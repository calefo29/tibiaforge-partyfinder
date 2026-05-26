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
import { createNotification, createNotificationsBulk } from "./notifications";

const NOTIF_LINK = "/quest/primal";

export const PRIMAL_PARTY_SIZE = 5;
export const PRIMAL_PARTY_MIN_LEVEL = 600;
export const MAX_CONFIRMED_PTS_PER_CHAR = 3;

// Composição: slot 0 = EK fixo, slot 1 = ED fixo, slots 2-4 = livre (vocations[] vazio = qualquer).
// vocations: lista de vocs aceitas; array vazio = aceita qualquer.
export type SlotVocation = Vocation | "ANY"; // mantido p/ compat de tipos antigos
export const SLOT_TEMPLATE: Vocation[][] = [["EK"], ["ED"], [], [], []];

export type SlotEntryStatus = "pending" | "confirmed";

export type SlotEntryKind = "apply" | "invite";

export type SlotEntry = {
  characterId: string;
  ownerId: string;
  status: SlotEntryStatus;
  addedAt: Timestamp | null;
  // Snapshot opcional — fallback de exibição quando não houver char/pool entry resolvível
  characterName?: string;
  vocation?: Vocation;
  level?: number;
  // Origem da entry: apply = player se candidatou, invite = host convidou
  kind?: SlotEntryKind;
  // Expiração do pending (24h por padrão).
  expiresAt?: Timestamp | null;
};

export type Slot = {
  index: number;
  /** Lista de vocações aceitas. Vazio = qualquer voc. */
  vocations: Vocation[];
  /** Candidaturas pendentes (player aplicou). */
  applicants: SlotEntry[];
  /** Convites pendentes (host convidou). */
  invites: SlotEntry[];
  /** Único confirmado da vaga. */
  confirmed: SlotEntry | null;
  /** @deprecated use slot.confirmed (populado via fallback) */
  entry: SlotEntry | null;
  /** @deprecated use slot.vocations (populado via fallback) */
  vocation: SlotVocation;
};

export type PartyStatus = "forming" | "closed" | "cancelled" | "completed";

export type Requirement<T> = { active: boolean; value: T };

export type PartyRequirements = {
  minLevel: Requirement<number>;
  minHazard: Requirement<number>;
  schedule: Requirement<Turno[]>;
  experienced: { active: boolean };
  /**
   * Quest done filter:
   * - active=false → sem restrição (qualquer um pode aplicar)
   * - active=true, value=true → apenas veteranos (chars com questHistory.primal === true)
   * - active=true, value=false → apenas iniciantes (chars que nunca fizeram)
   */
  questDone: Requirement<boolean>;
};

export const DEFAULT_REQUIREMENTS: PartyRequirements = {
  minLevel: { active: true, value: PRIMAL_PARTY_MIN_LEVEL },
  minHazard: { active: false, value: 0 },
  schedule: { active: false, value: [] },
  experienced: { active: false },
  questDone: { active: false, value: false },
};

/**
 * Origem da PT — influencia como ela se comporta ao ser "ressuscitada" via
 * leaveClosedParty (player desistir de PT já fechada). PTs do sistema aleatório
 * têm requirements resetadas pro mínimo, manuais mantêm o que o host configurou.
 */
export type PartyOrigin = "manual" | "suggestion";

