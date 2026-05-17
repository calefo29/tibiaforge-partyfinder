"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Character, subscribeToUserCharacters } from "@/lib/characters";
import {
  hazardTier,
  PrimalPoolEntry,
  removeFromPrimalPool,
  subscribeToUserPrimalPool,
  Turno,
  TURNO_ICONS,
  TURNO_LABELS,
} from "@/lib/primal-pool";
import { AppShell } from "@/app/(components)/AppShell";
import { PrimalPoolModal } from "@/app/(components)/PrimalPoolModal";

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

export default function PrimalHubPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  type Tab = "pool" | "pts" | "sugestao" | "minhas";
  const [tab, setTab] = useState<Tab>("pool");
  const [chars, setChars] = useState<Character[] | null>(null);
  const [pool, setPool] = useState<PrimalPoolEntry[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PrimalPoolEntry | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingEntry(null);
    setModalOpen(true);
  };

  const openEdit = (entry: PrimalPoolEntry) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEntry(null);
  };

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserCharacters(user.uid, setChars);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserPrimalPool(user.uid, setPool);
    return () => unsub();
  }, [user]);

  const alreadyInPool = useMemo(
    () => new Set((pool ?? []).map((e) => e.characterId)),
    [pool]
  );

  const charsById = useMemo(() => {
    const m = new Map<string, Character>();
    (chars ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [chars]);

  const poolByVocation = useMemo(() => {
    const counts: Record<string, number> = { EK: 0, ED: 0, RP: 0, MS: 0, EM: 0 };
    (pool ?? []).forEach((e) => {
      const ch = charsById.get(e.characterId);
      if (ch) counts[ch.vocation] = (counts[ch.vocation] ?? 0) + 1;
    });
    return counts;
  }, [pool, charsById]);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeFromPrimalPool(id);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-mute)] text-sm">Carregando…</p>
      </main>
    );
  }

  const myPoolCount = pool?.length ?? 0;

  return (
    <AppShell>
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        {/* Quest header + tabs */}
        <div className="bg-gradient-to-br from-[var(--accent)]/8 to-[var(--accent)]/0 border border-[var(--border)] rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-6 flex-wrap mb-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                The Primal Order
              </h1>
              <p className="text-sm text-[var(--text-mute)] mt-1">
                Hub da quest · pool de chars + formação de PT
              </p>
              <div className="flex gap-5 flex-wrap text-xs text-[var(--text-mute)] mt-4">
                <span>
                  <strong className="text-[var(--text)]">Composição:</strong> 1 EK · 1+ ED · 3 flex
                </span>
                <span>
                  <strong className="text-[var(--text)]">Level mínimo:</strong> 600
                </span>
                <span>
                  <strong className="text-[var(--text)]">Tamanho:</strong> 5 players
                </span>
              </div>
            </div>
          </div>

          {/* Tab bar segmented */}
          <div className="flex flex-wrap gap-1.5 bg-[var(--background)]/60 border border-[var(--border)] rounded-lg p-1">
            <TabButton
              active={tab === "pool"}
              onClick={() => setTab("pool")}
              icon="👥"
              label="Cadastrar personagens na Pool"
              badge={pool?.length}
            />
            <TabButton
              active={tab === "pts"}
              onClick={() => setTab("pts")}
              icon="⚔️"
              label="PTs criadas"
            />
            <TabButton
              active={tab === "sugestao"}
              onClick={() => setTab("sugestao")}
              icon="✨"
              label="Sugestão automática"
            />
            <TabButton
              active={tab === "minhas"}
              onClick={() => setTab("minhas")}
              icon="🛡️"
              label="Minhas PTs"
            />
          </div>
        </div>

        {/* Tab content */}
        {tab === "pool" && (
          <section>
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold">Meus chars na pool</h2>
                <p className="text-xs text-[var(--text-mute)] mt-0.5">
                  Chars seus disponíveis pros líderes formarem PT de Primal.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                disabled={!chars}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm disabled:opacity-60"
              >
                + Cadastrar char na pool
              </button>
            </div>

            {pool === null || chars === null ? (
              <div className="text-center text-sm text-[var(--text-mute)] py-10">
                Carregando pool…
              </div>
            ) : pool.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-10 text-center">
                <strong className="block text-[15px] mb-1">
                  Nenhum char na pool ainda
                </strong>
                <p className="text-sm text-[var(--text-mute)] mb-4">
                  Cadastra um char pra ele ficar disponível pros líderes formarem PT.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm"
                >
                  + Cadastrar primeiro char
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {pool.map((entry) => {
                    const ch = charsById.get(entry.characterId);
                    if (!ch) {
                      return (
                        <div
                          key={entry.id}
                          className="bg-[var(--background-elev)] border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--text-mute)]"
                        >
                          Personagem removido — esta inscrição pode ser excluída.
                          <button
                            type="button"
                            onClick={() => handleRemove(entry.id)}
                            className="block mt-2 text-xs text-[var(--danger)] hover:underline"
                          >
                            Remover da pool
                          </button>
                        </div>
                      );
                    }
                    return (
                      <PoolCard
                        key={entry.id}
                        entry={entry}
                        ch={ch}
                        removing={removingId === entry.id}
                        onEdit={() => openEdit(entry)}
                        onRemove={() => handleRemove(entry.id)}
                      />
                    );
                  })}
                </div>

                <div className="mt-6">
                  <PoolStatsCard
                    myPoolCount={myPoolCount}
                    countsByVoc={poolByVocation}
                  />
                </div>
              </>
            )}
          </section>
        )}

        {tab === "pts" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold">PTs criadas</h2>
              <p className="text-xs text-[var(--text-mute)] mt-0.5">
                PTs manuais abertas no momento · qualquer player pode se candidatar.
              </p>
            </div>
            <ComingSoonCard
              title="Criar e procurar PT — em breve"
              text="Em construção: hosts vão poder montar PTs manuais com slots de vocação, level mínimo e horário. Outros players candidatam seus chars."
              note="🚧 Implementação do passo 2 do épico Primal."
            />
          </section>
        )}

        {tab === "sugestao" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                Sugestão automática
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#22d3ee]/15 text-[#22d3ee] border border-[#22d3ee]/30">
                  em breve
                </span>
              </h2>
              <p className="text-xs text-[var(--text-mute)] mt-0.5">
                PTs propostas automaticamente combinando chars compatíveis da pool.
              </p>
            </div>
            <ComingSoonCard
              title="PTs montadas automaticamente"
              text="Quando habilitado, o sistema vai propor PTs de 5 chars de 5 players diferentes, respeitando 1 EK + 1+ ED, level e turnos compatíveis. Os 5 têm 24h pra confirmar."
              tone="info"
            />
          </section>
        )}

        {tab === "minhas" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold">Minhas PTs</h2>
              <p className="text-xs text-[var(--text-mute)] mt-0.5">
                PTs que você fechou (host) ou em que está confirmado. Histórico + ativas.
              </p>
            </div>
            <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-10 text-center">
              <div className="text-3xl mb-2">🛡️</div>
              <strong className="block text-[15px] mb-1">
                Nenhuma PT fechada ainda
              </strong>
              <p className="text-sm text-[var(--text-mute)]">
                Quando você fechar uma PT (como host) ou aceitar entrar em uma, ela aparece aqui.
              </p>
            </div>
          </section>
        )}
      </div>

      <PrimalPoolModal
        open={modalOpen}
        ownerId={user.uid}
        characters={chars ?? []}
        alreadyInPool={alreadyInPool}
        editing={editingEntry}
        onClose={closeModal}
      />
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition border ${
        active
          ? "bg-[var(--accent)] text-[#04122a] border-[var(--accent)] shadow-[0_0_20px_rgba(96,165,250,0.25)]"
          : "bg-transparent text-[var(--text-mute)] border-transparent hover:bg-[var(--background-elev-2)] hover:text-[var(--text)]"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="truncate">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
            active
              ? "bg-[#04122a]/20 text-[#04122a]"
              : "bg-[var(--accent)]/15 text-[var(--accent)]"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ComingSoonCard({
  title,
  text,
  note,
  tone = "default",
}: {
  title: string;
  text: string;
  note?: string;
  tone?: "default" | "info";
}) {
  const cls =
    tone === "info"
      ? "bg-gradient-to-br from-[#22d3ee]/8 to-transparent border-[#22d3ee]/30"
      : "bg-[var(--background-elev)] border-[var(--border)]";
  return (
    <div className={`border rounded-xl p-5 ${cls}`}>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-mute)] leading-relaxed">{text}</p>
      {note && (
        <p className="text-[11px] text-[var(--text-dim)] mt-3">{note}</p>
      )}
    </div>
  );
}

