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

export const SERVERS = ["Halorian", "Elysian", "Lunarian", "Serenian"] as const;
export type Server = (typeof SERVERS)[number];

export type Character = {
  id: string;
  ownerId: string;
  name: string;
  vocation: Vocation;
  level: number;
  server: Server;
  createdAt: Timestamp | null;
};

export type CharacterInput = {
  name: string;
  vocation: Vocation;
  level: number;
  server: Server;
};

const charactersCol = () => collection(db, "characters");

export async function addCharacter(ownerId: string, input: CharacterInput) {
  return addDoc(charactersCol(), {
    ownerId,
    name: input.name.trim(),
    vocation: input.vocation,
    level: input.level,
    server: input.server,
    createdAt: serverTimestamp(),
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
          createdAt: data.createdAt ?? null,
        };
      });
      cb(list);
    },
    onError
  );
}