export type PrimalParty = {
  id: string;
  hostUid: string;
  hostCharacterId: string;
  hostCharacterName?: string;
  hostVocation?: Vocation;
  hostLevel?: number;
  server: string;
  notes: string;
  requirements: PartyRequirements;
  /** Default "manual" pra PTs antigas sem o campo. */
  origin: PartyOrigin;
  status: PartyStatus;
  slots: Slot[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  closedAt: Timestamp | null;
};

export type CreatePartyInput = {
  hostUid: string;
  hostCharacterId: string;
  hostCharacterName: string;
  hostVocation: Vocation;
  hostLevel: number;
  server: string;
  notes: string;
  requirements: PartyRequirements;
  /** Vocações aceitas por slot (length = 5). Vazio em slot = ANY. */
  slotComposition: Vocation[][];
};

const partiesCol = () => collection(db, "primalParties");

export function canVocFillSlot(voc: Vocation, vocations: Vocation[]): boolean {
  return vocations.length === 0 || vocations.includes(voc);
}

/** Resolve display label pra UI: "EK", "RP/MS", "Qualquer". */
export function slotVocationLabel(vocations: Vocation[]): string {
  if (vocations.length === 0) return "Qualquer";
  return vocations.join("/");
}

/** Helper compat: traduz SlotVocation antigo pra Vocation[] novo. */
export function legacyVocToList(v: SlotVocation): Vocation[] {
  return v === "ANY" ? [] : [v];
}

/** First slot index in the given composition that accepts the host's vocation. */
export function hostSlotIndexFor(
  composition: Vocation[][],
  hostVoc: Vocation
): number {
  return composition.findIndex((vocs) => canVocFillSlot(hostVoc, vocs));
}

function emptySlot(index: number, vocations: Vocation[]): Slot {
  return {
    index,
    vocations,
    applicants: [],
    invites: [],
    confirmed: null,
    // deprecated derived
    entry: null,
    vocation: vocations.length === 1 ? vocations[0] : "ANY",
  };
}

export async function createParty(input: CreatePartyInput) {
  const slots: Slot[] = input.slotComposition.map((vocs, index) =>
    emptySlot(index, vocs)
  );
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

  const hostEntry: SlotEntry = {
    characterId: input.hostCharacterId,
    ownerId: input.hostUid,
    status: "confirmed",
    addedAt: Timestamp.now(),
    characterName: input.hostCharacterName,
    vocation: input.hostVocation,
    level: input.hostLevel,
  };
  slots[hostIndex] = {
    ...slots[hostIndex],
    confirmed: hostEntry,
    entry: hostEntry,
  };

  return addDoc(partiesCol(), {
    hostUid: input.hostUid,
    hostCharacterId: input.hostCharacterId,
    hostCharacterName: input.hostCharacterName,
    hostVocation: input.hostVocation,
    hostLevel: input.hostLevel,
    server: input.server,
    notes: input.notes,
    requirements: input.requirements,
    origin: "manual" as PartyOrigin,
    status: "forming" as PartyStatus,
    slots: slots.map(serializeSlot),
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
  if (slot.confirmed) return { ok: false, reason: "Vaga já preenchida" };
  if (party.server && cand.server !== party.server)
    return { ok: false, reason: "Servidor diferente" };
  if (!canVocFillSlot(cand.vocation, slot.vocations))
    return { ok: false, reason: `Vocação ${slotVocationLabel(slot.vocations)} requerida` };

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

  if (req.questDone?.active) {
    if (req.questDone.value === true && !cand.questDonePrimal) {
      return { ok: false, reason: "PT só pra quem já fez a quest" };
    }
    if (req.questDone.value === false && cand.questDonePrimal) {
      return { ok: false, reason: "PT só pra quem nunca fez a quest" };
    }
  }

  // Char já está como confirmed em alguma vaga dessa PT?
  if (party.slots.some((s) => s.confirmed?.characterId === cand.characterId))
    return { ok: false, reason: "Char já está nessa PT" };

  // Mesmo char já candidatado ou convidado em QUALQUER vaga desta PT?
  if (party.slots.some((s) => s.applicants.some((a) => a.characterId === cand.characterId)))
    return { ok: false, reason: "Você já se candidatou" };
  if (party.slots.some((s) => s.invites.some((i) => i.characterId === cand.characterId)))
    return { ok: false, reason: "Convite já enviado" };

  // 1 char por player na MESMA PT: só bloqueia se já tem CONFIRMED do mesmo
  // dono. Múltiplos pendings (apply/invite) são permitidos — quando um deles
  // virar confirmed, os outros caem via stripOwnerPendings.
  if (party.slots.some((s) => s.confirmed?.ownerId === cand.ownerId))
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

function readSlot(raw: unknown, i: number): Slot {
  const s = (raw ?? {}) as Record<string, unknown>;
  const index = typeof s.index === "number" ? (s.index as number) : i;
  // Lê vocations[] novo ou vocation antigo
  let vocations: Vocation[];
  if (Array.isArray(s.vocations)) {
    vocations = (s.vocations as Vocation[]).filter((v) => typeof v === "string");
  } else if (typeof s.vocation === "string") {
    vocations = legacyVocToList(s.vocation as SlotVocation);
  } else {
    vocations = [];
  }
  const applicants = Array.isArray(s.applicants) ? (s.applicants as SlotEntry[]) : [];
  const invites = Array.isArray(s.invites) ? (s.invites as SlotEntry[]) : [];
  let confirmed: SlotEntry | null = null;
  if (s.confirmed && typeof s.confirmed === "object") {
    confirmed = s.confirmed as SlotEntry;
  } else if (s.entry && typeof s.entry === "object") {
    // Compat: doc antigo com single entry — se status confirmed vira confirmed,
    // se pending vira applicants ou invites conforme kind.
    const entry = s.entry as SlotEntry;
    if (entry.status === "confirmed") {
      confirmed = entry;
    } else if (entry.kind === "invite") {
      invites.push(entry);
    } else {
      applicants.push(entry);
    }
  }
  return {
    index,
    vocations,
    applicants,
    invites,
    confirmed,
    // deprecated derived
    entry: confirmed,
    vocation: vocations.length === 1 ? vocations[0] : "ANY",
  };
}

/**
 * Serializa o slot. Mantém os campos deprecated (`entry`, `vocation`) gravados
 * no disco também — leitores diretos (cron de sugestões, código legado) ainda
 * dependem deles enquanto não migrarmos todo mundo.
 */
function serializeSlot(s: Slot): Record<string, unknown> {
  return {
    index: s.index,
    vocations: s.vocations,
    applicants: s.applicants,
    invites: s.invites,
    confirmed: s.confirmed,
    // deprecated mirrors
    entry: s.confirmed,
    vocation: s.vocations.length === 1 ? s.vocations[0] : "ANY",
  };
}

function mapParty(d: import("firebase/firestore").QueryDocumentSnapshot): PrimalParty {
  const data = d.data() as Record<string, unknown>;
  const rawSlots = (data.slots as unknown[] | undefined) ?? [];
  const slots = rawSlots.map(readSlot);
  const rawReq = (data.requirements ?? null) as Partial<PartyRequirements> | null;
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
    questDone: rawReq?.questDone ?? { active: false, value: false },
  };
  const origin: PartyOrigin =
    data.origin === "suggestion" ? "suggestion" : "manual";
  return {
    id: d.id,
    hostUid: String(data.hostUid ?? ""),
    hostCharacterId: String(data.hostCharacterId ?? ""),
    hostCharacterName:
      typeof data.hostCharacterName === "string"
        ? (data.hostCharacterName as string)
        : undefined,
    hostVocation:
      typeof data.hostVocation === "string"
        ? (data.hostVocation as Vocation)
        : undefined,
    hostLevel:
      typeof data.hostLevel === "number" ? (data.hostLevel as number) : undefined,
    server: String(data.server ?? ""),
    notes: String(data.notes ?? ""),
    requirements,
    origin,
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

function makeEntry(
  characterId: string,
  ownerId: string,
  snapshot: ApplySnapshot,
  kind: SlotEntryKind,
  ttlHours: number
): SlotEntry {
  const expiresAtMs = Date.now() + ttlHours * 60 * 60 * 1000;
  return {
    characterId,
    ownerId,
    status: "pending",
    addedAt: Timestamp.now(),
    characterName: snapshot.characterName,
    vocation: snapshot.vocation,
    level: snapshot.level,
    kind,
    expiresAt: Timestamp.fromMillis(expiresAtMs),
  };
}

function confirmedEntry(pending: SlotEntry): SlotEntry {
  return {
    ...pending,
    status: "confirmed",
    addedAt: Timestamp.now(),
    expiresAt: null,
  };
}

/**
 * Após confirmar um char na PT, remove em todos os slots quaisquer
 * applicants/invites pendentes do mesmo player (ownerId), garantindo a
 * regra de 1 char por player. Não mexe em confirmed nem no slot atual.
 */
function stripOwnerPendings(slots: Slot[], ownerId: string, skipIndex: number): Slot[] {
  return slots.map((s) => {
    if (s.index === skipIndex) return s;
    const apps = s.applicants.filter((a) => a.ownerId !== ownerId);
    const invs = s.invites.filter((i) => i.ownerId !== ownerId);
    if (apps.length === s.applicants.length && invs.length === s.invites.length) {
      return s;
    }
    return { ...s, applicants: apps, invites: invs };
  });
}

/**
 * Player se candidata a uma vaga. Se já há invite pendente pra esse char na
 * mesma vaga, vira confirmed imediatamente (cross-match).
 */
export async function applyToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string,
  ownerId: string,
  snapshot: ApplySnapshot,
  options?: { ttlHours?: number }
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  if (slot.confirmed) throw new Error("Vaga já preenchida.");
  if (slot.applicants.some((a) => a.characterId === characterId)) {
    throw new Error("Você já se candidatou nessa vaga.");
  }

  // 1 char por player: só bloqueia se já tem CONFIRMED do mesmo dono na PT.
  // Múltiplos pendings são permitidos; sweep acontece no confirm.
  const ownerAlreadyConfirmed = party.slots.some(
    (s) => s.confirmed?.ownerId === ownerId && s.confirmed.characterId !== characterId
  );
  if (ownerAlreadyConfirmed) {
    throw new Error("Você já tem outro char confirmado nessa PT.");
  }

  const matchingInvite = slot.invites.find((i) => i.characterId === characterId);
  let newSlot: Slot;
  if (matchingInvite) {
    // Cross-match: invite + apply do mesmo char na mesma vaga → confirmed
    newSlot = {
      ...slot,
      applicants: [],
      invites: [],
      confirmed: confirmedEntry(matchingInvite),
      entry: confirmedEntry(matchingInvite),
    };
  } else {
    const ttlHours = options?.ttlHours ?? 24;
    const entry = makeEntry(characterId, ownerId, snapshot, "apply", ttlHours);
    newSlot = {
      ...slot,
      applicants: [...slot.applicants, entry],
    };
  }
  let slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  if (matchingInvite) {
    slots = stripOwnerPendings(slots, ownerId, slotIndex);
  }
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });

  // Notificações
  const playerName = snapshot.characterName ?? "Um player";
  if (matchingInvite) {
    // Cross-match: ambos os lados confirmados
    if (party.hostUid && party.hostUid !== ownerId) {
      createNotification({
        userId: party.hostUid,
        type: "invite_accepted",
        title: "Convite confirmado (cross-match)",
        body: `${playerName} se candidatou e cruzou com seu convite — vaga ${slotIndex + 1} fechada.`,
        link: NOTIF_LINK,
        meta: { partyId, slotIndex },
      });
    }
    if (ownerId && ownerId !== party.hostUid) {
      createNotification({
        userId: ownerId,
        type: "application_accepted",
        title: "Confirmado na PT!",
        body: `Sua candidatura cruzou com um convite do host — você está confirmado na vaga ${slotIndex + 1}.`,
        link: NOTIF_LINK,
        meta: { partyId, slotIndex },
      });
    }
  } else if (party.hostUid && party.hostUid !== ownerId) {
    // Aplicação simples → notifica host
    createNotification({
      userId: party.hostUid,
      type: "apply_received",
      title: "Nova candidatura",
      body: `${playerName} se candidatou na vaga ${slotIndex + 1} da sua PT.`,
      link: NOTIF_LINK,
      meta: { partyId, slotIndex },
    });
  }
}

/**
 * Host convida um char pra uma vaga. Se esse char já se candidatou, vira
 * confirmed direto (cross-match).
 */
export async function inviteToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string,
  ownerId: string,
  snapshot: ApplySnapshot,
  options?: { ttlHours?: number }
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  if (slot.confirmed) throw new Error("Vaga já preenchida.");
  if (slot.invites.some((i) => i.characterId === characterId)) {
    throw new Error("Convite já enviado pra esse char.");
  }
  if (!canVocFillSlot(snapshot.vocation, slot.vocations)) {
    throw new Error("Vocação não compatível com a vaga.");
  }

  // 1 char por player: só bloqueia se já tem CONFIRMED do mesmo dono na PT.
  // Convidar múltiplos chars do mesmo player é permitido — o primeiro a virar
  // confirmed ganha e os demais pendings caem via stripOwnerPendings.
  const ownerAlreadyConfirmed = party.slots.some(
    (s) => s.confirmed?.ownerId === ownerId && s.confirmed.characterId !== characterId
  );
  if (ownerAlreadyConfirmed) {
    throw new Error("Esse player já tem outro char confirmado nessa PT.");
  }

  const matchingApply = slot.applicants.find((a) => a.characterId === characterId);
  let newSlot: Slot;
  if (matchingApply) {
    // Cross-match: apply + invite do mesmo char → confirmed (precisa respeitar lock=3)
    await assertLockSlotAvailable(characterId);
    newSlot = {
      ...slot,
      applicants: [],
      invites: [],
      confirmed: confirmedEntry(matchingApply),
      entry: confirmedEntry(matchingApply),
    };
  } else {
    const ttlHours = options?.ttlHours ?? 24;
    const entry = makeEntry(characterId, ownerId, snapshot, "invite", ttlHours);
    newSlot = {
      ...slot,
      invites: [...slot.invites, entry],
    };
  }
  let slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  if (matchingApply) {
    slots = stripOwnerPendings(slots, ownerId, slotIndex);
  }
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });

  // Notificações
  const playerName = snapshot.characterName ?? "Um player";
  const hostName = party.hostCharacterName ?? "o host";
  if (matchingApply) {
    // Cross-match: ambos os lados confirmados
    if (ownerId && ownerId !== party.hostUid) {
      createNotification({
        userId: ownerId,
        type: "application_accepted",
        title: "Confirmado na PT!",
        body: `Seu convite cruzou com uma candidatura existente — você está confirmado na vaga ${slotIndex + 1}.`,
        link: NOTIF_LINK,
        meta: { partyId, slotIndex },
      });
    }
    if (party.hostUid && party.hostUid !== ownerId) {
      createNotification({
        userId: party.hostUid,
        type: "invite_accepted",
        title: "Convite confirmado (cross-match)",
        body: `${playerName} já tinha se candidatado — vaga ${slotIndex + 1} fechada.`,
        link: NOTIF_LINK,
        meta: { partyId, slotIndex },
      });
    }
  } else if (ownerId && ownerId !== party.hostUid) {
    // Convite simples → notifica o invitee
    createNotification({
      userId: ownerId,
      type: "invite_received",
      title: "Convite recebido",
      body: `${hostName} te convidou pra vaga ${slotIndex + 1}.`,
      link: NOTIF_LINK,
      meta: { partyId, slotIndex },
    });
  }
}

