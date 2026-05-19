"use client";

import { useEffect, useMemo, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { useOverlayClose } from "./useOverlayClose";
import { Character } from "@/lib/characters";
import {
  addDummyToSlot,
  applyToSlot,
  cancelParty,
  checkCandidateForSlot,
  closePartyAndLock,
  completeParty,
  effectiveMinLevel,
  inviteToSlot,
  isCharEligibleForSlot,
  leaveClosedParty,
  PrimalParty,
  setSlotStatus,
  Slot,
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
  const [hostPickerSlot, setHostPickerSlot] = useState<number | null>(null);

  const isHost = party.hostUid === myUid;
  const filled = party.slots.filter((s) => s.entry).length;
  const confirmed = party.slots.filter(
    (s) => s.entry?.status === "confirmed"
  ).length;
  const allConfirmed = confirmed === party.slots.length;
  const isClosed = party.status === "closed";
  const isCancelled = party.status === "cancelled";
  const isCompleted = party.status === "completed";
  const isDev = process.env.NODE_ENV === "development";
  const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID ?? "";
  const isAdmin = !!adminUid && myUid === adminUid;
  const mySlot = party.slots.find((s) => s.entry?.ownerId === myUid);
  const openSlotsForAdmin = party.slots.filter((s) => !s.entry);
  const dummySlotsForAdmin = party.slots.filter((s) =>
    s.entry?.characterId?.startsWith("dummy_")
  );

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

  return (
    <div
      className={`bg-[var(--background-elev)] border rounded-xl p-4 transition ${
        isClosed
          ? "border-[var(--ok)]/40"
          : isCancelled
            ? "border-[var(--border)] opacity-60"
            : "border-[var(--border)] hover:border-[var(--accent-dim)]"
      }`}
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
            return (
              <div className="text-xs text-[var(--text-mute)]">
                Host:{" "}
                {hostName ? (
                  <>
                    {hostVoc && (
                      <>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${VOC_COLORS[hostVoc] ?? ""}`}
                        >
                          {hostVoc}
                        </span>{" "}
                      </>
                    )}
                    <strong className="text-[var(--text)]">{hostName}</strong>
                    {hostLvl != null && (
                      <span className="text-[var(--text-dim)]"> · {hostLvl}</span>
                    )}
                  </>
                ) : (
                  <em>char removido</em>
                )}
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
          confirmed={confirmed}
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
              slot.entry ? charById.get(slot.entry.characterId) ?? null : null
            }
            isMine={slot.entry?.ownerId === myUid}
            isHostSlot={
              !!slot.entry && slot.entry.characterId === party.hostCharacterId
            }
            partyIsClosed={isClosed}
            onClick={
              isHost && !isClosed && !isCancelled && !slot.entry
                ? () => setHostPickerSlot(slot.index)
                : undefined
            }
            entryName={
              slot.entry
                ? charById.get(slot.entry.characterId)?.name ??
                  poolEntryByCharId(allPool, slot.entry.characterId)
                    ?.characterName ??
                  slot.entry.characterName ??
                  null
                : null
            }
            entryVoc={
              slot.entry
                ? charById.get(slot.entry.characterId)?.vocation ??
                  (poolEntryByCharId(allPool, slot.entry.characterId)
                    ?.vocation as string) ??
                  slot.entry.vocation ??
                  null
                : null
            }
            entryLevel={
              slot.entry
                ? charById.get(slot.entry.characterId)?.level ??
                  poolEntryByCharId(allPool, slot.entry.characterId)?.level ??
                  slot.entry.level ??
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
                    const dummy = makeDummyForSlot(s.vocation);
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
                      − vaga {s.index + 1} ({s.entry?.vocation} {s.entry?.characterName})
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
              onConfirmSlot={(idx) =>
                handleAction(() => setSlotStatus(party.id, party, idx, "confirmed"))
              }
              onKickSlot={(idx) =>
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
              busy={busy}
              onOpenPicker={(idx) => setPickerSlot(idx)}
              onWithdraw={(idx) =>
                handleAction(() => withdrawFromSlot(party.id, party, idx))
              }
              onAcceptInvite={(idx) =>
                handleAction(() =>
                  setSlotStatus(party.id, party, idx, "confirmed")
                )
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
                      s.entry &&
                      s.entry.characterId !== party.hostCharacterId
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
                    s.entry &&
                    s.entry.characterId !== party.hostCharacterId
                ).length === 0 && (
                  <span className="text-[10px] text-[var(--text-mute)]">
                    nenhum não-host pra expulsar
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            {mySlot ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  handleAction(() =>
                    leaveClosedParty(party.id, party, mySlot.index)
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
                  handleAction(() => completeParty(party.id))
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

      {hostPickerSlot !== null && (
        <HostInvitePicker
          party={party}
          slotIndex={hostPickerSlot}
          allPool={allPool ?? []}
          lockedCharIds={lockedCharIds}
          onCancel={() => setHostPickerSlot(null)}
          onPick={async (entry) => {
            setHostPickerSlot(null);
            await handleAction(() =>
              inviteToSlot(
                party.id,
                party,
                hostPickerSlot,
                entry.characterId,
                entry.ownerId,
                {
                  characterName: entry.characterName,
                  vocation: entry.vocation as Vocation,
                  level: entry.level,
                }
              )
            );
          }}
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
  const vocLabel = slot.vocation === "ANY" ? "Flex" : slot.vocation;

  if (!slot.entry) {
    const clickable = !!onClick;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        className={`p-2 rounded-md border border-dashed min-h-[68px] flex flex-col items-center justify-center text-center transition w-full ${
          clickable
            ? "border-[var(--accent)] bg-[var(--accent)]/4 hover:bg-[var(--accent)]/12 hover:border-[var(--accent)] cursor-pointer"
            : "border-[var(--accent-dim)] bg-[var(--accent)]/4 cursor-default"
        }`}
        title={clickable ? "Clique pra convidar um char" : undefined}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--warn)]">
          {vocLabel}
        </div>
        <div className="text-[10px] text-[var(--text-mute)] mt-1">
          {clickable ? "+ convidar" : "Vaga aberta"}
        </div>
      </button>
    );
  }

  const pending = slot.entry.status === "pending";
  const cellBorder = pending
    ? "border-[var(--warn)] bg-[var(--warn)]/6"
    : partyIsClosed
      ? "border-[var(--ok)] bg-[var(--ok)]/8"
      : "border-[var(--ok)]/40 bg-[var(--ok)]/5";
  const vocColor = entryVoc
    ? VOC_COLORS[entryVoc] ?? "text-[var(--accent)]"
    : "text-[var(--text-mute)]";

  return (
    <div
      className={`p-2 rounded-md border min-h-[68px] flex flex-col items-center justify-center text-center ${cellBorder}`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-wider ${vocColor}`}
      >
        {entryVoc ?? vocLabel}
      </div>
      <div className="text-[11px] text-[var(--text)] font-medium mt-0.5 truncate w-full">
        {entryName ?? "removido"}
      </div>
      <div className="text-[9px] text-[var(--text-dim)] tabular-nums">
        {entryLevel ?? "—"}
      </div>
      {pending && (
        <div className="text-[9px] font-bold text-[var(--warn)] uppercase mt-0.5">
          pendente
        </div>
      )}
      {isHostSlot && (
        <div className="text-[9px] text-[var(--accent)] uppercase mt-0.5">host</div>
      )}
      {isMine && !isHostSlot && (
        <div className="text-[9px] text-[var(--accent)] uppercase mt-0.5">você</div>
      )}
    </div>
  );
}

const DUMMY_NAMES = [
  "Dummy Bot", "Test Hero", "Mock Char", "Fake Knight", "Sim Druid",
  "Phantom MS", "Echo RP", "Ghost EM", "Probe Char", "Stub Player",
];
function makeDummyForSlot(slotVoc: string): {
  characterName: string;
  vocation: Vocation;
  level: number;
} {
  const voc: Vocation =
    slotVoc === "ANY"
      ? (["EK", "ED", "MS", "RP", "EM"] as Vocation[])[
          Math.floor(Math.random() * 5)
        ]
      : (slotVoc as Vocation);
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
  onConfirmSlot,
  onKickSlot,
  onClose,
  onCancel,
  onEdit,
}: {
  party: PrimalParty;
  busy: boolean;
  allConfirmed: boolean;
  isAdminViewing?: boolean;
  onConfirmSlot: (i: number) => void;
  onKickSlot: (i: number) => void;
  onClose: () => void;
  onCancel: () => void;
  onEdit?: () => void;
}) {
  // Candidaturas (apply): player se candidatou e host precisa aceitar/recusar
  const pendingApplications = party.slots.filter(
    (s) => s.entry?.status === "pending" && (s.entry.kind ?? "apply") === "apply"
  );
  // Convites (invite): host convidou e player precisa aceitar — host só observa
  const pendingInvites = party.slots.filter(
    (s) => s.entry?.status === "pending" && s.entry.kind === "invite"
  );
  const confirmedNonHost = party.slots.filter(
    (s) =>
      s.entry?.status === "confirmed" &&
      s.entry.characterId !== party.hostCharacterId
  );

  return (
    <div className="space-y-2">
      {isAdminViewing && (
        <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--warn)] bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded px-2 py-1">
          🛠 Visualizando como ADMIN — você não é o host dessa PT
        </div>
      )}
      {pendingApplications.length > 0 && (
        <div className="text-[11px] space-y-1.5">
          <div className="text-[var(--warn)] font-semibold uppercase tracking-wider text-[10px]">
            {pendingApplications.length} candidatura(s) pendente(s)
          </div>
          {pendingApplications.map((s) => (
            <div
              key={s.index}
              className="flex items-center justify-between gap-2 bg-[var(--warn)]/6 border border-[var(--warn)]/30 rounded px-2 py-1.5"
            >
              <span className="text-[11px] text-[var(--text)]">
                Vaga {s.index + 1} · {s.vocation === "ANY" ? "Flex" : s.vocation}
                {s.entry?.characterName && (
                  <>
                    {" · "}
                    <strong className="text-[var(--text)]">
                      {s.entry.vocation} {s.entry.characterName}
                    </strong>{" "}
                    <span className="text-[var(--text-dim)]">({s.entry.level})</span>
                  </>
                )}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onKickSlot(s.index)}
                  className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
                >
                  Recusar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onConfirmSlot(s.index)}
                  className="text-[10px] bg-[var(--ok)] hover:brightness-110 text-[#063817] font-medium px-2 py-0.5 rounded transition disabled:opacity-50"
                >
                  Aceitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="text-[11px] space-y-1.5">
          <div className="text-[var(--accent)] font-semibold uppercase tracking-wider text-[10px]">
            {pendingInvites.length} convite(s) enviado(s) — aguardando resposta
          </div>
          {pendingInvites.map((s) => (
            <div
              key={s.index}
              className="flex items-center justify-between gap-2 bg-[var(--accent)]/6 border border-[var(--accent)]/30 rounded px-2 py-1.5"
            >
              <span className="text-[11px] text-[var(--text)]">
                Vaga {s.index + 1} ·{" "}
                {s.entry?.characterName ? (
                  <>
                    <strong>{s.entry.vocation} {s.entry.characterName}</strong>{" "}
                    <span className="text-[var(--text-dim)]">({s.entry.level})</span>
                  </>
                ) : (
                  <em>char convidado</em>
                )}
                {s.entry?.expiresAt && (
                  <>
                    {" · "}
                    <CountdownLabel expiresAt={s.entry.expiresAt} />
                  </>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onKickSlot(s.index)}
                className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                Cancelar convite
              </button>
            </div>
          ))}
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
                Vaga {s.index + 1} · {s.vocation === "ANY" ? "Flex" : s.vocation}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onKickSlot(s.index)}
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

function NonHostActions({
  party,
  myUid,
  busy,
  onOpenPicker,
  onWithdraw,
  onAcceptInvite,
}: {
  party: PrimalParty;
  myUid: string;
  busy: boolean;
  onOpenPicker: (i: number) => void;
  onWithdraw: (i: number) => void;
  onAcceptInvite: (i: number) => void;
}) {
  const mySlots = party.slots.filter((s) => s.entry?.ownerId === myUid);
  const openSlots = party.slots.filter((s) => !s.entry);

  return (
    <div className="space-y-2">
      {mySlots.length > 0 && (
        <div className="text-[11px] space-y-1">
          {mySlots.map((s) => {
            const isInvite =
              s.entry?.kind === "invite" && s.entry?.status === "pending";
            return (
            <div
              key={s.index}
              className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 ${
                isInvite
                  ? "bg-[var(--warn)]/8 border border-[var(--warn)]/40"
                  : "bg-[var(--accent)]/6 border border-[var(--accent)]/30"
              }`}
            >
              <span className="text-[11px]">
                {isInvite ? (
                  <>
                    <strong className="text-[var(--warn)]">
                      Você foi convidado pra vaga {s.index + 1}
                    </strong>
                    {s.entry?.expiresAt && (
                      <>
                        {" · "}
                        <CountdownLabel expiresAt={s.entry.expiresAt} />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Você está na vaga {s.index + 1}
                    {s.entry?.status === "pending" ? (
                      <span className="text-[var(--warn)]"> · aguardando host</span>
                    ) : (
                      <span className="text-[var(--ok)]"> · confirmado</span>
                    )}
                  </>
                )}
              </span>
              {isInvite ? (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onWithdraw(s.index)}
                    className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAcceptInvite(s.index)}
                    className="text-[10px] bg-[var(--ok)] hover:brightness-110 text-[#063817] font-medium px-2 py-0.5 rounded transition disabled:opacity-50"
                  >
                    Aceitar
                  </button>
                </div>
              ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onWithdraw(s.index)}
                className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                Sair da PT
              </button>
              )}
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
                {s.vocation === "ANY" ? "Flex" : s.vocation}
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
            {slot.vocation === "ANY" ? "Flex (qualquer)" : slot.vocation}
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

function HostInvitePicker({
  party,
  slotIndex,
  allPool,
  lockedCharIds,
  onCancel,
  onPick,
}: {
  party: PrimalParty;
  slotIndex: number;
  allPool: PrimalPoolEntry[];
  lockedCharIds?: Set<string>;
  onCancel: () => void;
  onPick: (entry: PrimalPoolEntry) => void;
}) {
  const slot = party.slots[slotIndex];
  const [onlyEligible, setOnlyEligible] = useState(false);

  // Pre-filtra por vocação do slot. Se for ANY, mostra todas as vocs.
  const vocFiltered = useMemo(
    () =>
      allPool
        .filter((e) => e.vocation && e.characterName)
        .filter(
          (e) => slot.vocation === "ANY" || e.vocation === slot.vocation
        ),
    [allPool, slot.vocation]
  );

  const evaluated = useMemo(
    () =>
      vocFiltered.map((e) => {
        // Char preso em outra PT fechada
        if (lockedCharIds?.has(e.characterId)) {
          return {
            entry: e,
            ok: false as const,
            reason: "Char travado em outra PT fechada",
          };
        }
        const check = checkCandidateForSlot(
          {
            characterId: e.characterId,
            ownerId: e.ownerId,
            vocation: e.vocation as Character["vocation"],
            level: e.level,
            server: e.server,
            questDonePrimal: false,
            hazard: e.hazard,
            availability: e.availability,
            hasExperience: e.experience,
            inPool: true,
          },
          party,
          slotIndex
        );
        return { entry: e, ...check };
      }),
    [vocFiltered, party, slotIndex, lockedCharIds]
  );

  // Elegíveis primeiro, depois bloqueados.
  const sorted = useMemo(() => {
    const ok = evaluated.filter((x) => x.ok);
    const blocked = evaluated.filter((x) => !x.ok);
    return [...ok, ...blocked];
  }, [evaluated]);

  const [search, setSearch] = useState("");
  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((x) =>
      x.entry.characterName.toLowerCase().includes(q)
    );
  }, [sorted, search]);
  const visible = onlyEligible
    ? sortedFiltered.filter((x) => x.ok)
    : sortedFiltered;
  const eligibleCount = evaluated.filter((x) => x.ok).length;
  const blockedCount = evaluated.length - eligibleCount;
  const overlayProps = useOverlayClose(onCancel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      {...overlayProps}
    >
      <div
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl p-5 shadow-2xl"
      >
        <h3 className="text-sm font-semibold mb-1">
          Convidar char pra vaga {slotIndex + 1}
        </h3>
        <p className="text-xs text-[var(--text-mute)] mb-3">
          Vocação:{" "}
          <strong className="text-[var(--text)]">
            {slot.vocation === "ANY" ? "Flex (qualquer)" : slot.vocation}
          </strong>{" "}
          · Servidor {party.server}
        </p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar char por nome..."
          className="w-full mb-3 bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
          autoFocus
        />

        <div className="flex items-center justify-between gap-3 mb-3 bg-[var(--background)] border border-[var(--border-strong)] rounded-lg px-3 py-2">
          <span className="text-[11px] text-[var(--text-mute)]">
            {eligibleCount} elegível(eis) ·{" "}
            <span className="text-[var(--danger)]">
              {blockedCount} não elegível(eis)
            </span>
          </span>
          <button
            type="button"
            onClick={() => setOnlyEligible((v) => !v)}
            aria-pressed={onlyEligible}
            className="flex items-center gap-2 text-[11px] text-[var(--text)]"
          >
            <span>Apenas elegíveis</span>
            <span
              className={`relative w-[36px] h-[20px] rounded-full border-[1.5px] transition ${
                onlyEligible
                  ? "bg-[var(--accent)]/30 border-[var(--accent)] shadow-[inset_0_0_8px_rgba(96,165,250,0.4)]"
                  : "bg-[var(--background-elev-2)] border-[var(--border-strong)]"
              }`}
            >
              <span
                className={`absolute top-[1px] w-[14px] h-[14px] rounded-full transition-all duration-200 ${
                  onlyEligible
                    ? "left-[19px] bg-[var(--accent)] shadow-[0_0_6px_rgba(96,165,250,0.7)]"
                    : "left-[1px] bg-[var(--text-dim)]"
                }`}
              />
            </span>
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
            {onlyEligible
              ? "Nenhum char elegível pra essa vaga ainda."
              : `Nenhum char ${slot.vocation === "ANY" ? "" : `${slot.vocation} `}na pool.`}
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {visible.map(({ entry, ok, reason }) => {
              const vocColor =
                VOC_COLORS[entry.vocation] ?? "text-[var(--accent)]";
              if (ok) {
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onPick(entry)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/6 text-left transition"
                  >
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
                    >
                      {entry.vocation || "?"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">
                        {entry.characterName}
                      </span>
                      <span className="block text-[11px] text-[var(--text-mute)]">
                        Level {entry.level} · Hazard {entry.hazard} ·{" "}
                        {entry.availability
                          .map((t) => TURNO_ICONS[t])
                          .join(" ") || "sem turnos"}
                      </span>
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--ok)] bg-[var(--ok)]/10 border border-[var(--ok)]/40 px-2 py-0.5 rounded-full whitespace-nowrap">
                      elegível
                    </span>
                  </button>
                );
              }
              return (
                <div
                  key={entry.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--border-strong)] bg-[var(--background)] opacity-60 cursor-not-allowed"
                  title={reason}
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
                  >
                    {entry.vocation || "?"}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {entry.characterName}
                    </span>
                    <span className="block text-[11px] text-[var(--text-mute)]">
                      Level {entry.level} · Hazard {entry.hazard} ·{" "}
                      {entry.availability
                        .map((t) => TURNO_ICONS[t])
                        .join(" ") || "sem turnos"}
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {reason}
                  </span>
                </div>
              );
            })}
          </div>
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
