"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
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
  acceptSuggestion,
  currentCycleDate,
  nextServerSave,
  SuggestionSlot,
  SuggestionStatus,
} from "@/lib/primal-suggestions";
import { createNotificationsBulk } from "@/lib/notifications";
import { useAuth } from "@/lib/auth-context";

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

type LastRun = {
  ranAt: Timestamp | null;
  trigger: "auto" | "manual";
  expiredCount: number;
  created: number;
  poolSize?: number;
  eligibleSize?: number;
};

export function DevSuggestionTools() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);

  const append = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l].slice(0, 8));

  // Subscribe à última execução do cron pra exibir no UI
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "adminMetrics", "lastCronRun"),
      (snap) => {
        if (!snap.exists()) {
          setLastRun(null);
          return;
        }
        const d = snap.data();
        setLastRun({
          ranAt: d.ranAt ?? null,
          trigger: (d.trigger ?? "auto") as "auto" | "manual",
          expiredCount: d.expiredCount ?? 0,
          created: d.created ?? 0,
          poolSize: d.poolSize,
          eligibleSize: d.eligibleSize,
        });
      },
      () => setLastRun(null)
    );
    return () => unsub();
  }, []);

  const handleSeed = async () => {
    setBusy("seed");
    try {
      const now = new Date();
      const stamp = now.getTime();
      // 30 dummies todos no Auroria · exatamente 6 de cada voc (EK/ED/MS/RP/EM).
      // Garante que toda PT da Auroria consegue ser formada (algoritmo precisa
      // de 1 EK + 1-2 ED + ≥1 RP + ≤1 EM + 5 chars).
      const server = "Auroria";
      const vocsPlan: Vocation[] = [];
      (["EK", "ED", "RP", "MS", "EM"] as Vocation[]).forEach((v) => {
        for (let i = 0; i < 6; i++) vocsPlan.push(v);
      });
      // Embaralha pra que os turnos/levels não fiquem agrupados por voc
      vocsPlan.sort(() => Math.random() - 0.5);

      let created = 0;
      for (let i = 0; i < vocsPlan.length; i++) {
        const voc = vocsPlan[i];
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
      append(
        `🌱 Seedados ${created} dummies em ${server} (6 EK · 6 ED · 6 RP · 6 MS · 6 EM)`
      );
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
      let notified = 0;
      const summary: string[] = [];
      for (const [server, pool] of byServer.entries()) {
        const parts = buildBestPartitionForServer(pool, 50);
        for (const slots of parts) {
          const meta = computePartitionMeta(slots);
          const ref = await addDoc(collection(db, "primalSuggestions"), {
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

          // Notifica os 5 players sorteados (mesmo comportamento do cron real)
          const ownerIds = slots
            .map((s) => s.ownerId)
            .filter(
              (uid): uid is string => !!uid && !uid.startsWith("dummy_")
            );
          if (ownerIds.length > 0) {
            await createNotificationsBulk(ownerIds, {
              type: "suggestion_new",
              title: "PT aleatória formada!",
              body: `Você foi sorteado pra uma PT no ${server}. Avalie e aceite/recuse até o próximo SS.`,
              link: "/quest/primal",
              meta: { suggestionId: ref.id, server },
            });
            notified += ownerIds.length;
          }
        }
        if (parts.length > 0) summary.push(`${server}: ${parts.length} PT(s)`);
      }
      // Tracking: registra essa execução manual em adminMetrics/lastCronRun
      try {
        await setDoc(doc(db, "adminMetrics", "lastCronRun"), {
          cycleDate,
          ranAt: serverTimestamp(),
          trigger: "manual",
          expiredCount: oldSnap.size,
          poolSize: allPool.length,
          eligibleSize: eligible.length,
          created,
          notified,
        });
      } catch {
        // não-crítico
      }

      append(
        `🔁 Ciclo simulado: ${oldSnap.size} expiradas → ${created} novas sugestões · ${notified} players notificados${
          summary.length ? " (" + summary.join(", ") + ")" : ""
        }`
      );
    } catch (e) {
      append(`❌ Erro matching: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // Força uma sugestão pendente que GARANTIDAMENTE inclui um char do admin,
  // preenchendo as outras 4 vagas com chars (dummies preferidos) que satisfaçam
  // a composição (1 EK, 1-2 ED, ≥1 RP, ≤1 EM).
  const handleForceSuggestionForMe = async () => {
    if (!user) {
      append("❌ Usuário não autenticado");
      return;
    }
    setBusy("force-mine");
    try {
      // 1. Lê chars do admin na pool
      const myPoolSnap = await getDocs(
        query(
          collection(db, "primalPool"),
          where("ownerId", "==", user.uid),
          where("status", "==", "active")
        )
      );
      if (myPoolSnap.empty) {
        append("❌ Você não tem chars na pool ativa. Cadastra na aba 'Add Personagem' primeiro.");
        return;
      }
      const myEntries: PrimalPoolEntry[] = myPoolSnap.docs.map((d) => mapEntry(d));
      const myEntry = myEntries[0];

      // 2. Lê outros chars do mesmo server
      const allSnap = await getDocs(
        query(
          collection(db, "primalPool"),
          where("status", "==", "active"),
          where("server", "==", myEntry.server)
        )
      );
      const others: PrimalPoolEntry[] = allSnap.docs
        .map((d) => mapEntry(d))
        .filter((e) => e.characterId !== myEntry.characterId);

      // 3. Greedy: preenche pra satisfazer composição
      const counts: Record<string, number> = {
        EK: 0,
        ED: 0,
        RP: 0,
        MS: 0,
        EM: 0,
      };
      counts[myEntry.vocation as Vocation]++;
      const chosen: PrimalPoolEntry[] = [myEntry];
      const usedIds = new Set([myEntry.characterId]);
      const usedOwners = new Set([myEntry.ownerId]);

      // Helper pra escolher por voc respeitando limites
      const pickByVoc = (voc: Vocation): PrimalPoolEntry | null => {
        return (
          others.find(
            (e) =>
              e.vocation === voc &&
              !usedIds.has(e.characterId) &&
              !usedOwners.has(e.ownerId)
          ) ?? null
        );
      };

      // Primeiro, preenche necessidades mínimas: 1 EK, 1 ED, 1 RP
      const required: Vocation[] = [];
      if (counts.EK < 1) required.push("EK");
      if (counts.ED < 1) required.push("ED");
      if (counts.RP < 1) required.push("RP");

      for (const voc of required) {
        const pick = pickByVoc(voc);
        if (!pick) {
          append(
            `❌ Sem ${voc} disponível no server ${myEntry.server}. Roda "Seed pool" antes ou cadastra mais chars.`
          );
          return;
        }
        chosen.push(pick);
        usedIds.add(pick.characterId);
        usedOwners.add(pick.ownerId);
        counts[voc]++;
      }

      // Depois, completa até 5 com qualquer voc respeitando limites
      while (chosen.length < 5) {
        const pick = others.find((e) => {
          if (usedIds.has(e.characterId)) return false;
          if (usedOwners.has(e.ownerId)) return false;
          const v = e.vocation;
          if (v === "EK" && counts.EK >= 1) return false;
          if (v === "ED" && counts.ED >= 2) return false;
          if (v === "EM" && counts.EM >= 1) return false;
          return true;
        });
        if (!pick) {
          append(
            `❌ Pool insuficiente no server ${myEntry.server} pra completar a PT. Roda "Seed pool" antes.`
          );
          return;
        }
        chosen.push(pick);
        usedIds.add(pick.characterId);
        usedOwners.add(pick.ownerId);
        counts[pick.vocation as Vocation]++;
      }

      // 4. Monta SuggestionSlot[]
      const slots: SuggestionSlot[] = chosen.map((e, i) => ({
        index: i,
        characterId: e.characterId,
        ownerId: e.ownerId,
        characterName: e.characterName,
        vocation: e.vocation as Vocation,
        level: e.level,
        hasExperience: e.experience ?? false,
        availability: e.availability ?? [],
      }));

      // Turnos em comum (intersecção)
      const allTurnos = slots.map((s) => new Set(s.availability));
      const commonTurns: Turno[] = (
        ["manha", "tarde", "noite", "madrugada"] as Turno[]
      ).filter((t) => allTurnos.every((set) => set.has(t)));

      const levelAvg = Math.round(
        slots.reduce((acc, s) => acc + s.level, 0) / slots.length
      );
      const experiencedCount = slots.filter((s) => s.hasExperience).length;

      const cycleDate = currentCycleDate();
      const expiresAt = nextServerSave();

      const ref = await addDoc(collection(db, "primalSuggestions"), {
        cycleDate,
        server: myEntry.server,
        slots,
        acceptedBy: [],
        declinedBy: null,
        status: "pending" as SuggestionStatus,
        commonTurns,
        levelAvg,
        experiencedCount,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
      });

      // Notifica os players reais (não-dummies)
      const ownerIds = slots
        .map((s) => s.ownerId)
        .filter(
          (uid): uid is string => !!uid && !uid.startsWith("dummy_")
        );
      if (ownerIds.length > 0) {
        await createNotificationsBulk(ownerIds, {
          type: "suggestion_new",
          title: "PT aleatória formada!",
          body: `Você foi sorteado pra uma PT no ${myEntry.server}.`,
          link: "/quest/primal",
          meta: { suggestionId: ref.id, server: myEntry.server },
        });
      }

      append(
        `🎯 Sugestão forçada pro ${myEntry.characterName} (${myEntry.vocation}): ${slots
          .map((s) => `${s.vocation} ${s.characterName}`)
          .join(", ")}`
      );
    } catch (e) {
      append(
        `❌ Erro force: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(null);
    }
  };

  // Simula os outros 4 players da sugestão pendente aceitando — se completar 5/5
  // dispara a promoção pra PrimalParty closed.
  const handleAcceptByOthers = async () => {
    if (!user) {
      append("❌ Usuário não autenticado");
      return;
    }
    setBusy("accept-others");
    try {
      // Acha sugestões pending com algum char do admin
      const snap = await getDocs(
        query(
          collection(db, "primalSuggestions"),
          where("status", "==", "pending")
        )
      );
      const mineSugs = snap.docs.filter((d) => {
        const slots = (d.data().slots ?? []) as Array<{ ownerId?: string }>;
        return slots.some((s) => s.ownerId === user.uid);
      });
      if (mineSugs.length === 0) {
        append(
          "❌ Você não está em nenhuma sugestão pending. Clica em 'Sortear PT com meu char' primeiro."
        );
        return;
      }
      let totalAccepted = 0;
      let promotedCount = 0;
      for (const d of mineSugs) {
        const data = d.data();
        const slots = (data.slots ?? []) as SuggestionSlot[];
        const acceptedBy: string[] = (data.acceptedBy ?? []) as string[];

        // Filtra outros chars (não do admin) que ainda não aceitaram
        const toAccept = slots.filter(
          (s) =>
            s.ownerId !== user.uid && !acceptedBy.includes(s.characterId)
        );

        for (const slot of toAccept) {
          const result = await acceptSuggestion(d.id, slot.characterId);
          if (result.ok) {
            totalAccepted++;
            if (result.promoted) promotedCount++;
          }
        }
      }
      append(
        `✅ ${totalAccepted} aceites simulados${
          promotedCount > 0 ? ` · ${promotedCount} PT(s) promovida(s) pra closed` : ""
        }`
      );
    } catch (e) {
      append(
        `❌ Erro accept-others: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-wider text-[var(--warn)] font-bold">
          🛠 ADMIN — ferramentas de teste
        </div>
        <div className="text-[10px] text-[var(--text-mute)]">
          visível só em dev ou pra admin · auto-cron roda diariamente às 10h BRT
        </div>
      </div>
      <div className="text-[11px] text-[var(--text-mute)] mb-2 leading-relaxed">
        ⚙️ <strong className="text-[var(--text)]">Auto:</strong> todo dia às 10h BRT (13h UTC), o cron expira sugestões pendentes e sorteia novas pra cada char na pool.
        <br />
        🔁 <strong className="text-[var(--text)]">Manual:</strong> use o botão abaixo pra simular esse processo agora — útil pra testar sem esperar o próximo ciclo.
      </div>

      <div className="text-[11px] mb-2 px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--background)]/60">
        <span className="text-[var(--text-mute)]">Última execução:</span>{" "}
        {lastRun ? (
          <>
            <strong
              className={
                lastRun.trigger === "auto"
                  ? "text-[var(--ok)]"
                  : "text-[var(--accent)]"
              }
            >
              {lastRun.trigger === "auto" ? "🟢 AUTO" : "🟦 MANUAL"}
            </strong>{" "}
            <span className="text-[var(--text)]">{formatLastRun(lastRun.ranAt)}</span>{" "}
            <span className="text-[var(--text-dim)]">
              · {lastRun.expiredCount} expiradas → {lastRun.created} novas
              {typeof lastRun.eligibleSize === "number" &&
                ` · pool ${lastRun.eligibleSize}`}
            </span>
          </>
        ) : (
          <em className="text-[var(--text-dim)]">
            sem registros (cron auto ainda não rodou)
          </em>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={handleSeed}
          className="text-xs border border-[var(--warn)]/50 text-[var(--warn)] hover:bg-[var(--warn)]/15 px-3 py-1.5 rounded transition disabled:opacity-50"
        >
          {busy === "seed" ? "Seedando…" : "🌱 Seed pool (30 dummies · Auroria)"}
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
          className="text-xs border border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)]/15 px-3 py-1.5 rounded transition disabled:opacity-50 font-semibold"
          title="Expira todas as sugestões pendentes/recusadas + sorteia novas pra cada char na pool"
        >
          {busy === "match"
            ? "Sorteando…"
            : "🔁 Simular fim de prazo + sortear novamente"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={handleForceSuggestionForMe}
          className="text-xs border border-[var(--ok)]/50 text-[var(--ok)] hover:bg-[var(--ok)]/15 px-3 py-1.5 rounded transition disabled:opacity-50"
          title="Cria uma sugestão garantindo que seu char (1º da pool) esteja nela, com 4 chars compatíveis no mesmo server"
        >
          {busy === "force-mine"
            ? "Sorteando…"
            : "🎯 Sortear PT com meu char"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={handleAcceptByOthers}
          className="text-xs border border-[#a78bfa]/60 text-[#a78bfa] hover:bg-[#a78bfa]/15 px-3 py-1.5 rounded transition disabled:opacity-50"
          title="Para cada sugestão pending onde você está, simula que os outros 4 players aceitaram (testa promoção pra PT closed)"
        >
          {busy === "accept-others"
            ? "Aceitando…"
            : "✅ Aceitar pelos demais (fechar PT)"}
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

function mapEntry(
  d: import("firebase/firestore").QueryDocumentSnapshot
): PrimalPoolEntry {
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
}

function formatLastRun(ts: Timestamp | null): string {
  if (!ts || !ts.toMillis) return "—";
  const ms = ts.toMillis();
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora mesmo";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(ms).toLocaleString("pt-BR");
}