/**
 * Conta em quantas PTs (forming + closed) esse char está atualmente como
 * confirmed. Usado pra impedir lock numa 4ª PT.
 */
export async function countCharLocks(characterId: string): Promise<number> {
  const snap = await getDocs(
    query(partiesCol(), where("status", "in", ["forming", "closed"]))
  );
  let count = 0;
  snap.docs.forEach((d) => {
    const party = mapParty(d);
    if (party.slots.some((s) => s.confirmed?.characterId === characterId)) {
      count++;
    }
  });
  return count;
}

async function assertLockSlotAvailable(characterId: string) {
  const locks = await countCharLocks(characterId);
  if (locks >= MAX_CONFIRMED_PTS_PER_CHAR) {
    throw new Error(
      `Char travado em ${MAX_CONFIRMED_PTS_PER_CHAR} PTs · libere uma antes de confirmar.`
    );
  }
}

/** Host aceita uma candidatura. */
export async function acceptApplication(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  if (slot.confirmed) throw new Error("Vaga já preenchida.");
  const applicant = slot.applicants.find((a) => a.characterId === characterId);
  if (!applicant) throw new Error("Candidatura não encontrada.");

  await assertLockSlotAvailable(characterId);

  const newSlot: Slot = {
    ...slot,
    applicants: [],
    invites: [],
    confirmed: confirmedEntry(applicant),
    entry: confirmedEntry(applicant),
  };
  let slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  slots = stripOwnerPendings(slots, applicant.ownerId, slotIndex);
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });

  // Notifica o candidato aceito
  if (applicant.ownerId && applicant.ownerId !== party.hostUid) {
    const hostName = party.hostCharacterName ?? "o host";
    createNotification({
      userId: applicant.ownerId,
      type: "application_accepted",
      title: "Candidatura aceita!",
      body: `${hostName} aceitou sua candidatura na vaga ${slotIndex + 1}.`,
      link: NOTIF_LINK,
      meta: { partyId, slotIndex },
    });
  }
}

