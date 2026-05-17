import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
  await updateDoc(doc(db, "characters", id), {
    name: input.name.trim(),
    vocation: input.vocation,
    level: input.level,
    server: input.server,
    questHistory: input.questHistory,
    updatedAt: serverTimestamp(),
  });
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
