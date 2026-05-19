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
import { Character, Vocation } from "./characters";
import { PrimalPoolEntry, Turno } from "./primal-pool";

export const PRIMAL_PARTY_SIZE = 5;
export const PRIMAL_PARTY_MIN_LEVEL = 600;

// Composição fixa: slot 0 = EK, slot 1 = ED, slots 2-4 = ANY.
export type SlotVocation = Vocation | "ANY";
export const SLOT_TEMPLATE: SlotVocation[] = ["EK", "ED", "ANY", "ANY", "ANY"];

export type SlotEntryStatus = "pending" | "confirmed";

export type SlotEntryKind = "apply" | "invite";

export type SlotEntry = {
  characterId: string;
  ownerId: string;
  status: SlotEntryStatus;
  addedAt: Timestamp | null;
  // Snapshot opcional — fallback de exibição quando não houver char/pool entry resolvível
  // (usado por dummies de teste e para entries cujo char foi removido).
  characterName?: string;
  vocation?: Vocation;
  level?: number;
  // Origem da entry: apply = player se candidatou, invite = host convidou
  kind?: SlotEntryKind;
  // Expiração do pending (24h por padrão). Após isso, deve ser tratado como expirado.
  expiresAt?: Timestamp | null;
};

export type Slot = {
  index: number;
  vocation: SlotVocation;
  entry: SlotEntry | null;
};

export type PartyStatus = "forming" | "closed" | "cancelled" | "completed";

export type Requirement<T> = { active: boolean; value: T };

export type PartyRequirements = {
  minLevel: Requirement<number>;
  minHazard: Requirement<number>;
  schedule: Requirement<Turno[]>;
  experienced: { active: boolean };
};

export const DEFAULT_REQUIREMENTS: PartyRequirements = {
  minLevel: { active: true, value: PRIMAL_PARTY_MIN_LEVEL },
  minHazard: { active: false, value: 0 },
  schedule: { active: false, value: [] },
  experienced: { active: false },
};

export type PrimalParty = {
  id: string;
  hostUid: string;
  hostCharacterId: string;
  server: string;
  notes: string;
  requirements: PartyRequirements;
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
  notes: string;
  requirements: PartyRequirements;
  slotComposition: SlotVocation[];
};

const partiesCol = () => collection(db, "primalParties");

export function canVocFillSlot(voc: Vocation, slot: SlotVocation): boolean {
  if (slot === "ANY") return true;
  return slot === voc;
}

/** First slot index in the given composition that accepts the host's vocation. */
export function hostSlotIndexFor(
  composition: SlotVocation[],
  hostVoc: Vocation
): number {
  return composition.findIndex((v) => canVocFillSlot(hostVoc, v));
}

export async function createParty(input: CreatePartyInput) {
  const slots: Slot[] = input.slotComposition.map((vocation, index) => ({
    index,
    vocation,
    entry: null,
  }));
  const hostIndex = hostSlotIndexFor(input.slotComposition, input.hostVocation);
  if (hostIndex < 0) {
    throw new Error(
      "Nenhuma vaga aceita a vocação do host. Ajuste a composição."
    );
  }

  // Trava: 1 char só pode ser host de 1 PT em formação por vez.
  const existing = await getDocs(
    query(partiesCol(), where("hostCharacterId", "==", input.hostCharacterId))
  );
  const stillHosting = existing.docs.some(
    (d) => (d.data().status ?? "forming") === "forming"
  );
  if (stillHosting) {
    throw new Error(
      "Esse char já é host de outra PT em formação. Cancele ou feche a outra antes."
    );
  }

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
    notes: input.notes,
    requirements: input.requirements,
    status: "forming" as PartyStatus,
    slots,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    closedAt: null,
  });
}