/** Invitee aceita convite. */
export async function acceptInvite(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  if (slot.confirmed) throw new Error("Vaga já preenchida.");
  const invite = slot.invites.find((i) => i.characterId === characterId);
  if (!invite) throw new Error("Convite não encontrado.");

  await assertLockSlotAvailable(characterId);

  const newSlot: Slot = {
    ...slot,
    applicants: [],
    invites: [],
    confirmed: confirmedEntry(invite),
    entry: confirmedEntry(invite),
  };
  let slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  slots = stripOwnerPendings(slots, invite.ownerId, slotIndex);
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });

  // Notifica o host
  if (party.hostUid && party.hostUid !== invite.ownerId) {
    const playerName = invite.characterName ?? "Um player";
    createNotification({
      userId: party.hostUid,
      type: "invite_accepted",
      title: "Convite aceito",
      body: `${playerName} aceitou seu convite (vaga ${slotIndex + 1}).`,
      link: NOTIF_LINK,
      meta: { partyId, slotIndex },
    });
  }
}

/** Host recusa candidatura. */
export async function declineApplication(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  const newSlot: Slot = {
    ...slot,
    applicants: slot.applicants.filter((a) => a.characterId !== characterId),
  };
  const slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });
}

/** Invitee recusa convite (ou host cancela). */
export async function declineInvite(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  const newSlot: Slot = {
    ...slot,
    invites: slot.invites.filter((i) => i.characterId !== characterId),
  };
  const slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });
}

