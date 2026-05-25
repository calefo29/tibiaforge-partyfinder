"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/app/(components)/AppShell";
import { HuntPartyModal } from "@/app/(components)/HuntPartyModal";
import {
  HuntParty,
  deleteHuntParty,
  subscribeToAllHuntParties,
} from "@/lib/hunts";
import {
  HUNT_GROUP_LABELS,
  HUNT_GROUP_ORDER,
  HUNT_RESPS,
  HUNT_SLOT_HOURS,
  HuntResp,
  HuntRespGroup,
  formatSlot,
} from "@/lib/hunt-resps";

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

type Tab = "calendario" | "pts" | "ranking";

export default function PlanilhadoPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [tab, setTab] = useState<Tab>("calendario");
  const [allParties, setAllParties] = useState<HuntParty[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** Toggle "Só as que eu faço parte". Default false = mostra todas. */
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToAllHuntParties(setAllParties);
    return () => unsub();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!confirm("Deletar essa PT? Essa ação não pode ser desfeita.")) return;
    setDeletingId(id);
    try {
      await deleteHuntParty(id);
    } catch (err) {
      console.error(err);
      alert("Erro ao deletar PT.");
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Toggle "Só as que eu faço parte" considera tanto PTs onde sou owner quanto
   * PTs em que algum char meu está na composição (member.ownerId === user.uid).
   */
  const visibleParties = useMemo(() => {
    if (!allParties || !user) return allParties;
    if (!onlyMine) return allParties;
    return allParties.filter(
      (p) =>
        p.ownerId === user.uid ||
        p.members.some((m) => m.ownerId === user.uid)
    );
  }, [allParties, onlyMine, user]);

  const myPartiesCount = useMemo(() => {
    if (!allParties || !user) return 0;
    return allParties.filter(
      (p) =>
        p.ownerId === user.uid ||
        p.members.some((m) => m.ownerId === user.uid)
    ).length;
  }, [allParties, user]);

  if (loading || !user) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh] text-[var(--text-mute)]">
          Carregando...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-3 sm:px-6 md:px-8 py-4 md:py-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            📅 Planilhado de Hunts
          </h1>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Cadastre sua PT e concorra aos slots de cada resp.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
          <TabButton
            active={tab === "calendario"}
            onClick={() => setTab("calendario")}
          >
            Calendário
          </TabButton>
          <TabButton
            active={tab === "pts"}
            onClick={() => setTab("pts")}
            count={allParties?.length}
          >
            PTs registradas
          </TabButton>
          <TabButton
            active={tab === "ranking"}
            onClick={() => setTab("ranking")}
            disabled
          >
            Ranking (em breve)
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "calendario" && (
          <CalendarioView search={search} setSearch={setSearch} />
        )}
        {tab === "pts" && (
          <PartiesView
            parties={visibleParties}
            myParticipationCount={myPartiesCount}
            totalCount={allParties?.length ?? 0}
            onlyMine={onlyMine}
            setOnlyMine={setOnlyMine}
            currentUid={user.uid}
            onCreate={() => setModalOpen(true)}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        )}
        {tab === "ranking" && (
          <div className="text-center py-12 text-[var(--text-mute)] text-sm">
            Ranking de PTs por lvl médio + caveiras — em breve.
          </div>
        )}
      </div>

      <HuntPartyModal
        open={modalOpen}
        ownerId={user.uid}
        onClose={() => setModalOpen(false)}
      />
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
  count,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-transparent text-[var(--text-mute)] hover:text-[var(--text)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {children}
      {typeof count === "number" && count > 0 && (
        <span className="bg-[var(--background-elev-2)] text-[var(--text-mute)] text-[10px] rounded-full px-1.5 min-w-[18px] text-center">
          {count}
        </span>
      )}
    </button>
  );
}

/* ─────────────── Calendário ─────────────── */

function CalendarioView({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (s: string) => void;
}) {
  const filteredResps = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return HUNT_RESPS;
    return HUNT_RESPS.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        HUNT_GROUP_LABELS[r.group].toLowerCase().includes(q)
    );
  }, [search]);

  const groupsWithResps = useMemo(() => {
    return HUNT_GROUP_ORDER.map((g) => ({
      group: g,
      resps: filteredResps.filter((r) => r.group === g),
    })).filter((x) => x.resps.length > 0);
  }, [filteredResps]);

  return (
    <div className="space-y-6">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Buscar resp ou categoria..."
        className="w-full bg-[var(--background-elev)] border border-[var(--border)] focus:border-[var(--accent)] rounded-md px-3 py-2 text-sm outline-none"
      />

      {groupsWithResps.length === 0 && (
        <p className="text-center py-12 text-sm text-[var(--text-mute)]">
          Nenhum resp encontrado.
        </p>
      )}

      {groupsWithResps.map(({ group, resps }) => (
        <GroupSection key={group} group={group} resps={resps} />
      ))}

      <div className="text-center text-xs text-[var(--text-mute)] pt-4">
        💡 Os slots aparecerão preenchidos quando o sistema de sorteio estiver
        implementado.
      </div>
    </div>
  );
}