/** Effective minimum level for the party (always >= quest minimum). */
export function effectiveMinLevel(party: PrimalParty): number {
  const v = party.requirements?.minLevel;
  return v?.active ? Math.max(v.value, PRIMAL_PARTY_MIN_LEVEL) : PRIMAL_PARTY_MIN_LEVEL;
}

export type CandidateCheck = {
  characterId: string;
  ownerId: string;
  vocation: Vocation;
  level: number;
  server: string;
  questDonePrimal: boolean;
  hazard?: number;
  availability?: Turno[];
  hasExperience?: boolean;
  inPool: boolean;
};

/** Pure check using a generic candidate shape (works for pool entries or own chars). */
export function checkCandidateForSlot(
  cand: CandidateCheck,
  party: PrimalParty,
  slotIndex: number
): { ok: boolean; reason?: string } {
  const slot = party.slots[slotIndex];
  if (!slot) return { ok: false, reason: "Vaga inválida" };
  if (slot.entry) return { ok: false, reason: "Vaga já ocupada" };
  if (cand.questDonePrimal) return { ok: false, reason: "Char já fez Primal" };
  if (party.server && cand.server !== party.server)
    return { ok: false, reason: "Servidor diferente" };
  if (!canVocFillSlot(cand.vocation, slot.vocation))
    return { ok: false, reason: `Vocação ${slot.vocation} requerida` };

  const req = party.requirements ?? DEFAULT_REQUIREMENTS;
  if (req.minLevel?.active && cand.level < req.minLevel.value)
    return { ok: false, reason: `Level mínimo ${req.minLevel.value}` };

  if (req.minHazard?.active) {
    if (!cand.inPool) return { ok: false, reason: "Char precisa estar na pool (hazard)" };
    if ((cand.hazard ?? 0) < req.minHazard.value)
      return { ok: false, reason: `Hazard mínimo ${req.minHazard.value}` };
  }

  if (req.schedule?.active && req.schedule.value.length > 0) {
    if (!cand.inPool) return { ok: false, reason: "Char precisa estar na pool (turnos)" };
    const overlap = (cand.availability ?? []).some((t) =>
      req.schedule.value.includes(t)
    );
    if (!overlap) return { ok: false, reason: "Turnos incompatíveis" };
  }

  if (req.experienced?.active) {
    if (!cand.inPool) return { ok: false, reason: "Char precisa estar na pool (experiência)" };
    if (cand.hasExperience !== true)
      return { ok: false, reason: "Precisa ter experiência na quest" };
  }

  if (party.slots.some((s) => s.entry?.characterId === cand.characterId))
    return { ok: false, reason: "Char já está nessa PT" };

  // 1 char por player: se outro char desse mesmo dono já está na PT, bloqueia.
  if (party.slots.some((s) => s.entry?.ownerId === cand.ownerId))
    return { ok: false, reason: "Você já tem um char nessa PT" };

  return { ok: true };
}

