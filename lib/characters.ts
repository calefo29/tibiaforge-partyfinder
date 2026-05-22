import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

export const VOCATIONS = ["EK", "ED", "MS", "RP", "EM"] as const;
export type Vocation = (typeof VOCATIONS)[number];

export const VOCATION_LABELS: Record<Vocation, string> = {
  EK: "Elite Knight",
  ED: "Elder Druid",
  MS: "Master Sorcerer",
  RP: "Royal Paladin",
  EM: "Exalted Monk",
};

// Servidores são carregados dinamicamente via /api/servers (scrape do rubinot.com).
// Mantemos o type como string pra acomodar novos mundos sem precisar mexer no código.
export type Server = string;

export type QuestHistory = {
  primal: boolean;
  soulwar: boolean;
};

export const DEFAULT_QUEST_HISTORY: QuestHistory = {
  primal: false,
  soulwar: false,
};

export type Character = {
  id: string;
  ownerId: string;
  name: string;
  vocation: Vocation;
  level: number;
  server: Server;
  questHistory: QuestHistory;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type CharacterInput = {
  name: string;
  vocation: Vocation;
  level: number;
  server: Server;
  questHistory: QuestHistory;
};

const charactersCol = () => collection(db, "characters");

export async function addCharacter(ownerId: string, input: CharacterInput) {
  return addDoc(charactersCol(), {
    ownerId,
    name: input.name.trim(),
    vocation: input.vocation,
    level: input.level,
    server: input.server,
    questHistory: input.questHistory,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCharacter(id: string, input: CharacterInput) {
  // Lê estado anterior pra detectar mudança em questHistory.primal
  // e sincronizar com a pool (player tem autonomia pra reverter "já fiz").
  const ref = doc(db, "characters", id);
  const before = await getDoc(ref);
  const beforeData = before.exists() ? before.data() : null;
  const oldPrimal = beforeData?.questHistory?.primal === true;
  const newPrimal = input.questHistory.primal === true;

  await updateDoc(ref, {
    name: input.name.trim(),
    vocation: input.vocation,
    level: input.level,
    server: input.server,
    questHistory: input.questHistory,
    updatedAt: serverTimestamp(),
  });

  // Se mudou o status de "já fez Primal", sincroniza pool entries do char:
  // - false → true: inativa (não precisa mais matchmaking)
  // - true → false: reativa (player desmarcou, talvez por erro do host)
  if (oldPrimal !== newPrimal) {
    try {
      const poolSnap = await getDocs(
        query(collection(db, "primalPool"), where("characterId", "==", id))
      );
      for (const d of poolSnap.docs) {
        await updateDoc(d.ref, {
          status: newPrimal ? "inactive" : "active",
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("Falhou ao sincronizar pool após mudar questHistory:", err);
    }
  }
}

export async function deleteCharacter(id: string) {
  await deleteDoc(doc(db, "characters", id));
}

export function subscribeToUserCharacters(
  ownerId: string,
  cb: (chars: Character[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    charactersCol(),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: Character[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          name: data.name,
          vocation: data.vocation,
          level: data.level,
          server: data.server,
          questHistory: {
            primal: data.questHistory?.primal ?? false,
            soulwar: data.questHistory?.soulwar ?? false,
          },
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      cb(list);
    },
    onError
  );
}
