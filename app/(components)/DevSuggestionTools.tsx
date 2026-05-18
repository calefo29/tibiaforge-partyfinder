"use client";

import { useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Vocation } from "@/lib/characters";
import { PrimalPoolEntry, Turno } from "@/lib/primal-pool";
import {
  buildBestPartitionForServer,
  computePartitionMeta,
  MatchablePool,
} from "@/lib/primal-matching";
import {
  currentCycleDate,
  nextServerSave,
  SuggestionStatus,
} from "@/lib/primal-suggestions";

const FAKE_NAMES = [
  "Carlos", "Maria", "Jose", "Alfredo", "Thiago", "Soxi", "Rafael", "Pedro",
  "Bianca", "Diego", "Camila", "Vitor", "Helena", "Bruno", "Larissa", "Marcos",
  "Julia", "Fernando", "Patricia", "Ricardo", "Amanda", "Eduardo", "Beatriz",
  "Gabriel", "Renata", "Daniel", "Sofia", "Leonardo", "Mariana", "Andre",
];
const SUFFIXES = ["Tank", "Heal", "DPS", "Bow", "Punch", "Fire", "Cure", "Wall", "Aim", "Fist", "Slash", "Bolt"];
const VOCS: Vocation[] = ["EK", "ED", "MS", "RP", "EM"];
const TURNOS_ALL: Turno[] = ["manha", "tarde", "noite", "madrugada"];

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function rollTurnos(): Turno[] {
  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = [...TURNOS_ALL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function DevSuggestionTools() {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const append = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l].slice(0, 8));

  const handleSeed = async () => {
    setBusy("seed");
    try {
      const now = new Date();
      const stamp = now.getTime();
      const plan = [
        { server: "Auroria", count: 18 },
        { server: "Halorian", count: 10 },
      ];
      let created = 0;
      for (const { server, count } of plan) {
        for (let i = 0; i < count; i++) {
          const voc: Vocation = i === 0 ? "EK" : i === 1 ? "ED" : i === 2 ? "EK" : i === 3 ? "ED" : pickRandom(VOCS);
          const name = `${pickRandom(FAKE_NAMES)} ${pickRandom(SUFFIXES)} ${i + 1}`;
          const level = 600 + Math.floor(Math.random() * 500);
          const ownerId = `__dummy_${stamp}_${server}_${i}`;
          const characterId = `__dummy_char_${stamp}_${server}_${i}`;
          const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          await addDoc(collection(db, "primalPool"), {
            ownerId,
            characterId,
            experience: Math.random() < 0.4,
            hazard: Math.floor(Math.random() * 12),
            availability: rollTurnos(),
            status: "active",
            registeredAt: Timestamp.fromDate(past),
            updatedAt: serverTimestamp(),
            characterName: name,
            vocation: voc,
            level,
            server,
            __dummy: true,
          });
          created++;
        }
      }
      append(`🌱 Seedados ${created} dummies (Auroria + Halorian)`);
    } catch (e) {
      append(`❌ Erro seed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    setBusy("clear");
    try {
      const snap = await getDocs(
        query(collection(db, "primalPool"), where("__dummy", "==", true))
      );
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      // Limpa também sugestões pending/declined
      const sugSnap = await getDocs(
        query(
          collection(db, "primalSuggestions"),
          where("status", "in", ["pending", "declined"])
        )
      );
      if (!sugSnap.empty) {
        const sb = writeBatch(db);
        sugSnap.docs.forEach((d) => sb.delete(d.ref));
        await sb.commit();
      }
      append(`🗑️ Limpos ${snap.size} dummies + ${sugSnap.size} sugestões`);
    } catch (e) {
      append(`❌ Erro clear: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRunMatching = async () => {
    setBusy("match");
    try {
      const now = new Date();
      const cycleDate = currentCycleDate(now);
      const expiresAt = nextServerSave(now);

      // 1. Expira sugestões pending/declined
      const oldSnap = await getDocs(
        query(
          collection(db, "primalSuggestions"),
          where("status", "in", ["pending", "declined"])
        )
      );
      if (!oldSnap.empty) {
        const b = writeBatch(db);
        oldSnap.docs.forEach((d) =>
          b.update(d.ref, { status: "expired" as SuggestionStatus })
        );
        await b.commit();
      }

      // 2. Pool ativa
      const poolSnap = await getDocs(
        query(collection(db, "primalPool"), where("status", "==", "active"))
      );
      const allPool: PrimalPoolEntry[] = poolSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          characterId: data.characterId,
          experience: data.experience ?? false,
          hazard: data.hazard ?? 0,
          availability: (data.availability ?? []) as Turno[],
          status: data.status ?? "active",
          registeredAt: data.registeredAt ?? null,
          updatedAt: data.updatedAt ?? null,
          characterName: data.characterName ?? "",
          vocation: data.vocation ?? "",
          level: data.level ?? 0,
          server: data.server ?? "",
        };
      });

      // 3. Locked chars
      const closedSnap = await getDocs(
        query(collection(db, "primalParties"), where("status", "==", "closed"))
      );
      const locked = new Set<string>();
      closedSnap.docs.forEach((d) => {
        const slots = (d.data().slots ?? []) as Array<{ entry?: { characterId?: string } }>;
        slots.forEach((s) => {
          if (s.entry?.characterId) locked.add(s.entry.characterId);
        });
      });

      const eligible: MatchablePool[] = allPool
        .filter((e) => e.vocation && e.characterName && !locked.has(e.characterId))
        .map((e) => ({ ...e, vocation: e.vocation as MatchablePool["vocation"] }));

      // 4. Por server
      const byServer = new Map<string, MatchablePool[]>();
      eligible.forEach((e) => {
        if (!byServer.has(e.server)) byServer.set(e.server, []);
        byServer.get(e.server)!.push(e);
      });

      let created = 0;
      const summary: string[] = [];
      for (const [server, pool] of byServer.entries()) {
        const parts = buildBestPartitionForServer(pool, 50);
        for (const slots of parts) {
          const meta = computePartitionMeta(slots);
          await addDoc(collection(db, "primalSuggestions"), {
            cycleDate,
            server,
            slots,
            acceptedBy: [],
            declinedBy: null,
            status: "pending" as SuggestionStatus,
            commonTurns: meta.commonTurns,
            levelAvg: meta.levelAvg,
            experiencedCount: meta.experiencedCount,
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt),
          });
          created++;
        }
        if (parts.length > 0) summary.push(`${server}: ${parts.length} PT(s)`);
      }
      append(`✨ Matching: pool ${eligible.length} elegíveis → ${created} sugestões${summary.length ? " (" + summary.join(", ") + ")" : ""}`);
    } catch (e) {
      append(`❌ Erro matching: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wider text-[var(--warn)] font-bold">
          🛠 DEV — ferramentas de teste
        </div>
        <div className="text-[10px] text-[var(--text-mute)]">
          só em dev · não vai pra prod
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={handleSeed}
          className="text-xs border border-[var(--warn)]/50 text-[var(--warn)] hover:bg-[var(--warn)]/15 px-3 py-1.5 rounded transition disabled:opacity-50"
        >
          {busy === "seed" ? "Seedando…" : "🌱 Seed pool (28 dummies)"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={handleClear}
          className="text-xs border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-3 py-1.5 rounded transition disabled:opacity-50"
        >
          {busy === "clear" ? "Limpando…" : "🗑️ Limpar dummies + sugestões"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={handleRunMatching}
          className="text-xs border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)]/15 px-3 py-1.5 rounded transition disabled:opacity-50"
        >
          {busy === "match" ? "Calculando…" : "✨ Rodar matching agora"}
        </button>
      </div>
      {log.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--warn)]/20 space-y-1">
          {log.map((line, i) => (
            <div
              key={i}
              className={`text-[10px] font-mono ${i === 0 ? "text-[var(--text)]" : "text-[var(--text-mute)]"}`}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
