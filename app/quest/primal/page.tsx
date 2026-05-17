"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Brand } from "@/app/(components)/Brand";
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
  const { user, loading, signOut } = useAuth();

  const [chars, setChars] = useState<Character[] | null>(null);
  const [pool, setPool] = useState<PrimalPoolEntry[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

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

  return (
    <>
      <nav className="sticky top-0 z-10 bg-[var(--background)]/90 backdrop-blur border-b border-[var(--border)] px-8 py-3.5 flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-3">
          <Link
            href="/perfil"
            className="text-sm text-[var(--text-mute)] hover:text-[var(--text)] transition"
          >
            ← Perfil
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-[var(--text-mute)] hover:text-[var(--text)] border border-[var(--border-strong)] hover:border-[var(--accent-dim)] rounded-md px-4 py-1.5 transition"
          >
            Sair
          </button>
        </div>
      </nav>

      <main className="max-w-[1080px] mx-auto px-8 py-10">
        <div className="bg-gradient-to-br from-[var(--accent)]/8 to-[var(--accent)]/0 border border-[var(--border)] rounded-xl p-6 mb-8">
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

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Meus chars na pool</h2>
            <p className="text-xs text-[var(--text-mute)] mt-0.5">
              Chars seus disponíveis pros líderes formarem PT de Primal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
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
              onClick={() => setModalOpen(true)}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm"
            >
              + Cadastrar primeiro char
            </button>
          </div>
        ) : (
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
                  onRemove={() => handleRemove(entry.id)}
                />
              );
            })}
          </div>
        )}

        <div className="mt-10 bg-[var(--background-elev)] border border-[var(--border)] rounded-lg p-5 text-sm text-[var(--text-mute)]">
          🚧 Próximos passos do épico Primal: <strong className="text-[var(--text)]">criar PT</strong> e{" "}
          <strong className="text-[var(--text)]">procurar PT</strong> (mock v3 já aprovado, aguardando implementação).
        </div>
      </main>

      <PrimalPoolModal
        open={modalOpen}
        ownerId={user.uid}
        characters={chars ?? []}
        alreadyInPool={alreadyInPool}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

function PoolCard({
  entry,
  ch,
  removing,
  onRemove,
}: {
  entry: PrimalPoolEntry;
  ch: Character;
  removing: boolean;
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
          <Tag
            key={t}
            icon={TURNO_ICONS[t]}
            label={TURNO_LABELS[t]}
            tone="ok"
          />
        ))}
      </div>

      <div className="flex justify-end pt-3 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="text-xs border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 hover:border-[var(--danger)] px-3 py-1.5 rounded transition disabled:opacity-60"
        >
          {removing ? "Removendo…" : "Remover da pool"}
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