function PoolStatsCard({
  myPoolCount,
  countsByVoc,
}: {
  myPoolCount: number;
  countsByVoc: Record<string, number>;
}) {
  return (
    <div className="bg-[var(--background-elev)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-3">
        Pool da Primal — meus chars
      </h3>
      <div className="grid grid-cols-2 gap-y-2 text-xs">
        <Stat label="👥 Meus chars na pool" value={myPoolCount} highlight />
        <Stat label="⚔️ EK" value={countsByVoc.EK} />
        <Stat label="💚 ED" value={countsByVoc.ED} />
        <Stat label="🏹 RP" value={countsByVoc.RP} />
        <Stat label="🔥 MS" value={countsByVoc.MS} />
        <Stat label="👊 EM" value={countsByVoc.EM} />
      </div>
      <p className="text-[11px] text-[var(--text-dim)] mt-4">
        Stats globais da pool (todos os players) virão no passo 2.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--text-mute)]">{label}</span>
      <strong
        className={`tabular-nums ${highlight ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
      >
        {value}
      </strong>
    </div>
  );
}

function PoolCard({
  entry,
  ch,
  removing,
  onEdit,
  onRemove,
}: {
  entry: PrimalPoolEntry;
  ch: Character;
  removing: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const vocColor = VOC_COLORS[ch.vocation] ?? "text-[var(--accent)]";
  const tier = hazardTier(entry.hazard);
  const tierBg =
    tier.cls === "low"
      ? "bg-[var(--ok)]/10 text-[var(--ok)] border-[var(--ok)]/40"
      : tier.cls === "mid"
        ? "bg-[var(--warn)]/10 text-[var(--warn)] border-[var(--warn)]/40"
        : "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/40";

  return (
    <div className="bg-[var(--background-elev)] border border-[var(--border)] hover:border-[var(--accent-dim)] rounded-lg p-4 transition">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
          >
            {ch.vocation}
          </span>
          <span className="text-[15px] font-semibold truncate">{ch.name}</span>
        </div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tierBg}`}
        >
          Haz {entry.hazard} · {tier.label}
        </span>
      </div>

      <div className="text-xs text-[var(--text-mute)] mb-3">
        Level <strong className="text-[var(--text)]">{ch.level}</strong> · {ch.server}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <Tag
          icon={entry.experience ? "🎯" : "🌱"}
          label={entry.experience ? "Com experiência" : "Primeira vez"}
        />
        {entry.availability.map((t: Turno) => (
          <Tag key={t} icon={TURNO_ICONS[t]} label={TURNO_LABELS[t]} tone="ok" />
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onEdit}
          disabled={removing}
          className="text-xs flex items-center gap-1.5 border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] text-[var(--text)] px-3 py-1.5 rounded transition disabled:opacity-60"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editar
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="text-xs border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 hover:border-[var(--danger)] px-3 py-1.5 rounded transition disabled:opacity-60"
        >
          {removing ? "Removendo…" : "Remover"}
        </button>
      </div>
    </div>
  );
}

function Tag({
  icon,
  label,
  tone = "default",
}: {
  icon: string;
  label: string;
  tone?: "default" | "ok";
}) {
  const cls =
    tone === "ok"
      ? "bg-[var(--ok)]/10 border-[var(--ok)]/30 text-[var(--ok)]"
      : "bg-[var(--background)] border-[var(--border-strong)] text-[var(--text-mute)]";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}
