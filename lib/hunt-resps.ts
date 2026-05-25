/**
 * Catálogo de resps (respawns/hunts) usados no planilhado da guild.
 *
 * Por enquanto hardcoded — baseado no calendário do fatal.team/planilha/calendario/serenian-iii.
 * Quando o Tibia recebe atualização nova, esse catálogo pode mudar; ainda assim é raro o
 * suficiente pra não justificar tela admin (mexer no código + redeploy é aceitável).
 *
 * Cada resp pertence a um GROUP (Soulwar, Gnomprona, etc) e tem uma DURAÇÃO ("semanal" ou
 * "quinzenal") que define quanto tempo a PT vencedora do sorteio "trava" aquele slot.
 *
 * `creatureAssetId` referencia o asset do tibiadata.bytewizards.de pra exibir o sprite.
 * URL de imagem: https://tibiadata.bytewizards.de/api/v1/assets/{assetId} (formato webp).
 */

export type HuntRespGroup =
  | "rotten-blood"
  | "soulwar"
  | "gnomprona"
  | "crypt"
  | "livraria"
  | "inferniarch"
  | "mega-dragon"
  | "goanna";

export type HuntCycle = "semanal" | "quinzenal";

export type HuntResp = {
  id: string;
  group: HuntRespGroup;
  name: string;
  cycle: HuntCycle;
  /** Id de asset no tibiadata.bytewizards.de — pra renderizar o sprite. */
  creatureAssetId?: number;
};

export const HUNT_GROUP_LABELS: Record<HuntRespGroup, string> = {
  "rotten-blood": "Rotten Blood",
  soulwar: "Soulwar",
  gnomprona: "Gnomprona",
  crypt: "Crypt",
  livraria: "Livraria",
  inferniarch: "Inferniarch",
  "mega-dragon": "Mega Dragon",
  goanna: "Goanna",
};

/**
 * Ordem de exibição dos grupos. Rotten Blood primeiro por ser o único quinzenal —
 * decisão de planilhado dura 2 semanas, então é o ciclo principal de planejamento.
 */
export const HUNT_GROUP_ORDER: HuntRespGroup[] = [
  "rotten-blood",
  "soulwar",
  "gnomprona",
  "crypt",
  "livraria",
  "inferniarch",
  "mega-dragon",
  "goanna",
];

/** Sprite oficial do bicho mais icônico de cada grupo. Usado quando o resp não tem sprite próprio. */
export const HUNT_GROUP_FALLBACK_ASSET: Partial<Record<HuntRespGroup, number>> = {
  "rotten-blood": 6723, // Darklight Construct
  soulwar: 6543, // Brachiodemon
  gnomprona: 6610, // Cobra Scout
  crypt: 6694, // Crypt Warden
  livraria: 6880, // Energetic Book
  inferniarch: 6539, // Brinebrute Inferniarch
  "mega-dragon": 7478, // Mega Dragon
  goanna: 6336, // Adult Goanna
};

