"use client";

import { useEffect, useMemo, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { useOverlayClose } from "./useOverlayClose";
import { Character } from "@/lib/characters";
import {
  acceptApplication,
  acceptInvite,
  addDummyToSlot,
  applyToSlot,
  cancelInvite,
  cancelParty,
  canVocFillSlot,
  closePartyAndLock,
  completeParty,
  declineApplication,
  declineInvite,
  effectiveMinLevel,
  inviteToSlot,
  isCharEligibleForSlot,
  leaveClosedParty,
  PrimalParty,
  Slot,
  slotVocationLabel,
  withdrawApplication,
  withdrawFromSlot,
} from "@/lib/primal-parties";
import { Vocation } from "@/lib/characters";
import {
  PrimalPoolEntry,
  TURNO_ICONS,
  TURNO_LABELS,
} from "@/lib/primal-pool";

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

type Props = {
  party: PrimalParty;
  myUid: string;
  myChars: Character[];
  myPoolByCharId: Map<string, PrimalPoolEntry>;
  allPool?: PrimalPoolEntry[];
  charById: Map<string, Character>;
  hostChar: Character | null;
  lockedCharIds?: Set<string>;
  onEdit?: () => void;
};

export function PartyCard({
  party,
  myUid,
  myChars,
  myPoolByCharId,
  allPool,
  charById,
  hostChar,
  lockedCharIds,
  onEdit,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [managePopupSlot, setManagePopupSlot] = useState<number | null>(null);

  const isHost = party.hostUid === myUid;
  const confirmedCount = party.slots.filter((s) => s.confirmed).length;
  const filled = confirmedCount;
  const allConfirmed = confirmedCount === party.slots.length;
  const isClosed = party.status === "closed";
  const isCancelled = party.status === "cancelled";
  const isCompleted = party.status === "completed";
  const isDev = process.env.NODE_ENV === "development";
  const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID ?? "";
  const isAdmin = !!adminUid && myUid === adminUid;
  const myConfirmedSlot = party.slots.find(
    (s) => s.confirmed?.ownerId === myUid
  );
  const openSlotsForAdmin = party.slots.filter((s) => !s.confirmed);
  const dummySlotsForAdmin = party.slots.filter((s) =>
    s.confirmed?.characterId?.startsWith("dummy_")
  );
  const canManageAsHost = (isHost || isAdmin) && !isClosed && !isCancelled;

  const handleAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  // Tint progressivo: enche da esquerda pra direita conforme confirmados,
  // cor interpolada de azul (0/N) a verde (N/N). Mesmo padrão da Sugestão Auto.
  const progressBg = (() => {
    if (isCancelled || isCompleted) return undefined;
    const total = party.slots.length;
    if (total === 0) return undefined;
    const ratio = confirmedCount / total;
    const pct = Math.min(100, Math.max(0, ratio * 100));
    const r = Math.round(120 + (74 - 120) * ratio);
    const g = Math.round(180 + (222 - 180) * ratio);
    const b = Math.round(250 + (94 - 250) * ratio);
    const alpha = 0.05;
    const tone = `rgba(${r},${g},${b},${alpha})`;
    return `linear-gradient(90deg, ${tone} 0%, ${tone} ${pct}%, transparent ${pct}%)`;
  })();

  return (
    <div
      className={`bg-[var(--background-elev)] border rounded-xl p-4 transition ${
        isClosed
          ? "border-[var(--ok)]/40"
          : isCancelled
            ? "border-[var(--border)] opacity-60"
            : "border-[var(--border)] hover:border-[var(--accent-dim)]"
      }`}
      style={progressBg ? { backgroundImage: progressBg } : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          {(() => {
            // Prioridade: charById (viewer próprio) → snapshot da party → pool entry → entry no slot do host
            const hostSlotEntry = party.slots.find(
              (s) => s.entry?.characterId === party.hostCharacterId
            )?.entry;
            const poolHost = poolEntryByCharId(allPool, party.hostCharacterId);
            const hostName =
              hostChar?.name ??
              party.hostCharacterName ??
              hostSlotEntry?.characterName ??
              poolHost?.characterName ??
              null;
            const hostVoc =
              hostChar?.vocation ??
              party.hostVocation ??
              hostSlotEntry?.vocation ??
              (poolHost?.vocation as Vocation | undefined) ??
              null;
            const hostLvl =
              hostChar?.level ??
              party.hostLevel ??
              hostSlotEntry?.level ??
              poolHost?.level ??
              null;
            const hostInitial = (hostName ?? "?").charAt(0).toUpperCase();
            return (
              <div className="flex items-center gap-2.5">
                {hostName && (
                  <div
                    className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-bold text-[15px] border border-[var(--accent-dim)] bg-[var(--accent)]/15 ${VOC_COLORS[hostVoc ?? ""] ?? "text-[var(--accent)]"}`}
                    title="Host"
                  >
                    {hostInitial}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent)] text-[#04122a]">
                      HOST
                    </span>
                  </div>
                  {hostName ? (
                    <div className="text-[15px] font-semibold leading-tight">
                      PT do{" "}
                      <span className="text-[var(--accent)]">{hostName}</span>
                      {(hostVoc || hostLvl != null) && (
                        <span className="text-[var(--text-mute)] font-normal text-[13px]">
                          {" "}
                          ({hostVoc ?? "?"}
                          {hostLvl != null ? ` ${hostLvl}` : ""})
                        </span>
                      )}
                    </div>
                  ) : (
                    <em className="text-xs text-[var(--text-mute)]">char removido</em>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="flex gap-3 flex-wrap text-[11px] text-[var(--text-mute)] mt-1">
            <span>📍 {party.server}</span>
          </div>
          <RequirementChips party={party} />
        </div>
        <StatusBadge
          status={party.status}
          filled={filled}
          confirmed={confirmedCount}
          total={party.slots.length}
        />
      </div>

      {party.notes && (
        <div className="text-[12px] text-[var(--text-mute)] bg-[var(--background)]/50 border border-[var(--border)] rounded px-3 py-2 mb-3">
          💬 {party.notes}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {party.slots.map((slot) => (
          <SlotCell
            key={slot.index}
            slot={slot}
            character={
              slot.confirmed ? charById.get(slot.confirmed.characterId) ?? null : null
            }
            isMine={slot.confirmed?.ownerId === myUid}
            isHostSlot={
              !!slot.confirmed && slot.confirmed.characterId === party.hostCharacterId
            }
            partyIsClosed={isClosed}
            onClick={
              canManageAsHost ? () => setManagePopupSlot(slot.index) : undefined
            }
            entryName={
              slot.confirmed
                ? charById.get(slot.confirmed.characterId)?.name ??
                  poolEntryByCharId(allPool, slot.confirmed.characterId)
                    ?.characterName ??
                  slot.confirmed.characterName ??
                  null
                : null
            }
            entryVoc={
              slot.confirmed
                ? charById.get(slot.confirmed.characterId)?.vocation ??
                  (poolEntryByCharId(allPool, slot.confirmed.characterId)
                    ?.vocation as string) ??
                  slot.confirmed.vocation ??
                  null
                : null
            }
            entryLevel={
              slot.confirmed
                ? charById.get(slot.confirmed.characterId)?.level ??
                  poolEntryByCharId(allPool, slot.confirmed.characterId)?.level ??
                  slot.confirmed.level ??
                  null
                : null
            }
          />
        ))}
      </div>

      {error && (
        <div className="text-xs text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {!isClosed && !isCancelled && (
        <div className="pt-3 border-t border-[var(--border)] space-y-2">
          {isAdmin && (openSlotsForAdmin.length > 0 || dummySlotsForAdmin.length > 0) && (
            <div className="bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded px-2 py-1.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--warn)] font-bold">
                  🛠 ADMIN — gerenciar dummies
                </span>
                <span className="text-[10px] text-[var(--text-mute)]">
                  {isHost ? "sua PT" : `host: ${party.hostUid.slice(0, 6)}…`}
                </span>
              </div>
              {openSlotsForAdmin.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {openSlotsForAdmin.map((s) => {
                    const dummy = makeDummyForSlot(s.vocations);
                    return (
                      <button
                        key={`add-${s.index}`}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleAction(() =>
                            addDummyToSlot(party.id, party, s.index, dummy)
                          )
                        }
                        className="text-[10px] border border-[var(--warn)]/50 text-[var(--warn)] hover:bg-[var(--warn)]/15 px-2 py-0.5 rounded transition disabled:opacity-50"
                      >
                        + vaga {s.index + 1} ({dummy.vocation} {dummy.characterName} {dummy.level})
                      </button>
                    );
                  })}
                </div>
              )}
              {dummySlotsForAdmin.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dummySlotsForAdmin.map((s) => (
                    <button
                      key={`rm-${s.index}`}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleAction(() =>
                          withdrawFromSlot(party.id, party, s.index)
                        )
                      }
                      className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/15 px-2 py-0.5 rounded transition disabled:opacity-50"
                    >
                      − vaga {s.index + 1} ({s.confirmed?.vocation} {s.confirmed?.characterName})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {(isHost || isAdmin) && (
            <HostActions
              party={party}
              busy={busy}
              allConfirmed={allConfirmed}
              isAdminViewing={!isHost && isAdmin}
              onKickConfirmed={(idx) =>
                handleAction(() => withdrawFromSlot(party.id, party, idx))
              }
              onClose={() =>
                handleAction(() => closePartyAndLock(party.id, party))
              }
              onCancel={() => handleAction(() => cancelParty(party.id))}
              onEdit={onEdit}
            />
          )}

          {!isHost && (
            <NonHostActions
              party={party}
              myUid={myUid}
              myChars={myChars}
              busy={busy}
              onOpenPicker={(idx) => setPickerSlot(idx)}
              onAcceptInvite={(idx, charId) =>
                handleAction(() => acceptInvite(party.id, party, idx, charId))
              }
              onDeclineInvite={(idx, charId) =>
                handleAction(() => declineInvite(party.id, party, idx, charId))
              }
              onWithdrawApplication={(idx, charId) =>
                handleAction(() =>
                  withdrawApplication(party.id, party, idx, charId)
                )
              }
              onWithdrawConfirmed={(idx) =>
                handleAction(() => withdrawFromSlot(party.id, party, idx))
              }
            />
          )}
        </div>
      )}

      {isClosed && (
        <div className="pt-3 border-t border-[var(--border)] space-y-2">
          <div className="text-xs text-[var(--ok)] font-semibold flex items-center gap-2">
            ✓ PT fechada — chars locked
          </div>

          {isAdmin && (
            <div className="bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded px-2 py-1.5 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--warn)] font-bold">
                🛠 ADMIN — expulsar de PT fechada
              </div>
              <div className="flex flex-wrap gap-1">
                {party.slots
                  .filter(
                    (s) =>
                      s.confirmed &&
                      s.confirmed.characterId !== party.hostCharacterId
                  )
                  .map((s) => (
                    <button
                      key={s.index}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleAction(() =>
                          leaveClosedParty(party.id, party, s.index)
                        )
                      }
                      className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
                    >
                      Expulsar vaga {s.index + 1}
                    </button>
                  ))}
                {party.slots.filter(
                  (s) =>
                    s.confirmed &&
                    s.confirmed.characterId !== party.hostCharacterId
                ).length === 0 && (
                  <span className="text-[10px] text-[var(--text-mute)]">
                    nenhum não-host pra expulsar
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            {myConfirmedSlot ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  handleAction(() =>
                    leaveClosedParty(party.id, party, myConfirmedSlot.index)
                  )
                }
                className="text-xs border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-3 py-1.5 rounded transition disabled:opacity-50"
              >
                Sair da PT
              </button>
            ) : (
              <span />
            )}
            {isHost && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  handleAction(() => completeParty(party.id, party))
                }
                className="text-xs bg-[var(--ok)] hover:brightness-110 text-[#063817] font-semibold px-3 py-1.5 rounded transition disabled:opacity-50"
              >
                {busy ? "..." : "✓ Quest Concluída"}
              </button>
            )}
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="pt-3 border-t border-[var(--border)] text-xs text-[var(--ok)] font-semibold flex items-center gap-2">
          🏆 Quest concluída
        </div>
      )}

      {pickerSlot !== null && (
        <SlotPicker
          party={party}
          slotIndex={pickerSlot}
          myChars={myChars}
          myPoolByCharId={myPoolByCharId}
          onCancel={() => setPickerSlot(null)}
          onPick={async (charId) => {
            const c = myChars.find((x) => x.id === charId);
            if (!c) return;
            setPickerSlot(null);
            await handleAction(() =>
              applyToSlot(party.id, party, pickerSlot, charId, myUid, {
                characterName: c.name,
                vocation: c.vocation,
                level: c.level,
              })
            );
          }}
        />
      )}

      {managePopupSlot !== null && (
        <SlotManagePopup
          party={party}
          slotIndex={managePopupSlot}
          allPool={allPool ?? []}
          charById={charById}
          lockedCharIds={lockedCharIds}
          busy={busy}
          onClose={() => setManagePopupSlot(null)}
          onAcceptApplication={(charId) =>
            handleAction(() =>
              acceptApplication(party.id, party, managePopupSlot, charId)
            )
          }
          onDeclineApplication={(charId) =>
            handleAction(() =>
              declineApplication(party.id, party, managePopupSlot, charId)
            )
          }
          onInvite={(entry) =>
            handleAction(() =>
              inviteToSlot(
                party.id,
                party,
                managePopupSlot,
                entry.characterId,
                entry.ownerId,
                {
                  characterName: entry.characterName,
                  vocation: entry.vocation as Vocation,
                  level: entry.level,
                }
              )
            )
          }
          onCancelInvite={(charId) =>
            handleAction(() =>
              cancelInvite(party.id, party, managePopupSlot, charId)
            )
          }
          onKickConfirmed={() =>
            handleAction(() =>
              withdrawFromSlot(party.id, party, managePopupSlot)
            )
          }
        />
      )}
    </div>
  );
}

function StatusBadge({
  status,
  filled,
  confirmed,
  total,
}: {
  status: string;
  filled: number;
  confirmed: number;
  total: number;
}) {
  if (status === "closed") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/40 whitespace-nowrap">
        ● Fechada
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[var(--ok)]/15 text-[var(--ok)] border border-[var(--ok)]/40 whitespace-nowrap">
        🏆 Concluída
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[var(--background-elev-2)] text-[var(--text-dim)] border border-[var(--border-strong)] whitespace-nowrap">
        ● Cancelada
      </span>
    );
  }
  const tone =
    confirmed === total
      ? "bg-[var(--ok)]/15 text-[var(--ok)] border-[var(--ok)]/40"
      : "bg-[var(--warn)]/15 text-[var(--warn)] border-[var(--warn)]/40";
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap ${tone}`}
    >
      ● {confirmed}/{total} confirmados · {total - filled} aberta(s)
    </span>
  );
}

function SlotCell({
  slot,
  isMine,
  isHostSlot,
  partyIsClosed,
  onClick,
  entryName,
  entryVoc,
  entryLevel,
}: {
  slot: Slot;
  character?: Character | null;
  isMine: boolean;
  isHostSlot: boolean;
  partyIsClosed: boolean;
  onClick?: () => void;
  entryName: string | null;
  entryVoc: string | null;
  entryLevel: number | null;
}) {
  const vocLabel = slotVocationLabel(slot.vocations);
  const applicantCount = slot.applicants.length;
  const hasApplicants = applicantCount > 0;
  const clickable = !!onClick;

  if (!slot.confirmed) {
    // Vaga aberta: visual amarelo se tem inscrições, azul tracejado se vazia.
    const tinted = hasApplicants;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        className={`relative p-2 rounded-md border min-h-[68px] flex flex-col items-center justify-center text-center transition w-full ${
          tinted
            ? `border-[var(--warn)]/50 bg-[var(--warn)]/10 ${
                clickable ? "hover:bg-[var(--warn)]/18 cursor-pointer" : ""
              }`
            : clickable
              ? "border-dashed border-[var(--accent)] bg-[var(--accent)]/4 hover:bg-[var(--accent)]/12 cursor-pointer"
              : "border-dashed border-[var(--accent-dim)] bg-[var(--accent)]/4 cursor-default"
        }`}
        title={
          tinted
            ? `${applicantCount} inscrito(s) aguardando você`
            : clickable
              ? "Clique para gerenciar"
              : undefined
        }
      >
        {hasApplicants && (
          <span
            className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--warn)] text-[#1a1200] font-black text-[12px] shadow"
            aria-label={`${applicantCount} inscritos`}
          >
            !
          </span>
        )}
        <div
          className={`text-[10px] font-bold uppercase tracking-wider ${
            tinted ? "text-[var(--warn)]" : "text-[var(--warn)]"
          }`}
        >
          {vocLabel === "Qualquer" ? "Flex" : vocLabel}
        </div>
        <div className="text-[10px] text-[var(--text-mute)] mt-1">
          {hasApplicants ? `${applicantCount} inscrito(s)` : clickable ? "+ convidar" : "Vaga aberta"}
        </div>
      </button>
    );
  }

  const cellBorder = partyIsClosed
    ? "border-[var(--ok)] bg-[var(--ok)]/8"
    : "border-[var(--ok)]/40 bg-[var(--ok)]/5";
  const vocColor = entryVoc
    ? VOC_COLORS[entryVoc] ?? "text-[var(--accent)]"
    : "text-[var(--text-mute)]";
  const interactive = clickable;
  const Wrapper: "button" | "div" = interactive ? "button" : "div";

  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      className={`p-2 rounded-md border min-h-[68px] flex flex-col items-center justify-center text-center w-full ${cellBorder} ${
        interactive ? "cursor-pointer hover:brightness-110 transition" : ""
      }`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-wider ${vocColor}`}
      >
        {entryVoc ?? (vocLabel === "Qualquer" ? "Flex" : vocLabel)}
      </div>
      <div className="text-[11px] text-[var(--text)] font-medium mt-0.5 truncate w-full">
        {entryName ?? "removido"}
      </div>
      <div className="text-[9px] text-[var(--text-dim)] tabular-nums">
        {entryLevel ?? "—"}
      </div>
      {isHostSlot && (
        <div className="text-[9px] text-[var(--accent)] uppercase mt-0.5">host</div>
      )}
      {isMine && !isHostSlot && (
        <div className="text-[9px] text-[var(--accent)] uppercase mt-0.5">você</div>
      )}
    </Wrapper>
  );
}

const DUMMY_NAMES = [
  "Dummy Bot", "Test Hero", "Mock Char", "Fake Knight", "Sim Druid",
  "Phantom MS", "Echo RP", "Ghost EM", "Probe Char", "Stub Player",
];
function makeDummyForSlot(slotVocations: Vocation[]): {
  characterName: string;
  vocation: Vocation;
  level: number;
} {
  const ALL_VOCS: Vocation[] = ["EK", "ED", "MS", "RP", "EM"];
  const pool = slotVocations.length === 0 ? ALL_VOCS : slotVocations;
  const voc = pool[Math.floor(Math.random() * pool.length)];
  const name = DUMMY_NAMES[Math.floor(Math.random() * DUMMY_NAMES.length)];
  const level = 600 + Math.floor(Math.random() * 400);
  return { characterName: name, vocation: voc, level };
}

function CountdownLabel({ expiresAt }: { expiresAt: Timestamp }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const remainMs = expiresAt.toMillis() - now;
  if (remainMs <= 0) {
    return <span className="text-[var(--danger)] text-[10px]">expirado</span>;
  }
  const totalMin = Math.floor(remainMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return (
    <span className="text-[var(--text-dim)] text-[10px]">expira em {label}</span>
  );
}

function poolEntryByCharId(
  pool: PrimalPoolEntry[] | undefined,
  charId: string
): PrimalPoolEntry | undefined {
  return pool?.find((e) => e.characterId === charId);
}

function HostActions({
  party,
  busy,
  allConfirmed,
  isAdminViewing,
  onKickConfirmed,
  onClose,
  onCancel,
  onEdit,
}: {
  party: PrimalParty;
  busy: boolean;
  allConfirmed: boolean;
  isAdminViewing?: boolean;
  onKickConfirmed: (i: number) => void;
  onClose: () => void;
  onCancel: () => void;
  onEdit?: () => void;
}) {
  const slotsWithApplicants = party.slots.filter(
    (s) => !s.confirmed && s.applicants.length > 0
  );
  const slotsWithInvitesOnly = party.slots.filter(
    (s) => !s.confirmed && s.invites.length > 0 && s.applicants.length === 0
  );
  const confirmedNonHost = party.slots.filter(
    (s) =>
      s.confirmed &&
      s.confirmed.characterId !== party.hostCharacterId
  );

  return (
    <div className="space-y-2">
      {isAdminViewing && (
        <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--warn)] bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded px-2 py-1">
          🛠 Visualizando como ADMIN — você não é o host dessa PT
        </div>
      )}
      {slotsWithApplicants.length > 0 && (
        <div className="text-[11px] bg-[var(--warn)]/6 border border-[var(--warn)]/30 rounded px-3 py-1.5 text-[var(--warn)] font-semibold flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--warn)] text-[#1a1200] font-black text-[11px]">!</span>
          {slotsWithApplicants
            .map((s) => `Vaga ${s.index + 1} (${s.applicants.length})`)
            .join(", ")}
          {" — "}clique na vaga pra ver inscritos
        </div>
      )}
      {slotsWithInvitesOnly.length > 0 && (
        <div className="text-[10px] text-[var(--text-mute)]">
          Convites enviados:{" "}
          {slotsWithInvitesOnly
            .map((s) => `vaga ${s.index + 1} (${s.invites.length})`)
            .join(", ")}
          {" — "}aguardando resposta
        </div>
      )}

      {confirmedNonHost.length > 0 && (
        <div className="text-[11px] space-y-1.5">
          <div className="text-[var(--text-mute)] font-semibold uppercase tracking-wider text-[10px]">
            Membros confirmados
          </div>
          {confirmedNonHost.map((s) => (
            <div
              key={s.index}
              className="flex items-center justify-between gap-2 bg-[var(--ok)]/6 border border-[var(--ok)]/25 rounded px-2 py-1.5"
            >
              <span className="text-[11px] text-[var(--text)]">
                Vaga {s.index + 1} · {slotVocationLabel(s.vocations) === "Qualquer" ? "Flex" : slotVocationLabel(s.vocations)}
                {s.confirmed?.characterName && (
                  <>
                    {" · "}
                    <strong>
                      {s.confirmed.vocation} {s.confirmed.characterName}
                    </strong>{" "}
                    <span className="text-[var(--text-dim)]">
                      ({s.confirmed.level})
                    </span>
                  </>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onKickConfirmed(s.index)}
                className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                Expulsar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="text-xs border border-[var(--border-strong)] hover:border-[var(--danger)]/40 hover:text-[var(--danger)] px-3 py-1.5 rounded transition disabled:opacity-50"
          >
            Cancelar PT
          </button>
          {onEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={onEdit}
              className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] px-3 py-1.5 rounded transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar PT
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !allConfirmed}
          onClick={onClose}
          title={
            allConfirmed
              ? "Fechar a PT e travar os chars"
              : "Confirme todas as vagas antes de fechar"
          }
          className="text-xs bg-[var(--ok)] hover:brightness-110 text-[#063817] font-semibold px-3 py-1.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Fechando…" : "Fechar PT"}
        </button>
      </div>
    </div>
  );
}

type MyEntryState =
  | { kind: "confirmed"; slot: Slot; charId: string }
  | { kind: "apply"; slot: Slot; charId: string; competitors: number; expiresAt?: Timestamp | null }
  | { kind: "invite"; slot: Slot; charId: string; expiresAt?: Timestamp | null };

function NonHostActions({
  party,
  myUid,
  myChars,
  busy,
  onOpenPicker,
  onAcceptInvite,
  onDeclineInvite,
  onWithdrawApplication,
  onWithdrawConfirmed,
}: {
  party: PrimalParty;
  myUid: string;
  myChars: Character[];
  busy: boolean;
  onOpenPicker: (i: number) => void;
  onAcceptInvite: (i: number, charId: string) => void;
  onDeclineInvite: (i: number, charId: string) => void;
  onWithdrawApplication: (i: number, charId: string) => void;
  onWithdrawConfirmed: (i: number) => void;
}) {
  const myCharIds = useMemo(() => new Set(myChars.map((c) => c.id)), [myChars]);

  const myEntries: MyEntryState[] = useMemo(() => {
    const out: MyEntryState[] = [];
    party.slots.forEach((s) => {
      if (s.confirmed?.ownerId === myUid) {
        out.push({ kind: "confirmed", slot: s, charId: s.confirmed.characterId });
        return;
      }
      const myInv = s.invites.find(
        (i) => i.ownerId === myUid || myCharIds.has(i.characterId)
      );
      if (myInv) {
        out.push({
          kind: "invite",
          slot: s,
          charId: myInv.characterId,
          expiresAt: myInv.expiresAt ?? null,
        });
      }
      const myApp = s.applicants.find(
        (a) => a.ownerId === myUid || myCharIds.has(a.characterId)
      );
      if (myApp) {
        out.push({
          kind: "apply",
          slot: s,
          charId: myApp.characterId,
          competitors: s.applicants.length - 1,
          expiresAt: myApp.expiresAt ?? null,
        });
      }
    });
    return out;
  }, [party.slots, myUid, myCharIds]);

  const openSlots = party.slots.filter((s) => !s.confirmed);

  return (
    <div className="space-y-2">
      {myEntries.length > 0 && (
        <div className="text-[11px] space-y-1">
          {myEntries.map((e) => {
            const slotLabel = `Vaga ${e.slot.index + 1}`;
            if (e.kind === "invite") {
              return (
                <div
                  key={`inv-${e.slot.index}-${e.charId}`}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 bg-[var(--warn)]/8 border border-[var(--warn)]/40"
                >
                  <span className="text-[11px]">
                    <strong className="text-[var(--warn)]">
                      Você foi convidado pra {slotLabel}
                    </strong>
                    {e.expiresAt && (
                      <>
                        {" · "}
                        <CountdownLabel expiresAt={e.expiresAt} />
                      </>
                    )}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDeclineInvite(e.slot.index, e.charId)}
                      className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAcceptInvite(e.slot.index, e.charId)}
                      className="text-[10px] bg-[var(--ok)] hover:brightness-110 text-[#063817] font-medium px-2 py-0.5 rounded transition disabled:opacity-50"
                    >
                      Aceitar
                    </button>
                  </div>
                </div>
              );
            }
            if (e.kind === "apply") {
              return (
                <div
                  key={`app-${e.slot.index}-${e.charId}`}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 bg-[var(--accent)]/6 border border-[var(--accent)]/30"
                >
                  <span className="text-[11px]">
                    Sua candidatura na {slotLabel}
                    {e.competitors > 0 ? (
                      <span className="text-[var(--text-mute)]">
                        {" · concorrendo com mais "}
                        <strong className="text-[var(--text)]">
                          {e.competitors}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-[var(--text-mute)]">
                        {" · aguardando host"}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onWithdrawApplication(e.slot.index, e.charId)}
                    className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              );
            }
            return (
              <div
                key={`conf-${e.slot.index}`}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 bg-[var(--ok)]/6 border border-[var(--ok)]/30"
              >
                <span className="text-[11px]">
                  Você está na {slotLabel}
                  <span className="text-[var(--ok)]"> · confirmado</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onWithdrawConfirmed(e.slot.index)}
                  className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
                >
                  Sair da PT
                </button>
              </div>
            );
          })}
        </div>
      )}

      {openSlots.length > 0 && (
        <div className="flex justify-end">
          <SlotApplyMenu slots={openSlots} onPick={onOpenPicker} busy={busy} />
        </div>
      )}
    </div>
  );
}

function SlotApplyMenu({
  slots,
  onPick,
  busy,
}: {
  slots: Slot[];
  onPick: (i: number) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-semibold px-3 py-1.5 rounded transition disabled:opacity-50"
      >
        Candidatar char →
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-44 bg-[var(--background)] border border-[var(--border-strong)] rounded-md shadow-xl z-20 overflow-hidden">
          {slots.map((s) => (
            <button
              key={s.index}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(s.index);
              }}
              className="block w-full text-left px-3 py-2 text-xs hover:bg-[var(--background-elev-2)] transition border-b border-[var(--border)] last:border-0"
            >
              Vaga {s.index + 1} ·{" "}
              <span className="text-[var(--warn)] font-semibold">
                {slotVocationLabel(s.vocations) === "Qualquer"
                  ? "Flex"
                  : slotVocationLabel(s.vocations)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SlotPicker({
  party,
  slotIndex,
  myChars,
  myPoolByCharId,
  onCancel,
  onPick,
}: {
  party: PrimalParty;
  slotIndex: number;
  myChars: Character[];
  myPoolByCharId: Map<string, PrimalPoolEntry>;
  onCancel: () => void;
  onPick: (charId: string) => void;
}) {
  const slot = party.slots[slotIndex];
  const minLevel = effectiveMinLevel(party);

  const evaluated = useMemo(
    () =>
      myChars.map((c) => {
        const eligibility = isCharEligibleForSlot(
          c,
          myPoolByCharId.get(c.id),
          party,
          slotIndex
        );
        return { char: c, ...eligibility };
      }),
    [myChars, myPoolByCharId, party, slotIndex]
  );
  const eligible = evaluated.filter((e) => e.ok);
  const blocked = evaluated.filter((e) => !e.ok);
  const overlayProps = useOverlayClose(onCancel);
  const [search, setSearch] = useState("");
  const filteredEligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(({ char: c }) =>
      c.name.toLowerCase().includes(q)
    );
  }, [eligible, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      {...overlayProps}
    >
      <div
        className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl p-5 shadow-2xl"
      >
        <h3 className="text-sm font-semibold mb-1">
          Candidatar char na vaga {slotIndex + 1}
        </h3>
        <p className="text-xs text-[var(--text-mute)] mb-3">
          Vocação:{" "}
          <strong className="text-[var(--text)]">
            {slotVocationLabel(slot.vocations)}
          </strong>{" "}
          · Mín. level {minLevel} · Servidor {party.server}
        </p>

        {eligible.length > 3 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar char por nome..."
            className="w-full mb-3 bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
            autoFocus
          />
        )}

        {eligible.length === 0 ? (
          <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
            Nenhum char seu elegível pra essa vaga.
          </div>
        ) : filteredEligible.length === 0 ? (
          <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
            Nenhum char bate com &quot;{search}&quot;.
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {filteredEligible.map(({ char: c }) => {
              const vocColor = VOC_COLORS[c.vocation] ?? "text-[var(--accent)]";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPick(c.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/6 text-left transition"
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
                  >
                    {c.vocation}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {c.name}
                    </span>
                    <span className="block text-[11px] text-[var(--text-mute)]">
                      Level {c.level} · {c.server}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {blocked.length > 0 && (
          <details className="text-xs text-[var(--text-mute)] mb-4">
            <summary className="cursor-pointer hover:text-[var(--text)]">
              {blocked.length} char(s) não elegível(eis) — ver motivos
            </summary>
            <div className="mt-2 space-y-1 pl-2">
              {blocked.map(({ char: c, reason }) => (
                <div key={c.id} className="flex justify-between gap-2 py-1 border-b border-[var(--border)] last:border-0">
                  <span className="truncate">
                    {c.vocation} {c.name} ({c.level})
                  </span>
                  <span className="text-[var(--danger)] text-[10px] whitespace-nowrap">
                    {reason}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] px-3 py-1.5 rounded transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotManagePopup({
  party,
  slotIndex,
  allPool,
  charById,
  lockedCharIds,
  busy,
  onClose,
  onAcceptApplication,
  onDeclineApplication,
  onInvite,
  onCancelInvite,
  onKickConfirmed,
}: {
  party: PrimalParty;
  slotIndex: number;
  allPool: PrimalPoolEntry[];
  charById: Map<string, Character>;
  lockedCharIds?: Set<string>;
  busy: boolean;
  onClose: () => void;
  onAcceptApplication: (charId: string) => void;
  onDeclineApplication: (charId: string) => void;
  onInvite: (entry: PrimalPoolEntry) => void;
  onCancelInvite: (charId: string) => void;
  onKickConfirmed: () => void;
}) {
  const slot = party.slots[slotIndex];
  const overlayProps = useOverlayClose(onClose);
  const [applicantSearch, setApplicantSearch] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [vocFilter, setVocFilter] = useState<Set<Vocation>>(new Set());

  const slotVocLabel = slotVocationLabel(slot.vocations);
  const slotAcceptsAny = (slot?.vocations ?? []).length === 0;
  const slotVocSet = useMemo(
    () => new Set<Vocation>(slot?.vocations ?? []),
    [slot]
  );

  const toggleVocFilter = (v: Vocation) => {
    setVocFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const applicants = slot?.applicants ?? [];
  const invitedCharIds = useMemo(
    () => new Set((slot?.invites ?? []).map((i) => i.characterId)),
    [slot]
  );

  const filteredApplicants = useMemo(() => {
    const q = applicantSearch.trim().toLowerCase();
    if (!q) return applicants;
    return applicants.filter((a) =>
      (a.characterName ?? "").toLowerCase().includes(q)
    );
  }, [applicants, applicantSearch]);

  // Pool de chars do mesmo servidor (todos, com voc válida), excluindo o host
  const serverPool = useMemo(
    () =>
      allPool.filter(
        (e) =>
          e.vocation &&
          e.characterName &&
          e.server === party.server &&
          e.characterId !== party.hostCharacterId
      ),
    [allPool, party.server, party.hostCharacterId]
  );

  type InviteRow = {
    entry: PrimalPoolEntry;
    invited: boolean;
    inviteEntry: ReturnType<typeof getInvite>;
    disabled: boolean;
    reason: string | null;
  };
  function getInvite(charId: string) {
    return slot?.invites.find((i) => i.characterId === charId) ?? null;
  }

  const inviteRows: InviteRow[] = useMemo(() => {
    return serverPool.map((e) => {
      const invited = invitedCharIds.has(e.characterId);
      const inviteEntry = getInvite(e.characterId);
      let reason: string | null = null;
      let disabled = false;
      // Char locked em outra PT fechada
      if (lockedCharIds?.has(e.characterId)) {
        reason = "Char travado em outra PT fechada";
        disabled = true;
      } else if (
        !canVocFillSlot(e.vocation as Vocation, slot?.vocations ?? [])
      ) {
        reason = `Vocação não compatível (precisa ${slotVocLabel})`;
        disabled = true;
      } else if (
        party.slots.some((s) => s.confirmed?.ownerId === e.ownerId)
      ) {
        reason = "Player já tem char nessa PT";
        disabled = true;
      } else if (
        slot?.applicants.some((a) => a.characterId === e.characterId)
      ) {
        // tem apply do mesmo char — convite vira auto-confirm
        reason = "Já se candidatou — clicar Convidar confirma";
        disabled = false;
      }
      return { entry: e, invited, inviteEntry, disabled, reason };
    });
  }, [
    serverPool,
    invitedCharIds,
    lockedCharIds,
    slot,
    slotVocLabel,
    party.slots,
  ]);

  const filteredInviteRows = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    return inviteRows.filter((r) => {
      if (q && !r.entry.characterName.toLowerCase().includes(q)) return false;
      if (vocFilter.size > 0 && !vocFilter.has(r.entry.vocation as Vocation))
        return false;
      return true;
    });
  }, [inviteRows, inviteSearch, vocFilter]);

  if (!slot) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      {...overlayProps}
    >
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${VOC_COLORS[slot.vocations[0] ?? ""] ?? "text-[var(--accent)]"}`}
            >
              {slotVocLabel === "Qualquer" ? "Flex" : slotVocLabel}
            </span>
            <div>
              <div className="text-sm font-semibold">Vaga {slot.index + 1}</div>
              <div className="text-[11px] text-[var(--text-mute)]">
                {slot.confirmed
                  ? "Vaga preenchida"
                  : "Gerencie inscrições e envie convites"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text)] text-lg leading-none px-2"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Confirmed (read-only com botão de kick) */}
        {slot.confirmed && (
          <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--ok)]/4">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ok)] mb-2">
              Confirmado nesta vaga
            </div>
            <div className="flex items-center justify-between gap-2 bg-[var(--background)] border border-[var(--ok)]/30 rounded px-3 py-2">
              <span className="text-[12px]">
                <strong>
                  {slot.confirmed.vocation} {slot.confirmed.characterName}
                </strong>{" "}
                <span className="text-[var(--text-dim)]">
                  · {slot.confirmed.level}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={onKickConfirmed}
                className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                Expulsar
              </button>
            </div>
          </div>
        )}

        {/* Inscritos */}
        {!slot.confirmed && (
          <div className="px-5 pt-5 pb-6" style={{ borderBottom: "8px solid var(--background)" }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--warn)] mb-2">
              Inscritos{" "}
              <span className="text-[var(--text-mute)]">
                · {applicants.length}
              </span>
            </div>
            <input
              type="text"
              value={applicantSearch}
              onChange={(e) => setApplicantSearch(e.target.value)}
              placeholder="🔍 Buscar inscrito por nome..."
              className="w-full mb-2 bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-1.5 text-sm focus:border-[var(--warn)] focus:outline-none"
            />
            {applicants.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded p-4 text-center text-[11px] text-[var(--text-mute)]">
                Sem inscrições ainda.
              </div>
            ) : filteredApplicants.length === 0 ? (
              <div className="text-[11px] text-[var(--text-mute)] py-2">
                Nenhum inscrito bate com &quot;{applicantSearch}&quot;.
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredApplicants.map((a) => {
                  const live = charById.get(a.characterId);
                  const name = live?.name ?? a.characterName ?? "removido";
                  const voc = live?.vocation ?? a.vocation ?? "?";
                  const level = live?.level ?? a.level ?? "—";
                  const vocColor =
                    VOC_COLORS[voc] ?? "text-[var(--accent)]";
                  return (
                    <div
                      key={a.characterId}
                      className="flex items-center gap-2 bg-[var(--background)] border border-[var(--border-strong)] rounded px-3 py-2"
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
                      >
                        {voc}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold truncate">
                          {name}
                        </div>
                        <div className="text-[10px] text-[var(--text-dim)]">
                          level {level}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAcceptApplication(a.characterId)}
                        className="text-[10px] bg-[var(--ok)] hover:brightness-110 text-[#063817] font-medium px-2 py-1 rounded transition disabled:opacity-50"
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeclineApplication(a.characterId)}
                        className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-1 rounded transition disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Convidar */}
        {!slot.confirmed && (
          <div className="px-5 pt-5 pb-5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--accent)] mb-2">
              Convidar player{" "}
              <span className="text-[var(--text-mute)]">
                · servidor {party.server}
              </span>
            </div>
            {/* Filtro de vocação — vocs aceitas pela vaga habilitadas, outras disabled */}
            <div className="flex flex-wrap gap-1 mb-2">
              {(["EK", "ED", "RP", "MS", "EM"] as Vocation[]).map((v) => {
                const allowed = slotAcceptsAny || slotVocSet.has(v);
                const active = vocFilter.has(v);
                const colorCls = VOC_COLORS[v] ?? "text-[var(--accent)]";
                const title = allowed
                  ? `Filtrar por ${v}`
                  : `Vaga aceita: ${slotVocLabel}`;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={!allowed}
                    onClick={() => allowed && toggleVocFilter(v)}
                    title={title}
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition ${
                      !allowed
                        ? "opacity-35 cursor-not-allowed border-[var(--border)] bg-[var(--background-elev-2)]/40 text-[var(--text-dim)]"
                        : active
                          ? `${colorCls} border-current bg-[var(--background-elev-2)]`
                          : `${colorCls} border-[var(--border-strong)] hover:border-current bg-[var(--background-elev-2)]/60`
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
              {vocFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setVocFilter(new Set())}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] transition"
                  title="Limpar filtro"
                >
                  Limpar
                </button>
              )}
            </div>
            <input
              type="text"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              placeholder="🔍 Buscar char por nome..."
              className="w-full mb-2 bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
            />
            {serverPool.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded p-4 text-center text-[11px] text-[var(--text-mute)]">
                Nenhum char registrado na pool do servidor {party.server}.
              </div>
            ) : filteredInviteRows.length === 0 ? (
              <div className="text-[11px] text-[var(--text-mute)] py-2">
                Nenhum char bate com &quot;{inviteSearch}&quot;.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {filteredInviteRows.map(
                  ({ entry, invited, inviteEntry, disabled, reason }) => {
                    const vocColor =
                      VOC_COLORS[entry.vocation] ?? "text-[var(--accent)]";
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-2 bg-[var(--background)] border rounded px-3 py-2 ${
                          invited
                            ? "border-[var(--warn)]/40"
                            : "border-[var(--border-strong)]"
                        } ${disabled ? "opacity-65" : ""}`}
                      >
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
                        >
                          {entry.vocation || "?"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold truncate">
                            {entry.characterName}
                          </div>
                          <div className="text-[10px] text-[var(--text-dim)] truncate">
                            level {entry.level}
                            {reason && (
                              <span className="text-[var(--danger)]">
                                {" · "}
                                {reason}
                              </span>
                            )}
                            {invited && inviteEntry?.expiresAt && (
                              <span className="text-[var(--warn)]">
                                {" · "}
                                convite enviado ·{" "}
                                <CountdownLabel
                                  expiresAt={inviteEntry.expiresAt}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                        {invited ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onCancelInvite(entry.characterId)}
                            className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-1 rounded transition disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy || disabled}
                            onClick={() => onInvite(entry)}
                            title={disabled ? reason ?? undefined : "Enviar convite"}
                            className="text-[10px] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-2 py-1 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Convidar
                          </button>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RequirementChips({ party }: { party: PrimalParty }) {
  const r = party.requirements;
  const chips: { icon: string; label: string }[] = [];
  if (r.minLevel.active) {
    chips.push({ icon: "🛡️", label: `Level ≥ ${r.minLevel.value}` });
  }
  if (r.minHazard.active) {
    chips.push({ icon: "🔥", label: `Hazard ≥ ${r.minHazard.value}` });
  }
  if (r.schedule.active && r.schedule.value.length > 0) {
    const turnos = r.schedule.value
      .map((t) => `${TURNO_ICONS[t]} ${TURNO_LABELS[t]}`)
      .join(" · ");
    chips.push({ icon: "🕒", label: turnos });
  }
  if (r.experienced?.active) {
    chips.push({ icon: "🎯", label: "Com experiência" });
  }
  if (r.questDone?.active) {
    chips.push({
      icon: r.questDone.value ? "🎖️" : "🆕",
      label: r.questDone.value ? "Apenas veteranos" : "Apenas iniciantes",
    });
  }
  if (chips.length === 0) {
    return (
      <div className="mt-1.5 text-[10px] text-[var(--text-dim)]">
        Sem filtros · qualquer char elegível pode candidatar
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/8 text-[var(--accent)]"
        >
          <span>{c.icon}</span>
          <span>{c.label}</span>
        </span>
      ))}
    </div>
  );
}
