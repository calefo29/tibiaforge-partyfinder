"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Character, subscribeToUserCharacters } from "@/lib/characters";
import {
  hazardTier,
  PrimalPoolEntry,
  removeFromPrimalPool,
  subscribeToActivePrimalPool,
  subscribeToUserPrimalPool,
  Turno,
  TURNO_ICONS,
  TURNO_LABELS,
} from "@/lib/primal-pool";
import {
  PrimalParty,
  subscribeToClosedParties,
  subscribeToFormingParties,
  subscribeToMyParties,
} from "@/lib/primal-parties";
import {
  currentCycleDate,
  hasCurrentCycleRun,
  PrimalSuggestion,
  subscribeToMySuggestions,
} from "@/lib/primal-suggestions";
import { AppShell } from "@/app/(components)/AppShell";
import { PrimalPoolModal } from "@/app/(components)/PrimalPoolModal";
import { CreatePartyModal } from "@/app/(components)/CreatePartyModal";
import { EditPartyModal } from "@/app/(components)/EditPartyModal";
import { PartyCard } from "@/app/(components)/PartyCard";
import { SuggestionCard } from "@/app/(components)/SuggestionCard";
import { DevSuggestionTools } from "@/app/(components)/DevSuggestionTools";
import {
  EMPTY_PARTY_FILTERS,
  PartyFiltersState,
  PartyListFilters,
} from "@/app/(components)/PartyListFilters";
import { NotificationBell } from "@/app/(components)/NotificationBell";
import { useUserNotifications } from "@/lib/use-user-notifications";
import {
  ScopeMode,
  SimpleFilters,
} from "@/app/(components)/SimpleFilters";
import type { Vocation } from "@/lib/characters";

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
  const [allParties, setAllParties] = useState<PrimalParty[] | null>(null);
  const [hostedParties, setHostedParties] = useState<PrimalParty[] | null>(null);
  const [closedParties, setClosedParties] = useState<PrimalParty[] | null>(null);
  const [allPool, setAllPool] = useState<PrimalPoolEntry[] | null>(null);
  const [mySuggestions, setMySuggestions] = useState<PrimalSuggestion[] | null>(null);
  const [lockedCharIds, setLockedCharIds] = useState<Set<string>>(new Set());
  const [cycleRan, setCycleRan] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<PrimalParty | null>(null);
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

  useEffect(() => {
    const unsub = subscribeToFormingParties(setAllParties);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToActivePrimalPool(setAllPool);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToMyParties(user.uid, setHostedParties);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const unsub = subscribeToClosedParties(setClosedParties);
    return () => unsub();
  }, []);

  // Subscribe nas sugestões que envolvem meus chars
  const myCharIds = useMemo(
    () => (chars ?? []).map((c) => c.id),
    [chars]
  );
  useEffect(() => {
    if (myCharIds.length === 0) {
      setMySuggestions([]);
      return;
    }
    const unsub = subscribeToMySuggestions(myCharIds, setMySuggestions);
    return () => unsub();
  }, [myCharIds]);

  // Checa se o ciclo atual já rodou (ou re-checa quando as sugestões mudam)
  useEffect(() => {
    let cancelled = false;
    hasCurrentCycleRun(currentCycleDate())
      .then((ran) => { if (!cancelled) setCycleRan(ran); })
      .catch(() => { if (!cancelled) setCycleRan(null); });
    return () => { cancelled = true; };
  }, [mySuggestions]);

  // Mantém set de chars locked atualizado a partir das closedParties
  useEffect(() => {
    if (!closedParties) return;
    const set = new Set<string>();
    closedParties.forEach((p) => {
      p.slots.forEach((s) => {
        if (s.entry?.characterId) set.add(s.entry.characterId);
      });
    });
    setLockedCharIds(set);
  }, [closedParties]);

  const alreadyInPool = useMemo(
    () => new Set((pool ?? []).map((e) => e.characterId)),
    [pool]
  );

  const charsById = useMemo(() => {
    const m = new Map<string, Character>();
    (chars ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [chars]);

  const myUid = user?.uid ?? "";

  const myPoolByCharId = useMemo(() => {
    const m = new Map<string, PrimalPoolEntry>();
    (pool ?? []).forEach((e) => m.set(e.characterId, e));
    return m;
  }, [pool]);

  const myClosedParties = useMemo(() => {
    if (!myUid) return [];
    return (closedParties ?? []).filter(
      (p) =>
        p.hostUid === myUid ||
        p.slots.some(
          (s) => s.entry?.ownerId === myUid && s.entry?.status === "confirmed"
        )
    );
  }, [closedParties, myUid]);

  const myFormingParties = useMemo(
    () =>
      (allParties ?? []).filter(
        (p) => p.hostUid === myUid && p.status === "forming"
      ),
    [allParties, myUid]
  );

  // Chars já hosting alguma PT em formação (global) — bloqueia criação de outra.
  const hostingCharIds = useMemo(
    () =>
      new Set(
        (allParties ?? [])
          .filter((p) => p.status === "forming")
          .map((p) => p.hostCharacterId)
      ),
    [allParties]
  );

  const othersFormingParties = useMemo(
    () =>
      (allParties ?? []).filter(
        (p) => p.hostUid !== myUid && p.status === "forming"
      ),
    [allParties, myUid]
  );

  // Filtros da aba "Outras PTs"
  const [partyFilters, setPartyFilters] =
    useState<PartyFiltersState>(EMPTY_PARTY_FILTERS);

  // Filtros simples — pool, PTs criadas, Minhas PTs
  const [poolSearch, setPoolSearch] = useState("");
  const [poolServerFilter, setPoolServerFilter] = useState("");

  const [ptsCriadasSearch, setPtsCriadasSearch] = useState("");
  const [ptsCriadasServerFilter, setPtsCriadasServerFilter] = useState("");
  const [ptsCriadasScope, setPtsCriadasScope] = useState<ScopeMode>("all");

  const [minhasSearch, setMinhasSearch] = useState("");
  const [minhasServerFilter, setMinhasServerFilter] = useState("");

  const availableServers = useMemo(() => {
    const set = new Set<string>();
    othersFormingParties.forEach((p) => {
      if (p.server) set.add(p.server);
    });
    return Array.from(set).sort();
  }, [othersFormingParties]);

  const filteredOthersFormingParties = useMemo(() => {
    return othersFormingParties.filter((p) => {
      // Server
      if (partyFilters.server && p.server !== partyFilters.server) return false;
      // Host name
      const q = partyFilters.hostQuery.trim().toLowerCase();
      if (q) {
        const hostName = (p.hostCharacterName ?? "").toLowerCase();
        if (!hostName.includes(q)) return false;
      }
      // Level máx exigido (filter pega só PTs que cabem no meu char)
      if (partyFilters.maxMinLevel > 0 && p.requirements?.minLevel?.active) {
        if (p.requirements.minLevel.value > partyFilters.maxMinLevel) return false;
      }
      // Hazard máx exigido
      if (partyFilters.maxMinHazard > 0 && p.requirements?.minHazard?.active) {
        if (p.requirements.minHazard.value > partyFilters.maxMinHazard) return false;
      }
      // Turnos: se PT tem schedule.active, precisa ter overlap; se não, passa
      if (partyFilters.schedule.size > 0) {
        if (
          p.requirements?.schedule?.active &&
          p.requirements.schedule.value.length > 0
        ) {
          const overlap = p.requirements.schedule.value.some((t) =>
            partyFilters.schedule.has(t)
          );
          if (!overlap) return false;
        }
        // PT sem restrição de schedule = combina com qualquer filtro
      }
      // Vagas precisando voc: pelo menos 1 slot aberto que aceite a voc selecionada
      if (partyFilters.vocsNeeded.size > 0) {
        const openSlots = p.slots.filter((s) => !s.confirmed);
        const accepts = openSlots.some((s) => {
          if (s.vocations.length === 0) return true; // qualquer voc
          return s.vocations.some((v) =>
            partyFilters.vocsNeeded.has(v as Vocation)
          );
        });
        if (!accepts) return false;
      }
      return true;
    });
  }, [othersFormingParties, partyFilters]);

  const ptsCriadasCount = allParties?.length ?? 0;
  const minhasPtsCount = myClosedParties.length;

  // ── Filtragem do POOL (Add Personagem) ────────────────────────────────
  const poolAvailableServers = useMemo(() => {
    const set = new Set<string>();
    (pool ?? []).forEach((e) => {
      if (e.server) set.add(e.server);
    });
    return Array.from(set).sort();
  }, [pool]);

  const filteredPool = useMemo(() => {
    const q = poolSearch.trim().toLowerCase();
    return (pool ?? []).filter((e) => {
      if (poolServerFilter && e.server !== poolServerFilter) return false;
      if (q) {
        const ch = charsById.get(e.characterId);
        const name = (ch?.name ?? e.characterName ?? "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [pool, charsById, poolSearch, poolServerFilter]);

  // ── Filtragem das "Minhas PTs" (closed) ───────────────────────────────
  const minhasAvailableServers = useMemo(() => {
    const set = new Set<string>();
    myClosedParties.forEach((p) => {
      if (p.server) set.add(p.server);
    });
    return Array.from(set).sort();
  }, [myClosedParties]);

  const filteredMinhasPts = useMemo(() => {
    const q = minhasSearch.trim().toLowerCase();
    return myClosedParties.filter((p) => {
      if (minhasServerFilter && p.server !== minhasServerFilter) return false;
      if (q) {
        // Busca em todos os chars confirmed + host
        const names: string[] = [];
        if (p.hostCharacterName) names.push(p.hostCharacterName.toLowerCase());
        p.slots.forEach((s) => {
          if (s.confirmed?.characterName) {
            names.push(s.confirmed.characterName.toLowerCase());
          }
        });
        if (!names.some((n) => n.includes(q))) return false;
      }
      return true;
    });
  }, [myClosedParties, minhasSearch, minhasServerFilter]);

  // ── Filtragem da aba "PTs criadas" ────────────────────────────────────
  const ptsCriadasAvailableServers = useMemo(() => {
    const set = new Set<string>();
    (allParties ?? []).forEach((p) => {
      if (p.server) set.add(p.server);
    });
    return Array.from(set).sort();
  }, [allParties]);

  const applyPtsCriadasFilters = (parties: PrimalParty[]) => {
    const q = ptsCriadasSearch.trim().toLowerCase();
    return parties.filter((p) => {
      if (ptsCriadasServerFilter && p.server !== ptsCriadasServerFilter)
        return false;
      if (q) {
        const names: string[] = [];
        if (p.hostCharacterName) names.push(p.hostCharacterName.toLowerCase());
        p.slots.forEach((s) => {
          if (s.confirmed?.characterName) {
            names.push(s.confirmed.characterName.toLowerCase());
          }
        });
        if (!names.some((n) => n.includes(q))) return false;
      }
      return true;
    });
  };

  const filteredMyFormingForList = useMemo(() => {
    if (ptsCriadasScope === "accepted") return [] as PrimalParty[]; // outra seção
    return applyPtsCriadasFilters(myFormingParties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myFormingParties, ptsCriadasSearch, ptsCriadasServerFilter, ptsCriadasScope]);

  const filteredOthersForList = useMemo(() => {
    if (ptsCriadasScope === "host") return [] as PrimalParty[];
    // Aplica filtros básicos
    let list = applyPtsCriadasFilters(filteredOthersFormingParties);
    // Se modo "accepted", restringe ao subset onde tenho char confirmed
    if (ptsCriadasScope === "accepted") {
      list = list.filter((p) =>
        p.slots.some((s) => s.confirmed?.ownerId === myUid)
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredOthersFormingParties,
    ptsCriadasSearch,
    ptsCriadasServerFilter,
    ptsCriadasScope,
    myUid,
  ]);

  const ptsCriadasTotalCount =
    myFormingParties.length + othersFormingParties.length;
  const ptsCriadasFilteredCount =
    filteredMyFormingForList.length + filteredOthersForList.length;

  const myCharIdSet = useMemo(() => new Set(myCharIds), [myCharIds]);
  const sugestaoCount = useMemo(
    () =>
      (mySuggestions ?? []).filter((s) => s.status === "pending").length,
    [mySuggestions]
  );

  // Notificações
  const { items: notifItems, unreadCount: notifUnread } = useUserNotifications(
    user?.uid
  );

  // Badge de não-lidas por tab
  const tabUnread = useMemo(() => {
    const byTab: Record<string, number> = {
      pool: 0,
      pts: 0,
      sugestao: 0,
      minhas: 0,
    };
    notifItems.forEach((n) => {
      if (n.read) return;
      if (n.type === "suggestion_new" || n.type === "suggestion_closing_soon") {
        byTab.sugestao++;
      } else if (n.type === "party_closed") {
        byTab.minhas++;
      } else if (
        n.type === "apply_received" ||
        n.type === "invite_received" ||
        n.type === "application_accepted" ||
        n.type === "invite_accepted"
      ) {
        byTab.pts++;
      }
    });
    return byTab;
  }, [notifItems]);

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
      <div className="max-w-[1180px] mx-auto px-3 sm:px-6 md:px-8 py-4 md:py-8">
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
            {/* Sininho de notificações — fica dentro da página */}
            <NotificationBell
              userId={user?.uid}
              items={notifItems}
              unreadCount={notifUnread}
              anchor="right"
              pageTitle="The Primal Order"
            />
          </div>

          {/* Tab bar segmented */}
          <div className="flex flex-wrap gap-1.5 bg-[var(--background)]/60 border border-[var(--border)] rounded-lg p-1">
            <TabButton
              active={tab === "pool"}
              onClick={() => setTab("pool")}
              icon="👥"
              label="Add Personagem"
              badge={pool?.length}
              alertCount={tabUnread.pool}
            />
            <TabButton
              active={tab === "pts"}
              onClick={() => setTab("pts")}
              icon="⚔️"
              label="PTs criadas"
              badge={ptsCriadasCount}
              alertCount={tabUnread.pts}
            />
            <TabButton
              active={tab === "sugestao"}
              onClick={() => setTab("sugestao")}
              icon="✨"
              label="Sugestão automática"
              badge={sugestaoCount}
              alertCount={tabUnread.sugestao}
            />
            <TabButton
              active={tab === "minhas"}
              onClick={() => setTab("minhas")}
              icon="🛡️"
              label="Minhas PTs"
              badge={minhasPtsCount}
              alertCount={tabUnread.minhas}
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
                <SimpleFilters
                  searchValue={poolSearch}
                  onSearchChange={setPoolSearch}
                  serverValue={poolServerFilter}
                  onServerChange={setPoolServerFilter}
                  availableServers={poolAvailableServers}
                  totalCount={pool.length}
                  filteredCount={filteredPool.length}
                />
                {filteredPool.length === 0 ? (
                  <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                    Nenhum char bate com os filtros atuais.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredPool.map((entry) => {
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
                )}

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
          <section className="space-y-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-semibold">PTs criadas</h2>
                <p className="text-xs text-[var(--text-mute)] mt-0.5">
                  PTs abertas pra Primal · seu char pode estar em várias até uma
                  fechar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartyModalOpen(true)}
                disabled={!chars}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm disabled:opacity-60"
              >
                + Criar nova PT
              </button>
            </div>

            {/* Filtros básicos da aba PTs criadas */}
            <SimpleFilters
              searchValue={ptsCriadasSearch}
              onSearchChange={setPtsCriadasSearch}
              serverValue={ptsCriadasServerFilter}
              onServerChange={setPtsCriadasServerFilter}
              availableServers={ptsCriadasAvailableServers}
              scope={ptsCriadasScope}
              onScopeChange={setPtsCriadasScope}
              totalCount={ptsCriadasTotalCount}
              filteredCount={ptsCriadasFilteredCount}
            />

            {/* Minhas PTs criadas — escondida no modo "accepted" */}
            {ptsCriadasScope !== "accepted" && (
            <div className="bg-[var(--accent)]/4 border border-[var(--accent)]/25 rounded-xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-[var(--accent)]/20">
                <h3 className="text-base font-bold text-[var(--accent)] flex items-center gap-2">
                  <span>🛡️ Minhas PTs criadas</span>
                  <span className="text-[11px] font-bold text-[#04122a] bg-[var(--accent)] px-2 py-0.5 rounded-full">
                    {filteredMyFormingForList.length}
                  </span>
                </h3>
                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)]/80 font-semibold">
                  Você é host
                </span>
              </div>
              {allParties === null ? (
                <div className="text-center text-sm text-[var(--text-mute)] py-6">
                  Carregando…
                </div>
              ) : myFormingParties.length === 0 ? (
                <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                  Você ainda não criou nenhuma PT. Clica em{" "}
                  <strong className="text-[var(--text)]">+ Criar nova PT</strong>{" "}
                  pra começar.
                </div>
              ) : filteredMyFormingForList.length === 0 ? (
                <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                  Nenhuma das suas PTs bate com os filtros.
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredMyFormingForList.map((p) => (
                    <PartyCard
                      key={p.id}
                      party={p}
                      myUid={myUid}
                      myChars={chars ?? []}
                      myPoolByCharId={myPoolByCharId}
                      allPool={allPool ?? []}
                      charById={charsById}
                      hostChar={charsById.get(p.hostCharacterId) ?? null}
                      lockedCharIds={lockedCharIds}
                      onEdit={() => setEditingParty(p)}
                    />
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Divisor — escondido no modo "host" ou "accepted" */}
            {ptsCriadasScope === "all" && (
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent"></div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] font-semibold">
                  · · ·
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent"></div>
              </div>
            )}

            {/* Outras PTs — escondida no modo "host" */}
            {ptsCriadasScope !== "host" && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--border)]">
                <h3 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
                  <span>
                    {ptsCriadasScope === "accepted"
                      ? "✅ PTs onde fui aceito"
                      : "⚔️ Outras PTs abertas"}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--text-mute)] bg-[var(--background-elev-2)] px-2 py-0.5 rounded-full border border-[var(--border-strong)]">
                    {filteredOthersForList.length}
                  </span>
                </h3>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-mute)] font-semibold">
                  {ptsCriadasScope === "accepted"
                    ? "Você já está dentro"
                    : "Candidate seu char"}
                </span>
              </div>
              {othersFormingParties.length > 0 && ptsCriadasScope === "all" && (
                <PartyListFilters
                  value={partyFilters}
                  onChange={setPartyFilters}
                  availableServers={availableServers}
                  totalCount={othersFormingParties.length}
                  filteredCount={filteredOthersFormingParties.length}
                />
              )}
              {allParties === null ? (
                <div className="text-center text-sm text-[var(--text-mute)] py-6">
                  Carregando…
                </div>
              ) : othersFormingParties.length === 0 ? (
                <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                  Nenhuma PT de outros players aberta no momento.
                </div>
              ) : filteredOthersForList.length === 0 ? (
                <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                  {ptsCriadasScope === "accepted"
                    ? "Você ainda não foi aceito em nenhuma PT de outros."
                    : "Nenhuma PT bate com os filtros atuais."}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredOthersForList.map((p) => (
                    <PartyCard
                      key={p.id}
                      party={p}
                      myUid={myUid}
                      myChars={chars ?? []}
                      myPoolByCharId={myPoolByCharId}
                      allPool={allPool ?? []}
                      charById={charsById}
                      hostChar={charsById.get(p.hostCharacterId) ?? null}
                      lockedCharIds={lockedCharIds}
                    />
                  ))}
                </div>
              )}
            </div>
            )}
          </section>
        )}

        {tab === "sugestao" && (
          <SuggestaoTab
            mySuggestions={mySuggestions}
            myCharIdSet={myCharIdSet}
            lockedCharIds={lockedCharIds}
            myPoolCount={pool?.length ?? 0}
            cycleRan={cycleRan}
            myUid={myUid}
          />
        )}

        {tab === "minhas" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold">Minhas PTs fechadas</h2>
              <p className="text-xs text-[var(--text-mute)] mt-0.5">
                Histórico das PTs que você fechou como host ou em que tinha um
                char confirmado no momento do fechamento.
              </p>
            </div>
            {closedParties === null ? (
              <div className="text-center text-sm text-[var(--text-mute)] py-10">
                Carregando…
              </div>
            ) : myClosedParties.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-10 text-center">
                <div className="text-3xl mb-2">🛡️</div>
                <strong className="block text-[15px] mb-1">
                  Nenhuma PT fechada ainda
                </strong>
                <p className="text-sm text-[var(--text-mute)]">
                  Quando uma PT sua for fechada (host clica em &quot;Fechar PT&quot;),
                  ela aparece aqui.
                </p>
              </div>
            ) : (
              <>
                <SimpleFilters
                  searchValue={minhasSearch}
                  onSearchChange={setMinhasSearch}
                  serverValue={minhasServerFilter}
                  onServerChange={setMinhasServerFilter}
                  availableServers={minhasAvailableServers}
                  totalCount={myClosedParties.length}
                  filteredCount={filteredMinhasPts.length}
                />
                {filteredMinhasPts.length === 0 ? (
                  <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                    Nenhuma PT bate com os filtros atuais.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {filteredMinhasPts.map((p) => (
                      <PartyCard
                        key={p.id}
                        party={p}
                        myUid={myUid}
                        myChars={chars ?? []}
                        myPoolByCharId={myPoolByCharId}
                        allPool={allPool ?? []}
                        charById={charsById}
                        hostChar={charsById.get(p.hostCharacterId) ?? null}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <CreatePartyModal
        open={partyModalOpen}
        ownerId={user.uid}
        characters={chars ?? []}
        hostingCharIds={hostingCharIds}
        onClose={() => setPartyModalOpen(false)}
      />

      <EditPartyModal
        open={!!editingParty}
        party={editingParty}
        onClose={() => setEditingParty(null)}
      />

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

function SuggestaoTab({
  mySuggestions,
  myCharIdSet,
  lockedCharIds,
  myPoolCount,
  cycleRan,
  myUid,
}: {
  mySuggestions: PrimalSuggestion[] | null;
  myCharIdSet: Set<string>;
  lockedCharIds: Set<string>;
  myPoolCount: number;
  cycleRan: boolean | null;
  myUid: string;
}) {
  const pending = (mySuggestions ?? []).filter((s) => s.status === "pending");
  const declined = (mySuggestions ?? []).filter((s) => s.status === "declined");

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          Sugestão automática
        </h2>
        <p className="text-xs text-[var(--text-mute)] mt-0.5">
          PTs sorteadas todo dia às 10h. Todos os 5 chars envolvidos precisam aceitar até o próximo server save.
        </p>
      </div>

      <CycleBanner />

      {(process.env.NODE_ENV === "development" ||
        myUid === process.env.NEXT_PUBLIC_ADMIN_UID) && <DevSuggestionTools />}

      {mySuggestions === null ? (
        <div className="text-center text-sm text-[var(--text-mute)] py-10">
          Carregando…
        </div>
      ) : pending.length === 0 && declined.length === 0 ? (
        myPoolCount === 0 ? (
          <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-10 text-center">
            <div className="text-3xl mb-2">✨</div>
            <strong className="block text-[15px] mb-1">
              Cadastra um char na pool primeiro
            </strong>
            <p className="text-sm text-[var(--text-mute)]">
              Pra entrar nas sugestões automáticas, seu char precisa estar na
              pool da Primal. Vai na aba <strong>Pool</strong> e cadastra.
            </p>
          </div>
        ) : cycleRan ? (
          <div className="border border-dashed border-[var(--danger)]/30 bg-[var(--danger)]/4 rounded-xl p-10 text-center">
            <div className="text-3xl mb-2">😕</div>
            <strong className="block text-[15px] mb-1">
              Não rolou time pra você nessa rodada
            </strong>
            <p className="text-sm text-[var(--text-mute)] leading-relaxed max-w-md mx-auto">
              Infelizmente o sistema não conseguiu encaixar nenhum dos seus
              chars numa PT hoje — pode ser por falta de gente compatível na
              pool, vocação faltando, ou turnos sem sobreposição. Tenta de
              novo na próxima rodada (amanhã às <strong>10h</strong>).
            </p>
            <p className="text-[11px] text-[var(--text-dim)] mt-3">
              Dica: cadastra mais chars na pool ou adiciona mais turnos de
              disponibilidade pros chars que já estão lá.
            </p>
          </div>
        ) : (
          <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-10 text-center">
            <div className="text-3xl mb-2">⏳</div>
            <strong className="block text-[15px] mb-1">
              Aguardando a próxima rodada
            </strong>
            <p className="text-sm text-[var(--text-mute)] leading-relaxed max-w-md mx-auto">
              As sugestões automáticas são geradas todo dia às <strong>10h</strong>.
              Seu(s) char(s) na pool vão entrar no sorteio da próxima rodada.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-3.5">
          {pending.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              myCharacterIds={myCharIdSet}
              lockedCharIds={lockedCharIds}
            />
          ))}
          {declined.length > 0 && (
            <div className="pt-4">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
                Recusadas neste ciclo
              </h3>
              <div className="space-y-3.5">
                {declined.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    myCharacterIds={myCharIdSet}
                    lockedCharIds={lockedCharIds}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CycleBanner() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // Próximo server save = 13h UTC (10h BRT)
  const next = new Date();
  next.setUTCHours(13, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  const diff = next.getTime() - now;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return (
    <div className="mb-5 bg-gradient-to-br from-[var(--accent)]/8 to-transparent border border-[var(--accent)]/25 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-xl">🌅</span>
      <div className="flex-1 min-w-[200px]">
        <div className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold">
          Próxima rodada
        </div>
        <div className="text-[12px] text-[var(--text-mute)] mt-0.5">
          Toda manhã às <strong className="text-[var(--text)]">10h</strong> · sugestões não confirmadas viram pó e novas combinações aparecem
        </div>
      </div>
      <span className="font-mono text-base font-bold text-[var(--accent)] bg-[var(--accent)]/8 border border-[var(--accent)]/30 px-3 py-1.5 rounded-lg whitespace-nowrap">
        {h}h {m}m
      </span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  alertCount,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number;
  /** Badge vermelho de não-lidas (alertas) — independente do badge normal. */
  alertCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition border relative ${
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
      {typeof alertCount === "number" && alertCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center leading-none border-2 border-[var(--background)] animate-pulse"
          aria-label={`${alertCount} não lidas`}
          title={`${alertCount} não lidas`}
        >
          {alertCount > 9 ? "9+" : alertCount}
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