export const HUNT_RESPS: HuntResp[] = [
  // Rotten Blood (quinzenal)
  { id: "rb-darklight", group: "rotten-blood", name: "Darklight", cycle: "quinzenal", creatureAssetId: 6723 },
  { id: "rb-gloom-pillar", group: "rotten-blood", name: "Gloom Pillar", cycle: "quinzenal", creatureAssetId: 7061 },
  { id: "rb-putrefactory", group: "rotten-blood", name: "Putrefactory", cycle: "quinzenal", creatureAssetId: 7793 },
  { id: "rb-jadded-roots", group: "rotten-blood", name: "Jadded Roots", cycle: "quinzenal", creatureAssetId: 7874 },

  // Soulwar
  { id: "sw-brachiodemon", group: "soulwar", name: "Brachiodemon", cycle: "semanal", creatureAssetId: 6543 },
  { id: "sw-piranha", group: "soulwar", name: "Piranha", cycle: "semanal", creatureAssetId: 6599 },
  { id: "sw-cloak", group: "soulwar", name: "Cloak", cycle: "semanal", creatureAssetId: 6609 },
  { id: "sw-dark-thais", group: "soulwar", name: "Dark Thais", cycle: "semanal", creatureAssetId: 6704 },
  { id: "sw-rotten-sul-esq", group: "soulwar", name: "Rotten Sul Esquerda", cycle: "semanal", creatureAssetId: 7902 },
  { id: "sw-rotten-norte-dir", group: "soulwar", name: "Rotten Norte Direita", cycle: "semanal", creatureAssetId: 7897 },

  // Gnomprona — Carrinho 1 (Esq/Dir), Carrinho 2 (Norte/Sul), Carrinho 3 (Esq/Dir)
  { id: "gn-c1-dir", group: "gnomprona", name: "Carrinho 1 Direita", cycle: "semanal", creatureAssetId: 6610 },
  { id: "gn-c1-esq", group: "gnomprona", name: "Carrinho 1 Esquerda", cycle: "semanal", creatureAssetId: 6610 },
  { id: "gn-c2-norte", group: "gnomprona", name: "Carrinho 2 Norte", cycle: "semanal", creatureAssetId: 6638 },
  { id: "gn-c2-sul", group: "gnomprona", name: "Carrinho 2 Sul", cycle: "semanal", creatureAssetId: 6638 },
  { id: "gn-c3-dir", group: "gnomprona", name: "Carrinho 3 Direita", cycle: "semanal", creatureAssetId: 6607 },
  { id: "gn-c3-esq", group: "gnomprona", name: "Carrinho 3 Esquerda", cycle: "semanal", creatureAssetId: 6607 },

  // Crypt
  { id: "cr-outer", group: "crypt", name: "Outer Crypt", cycle: "semanal", creatureAssetId: 6697 },
  { id: "cr-inner", group: "crypt", name: "Inner Crypt", cycle: "semanal", creatureAssetId: 6694 },
  { id: "cr-unhallowed", group: "crypt", name: "Unhallowed Crypt", cycle: "semanal", creatureAssetId: 6702 },

  // Livraria
  { id: "lv-energy", group: "livraria", name: "Livraria Energy", cycle: "semanal", creatureAssetId: 6880 },
  { id: "lv-fire", group: "livraria", name: "Livraria Fire", cycle: "semanal", creatureAssetId: 6559 },
  { id: "lv-ice", group: "livraria", name: "Livraria Ice", cycle: "semanal", creatureAssetId: 7248 },

  // Inferniarch
  { id: "if-azdden-castelo", group: "inferniarch", name: "Azdden Castelo", cycle: "semanal", creatureAssetId: 6539 },
  { id: "if-azdden-3", group: "inferniarch", name: "Azdden -3", cycle: "semanal", creatureAssetId: 6549 },
  { id: "if-azdden-4", group: "inferniarch", name: "Azdden -4", cycle: "semanal", creatureAssetId: 7973 },

  // Mega Dragon
  { id: "md-ground-terros", group: "mega-dragon", name: "Mega Dragon Ground Terros", cycle: "semanal", creatureAssetId: 7478 },
  { id: "md-ground-1", group: "mega-dragon", name: "Mega Dragon Ground -1", cycle: "semanal", creatureAssetId: 7478 },

  // Goanna
  { id: "go-norte", group: "goanna", name: "Goanna Norte", cycle: "semanal", creatureAssetId: 6336 },
  { id: "go-sul", group: "goanna", name: "Goanna Sul", cycle: "semanal", creatureAssetId: 8084 },
  { id: "go-east", group: "goanna", name: "Goanna East / Drahidhufu", cycle: "semanal", creatureAssetId: 8439 },
];

export function respsByGroup(group: HuntRespGroup): HuntResp[] {
  return HUNT_RESPS.filter((r) => r.group === group);
}

export function findResp(id: string): HuntResp | undefined {
  return HUNT_RESPS.find((r) => r.id === id);
}

/** URL pública pro sprite de uma criatura. */
export function creatureSpriteUrl(assetId: number): string {
  return `https://tibiadata.bytewizards.de/api/v1/assets/${assetId}`;
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
