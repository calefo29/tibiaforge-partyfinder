"use client";

import { useMemo, useState } from "react";
import { Character } from "@/lib/characters";
import {
  applyToSlot,
  cancelParty,
  canVocFillSlot,
  closePartyAndLock,
  PrimalParty,
  setSlotStatus,
  Slot,
  withdrawFromSlot,
} from "@/lib/primal-parties";

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
  charById: Map<string, Character>;
  hostChar: Character | null;
};

export function PartyCard({ party, myUid, myChars, charById, hostChar }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const isHost = party.hostUid === myUid;
  const filled = party.slots.filter((s) => s.entry).length;
  const confirmed = party.slots.filter(
    (s) => s.entry?.status === "confirmed"
  ).length;
  const allConfirmed = confirmed === party.slots.length;
  const isClosed = party.status === "closed";
  const isCancelled = party.status === "cancelled";

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
          <div className="text-xs text-[var(--text-mute)]">
            Host:{" "}
            {hostChar ? (
              <>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${VOC_COLORS[hostChar.vocation] ?? ""}`}
                >
                  {hostChar.vocation}
                </span>{" "}
                <strong className="text-[var(--text)]">{hostChar.name}</strong>{" "}
                <span className="text-[var(--text-dim)]">· {hostChar.level}</span>
              </>
            ) : (
              <em>char removido</em>
            )}
          </div>
          <div className="flex gap-3 flex-wrap text-[11px] text-[var(--text-mute)] mt-1">
            <span>📍 {party.server}</span>
            <span>🛡️ Mín. {party.minLevel}</span>
            {party.schedule && <span>🕒 {party.schedule}</span>}
          </div>
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
          {isHost && (
            <HostActions
              party={party}
              busy={busy}
              allConfirmed={allConfirmed}
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
            />
          )}
        </div>
      )}

      {isClosed && (
        <div className="pt-3 border-t border-[var(--border)] text-xs text-[var(--ok)] font-semibold flex items-center gap-2">
          ✓ PT fechada — chars locked
        </div>
      )}

      {pickerSlot !== null && (
        <SlotPicker
          party={party}
          slotIndex={pickerSlot}
          myChars={myChars}
          onCancel={() => setPickerSlot(null)}
          onPick={async (charId) => {
            setPickerSlot(null);
            await handleAction(() =>
              applyToSlot(party.id, party, pickerSlot, charId, myUid)
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
  character,
  isMine,
  isHostSlot,
  partyIsClosed,
}: {
  slot: Slot;
  character: Character | null;
  isMine: boolean;
  isHostSlot: boolean;
  partyIsClosed: boolean;
}) {
  const vocLabel = slot.vocation === "ANY" ? "Flex" : slot.vocation;

  if (!slot.entry) {
    return (
      <div className="p-2 rounded-md border border-dashed border-[var(--accent-dim)] bg-[var(--accent)]/4 min-h-[68px] flex flex-col items-center justify-center text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--warn)]">
          {vocLabel}
        </div>
        <div className="text-[10px] text-[var(--text-mute)] mt-1">Vaga aberta</div>
      </div>
    );
  }

  const pending = slot.entry.status === "pending";
  const cellBorder = pending
    ? "border-[var(--warn)] bg-[var(--warn)]/6"
    : partyIsClosed
      ? "border-[var(--ok)] bg-[var(--ok)]/8"
      : "border-[var(--ok)]/40 bg-[var(--ok)]/5";
  const vocColor = character
    ? VOC_COLORS[character.vocation] ?? "text-[var(--accent)]"
    : "text-[var(--text-mute)]";

  return (
    <div
      className={`p-2 rounded-md border min-h-[68px] flex flex-col items-center justify-center text-center ${cellBorder}`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-wider ${vocColor}`}
      >
        {character?.vocation ?? vocLabel}
      </div>
      <div className="text-[11px] text-[var(--text)] font-medium mt-0.5 truncate w-full">
        {character?.name ?? "removido"}
      </div>
      <div className="text-[9px] text-[var(--text-dim)] tabular-nums">
        {character?.level ?? "—"}
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

function HostActions({
  party,
  busy,
  allConfirmed,
  onConfirmSlot,
  onKickSlot,
  onClose,
  onCancel,
}: {
  party: PrimalParty;
  busy: boolean;
  allConfirmed: boolean;
  onConfirmSlot: (i: number) => void;
  onKickSlot: (i: number) => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  const pendings = party.slots.filter(
    (s) => s.entry?.status === "pending"
  );

  return (
    <div className="space-y-2">
      {pendings.length > 0 && (
        <div className="text-[11px] space-y-1.5">
          <div className="text-[var(--warn)] font-semibold uppercase tracking-wider text-[10px]">
            {pendings.length} candidatura(s) pendente(s)
          </div>
          {pendings.map((s) => (
            <div
              key={s.index}
              className="flex items-center justify-between gap-2 bg-[var(--warn)]/6 border border-[var(--warn)]/30 rounded px-2 py-1.5"
            >
              <span className="text-[11px] text-[var(--text)]">
                Vaga {s.index + 1} · {s.vocation === "ANY" ? "Flex" : s.vocation}
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="text-xs border border-[var(--border-strong)] hover:border-[var(--danger)]/40 hover:text-[var(--danger)] px-3 py-1.5 rounded transition disabled:opacity-50"
        >
          Cancelar PT
        </button>
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
}: {
  party: PrimalParty;
  myUid: string;
  busy: boolean;
  onOpenPicker: (i: number) => void;
  onWithdraw: (i: number) => void;
}) {
  const mySlots = party.slots.filter((s) => s.entry?.ownerId === myUid);
  const openSlots = party.slots.filter((s) => !s.entry);

  return (
    <div className="space-y-2">
      {mySlots.length > 0 && (
        <div className="text-[11px] space-y-1">
          {mySlots.map((s) => (
            <div
              key={s.index}
              className="flex items-center justify-between gap-2 bg-[var(--accent)]/6 border border-[var(--accent)]/30 rounded px-2 py-1.5"
            >
              <span className="text-[11px]">
                Você está na vaga {s.index + 1}
                {s.entry?.status === "pending" ? (
                  <span className="text-[var(--warn)]"> · aguardando host</span>
                ) : (
                  <span className="text-[var(--ok)]"> · confirmado</span>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onWithdraw(s.index)}
                className="text-[10px] border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-2 py-0.5 rounded transition disabled:opacity-50"
              >
                Sair da PT
              </button>
            </div>
          ))}
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
  onCancel,
  onPick,
}: {
  party: PrimalParty;
  slotIndex: number;
  myChars: Character[];
  onCancel: () => void;
  onPick: (charId: string) => void;
}) {
  const slot = party.slots[slotIndex];
  const usedCharIds = useMemo(
    () =>
      new Set(
        party.slots
          .filter((s) => s.entry)
          .map((s) => s.entry!.characterId)
      ),
    [party]
  );
  const eligible = myChars.filter((c) => {
    if (c.questHistory?.primal === true) return false;
    if (c.level < party.minLevel) return false;
    if (!canVocFillSlot(c.vocation, slot.vocation)) return false;
    if (usedCharIds.has(c.id)) return false;
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[440px] bg-[var(--background-elev)] border border-[var(--border)] rounded-xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-1">
          Candidatar char na vaga {slotIndex + 1}
        </h3>
        <p className="text-xs text-[var(--text-mute)] mb-4">
          Vocação:{" "}
          <strong className="text-[var(--text)]">
            {slot.vocation === "ANY" ? "Flex (qualquer)" : slot.vocation}
          </strong>{" "}
          · Mín. level {party.minLevel}
        </p>

        {eligible.length === 0 ? (
          <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
            Nenhum char seu elegível pra essa vaga.
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {eligible.map((c) => {
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
