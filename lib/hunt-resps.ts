/**
 * Catálogo de resps (respawns/hunts) usados no planilhado da guild.
 *
 * Por enquanto hardcoded — baseado no calendário do fatal.team/planilha/calendario/serenian-iii.
 * Quando o Tibia recebe atualização nova, esse catálogo pode mudar; ainda assim é raro o
 * suficiente pra não justificar tela admin (mexer no código + redeploy é aceitável).
 *
 * Cada resp pertence a um GROUP (Soulwar, Gnomprona, etc) e tem uma DURAÇÃO (semanas) que
 * define quanto tempo a PT vencedora do sorteio "trava" aquele slot.
 */

export type HuntRespGroup =
  | "soulwar"
  | "gnomprona"
  | "rotten-blood"
  | "crypt"
  | "livraria"
  | "inferniarch"
  | "mega-dragon"
  | "goanna";

export type HuntResp = {
  id: string;
  group: HuntRespGroup;
  name: string;
  /** Quantas semanas a PT trava o slot ao ganhar. Rotten Blood = 2, demais = 1. */
  durationWeeks: 1 | 2;
};

export const HUNT_GROUP_LABELS: Record<HuntRespGroup, string> = {
  soulwar: "Soulwar",
  gnomprona: "Gnomprona",
  "rotten-blood": "Rotten Blood",
  crypt: "Crypt",
  livraria: "Livraria",
  inferniarch: "Inferniarch",
  "mega-dragon": "Mega Dragon",
  goanna: "Goanna",
};

/** Ordem de exibição dos grupos na grade. */
export const HUNT_GROUP_ORDER: HuntRespGroup[] = [
  "soulwar",
  "gnomprona",
  "rotten-blood",
  "crypt",
  "livraria",
  "inferniarch",
  "mega-dragon",
  "goanna",
];

export const HUNT_RESPS: HuntResp[] = [
  // Soulwar
  { id: "sw-brachiodemon", group: "soulwar", name: "Brachiodemon", durationWeeks: 1 },
  { id: "sw-piranha", group: "soulwar", name: "Piranha", durationWeeks: 1 },
  { id: "sw-cloak", group: "soulwar", name: "Cloak", durationWeeks: 1 },
  { id: "sw-dark-thais", group: "soulwar", name: "Dark Thais", durationWeeks: 1 },
  { id: "sw-rotten-sul-esq", group: "soulwar", name: "Rotten Sul Esquerda", durationWeeks: 1 },
  { id: "sw-rotten-norte-dir", group: "soulwar", name: "Rotten Norte Direita", durationWeeks: 1 },

  // Gnomprona
  { id: "gn-c1-esq", group: "gnomprona", name: "Carrinho 1 Esquerda", durationWeeks: 1 },
  { id: "gn-c1-dir", group: "gnomprona", name: "Carrinho 1 Direita", durationWeeks: 1 },
  { id: "gn-c2", group: "gnomprona", name: "Carrinho 2", durationWeeks: 1 },
  { id: "gn-c2-dir", group: "gnomprona", name: "Carrinho 2 Direita", durationWeeks: 1 },
  { id: "gn-c2-esq", group: "gnomprona", name: "Carrinho 2 Esquerda", durationWeeks: 1 },

  // Rotten Blood (2 semanas)
  { id: "rb-darklight", group: "rotten-blood", name: "Darklight", durationWeeks: 2 },
  { id: "rb-gloom-pillar", group: "rotten-blood", name: "Gloom Pillar", durationWeeks: 2 },
  { id: "rb-putrefactory", group: "rotten-blood", name: "Putrefactory", durationWeeks: 2 },
  { id: "rb-jadded-roots", group: "rotten-blood", name: "Jadded Roots", durationWeeks: 2 },

  // Crypt
  { id: "cr-outer", group: "crypt", name: "Outer Crypt", durationWeeks: 1 },
  { id: "cr-inner", group: "crypt", name: "Inner Crypt", durationWeeks: 1 },
  { id: "cr-unhallowed", group: "crypt", name: "Unhallowed Crypt", durationWeeks: 1 },

  // Livraria
  { id: "lv-energy", group: "livraria", name: "Livraria Energy", durationWeeks: 1 },
  { id: "lv-fire", group: "livraria", name: "Livraria Fire", durationWeeks: 1 },
  { id: "lv-ice", group: "livraria", name: "Livraria Ice", durationWeeks: 1 },

  // Inferniarch
  { id: "if-azdden-castelo", group: "inferniarch", name: "Azdden Castelo", durationWeeks: 1 },
  { id: "if-azdden-3", group: "inferniarch", name: "Azdden -3", durationWeeks: 1 },
  { id: "if-azdden-4", group: "inferniarch", name: "Azdden -4", durationWeeks: 1 },

  // Mega Dragon
  { id: "md-ground-terros", group: "mega-dragon", name: "Mega Dragon Ground Terros", durationWeeks: 1 },
  { id: "md-ground-1", group: "mega-dragon", name: "Mega Dragon Ground -1", durationWeeks: 1 },

  // Goanna
  { id: "go-norte", group: "goanna", name: "Goanna Norte", durationWeeks: 1 },
  { id: "go-sul", group: "goanna", name: "Goanna Sul", durationWeeks: 1 },
  { id: "go-east", group: "goanna", name: "Goanna East / Drahidhufu", durationWeeks: 1 },
];

export function respsByGroup(group: HuntRespGroup): HuntResp[] {
  return HUNT_RESPS.filter((r) => r.group === group);
}

export function findResp(id: string): HuntResp | undefined {
  return HUNT_RESPS.find((r) => r.id === id);
}

/**
 * Slots fixos de 2h começando às 10:00. Total = 12 slots cobrindo 24h.
 * Cada slot é identificado pelo hour de início (10, 12, 14, ..., 8).
 */
export const HUNT_SLOT_HOURS: number[] = [10, 12, 14, 16, 18, 20, 22, 0, 2, 4, 6, 8];

export function formatSlot(hour: number): string {
  const start = hour.toString().padStart(2, "0");
  const end = ((hour + 2) % 24).toString().padStart(2, "0");
  return `${start}:00 - ${end}:00`;
}
