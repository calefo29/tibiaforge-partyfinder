import { Vocation } from "./characters";
import { PrimalPoolEntry, Turno, TURNOS } from "./primal-pool";
import { SuggestionSlot } from "./primal-suggestions";

export type MatchablePool = PrimalPoolEntry & { vocation: Vocation };

export type Partition = {
  server: string;
  slots: SuggestionSlot[];
  commonTurns: Turno[];
  levelAvg: number;
  experiencedCount: number;
};

/**
 * Gera N tentativas de partição da pool em PTs e escolhe a partição
 * com melhor score (menor variância de level médio + melhor mix de exp).
 *
 * Hard rules da composição (cada PT):
 * - Exatamente 1 EK
 * - 1 ou 2 EDs (nunca 0, nunca 3+)
 * - Pelo menos 1 RP (Paladin)
 * - No máximo 1 EM (Monk)
 * - MS livre
 * - Total: 5 chars
 *
 * Outras hard rules:
 * - Mesmo server
 * - ≥1 turno em comum entre os 5
 * - 1 char por player na mesma PT
 *
 * Soft rules (usadas no score, não bloqueiam):
 * - Balancear level médio entre as PTs do mesmo server
 * - Balancear mix de experientes/novatos
 */
export function buildBestPartitionForServer(
  pool: MatchablePool[],
  tries = 50
): SuggestionSlot[][] {
  if (pool.length < 5) return [];

  let best: SuggestionSlot[][] = [];
  let bestScore = Infinity;

  for (let t = 0; t < tries; t++) {
    const attempt = greedyPartition(pool);
    if (attempt.length === 0) continue;
    const score = scorePartition(attempt);
    if (score < bestScore) {
      bestScore = score;
      best = attempt;
    }
  }
  return best;
}

/** Embaralha e tenta montar quantas PTs der via greedy. */
function greedyPartition(pool: MatchablePool[]): SuggestionSlot[][] {
  const used = new Set<string>();
  const result: SuggestionSlot[][] = [];

  while (true) {
    const remaining = pool.filter((e) => !used.has(e.characterId));
    const formed = tryFormParty(remaining);
    if (!formed) break;
    formed.forEach((slot) => used.add(slot.characterId));
    result.push(formed);
  }

  return result;
}

const MAX_BY_VOC: Partial<Record<Vocation, number>> = {
  EK: 1,
  ED: 2,
  EM: 1,
};

function tryFormParty(pool: MatchablePool[]): SuggestionSlot[] | null {
  const eks = shuffle(pool.filter((p) => p.vocation === "EK"));
  const eds = shuffle(pool.filter((p) => p.vocation === "ED"));
  const rps = shuffle(pool.filter((p) => p.vocation === "RP"));
  if (eks.length === 0 || eds.length === 0 || rps.length === 0) return null;

  // 1. Pick obrigatórios (1 EK + 1 ED + 1 RP) com owners distintos
  const picked: MatchablePool[] = [];
  const owners = new Set<string>();
  const counts: Record<string, number> = { EK: 0, ED: 0, RP: 0, MS: 0, EM: 0 };

  const ek = eks[0];
  picked.push(ek); owners.add(ek.ownerId); counts.EK++;

  const ed = eds.find((e) => !owners.has(e.ownerId));
  if (!ed) return null;
  picked.push(ed); owners.add(ed.ownerId); counts.ED++;

  const rp = rps.find((e) => !owners.has(e.ownerId));
  if (!rp) return null;
  picked.push(rp); owners.add(rp.ownerId); counts.RP++;

  // Verifica turno comum inicial
  if (intersectTurns(picked.map((p) => p.availability)).length === 0) return null;

  // 2. Preenche 2 vagas restantes — respeitando max counts + turno overlap + owner único
  const candidates = shuffle(
    pool.filter(
      (p) =>
        !picked.find((x) => x.characterId === p.characterId) &&
        !owners.has(p.ownerId)
    )
  );

  while (picked.length < 5) {
    const next = candidates.find((c) => {
      const max = MAX_BY_VOC[c.vocation];
      if (max != null && counts[c.vocation] >= max) return false;
      if (owners.has(c.ownerId)) return false;
      const newCommon = intersectTurns(
        [...picked.map((p) => p.availability), c.availability]
      );
      return newCommon.length > 0;
    });
    if (!next) return null;
    picked.push(next);
    owners.add(next.ownerId);
    counts[next.vocation]++;
    const idx = candidates.indexOf(next);
    if (idx >= 0) candidates.splice(idx, 1);
  }

  // 3. Valida composição final
  if (counts.EK !== 1) return null;
  if (counts.ED < 1 || counts.ED > 2) return null;
  if (counts.RP < 1) return null;
  if (counts.EM > 1) return null;

  return picked.map((entry, i) => entryToSlot(entry, i));
}

function intersectTurns(lists: Turno[][]): Turno[] {
  if (lists.length === 0) return [...TURNOS];
  return TURNOS.filter((t) => lists.every((l) => l.includes(t)));
}

function entryToSlot(e: MatchablePool, index: number): SuggestionSlot {
  return {
    index,
    characterId: e.characterId,
    ownerId: e.ownerId,
    characterName: e.characterName,
    vocation: e.vocation,
    level: e.level,
    hasExperience: !!e.experience,
    availability: e.availability,
  };
}

/**
 * Score (menor = melhor):
 * - desvio padrão do level médio entre as PTs
 * - desvio padrão da contagem de experientes entre as PTs
 */
function scorePartition(parts: SuggestionSlot[][]): number {
  if (parts.length === 0) return Infinity;
  const levelAvgs = parts.map(
    (p) => p.reduce((acc, s) => acc + s.level, 0) / p.length
  );
  const expCounts = parts.map(
    (p) => p.filter((s) => s.hasExperience).length
  );
  return stdev(levelAvgs) + stdev(expCounts) * 50;
}

function stdev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((acc, x) => acc + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function computePartitionMeta(slots: SuggestionSlot[]): {
  commonTurns: Turno[];
  levelAvg: number;
  experiencedCount: number;
} {
  const commonTurns = intersectTurns(slots.map((s) => s.availability));
  const levelAvg = Math.round(
    slots.reduce((acc, s) => acc + s.level, 0) / slots.length
  );
  const experiencedCount = slots.filter((s) => s.hasExperience).length;
  return { commonTurns, levelAvg, experiencedCount };
}