function GroupSection({
  group,
  resps,
}: {
  group: HuntRespGroup;
  resps: HuntResp[];
}) {
  return (
    <div>
      <h2 className="text-sm uppercase tracking-wider text-[var(--text-dim)] border-b border-[var(--border)] pb-1.5 mb-3 flex items-center gap-2">
        {HUNT_GROUP_LABELS[group]}
        {group === "rotten-blood" && (
          <span className="text-[10px] normal-case bg-[var(--accent-dim)]/30 text-[var(--accent)] px-1.5 py-0.5 rounded-full">
            2 semanas
          </span>
        )}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {resps.map((resp) => (
          <RespCard key={resp.id} resp={resp} />
        ))}
      </div>
    </div>
  );
}

function RespCard({ resp }: { resp: HuntResp }) {
  return (
    <div className="bg-[var(--background-elev)] border border-[var(--border)] rounded-lg p-3.5">
      <div className="text-center mb-3">
        <div className="text-xs font-semibold">{resp.name}</div>
      </div>
      <div className="space-y-1">
        {HUNT_SLOT_HOURS.map((hour) => (
          <div
            key={hour}
            className="flex items-center justify-center text-[11px] text-[var(--text-mute)] py-1 px-2 bg-[var(--background)]/40 rounded"
          >
            {formatSlot(hour)}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-dim)] text-center mt-3">
        Nenhuma PT escolheu esse resp
      </p>
    </div>
  );
}

/* ─────────────── PTs registradas ─────────────── */

function PartiesView({
  parties,
  myParticipationCount,
  totalCount,
  onlyMine,
  setOnlyMine,
  currentUid,
  onCreate,
  onDelete,
  deletingId,
}: {
  parties: HuntParty[] | null;
  myParticipationCount: number;
  totalCount: number;
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  currentUid: string;
  onCreate: () => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Botão + toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          onClick={onCreate}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-semibold px-4 py-2 rounded-md text-sm transition self-start sm:self-auto"
        >
          + Registrar PT
        </button>

        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text-mute)]">
            Só as PTs que faço parte
            {myParticipationCount > 0 && (
              <span className="ml-1.5 text-[11px] text-[var(--text-dim)]">
                ({myParticipationCount} de {totalCount})
              </span>
            )}
          </span>
        </label>
      </div>

      {/* Lista */}
      {parties === null ? (
        <p className="text-center py-12 text-sm text-[var(--text-mute)]">
          Carregando...
        </p>
      ) : parties.length === 0 ? (
        <div className="text-center py-12 space-y-3 border border-dashed border-[var(--border)] rounded-lg">
          <p className="text-sm text-[var(--text-mute)]">
            {onlyMine
              ? "Você ainda não faz parte de nenhuma PT."
              : "Nenhuma PT registrada ainda. Seja o primeiro!"}
          </p>
          {!onlyMine && (
            <button
              type="button"
              onClick={onCreate}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-semibold px-4 py-2 rounded-md text-sm transition"
            >
              + Registrar primeira PT
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {parties.map((p) => (
            <HuntPartyCard
              key={p.id}
              party={p}
              currentUid={currentUid}
              onDelete={() => onDelete(p.id)}
              deleting={deletingId === p.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HuntPartyCard({
  party,
  currentUid,
  onDelete,
  deleting,
}: {
  party: HuntParty;
  currentUid: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const isOwner = party.ownerId === currentUid;
  const imIn = party.members.some((m) => m.ownerId === currentUid);

  return (
    <div className="bg-[var(--background-elev)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-[var(--text-dim)] font-semibold">
            {party.server}
          </span>
          <span className="text-xs text-[var(--text-mute)]">
            · {party.members.length} chars
          </span>
          <span className="text-xs text-[var(--text-mute)]">
            · Lvl médio (top 4):{" "}
            <strong className="text-[var(--accent)]">
              {party.levelTop4Avg}
            </strong>
          </span>
          {imIn && !isOwner && (
            <span className="text-[10px] uppercase tracking-wider bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 px-1.5 py-0.5 rounded-full">
              Você
            </span>
          )}
          {isOwner && (
            <span className="text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-400/30 px-1.5 py-0.5 rounded-full">
              Host
            </span>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="text-xs text-[var(--text-mute)] hover:text-red-400 border border-[var(--border-strong)] hover:border-red-400/40 rounded-md px-2.5 py-1 transition disabled:opacity-50 shrink-0"
          >
            {deleting ? "Deletando..." : "Deletar"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {party.members.map((m) => {
          const isMine = m.ownerId === currentUid;
          return (
            <div
              key={m.characterId}
              className={`flex items-center gap-2 px-2.5 py-1.5 border rounded text-xs ${
                isMine
                  ? "bg-[var(--accent)]/8 border-[var(--accent)]/30"
                  : "bg-[var(--background)]/50 border-[var(--border)]"
              }`}
            >
              <span
                className={`font-semibold w-7 ${
                  VOC_COLORS[m.vocation] ?? "text-[var(--text-mute)]"
                }`}
              >
                {m.vocation}
              </span>
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-[var(--text-mute)]">{m.level}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