/** Alias semântico: host cancela convite. */
export const cancelInvite = declineInvite;

/** Player saca sua candidatura. */
export async function withdrawApplication(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  characterId: string
) {
  return declineApplication(partyId, party, slotIndex, characterId);
}

/** DEV only: insere um dummy confirmed no slot pra testar fluxos de host. */
export async function addDummyToSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  dummy: { characterName: string; vocation: Vocation; level: number }
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  if (slot.confirmed) throw new Error("Esta vaga já tem alguém.");
  const fakeId = `dummy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const entry: SlotEntry = {
    characterId: fakeId,
    ownerId: fakeId,
    status: "confirmed",
    addedAt: Timestamp.now(),
    characterName: dummy.characterName,
    vocation: dummy.vocation,
    level: dummy.level,
  };
  const newSlot: Slot = {
    ...slot,
    applicants: [],
    invites: [],
    confirmed: entry,
    entry,
  };
  const slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });
}

export type UpdatePartyInput = {
  notes: string;
  requirements: PartyRequirements;
  /** Composição nova (length = 5). Slots 0/1 ainda travados em EK/ED. */
  slotComposition: Vocation[][];
};

export async function updateParty(
  partyId: string,
  party: PrimalParty,
  input: UpdatePartyInput
) {
  if (input.slotComposition.length !== 5) {
    throw new Error("Composição precisa ter 5 vagas.");
  }
  const slot0 = input.slotComposition[0];
  const slot1 = input.slotComposition[1];
  if (slot0.length !== 1 || slot0[0] !== "EK") {
    throw new Error("Vaga 1 (EK) não pode ser alterada.");
  }
  if (slot1.length !== 1 || slot1[0] !== "ED") {
    throw new Error("Vaga 2 (ED) não pode ser alterada.");
  }
  const newSlots: Slot[] = party.slots.map((s, i) => {
    const vocs = input.slotComposition[i];
    return {
      ...s,
      vocations: vocs,
      vocation: vocs.length === 1 ? vocs[0] : ("ANY" as SlotVocation),
    };
  });
  await updateDoc(doc(db, "primalParties", partyId), {
    notes: input.notes,
    requirements: input.requirements,
    slots: newSlots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });
}

/** Player sai de confirmed (libera vaga sem trocar status da PT forming). */
export async function withdrawFromSlot(
  partyId: string,
  party: PrimalParty,
  slotIndex: number
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  const newSlot: Slot = { ...slot, confirmed: null, entry: null };
  const slots = party.slots.map((s) => (s.index === slotIndex ? newSlot : s));
  await updateDoc(doc(db, "primalParties", partyId), {
    slots: slots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  });
}

/**
 * @deprecated mantido só pra compat — promove pending → confirmed (usa o
 * primeiro applicant/invite encontrado). Prefira acceptApplication/acceptInvite.
 */
export async function setSlotStatus(
  partyId: string,
  party: PrimalParty,
  slotIndex: number,
  status: SlotEntryStatus
) {
  const slot = party.slots[slotIndex];
  if (!slot) throw new Error("Vaga inválida.");
  if (status === "confirmed") {
    const pending = slot.applicants[0] ?? slot.invites[0];
    if (!pending) throw new Error("Sem pendentes pra confirmar.");
    if (slot.applicants.includes(pending)) {
      return acceptApplication(partyId, party, slotIndex, pending.characterId);
    }
    return acceptInvite(partyId, party, slotIndex, pending.characterId);
  }
  // status === "pending" — sem operação direta no novo modelo
}

/**
 * Marca a PT como concluída (quest feita) — terminal, não volta.
 * Efeito colateral: cada char confirmado tem `questHistory.primal = true` e é
 * marcado como inactive na pool (já fez, não precisa mais de matchmaking).
 *
 * Estratégia de permissões:
 * - PT escreve `confirmedCharIds: string[]` denormalizado, que as Firestore
 *   rules consultam pra autorizar o host a alterar `characters` e `primalPool`
 *   de outros players.
 * - Char e pool entry recebem `lastCompletedPartyId` apontando pra esta PT.
 * - Pool não é deletada (rules de delete não conseguem fazer cross-doc lookup
 *   facilmente) — apenas vira `status: "inactive"`, que a query de listagem
 *   já filtra.
 */
export async function completeParty(partyId: string, party?: PrimalParty) {
  const confirmedCharIds = party
    ? Array.from(
        new Set(
          party.slots
            .map((s) => s.confirmed?.characterId)
            .filter((id): id is string => !!id && !id.startsWith("dummy_"))
        )
      )
    : [];

  const batch = writeBatch(db);

  batch.update(doc(db, "primalParties", partyId), {
    status: "completed" as PartyStatus,
    confirmedCharIds,
    updatedAt: serverTimestamp(),
  });

  for (const charId of confirmedCharIds) {
    batch.update(doc(db, "characters", charId), {
      "questHistory.primal": true,
      lastCompletedPartyId: partyId,
      updatedAt: serverTimestamp(),
    });
  }

  if (confirmedCharIds.length > 0) {
    const poolSnap = await getDocs(
      query(
        collection(db, "primalPool"),
        where("characterId", "in", confirmedCharIds)
      )
    );
    poolSnap.docs.forEach((d) =>
      batch.update(d.ref, {
        status: "inactive",
        lastCompletedPartyId: partyId,
        updatedAt: serverTimestamp(),
      })
    );
  }

  await batch.commit();
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
  const leaving =
    party.slots.find((s) => s.index === slotIndex) ?? party.slots[slotIndex];
  if (!leaving?.confirmed) throw new Error("Vaga vazia.");
  const wasHost = leaving.confirmed.characterId === party.hostCharacterId;
  const isSuggestionOrigin = party.origin === "suggestion";

  // Slot do player que sai: confirmed/entry zerado.
  // Se a PT veio da sugestão automática, vaga vacated vira flex (vocations=[]).
  // Se for manual, mantém vocs originais que o host configurou.
  const newSlots = party.slots.map((s, i) => {
    if (s.index === slotIndex || i === slotIndex) {
      const next: Slot = {
        ...s,
        confirmed: null,
        entry: null,
        applicants: [],
        invites: [],
      };
      if (isSuggestionOrigin) {
        next.vocations = [];
        next.vocation = "ANY";
      }
      return next;
    }
    return s;
  });
  const remaining = newSlots.filter((s) => s.confirmed);

  if (remaining.length === 0) {
    await updateDoc(doc(db, "primalParties", partyId), {
      status: "cancelled" as PartyStatus,
      slots: newSlots.map(serializeSlot),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const update: Record<string, unknown> = {
    status: "forming" as PartyStatus,
    closedAt: null,
    slots: newSlots.map(serializeSlot),
    updatedAt: serverTimestamp(),
  };

  // PTs vindas da sugestão automática "ressuscitam" com requirements minimas:
  // lvl 600 mínimo, demais filtros desativados. Manuais mantêm config do host.
  if (isSuggestionOrigin) {
    update.requirements = {
      minLevel: { active: true, value: PRIMAL_PARTY_MIN_LEVEL },
      minHazard: { active: false, value: 0 },
      schedule: { active: false, value: [] },
      experienced: { active: false },
      questDone: { active: false, value: false },
    } satisfies PartyRequirements;
  }

  if (wasHost) {
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    update.hostUid = pick.confirmed!.ownerId;
    update.hostCharacterId = pick.confirmed!.characterId;
    if (pick.confirmed!.characterName) update.hostCharacterName = pick.confirmed!.characterName;
    if (pick.confirmed!.vocation) update.hostVocation = pick.confirmed!.vocation;
    if (typeof pick.confirmed!.level === "number") update.hostLevel = pick.confirmed!.level;
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
 * Fecha a PT, trava os 5 chars confirmados, e em todas as outras PTs forming:
 * - se um char locked está confirmed em outra → remove (e se for host, transfere/cancela)
 * - se um char locked está como applicant ou invite em outra → remove a entry
 */
export async function closePartyAndLock(partyId: string, party: PrimalParty) {
  const allConfirmed = party.slots.every((s) => s.confirmed);
  if (!allConfirmed) {
    throw new Error("Todas as vagas precisam estar confirmadas pra fechar.");
  }
  const lockedCharIds = new Set(
    party.slots.map((s) => s.confirmed!.characterId)
  );

  const formingSnap = await getDocs(
    query(partiesCol(), where("status", "==", "forming"))
  );

  const batch = writeBatch(db);

  batch.update(doc(db, "primalParties", partyId), {
    status: "closed" as PartyStatus,
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  formingSnap.docs.forEach((d) => {
    if (d.id === partyId) return;
    const other = mapParty(d);
    const hostLocked = lockedCharIds.has(other.hostCharacterId);

    let slotsChanged = false;
    const newSlots = other.slots.map((s) => {
      let next = s;
      // Remove de applicants/invites
      const filteredApps = s.applicants.filter(
        (a) => !lockedCharIds.has(a.characterId)
      );
      const filteredInvs = s.invites.filter(
        (i) => !lockedCharIds.has(i.characterId)
      );
      if (
        filteredApps.length !== s.applicants.length ||
        filteredInvs.length !== s.invites.length
      ) {
        next = { ...next, applicants: filteredApps, invites: filteredInvs };
        slotsChanged = true;
      }
      // Remove confirmed se locked
      if (s.confirmed && lockedCharIds.has(s.confirmed.characterId)) {
        next = { ...next, confirmed: null, entry: null };
        slotsChanged = true;
      }
      return next;
    });

    if (hostLocked) {
      const remaining = newSlots.filter((s) => s.confirmed);
      if (remaining.length === 0) {
        batch.update(doc(db, "primalParties", d.id), {
          status: "cancelled" as PartyStatus,
          slots: newSlots.map(serializeSlot),
          updatedAt: serverTimestamp(),
        });
      } else {
        const pick = remaining[Math.floor(Math.random() * remaining.length)];
        const transferUpdate: Record<string, unknown> = {
          hostUid: pick.confirmed!.ownerId,
          hostCharacterId: pick.confirmed!.characterId,
          slots: newSlots.map(serializeSlot),
          updatedAt: serverTimestamp(),
        };
        if (pick.confirmed!.characterName)
          transferUpdate.hostCharacterName = pick.confirmed!.characterName;
        if (pick.confirmed!.vocation)
          transferUpdate.hostVocation = pick.confirmed!.vocation;
        if (typeof pick.confirmed!.level === "number")
          transferUpdate.hostLevel = pick.confirmed!.level;
        batch.update(doc(db, "primalParties", d.id), transferUpdate);
      }
    } else if (slotsChanged) {
      batch.update(doc(db, "primalParties", d.id), {
        slots: newSlots.map(serializeSlot),
        updatedAt: serverTimestamp(),
      });
    }
  });

  await batch.commit();

  // Notifica todos os confirmados exceto o host
  const hostName = party.hostCharacterName ?? "o host";
  const recipientIds = party.slots
    .map((s) => s.confirmed?.ownerId)
    .filter(
      (uid): uid is string => !!uid && uid !== party.hostUid && !uid.startsWith("dummy_")
    );
  if (recipientIds.length > 0) {
    createNotificationsBulk(recipientIds, {
      type: "party_closed",
      title: "PT fechada!",
      body: `A PT do ${hostName} foi fechada com todos os players confirmados.`,
      link: NOTIF_LINK,
      meta: { partyId },
    });
  }
}
