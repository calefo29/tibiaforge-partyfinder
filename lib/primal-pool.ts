import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export const PRIMAL_MIN_LEVEL = 600;
export const HAZARD_MIN = 0;
export const HAZARD_MAX = 11;

export const TURNOS = ["manha", "tarde", "noite", "madrugada"] as const;
export type Turno = (typeof TURNOS)[number];

export const TURNO_LABELS: Record<Turno, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
  madrugada: "Madrugada",
};

export const TURNO_RANGES: Record<Turno, string> = {
  manha: "6h – 12h",
  tarde: "12h – 18h",
  noite: "18h – 00h",
  madrugada: "00h – 06h",
};

export const TURNO_ICONS: Record<Turno, string> = {
  manha: "🌅",
  tarde: "☀️",
  noite: "🌙",
  madrugada: "🦉",
};

export type PrimalPoolEntry = {
  id: string;
  characterId: string;
  ownerId: string;
  experience: boolean;
  hazard: number;
  availability: Turno[];
  status: "active" | "inactive";
  registeredAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type PrimalPoolInput = {
  characterId: string;
  experience: boolean;
  hazard: number;
  availability: Turno[];
};

const poolCol = () => collection(db, "primalPool");

export async function addToPrimalPool(ownerId: string, input: PrimalPoolInput) {
  return addDoc(poolCol(), {
    ownerId,
    characterId: input.characterId,
    experience: input.experience,
    hazard: input.hazard,
    availability: input.availability,
    status: "active",
    registeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updatePrimalPoolEntry(id: string, input: Omit<PrimalPoolInput, "characterId">) {
  await updateDoc(doc(db, "primalPool", id), {
    experience: input.experience,
    hazard: input.hazard,
    availability: input.availability,
    updatedAt: serverTimestamp(),
  });
}

export async function removeFromPrimalPool(id: string) {
  await deleteDoc(doc(db, "primalPool", id));
}

export function subscribeToUserPrimalPool(
  ownerId: string,
  cb: (entries: PrimalPoolEntry[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(poolCol(), where("ownerId", "==", ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list: PrimalPoolEntry[] = snap.docs.map((d) => {
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
        };
      });
      list.sort((a, b) => {
        const at = a.registeredAt?.toMillis?.() ?? 0;
        const bt = b.registeredAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      cb(list);
    },
    onError
  );
}

export function hazardTier(h: number): { label: string; cls: "low" | "mid" | "high" } {
  if (h <= 3) return { label: "Baixo", cls: "low" };
  if (h <= 7) return { label: "Médio", cls: "mid" };
  return { label: "Alto", cls: "high" };
}
