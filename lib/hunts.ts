/**
 * Hunt Parties — PTs cadastradas pra concorrer no planilhado de Hunts da guild.
 *
 * Conceito diferente das PTs do /quest/primal (quest party). Aqui:
 *  - Mínimo 5 chars, sem máximo definido
 *  - Composição livre (qualquer voc, sem regra de 1 EK + 1 ED + ...)
 *  - Todos os chars no mesmo servidor
 *  - 1 char por player (não pode ter 2 chars do mesmo dono na mesma PT de hunt)
 *  - Chars precisam estar cadastrados em /perfil (collection `characters`)
 *
 * Por enquanto a PT é só o "time" — o sorteio + alocação em slots de resp vem em sprint futuro.
 */

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
import { Character, Vocation } from "./characters";

export const HUNT_PARTY_MIN_SIZE = 4;
export const HUNT_PARTY_MAX_SIZE = 5;

export type HuntPartyMember = {
  characterId: string;
  ownerId: string;
  /** Snapshot pra exibição rápida — fonte de verdade fica em characters/{id}. */
  name: string;
  vocation: Vocation;
  level: number;
};

export type HuntParty = {
  id: string;
  server: string;
  /** Líder que cadastrou a PT (uid). */
  ownerId: string;
  members: HuntPartyMember[];
  /** Média de lvl dos 4 chars mais altos. Usado pra rank em desempate. */
  levelTop4Avg: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type HuntPartyInput = {
  server: string;
  members: HuntPartyMember[];
};

const huntPartiesCol = () => collection(db, "huntParties");

/** Calcula a média de lvl dos top 4 chars da composição. */
export function calcLevelTop4Avg(members: HuntPartyMember[]): number {
  if (members.length === 0) return 0;
  const sorted = [...members].sort((a, b) => b.level - a.level);
  const top = sorted.slice(0, 4);
  const sum = top.reduce((acc, m) => acc + (m.level || 0), 0);
  return Math.round(sum / top.length);
}

/**
 * Valida regras de composição. Retorna mensagem de erro ou null se ok.
 * - mín N chars (HUNT_PARTY_MIN_SIZE)
 * - todos no mesmo servidor
 * - 1 char por player (ownerId único)
 * - chars distintos (characterId único)
 */
export function validateHuntComposition(
  members: HuntPartyMember[]
): string | null {
  if (members.length < HUNT_PARTY_MIN_SIZE) {
    return `A PT precisa de no mínimo ${HUNT_PARTY_MIN_SIZE} personagens.`;
  }
  if (members.length > HUNT_PARTY_MAX_SIZE) {
    return `A PT pode ter no máximo ${HUNT_PARTY_MAX_SIZE} personagens.`;
  }

  // Server-cross-check fica a cargo do caller (que tem acesso ao Character.server).
  // Aqui só validamos integridade dos members (sem duplicatas de char ou de player).

  const charIds = new Set<string>();
  for (const m of members) {
    if (charIds.has(m.characterId)) {
      return `Personagem "${m.name}" foi adicionado duas vezes.`;
    }
    charIds.add(m.characterId);
  }

  const ownerIds = new Set<string>();
  for (const m of members) {
    if (ownerIds.has(m.ownerId)) {
      const dup = members.find((x) => x.ownerId === m.ownerId && x.characterId !== m.characterId);
      return `Não pode ter dois personagens do mesmo player (${m.name} e ${dup?.name ?? "outro"}).`;
    }
    ownerIds.add(m.ownerId);
  }

  return null;
}

/**
 * Cria uma HuntParty. Valida composição e checa conflito de horário cross-PT (TODO sprint do sorteio).
 * Por ora não há slots alocados, então não há conflito real ainda.
 */
export async function createHuntParty(
  ownerId: string,
  input: HuntPartyInput
): Promise<string> {
  if (!input.server) throw new Error("Servidor é obrigatório.");

  const compositionError = validateHuntComposition(input.members);
  if (compositionError) throw new Error(compositionError);

  // O caller (modal) já valida que todos os chars são do servidor escolhido.
  // Aqui confiamos no input — fonte de verdade do server fica no character doc.

  const levelTop4Avg = calcLevelTop4Avg(input.members);

  const ref = await addDoc(huntPartiesCol(), {
    server: input.server,
    ownerId,
    members: input.members.map((m) => ({
      characterId: m.characterId,
      ownerId: m.ownerId,
      name: m.name,
      vocation: m.vocation,
      level: m.level,
    })),
    levelTop4Avg,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function deleteHuntParty(id: string) {
  await deleteDoc(doc(db, "huntParties", id));
}

/* ───────── Gestão de members (líder/admin) ───────── */

/**
 * Confere se o user tem autoridade pra modificar a PT (líder dela ou admin).
 * Lança erro se não tiver.
 */
function assertCanManage(
  party: HuntParty,
  actingUid: string,
  isAdmin: boolean
) {
  if (isAdmin) return;
  if (party.ownerId !== actingUid) {
    throw new Error("Só o líder da PT pode fazer essa ação.");
  }
}

function serializeMembers(members: HuntPartyMember[]): Record<string, unknown>[] {
  return members.map((m) => ({
    characterId: m.characterId,
    ownerId: m.ownerId,
    name: m.name,
    vocation: m.vocation,
    level: m.level,
  }));
}

/**
 * Líder/admin remove um member da PT. Não pode remover o próprio líder
 * (esse fluxo é via transferLeadershipAndLeave). Min size respeitado.
 */
export async function removeMemberFromHuntParty(
  partyId: string,
  party: HuntParty,
  characterId: string,
  actingUid: string,
  isAdmin: boolean
) {
  assertCanManage(party, actingUid, isAdmin);
  const target = party.members.find((m) => m.characterId === characterId);
  if (!target) throw new Error("Membro não encontrado na PT.");
  if (target.ownerId === party.ownerId) {
    throw new Error(
      "Não dá pra remover o líder direto — use 'Sair da PT' ou 'Transferir liderança'."
    );
  }
  const next = party.members.filter((m) => m.characterId !== characterId);
  if (next.length < HUNT_PARTY_MIN_SIZE) {
    throw new Error(
      `PT ficaria com ${next.length} chars (mínimo é ${HUNT_PARTY_MIN_SIZE}). Adicione alguém antes de remover.`
    );
  }
  await updateDoc(doc(db, "huntParties", partyId), {
    members: serializeMembers(next),
    levelTop4Avg: calcLevelTop4Avg(next),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Líder/admin adiciona um novo member. Valida cap, server, char/owner único.
 */
export async function addMemberToHuntParty(
  partyId: string,
  party: HuntParty,
  newMember: HuntPartyMember,
  actingUid: string,
  isAdmin: boolean
) {
  assertCanManage(party, actingUid, isAdmin);
  if (party.members.length >= HUNT_PARTY_MAX_SIZE) {
    throw new Error(`PT já está cheia (${HUNT_PARTY_MAX_SIZE} chars).`);
  }
  if (party.members.some((m) => m.characterId === newMember.characterId)) {
    throw new Error("Esse personagem já está na PT.");
  }
  if (party.members.some((m) => m.ownerId === newMember.ownerId)) {
    throw new Error("Esse player já tem outro char na PT.");
  }
  const next = [...party.members, newMember];
  await updateDoc(doc(db, "huntParties", partyId), {
    members: serializeMembers(next),
    levelTop4Avg: calcLevelTop4Avg(next),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Member não-líder sai da PT. Líder não pode usar — tem que transferir
 * primeiro via transferLeadershipAndLeave. Respeita min size.
 */
export async function leaveHuntParty(
  partyId: string,
  party: HuntParty,
  leavingOwnerId: string
) {
  if (party.ownerId === leavingOwnerId) {
    throw new Error(
      "Líder não pode sair direto — transfira a liderança antes."
    );
  }
  const target = party.members.find((m) => m.ownerId === leavingOwnerId);
  if (!target) throw new Error("Você não está nessa PT.");
  const next = party.members.filter((m) => m.ownerId !== leavingOwnerId);
  if (next.length < HUNT_PARTY_MIN_SIZE) {
    throw new Error(
      `PT ficaria com ${next.length} chars (mínimo é ${HUNT_PARTY_MIN_SIZE}).`
    );
  }
  await updateDoc(doc(db, "huntParties", partyId), {
    members: serializeMembers(next),
    levelTop4Avg: calcLevelTop4Avg(next),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Líder transfere liderança pra outro member e SAI da PT (combo atômico).
 * Min size respeitado após a saída.
 */
export async function transferLeadershipAndLeaveHuntParty(
  partyId: string,
  party: HuntParty,
  newOwnerUid: string,
  actingUid: string,
  isAdmin: boolean
) {
  assertCanManage(party, actingUid, isAdmin);
  if (newOwnerUid === party.ownerId) {
    throw new Error("Escolha outro player pra ser o líder.");
  }
  const newLeader = party.members.find((m) => m.ownerId === newOwnerUid);
  if (!newLeader) throw new Error("Novo líder precisa estar na PT.");
  const next = party.members.filter((m) => m.ownerId !== party.ownerId);
  if (next.length < HUNT_PARTY_MIN_SIZE) {
    throw new Error(
      `PT ficaria com ${next.length} chars (mínimo é ${HUNT_PARTY_MIN_SIZE}).`
    );
  }
  await updateDoc(doc(db, "huntParties", partyId), {
    ownerId: newOwnerUid,
    members: serializeMembers(next),
    levelTop4Avg: calcLevelTop4Avg(next),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Líder passa liderança pra outro member mas continua na PT.
 * Sem confirmações extras — só troca o ownerId.
 */
export async function transferLeadershipHuntParty(
  partyId: string,
  party: HuntParty,
  newOwnerUid: string,
  actingUid: string,
  isAdmin: boolean
) {
  assertCanManage(party, actingUid, isAdmin);
  if (newOwnerUid === party.ownerId) {
    throw new Error("Escolha outro player pra ser o líder.");
  }
  if (!party.members.some((m) => m.ownerId === newOwnerUid)) {
    throw new Error("Novo líder precisa estar na PT.");
  }
  await updateDoc(doc(db, "huntParties", partyId), {
    ownerId: newOwnerUid,
    updatedAt: serverTimestamp(),
  });
}

function mapHuntParty(snap: { id: string; data: () => Record<string, unknown> }): HuntParty {
  const d = snap.data() as Record<string, unknown>;
  const rawMembers = (d.members as HuntPartyMember[] | undefined) ?? [];
  return {
    id: snap.id,
    server: (d.server as string) ?? "",
    ownerId: (d.ownerId as string) ?? "",
    members: rawMembers,
    levelTop4Avg: (d.levelTop4Avg as number) ?? calcLevelTop4Avg(rawMembers),
    createdAt: (d.createdAt as Timestamp | null) ?? null,
    updatedAt: (d.updatedAt as Timestamp | null) ?? null,
  };
}

/** Subscribe a todas as PTs cadastradas (futuro: filtrar por server). */
export function subscribeToAllHuntParties(
  cb: (parties: HuntParty[]) => void
): () => void {
  const q = query(huntPartiesCol(), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => mapHuntParty(d)));
  });
}

/** Subscribe só nas PTs criadas pelo user (Minhas PTs). */
export function subscribeToMyHuntParties(
  ownerId: string,
  cb: (parties: HuntParty[]) => void
): () => void {
  const q = query(
    huntPartiesCol(),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => mapHuntParty(d)));
  });
}

/**
 * Busca todos os characters de qualquer player (cross-user) pra autocomplete na criação de PT.
 * Cuidado: lê collection inteira. Vai escalar mal — quando passar de ~500 chars, mudar pra busca
 * por prefix de nome via Firestore (`where("nameLower", ">=", q)` + `< q + ''`).
 */
export async function fetchAllCharactersOnce(): Promise<Character[]> {
  const snap = await getDocs(collection(db, "characters"));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      ownerId: (data.ownerId as string) ?? "",
      name: (data.name as string) ?? "",
      vocation: (data.vocation as Character["vocation"]) ?? "EK",
      level: (data.level as number) ?? 0,
      server: (data.server as string) ?? "",
      questHistory: (data.questHistory as Character["questHistory"]) ?? {
        primal: false,
        soulwar: false,
      },
      createdAt: (data.createdAt as Timestamp | null) ?? null,
      updatedAt: (data.updatedAt as Timestamp | null) ?? null,
    };
  });
}

/** Util: pega um char por id (usado pra refresh de snapshot caso member fique stale). */
export async function getCharacterById(id: string): Promise<Character | null> {
  const snap = await getDoc(doc(db, "characters", id));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    ownerId: (data.ownerId as string) ?? "",
    name: (data.name as string) ?? "",
    vocation: (data.vocation as Character["vocation"]) ?? "EK",
    level: (data.level as number) ?? 0,
    server: (data.server as string) ?? "",
    questHistory: (data.questHistory as Character["questHistory"]) ?? {
      primal: false,
      soulwar: false,
    },
    createdAt: (data.createdAt as Timestamp | null) ?? null,
    updatedAt: (data.updatedAt as Timestamp | null) ?? null,
  };
}
