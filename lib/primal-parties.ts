import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Vocation } from "./characters";

export const PRIMAL_PARTY_SIZE = 5;
export const PRIMAL_PARTY_MIN_LEVEL = 600;

// Composição fixa: slot 0 = EK, slot 1 = ED, slots 2-4 = ANY.
export type SlotVocation = Vocation | "ANY";
export const SLOT_TEMPLATE: SlotVocation[] = ["EK", "ED", "ANY", "ANY", "ANY"];

export type SlotEntryStatus = "pending" | "confirmed";

export type SlotEntry = {
  characterId: string;
  ownerId: string;
  status: SlotEntryStatus;
  addedAt: Timestamp | null;
};

export type Slot = {
  index: number;
  vocation: SlotVocation;
  entry: SlotEntry | null;
};

export type PartyStatus = "forming" | "closed" | "cancelled";

export type PrimalParty = {
  id: string;
  hostUid: string;
  hostCharacterId: string;
  server: string;
  minLevel: number;
  schedule: string;
  notes: string;
  status: PartyStatus;
  slots: Slot[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  closedAt: Timestamp | null;
};

export type CreatePartyInput = {
  hostUid: string;
  hostCharacterId: string;
  hostVocation: Vocation;
  server: string;
  minLevel: number;
  schedule: string;
  notes: string;
};

const partiesCol = () => collection(db, "primalParties");

/** Decide which slot index the host's char fills, given the host's vocation. */
export function hostSlotIndex(hostVoc: Vocation): number {
  if (hostVoc === "EK") return 0;
  if (hostVoc === "ED") return 1;
  return 2; // first ANY slot
}

export function canVocFillSlot(voc: Vocation, slot: SlotVocation): boolean {
  if (slot === "ANY") return true;
  return slot === voc;
}

export async function createParty(input: CreatePartyInput) {
  const slots: Slot[] = SLOT_TEMPLATE.map((vocation, index) => ({
    index,
    vocation,
    entry: null,
  }));
  const hostIndex = hostSlotIndex(input.hostVocation);
  slots[hostIndex] = {
    ...slots[hostIndex],
    entry: {
      characterId: input.hostCharacterId,
      ownerId: input.hostUid,
      status: "confirmed",
      addedAt: Timestamp.now(),
    },
  };

  return addDoc(partiesCol(), {
    hostUid: input.hostUid,
    hostCharacterId: input.hostCharacterId,
    server: input.server,
    minLevel: input.minLevel,
    schedule: input.schedule,
    notes: input.notes,
    status: "forming" as PartyStatus,
    slots,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    closedAt: null,
  });
}

export function subscribeToFormingParties(
  cb: (parties: PrimalParty[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(partiesCol(), where("status", "==", "forming"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapParty);
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      cb(list);
    },
    onError
  );
}

export function subscribeToMyParties(
  uid: string,
  cb: (parties: PrimalParty[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(partiesCol(), where("hostUid", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapParty);
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      cb(list);
    },
    onError
  );
}

function mapParty(d: import("firebase/firestore").QueryDocumentSnapshot): PrimalParty {
  const data = d.data() as Record<string, unknown>;
  const slots = ((data.slots as Slot[] | undefined) ?? []).map((s, i) => ({
    index: typeof s.index === "number" ? s.index : i,
    vocation: (s.vocation ?? "ANY") as SlotVocation,
    entry: s.entry ?? null,
  }));
  return {
    id: d.id,
    hostUid: String(data.hostUid ?? ""),
    hostCharacterId: String(data.hostCharacterId ?? ""),
    server: String(data.server ?? ""),
    minLevel: Number(data.minLevel ?? PRIMAL_PARTY_MIN_LEVEL),
    schedule: String(data.schedule ?? ""),
    notes: String(data.notes ?? ""),
    status: (data.status as PartyStatus) ?? "forming",
    slots,
    createdAt: (data.createdAt as Timestamp) ?? null,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
    closedAt: (data.closedAt as Timestamp) ?? null,
  };
}

export async function applyToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string,
  ownerId: string
) {
  if (party.slots[slotIndex].entry) {
    throw new Error("Esta vaga já tem um candidato.");
  }
  const slots = party.slots.map((s) =>
    s.index === slotIndex
      ? {
          ...s,
          entry: {
            characterId,
            ownerId,
            status: "pending" as SlotEntryStatus,
            addedAt: Timestamp.now(),
          },
        }
      : s
  );
  await updateDoc(doc(db, "primalParties", partyId), {
    slots,
    updatedAt: serverTimestamp(),
  });
}

export async function withdrawFromSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number
) {
  const slots = party.slots.map((s) =>
    s.index === slotIndex ? { ...s, entry: null } : s
  );
  await updateDoc(doc(db, "primalParties", partyId), {
    slots,
    updatedAt: serverTimestamp(),
  });
}

export async function setSlotStatus(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  status: SlotEntryStatus
) {
  const slot = party.slots[slotIndex];
  if (!slot.entry) throw new Error("Vaga vazia.");
  const slots = party.slots.map((s) =>
    s.index === slotIndex && s.entry
      ? { ...s, entry: { ...s.entry, status } }
      : s
  );
  await updateDoc(doc(db, "primalParties", partyId), {
    slots,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelParty(partyId: string) {
  await updateDoc(doc(db, "primalParties", partyId), {
    status: "cancelled" as PartyStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Close the party + lock the 5 confirmed characters by removing them from any
 * other forming party where they're sitting in a slot.
 */
export async function closePartyAndLock(partyId: string, party: PrimalParty) {
  // 1. Make sure all 5 slots are confirmed.
  const allConfirmed = party.slots.every(
    (s) => s.entry?.status === "confirmed"
  );
  if (!allConfirmed) {
    throw new Error("Todas as vagas precisam estar confirmadas pra fechar.");
  }
  const lockedCharIds = new Set(
    party.slots.map((s) => s.entry!.characterId)
  );

  // 2. Read every other forming party.
  const formingSnap = await getDocs(
    query(partiesCol(), where("status", "==", "forming"))
  );

  const batch = writeBatch(db);

  // 3. Close THIS party.
  batch.update(doc(db, "primalParties", partyId), {
    status: "closed" as PartyStatus,
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 4. For each OTHER forming party, drop locked chars from open slots.
  formingSnap.docs.forEach((d) => {
    if (d.id === partyId) return;
    const other = mapParty(d);
    let changed = false;
    const newSlots = other.slots.map((s) => {
      if (s.entry && lockedCharIds.has(s.entry.characterId)) {
        changed = true;
        return { ...s, entry: null };
      }
      return s;
    });
    if (changed) {
      batch.update(doc(db, "primalParties", d.id), {
        slots: newSlots,
        updatedAt: serverTimestamp(),
      });
    }
  });

  await batch.commit();
}
