import {
  addDoc,
  collection,
  doc,
  getDoc,
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
import { Turno } from "./primal-pool";
import {
  PartyStatus,
  PrimalParty,
  Slot,
  SlotEntry,
} from "./primal-parties";

export type SuggestionStatus =
  | "pending"
  | "promoted"
  | "declined"
  | "expired";

export type SuggestionSlot = {
  index: number;
  characterId: string;
  ownerId: string;
  characterName: string;
  vocation: Vocation;
  level: number;
  hasExperience: boolean;
  availability: Turno[];
};

export type PrimalSuggestion = {
  id: string;
  cycleDate: string; // YYYY-MM-DD do ciclo (server save BRT)
  server: string;
  slots: SuggestionSlot[];
  acceptedBy: string[]; // characterIds que aceitaram
  declinedBy: string | null; // characterId que recusou (se houver)
  status: SuggestionStatus;
  commonTurns: Turno[]; // turnos em que todos os 5 chars têm disponibilidade
  levelAvg: number;
  experiencedCount: number;
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
};

const suggestionsCol = () => collection(db, "primalSuggestions");

function mapSuggestion(
  d: import("firebase/firestore").QueryDocumentSnapshot
): PrimalSuggestion {
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    cycleDate: String(data.cycleDate ?? ""),
    server: String(data.server ?? ""),
    slots: ((data.slots as SuggestionSlot[] | undefined) ?? []).map((s, i) => ({
      index: typeof s.index === "number" ? s.index : i,
      characterId: s.characterId,
      ownerId: s.ownerId,
      characterName: s.characterName ?? "",
      vocation: s.vocation,
      level: s.level ?? 0,
      hasExperience: !!s.hasExperience,
      availability: (s.availability ?? []) as Turno[],
    })),
    acceptedBy: (data.acceptedBy as string[] | undefined) ?? [],
    declinedBy: (data.declinedBy as string | null | undefined) ?? null,
    status: (data.status as SuggestionStatus) ?? "pending",
    commonTurns: (data.commonTurns as Turno[] | undefined) ?? [],
    levelAvg: (data.levelAvg as number | undefined) ?? 0,
    experiencedCount: (data.experiencedCount as number | undefined) ?? 0,
    createdAt: (data.createdAt as Timestamp) ?? null,
    expiresAt: (data.expiresAt as Timestamp) ?? null,
  };
}

/**
 * Subscribe a todas as sugestões "vivas" (pending ou declined recentes) que
 * envolvem ao menos um dos chars do user. Firestore não suporta query
 * "array contains any em array de objetos", então fazemos um listener amplo
 * de sugestões com status pending|declined e filtramos client-side por
 * characterId. O volume é baixo (poucos docs por ciclo).
 */