/** Check whether a char (with optional pool entry) can apply to a given slot in a party. */
export function isCharEligibleForSlot(
  char: Character,
  poolEntry: PrimalPoolEntry | undefined,
  party: PrimalParty,
  slotIndex: number
): { ok: boolean; reason?: string } {
  return checkCandidateForSlot(
    {
      characterId: char.id,
      ownerId: char.ownerId,
      vocation: char.vocation,
      level: char.level,
      server: char.server,
      questDonePrimal: char.questHistory?.primal === true,
      hazard: poolEntry?.hazard,
      availability: poolEntry?.availability,
      hasExperience: poolEntry?.experience,
      inPool: !!poolEntry,
    },
    party,
    slotIndex
  );
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

export function subscribeToClosedParties(
  cb: (parties: PrimalParty[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(partiesCol(), where("status", "==", "closed"));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapParty);
      list.sort((a, b) => {
        const at = a.closedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const bt = b.closedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
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
  const rawReq = (data.requirements ?? null) as Partial<PartyRequirements> | null;
  // Back-compat: old docs had top-level minLevel and no requirements.
  const legacyMinLevel = typeof data.minLevel === "number"
    ? (data.minLevel as number)
    : null;
  const requirements: PartyRequirements = {
    minLevel: rawReq?.minLevel ?? {
      active: legacyMinLevel != null && legacyMinLevel > PRIMAL_PARTY_MIN_LEVEL,
      value: legacyMinLevel ?? PRIMAL_PARTY_MIN_LEVEL,
    },
    minHazard: rawReq?.minHazard ?? { active: false, value: 0 },
    schedule: rawReq?.schedule ?? { active: false, value: [] },
    experienced: rawReq?.experienced ?? { active: false },
  };
  return {
    id: d.id,
    hostUid: String(data.hostUid ?? ""),
    hostCharacterId: String(data.hostCharacterId ?? ""),
    server: String(data.server ?? ""),
    notes: String(data.notes ?? ""),
    requirements,
    status: (data.status as PartyStatus) ?? "forming",
    slots,
    createdAt: (data.createdAt as Timestamp) ?? null,
    updatedAt: (data.updatedAt as Timestamp) ?? null,
    closedAt: (data.closedAt as Timestamp) ?? null,
  };
}

export type ApplySnapshot = {
  characterName: string;
  vocation: Vocation;
  level: number;
};

export async function applyToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string,
  ownerId: string,
  snapshot: ApplySnapshot,
  options?: { kind?: "apply" | "invite"; ttlHours?: number }
) {
  if (party.slots[slotIndex].entry) {
    throw new Error("Esta vaga já tem um candidato.");
  }
  const kind = options?.kind ?? "apply";
  const ttlHours = options?.ttlHours ?? 24;
  const expiresAtMs = Date.now() + ttlHours * 60 * 60 * 1000;
  const slots = party.slots.map((s) =>
    s.index === slotIndex
      ? {
          ...s,
          entry: {
            characterId,
            ownerId,
            status: "pending" as SlotEntryStatus,
            addedAt: Timestamp.now(),
            characterName: snapshot.characterName,
            vocation: snapshot.vocation,
            level: snapshot.level,
            kind,
            expiresAt: Timestamp.fromMillis(expiresAtMs),
          },
        }
      : s
  );
  await updateDoc(doc(db, "primalParties", partyId), {
    slots,
    updatedAt: serverTimestamp(),
  });
}

/** DEV only: insere um dummy confirmed no slot pra testar fluxos de host. */
export async function addDummyToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  dummy: { characterName: string; vocation: Vocation; level: number }
) {
  if (party.slots[slotIndex].entry) {
    throw new Error("Esta vaga já tem alguém.");
  }
  const fakeId = `dummy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const slots = party.slots.map((s) =>
    s.index === slotIndex
      ? {
          ...s,
          entry: {
            characterId: fakeId,
            ownerId: fakeId,
            status: "confirmed" as SlotEntryStatus,
            addedAt: Timestamp.now(),
            characterName: dummy.characterName,
            vocation: dummy.vocation,
            level: dummy.level,
          },
        }
      : s
  );
  await updateDoc(doc(db, "primalParties", partyId), {
    slots,
    updatedAt: serverTimestamp(),
  });
}

export async function inviteToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string,
  ownerId: string,
  snapshot: ApplySnapshot
) {
  return applyToSlot(partyId, party, slotIndex, characterId, ownerId, snapshot, {
    kind: "invite",
    ttlHours: 24,
  });
}

export type UpdatePartyInput = {
  notes: string;
  requirements: PartyRequirements;
  slotComposition: SlotVocation[]; // length 5; first 2 must stay EK/ED
};

/** Update mutable party fields. Slots 0 and 1 stay fixed (EK/ED). */
export async function updateParty(
  partyId: string,
  party: PrimalParty,
  input: UpdatePartyInput
) {
  if (input.slotComposition.length !== 5) {
    throw new Error("Composição precisa ter 5 vagas.");
  }
  if (input.slotComposition[0] !== "EK" || input.slotComposition[1] !== "ED") {
    throw new Error("Vagas 1 (EK) e 2 (ED) não podem ser alteradas.");
  }
  // Apply new vocations, but if a slot already has an entry whose vocation no
  // longer matches the new requirement, clear that entry.
  const newSlots: Slot[] = party.slots.map((s, i) => {
    const newVoc = input.slotComposition[i];
    const entry = s.entry;
    if (entry && newVoc !== "ANY") {
      // We can't easily verify the entry's character vocation here; trust prior write.
      // Caller responsible for not making invalid changes.
    }
    return { ...s, vocation: newVoc };
  });
  await updateDoc(doc(db, "primalParties", partyId), {
    notes: input.notes,
    requirements: input.requirements,
    slots: newSlots,
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

/** Marca a PT como concluída (quest feita) — terminal, não volta. */
export async function completeParty(partyId: string) {
  await updateDoc(doc(db, "primalParties", partyId), {
    status: "completed" as PartyStatus,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Player sai de PT fechada: libera o slot e reabre a PT pra forming.
 * Se for o host saindo, transfere host pra um slot restante (random); se não
 * sobrar ninguém, a PT é cancelada.
 */
export async function leaveClosedParty(
  partyId: string,
  party: PrimalParty,
  slotIndex: number
) {
  // Busca pela posição no array (mais seguro) E pelo s.index (compat antiga)
  const leaving =
    party.slots.find((s) => s.index === slotIndex) ?? party.slots[slotIndex];
  if (!leaving?.entry) throw new Error("Vaga vazia.");
  const wasHost = leaving.entry.characterId === party.hostCharacterId;

  const newSlots = party.slots.map((s, i) =>
    s.index === slotIndex || i === slotIndex ? { ...s, entry: null } : s
  );
  const remaining = newSlots.filter((s) => s.entry);

  if (remaining.length === 0) {
    await updateDoc(doc(db, "primalParties", partyId), {
      status: "cancelled" as PartyStatus,
      slots: newSlots,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const update: Record<string, unknown> = {
    status: "forming" as PartyStatus,
    closedAt: null,
    slots: newSlots,
    updatedAt: serverTimestamp(),
  };

  if (wasHost) {
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    update.hostUid = pick.entry!.ownerId;
    update.hostCharacterId = pick.entry!.characterId;
  }

  await updateDoc(doc(db, "primalParties", partyId), update);
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

  // 4. For each OTHER forming party:
  //    - clear any slot whose char is now locked
  //    - if the host's char is locked, transfer host to a random remaining slot,
  //      or cancel the party if there's nobody left
  formingSnap.docs.forEach((d) => {
    if (d.id === partyId) return;
    const other = mapParty(d);
    const hostLocked = lockedCharIds.has(other.hostCharacterId);

    let slotsChanged = false;
    const newSlots = other.slots.map((s) => {
      if (s.entry && lockedCharIds.has(s.entry.characterId)) {
        slotsChanged = true;
        return { ...s, entry: null };
      }
      return s;
    });

    if (hostLocked) {
      const remaining = newSlots.filter((s) => s.entry);
      if (remaining.length === 0) {
        batch.update(doc(db, "primalParties", d.id), {
          status: "cancelled" as PartyStatus,
          slots: newSlots,
          updatedAt: serverTimestamp(),
        });
      } else {
        const pick = remaining[Math.floor(Math.random() * remaining.length)];
        batch.update(doc(db, "primalParties", d.id), {
          hostUid: pick.entry!.ownerId,
          hostCharacterId: pick.entry!.characterId,
          slots: newSlots,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (slotsChanged) {
      batch.update(doc(db, "primalParties", d.id), {
        slots: newSlots,
        updatedAt: serverTimestamp(),
      });
    }
  });

  await batch.commit();
}
