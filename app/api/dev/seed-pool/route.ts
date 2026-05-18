import { NextResponse } from "next/server";
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
import { Turno } from "@/lib/primal-pool";

function guard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "dev only" }, { status: 403 });
  }
  return null;
}

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
  // Garante ao menos 1 turno; weighted pra ter overlap entre dummies
  const count = 1 + Math.floor(Math.random() * 3); // 1-3 turnos
  const shuffled = [...TURNOS_ALL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

export async function POST() {
  const g = guard(); if (g) return g;

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;

  // Distribuição: Auroria forte (pra formar várias PTs), Halorian moderada
  const plan: { server: string; count: number; ekEdMin: number }[] = [
    { server: "Auroria", count: 18, ekEdMin: 4 },
    { server: "Halorian", count: 10, ekEdMin: 2 },
  ];

  let created = 0;
  const createdIds: string[] = [];

  for (const { server, count, ekEdMin } of plan) {
    // Garante que tem EK/ED suficiente pra formar pelo menos algumas PTs
    const guaranteedVocs: Vocation[] = [];
    for (let i = 0; i < ekEdMin; i++) guaranteedVocs.push(i % 2 === 0 ? "EK" : "ED");

    for (let i = 0; i < count; i++) {
      const voc = i < guaranteedVocs.length ? guaranteedVocs[i] : pickRandom(VOCS);
      const name = `${pickRandom(FAKE_NAMES)} ${pickRandom(SUFFIXES)} ${i + 1}`;
      const level = 600 + Math.floor(Math.random() * 500);
      const ownerId = `__dummy_owner_${stamp}_${server}_${i}`;
      const characterId = `__dummy_char_${stamp}_${server}_${i}`;
      // registeredAt deliberadamente NO PASSADO pra entrar no ciclo atual
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h atrás
      const ref = await addDoc(collection(db, "primalPool"), {
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
        __dummy: true, // flag pra cleanup
      });
      createdIds.push(ref.id);
      created++;
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    ids: createdIds.slice(0, 5),
    note: "Dummies marcados com __dummy:true. Rode DELETE pra limpar.",
  });
}

export async function DELETE() {
  const g = guard(); if (g) return g;

  const snap = await getDocs(
    query(collection(db, "primalPool"), where("__dummy", "==", true))
  );
  if (snap.empty) return NextResponse.json({ ok: true, deleted: 0 });

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // Limpa também sugestões pending/declined que envolvem só dummies (todas, pra simplificar)
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

  return NextResponse.json({
    ok: true,
    deletedPool: snap.size,
    deletedSuggestions: sugSnap.size,
  });
}