export function subscribeToMySuggestions(
  myCharacterIds: string[],
  cb: (suggestions: PrimalSuggestion[]) => void,
  onError?: (err: Error) => void
) {
  const charSet = new Set(myCharacterIds);
  const q = query(
    suggestionsCol(),
    where("status", "in", ["pending", "declined"])
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map(mapSuggestion)
        .filter((s) => s.slots.some((slot) => charSet.has(slot.characterId)));
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

/** Lista os characterIds atualmente locked (em PT status "closed"). */
export async function fetchLockedCharacterIds(): Promise<Set<string>> {
  const snap = await getDocs(
    query(collection(db, "primalParties"), where("status", "==", "closed"))
  );
  const locked = new Set<string>();
  snap.docs.forEach((d) => {
    const data = d.data();
    const slots = (data.slots as Slot[] | undefined) ?? [];
    slots.forEach((s) => {
      if (s.entry?.characterId) locked.add(s.entry.characterId);
    });
  });
  return locked;
}

export type AcceptResult =
  | { ok: true; promoted: boolean }
  | { ok: false; reason: string };

/**
 * Player aceita a sugestão com seu char. Se chegou em 5 aceites, promove
 * a sugestão pra PT closed e dispara lock cruzado.
 */
export async function acceptSuggestion(
  suggestionId: string,
  characterId: string
): Promise<AcceptResult> {
  const ref = doc(db, "primalSuggestions", suggestionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: "Sugestão não encontrada." };
  const sug = mapSuggestion(snap as unknown as import("firebase/firestore").QueryDocumentSnapshot);

  if (sug.status !== "pending") {
    return { ok: false, reason: "Sugestão não está mais aberta." };
  }
  if (!sug.slots.some((s) => s.characterId === characterId)) {
    return { ok: false, reason: "Esse char não está nesta sugestão." };
  }
  if (sug.acceptedBy.includes(characterId)) {
    return { ok: false, reason: "Char já aceitou." };
  }

  // Revalida: nenhum char da sugestão pode estar locked agora
  const locked = await fetchLockedCharacterIds();
  if (locked.has(characterId)) {
    return { ok: false, reason: "Seu char está locked em outra PT fechada." };
  }
  // (Os outros 4 podem estar locked — nesse caso o accept ainda funciona, mas
  // a promoção vai falhar; revalidamos abaixo na hora da promoção.)

  const newAccepted = [...sug.acceptedBy, characterId];
  const willPromote = newAccepted.length === sug.slots.length;

  if (!willPromote) {
    await updateDoc(ref, { acceptedBy: newAccepted });
    return { ok: true, promoted: false };
  }

  // Vai promover: revalida que NENHUM dos 5 está locked
  for (const slot of sug.slots) {
    if (locked.has(slot.characterId)) {
      return {
        ok: false,
        reason: `${slot.characterName} está locked em outra PT — sugestão não pode fechar.`,
      };
    }
  }

  await promoteSuggestionToParty(sug, newAccepted);
  return { ok: true, promoted: true };
}

/** Player recusa a sugestão — marca status "declined" e ela fica visível
 * pra todos verem que foi recusada (até o próximo cron expirar). */
export async function declineSuggestion(
  suggestionId: string,
  characterId: string
): Promise<{ ok: boolean; reason?: string }> {
  const ref = doc(db, "primalSuggestions", suggestionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: "Sugestão não encontrada." };
  const sug = mapSuggestion(snap as unknown as import("firebase/firestore").QueryDocumentSnapshot);
  if (sug.status !== "pending") {
    return { ok: false, reason: "Sugestão não está mais aberta." };
  }
  if (!sug.slots.some((s) => s.characterId === characterId)) {
    return { ok: false, reason: "Esse char não está nesta sugestão." };
  }
  await updateDoc(ref, {
    status: "declined" as SuggestionStatus,
    declinedBy: characterId,
  });
  return { ok: true };
}

/**
 * Cria a PrimalParty `closed` a partir da sugestão + roda lock cruzado
 * (igual ao closePartyAndLock): remove esses 5 chars de qualquer outra PT
 * em formação, transfere host ou cancela quando necessário.
 */
async function promoteSuggestionToParty(
  sug: PrimalSuggestion,
  acceptedBy: string[]
) {
  // Slot escolhido pra host: vamos sortear entre os 5
  const hostIdx = Math.floor(Math.random() * sug.slots.length);
  const hostSlot = sug.slots[hostIdx];

  // Monta os slots no formato PrimalParty (schema novo + mirrors deprecated)
  const slots: Slot[] = sug.slots.map((s) => {
    const entry: SlotEntry = {
      characterId: s.characterId,
      ownerId: s.ownerId,
      status: "confirmed",
      addedAt: Timestamp.now(),
      characterName: s.characterName,
      vocation: s.vocation,
      level: s.level,
    };
    const vocations: Vocation[] =
      s.vocation === "EK" || s.vocation === "ED" ? [s.vocation] : [];
    return {
      index: s.index,
      vocations,
      applicants: [],
      invites: [],
      confirmed: entry,
      // deprecated mirrors mantidos pra leitores diretos (cron, etc)
      entry,
      vocation: vocations.length === 1 ? vocations[0] : "ANY",
    };
  });

  const newPartyRef = await addDoc(collection(db, "primalParties"), {
    hostUid: hostSlot.ownerId,
    hostCharacterId: hostSlot.characterId,
    server: sug.server,
    notes: `Formada via sugestão automática (#${sug.id.slice(0, 4).toUpperCase()})`,
    requirements: {
      minLevel: { active: false, value: 600 },
      minHazard: { active: false, value: 0 },
      schedule: { active: false, value: [] },
      experienced: { active: false },
    },
    status: "closed" as PartyStatus,
    slots,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    closedAt: serverTimestamp(),
    sourceSuggestionId: sug.id,
  });

  // Marca a sugestão como promoted
  await updateDoc(doc(db, "primalSuggestions", sug.id), {
    status: "promoted" as SuggestionStatus,
    acceptedBy,
    promotedPartyId: newPartyRef.id,
  });

  // Lock cruzado: remove esses 5 chars de qualquer outra PT forming
  const lockedCharIds = new Set(sug.slots.map((s) => s.characterId));
  const formingSnap = await getDocs(
    query(collection(db, "primalParties"), where("status", "==", "forming"))
  );

  const batch = writeBatch(db);
  formingSnap.docs.forEach((d) => {
    if (d.id === newPartyRef.id) return;
    const data = d.data() as Record<string, unknown>;
    const otherSlots = ((data.slots as Slot[] | undefined) ?? []).map((s) => ({
      index: s.index,
      vocation: s.vocation,
      entry: s.entry,
    }));
    const hostCharacterId = String(data.hostCharacterId ?? "");
    const hostLocked = lockedCharIds.has(hostCharacterId);

    let slotsChanged = false;
    const newSlots = otherSlots.map((s) => {
      if (s.entry && lockedCharIds.has(s.entry.characterId)) {
        slotsChanged = true;
        return { ...s, entry: null };
      }
      return s;
    });

    if (hostLocked) {
      const remaining = newSlots.filter((s) => s.entry);
      if (remaining.length === 0) {
        batch.update(d.ref, {
          status: "cancelled" as PartyStatus,
          slots: newSlots,
          updatedAt: serverTimestamp(),
        });
      } else {
        const pick = remaining[Math.floor(Math.random() * remaining.length)];
        batch.update(d.ref, {
          hostUid: pick.entry!.ownerId,
          hostCharacterId: pick.entry!.characterId,
          slots: newSlots,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (slotsChanged) {
      batch.update(d.ref, { slots: newSlots, updatedAt: serverTimestamp() });
    }
  });

  await batch.commit();
}

/** Verifica se o ciclo atual já rodou (existe pelo menos 1 suggestion com cycleDate). */
export async function hasCurrentCycleRun(cycleDate: string): Promise<boolean> {
  const snap = await getDocs(
    query(suggestionsCol(), where("cycleDate", "==", cycleDate))
  );
  return !snap.empty;
}

/** Retorna referência ao timestamp do próximo server save (10h BRT). */
export function nextServerSave(now: Date = new Date()): Date {
  // BRT = UTC-3 (sem DST desde 2019). 10h BRT = 13h UTC.
  const next = new Date(now);
  next.setUTCHours(13, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/** YYYY-MM-DD do ciclo atual (BRT). */
export function currentCycleDate(now: Date = new Date()): string {
  // Quem está antes das 10h BRT pertence ao ciclo do dia anterior;
  // quem está depois pertence ao ciclo do dia.
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  if (brt.getUTCHours() < 10) {
    brt.setUTCDate(brt.getUTCDate() - 1);
  }
  return brt.toISOString().slice(0, 10);
}
