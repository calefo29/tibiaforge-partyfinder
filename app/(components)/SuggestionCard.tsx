"use client";

import { useEffect, useMemo, useState } from "react";
import { useOverlayClose } from "./useOverlayClose";
import {
  acceptSuggestion,
  declineSuggestion,
  PrimalSuggestion,
  SuggestionSlot,
} from "@/lib/primal-suggestions";
import { TURNO_LABELS } from "@/lib/primal-pool";
import { useAuth } from "@/lib/auth-context";

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

type Props = {
  suggestion: PrimalSuggestion;
  myCharacterIds: Set<string>;
  lockedCharIds: Set<string>;
};

export function SuggestionCard({
  suggestion,
  myCharacterIds,
  lockedCharIds,
}: Props) {
  const { user } = useAuth();
  const adminUid = process.env.NEXT_PUBLIC_ADMIN_UID ?? "";
  const isAdminOrDev =
    process.env.NODE_ENV === "development" ||
    (!!user && !!adminUid && user.uid === adminUid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const mySlot = suggestion.slots.find((s) =>
    myCharacterIds.has(s.characterId)
  );
  const accepted = suggestion.acceptedBy.length;
  const total = suggestion.slots.length;
  const fillPct = total === 0 ? 0 : (accepted / total) * 100;
  const youAccepted = mySlot
    ? suggestion.acceptedBy.includes(mySlot.characterId)
    : false;
  const myLocked = mySlot ? lockedCharIds.has(mySlot.characterId) : false;

  const isDeclined = suggestion.status === "declined";

  const cardTone = isDeclined
    ? "border-[var(--danger)]/30 opacity-80"
    : youAccepted && accepted === total - 1
      ? "border-[var(--ok)]/40"
      : !youAccepted && mySlot
        ? "border-[var(--accent-dim)] shadow-[0_0_0_1px_rgba(96,165,250,0.2)]"
        : "border-[var(--border)] hover:border-[var(--border-strong)]";

  const handleAccept = async () => {
    if (!mySlot) return;
    setBusy(true);
    setError(null);
    try {
      const r = await acceptSuggestion(suggestion.id, mySlot.characterId);
      if (!r.ok) setError(r.reason);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!mySlot) return;
    setBusy(true);
    setError(null);
    try {
      const r = await declineSuggestion(suggestion.id, mySlot.characterId);
      if (!r.ok) setError(r.reason ?? "Erro.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
      setConfirmingDecline(false);
    }
  };

  // Tint progressivo: enche da esquerda pra direita conforme aceites, com cor
  // interpolada de azul (0/5) a verde (5/5).
  const progressBg = isDeclined
    ? undefined
    : (() => {
        const ratio = accepted / total;
        const pct = ratio * 100;
        const r = Math.round(96 + (34 - 96) * ratio);
        const g = Math.round(165 + (197 - 165) * ratio);
        const b = Math.round(250 + (94 - 250) * ratio);
        const alpha = 0.05;
        const tone = `rgba(${r},${g},${b},${alpha})`;
        return `linear-gradient(90deg, ${tone} 0%, ${tone} ${pct}%, transparent ${pct}%)`;
      })();

  return (
    <div
      className={`bg-[var(--background-elev)] border rounded-xl p-4 transition ${cardTone}`}
      style={progressBg ? { backgroundImage: progressBg } : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-[var(--text-mute)]">
            📍 Servidor <strong className="text-[var(--text)]">{suggestion.server}</strong>
            <span className="text-[var(--text-dim)]"> · #{suggestion.id.slice(0, 4).toUpperCase()}</span>
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            Ciclo {suggestion.cycleDate}
            {isDeclined && (
              <>
                {" "}· <span className="text-[var(--danger)]">recusada</span>
              </>
            )}
          </div>
        </div>
        <Countdown expiresAt={suggestion.expiresAt?.toDate?.() ?? null} />
      </div>

      {!isDeclined && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-bold tabular-nums text-[var(--text)]">
            {accepted}<span className="text-[var(--text-mute)] font-medium">/{total}</span>
          </span>
          <div className="flex-1 h-1.5 bg-[var(--background-elev-2)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${fillPct}%`,
                background:
                  fillPct >= 80
                    ? "linear-gradient(90deg,var(--accent),var(--ok))"
                    : "var(--accent)",
              }}
            />
          </div>
          <span className="text-[11px] text-[var(--text-mute)] whitespace-nowrap">
            {accepted === total
              ? "fechado"
              : `aguardando ${total - accepted}`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {suggestion.slots.map((slot) => (
          <SlotCell
            key={slot.index}
            slot={slot}
            isMine={!!mySlot && mySlot.characterId === slot.characterId}
            isAccepted={suggestion.acceptedBy.includes(slot.characterId)}
            isLocked={lockedCharIds.has(slot.characterId)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-[var(--text-mute)] mb-3 bg-[var(--background)]/50 border border-[var(--border)] rounded px-3 py-2">
        <span>
          Level médio: <strong className="text-[var(--text)] tabular-nums">{suggestion.levelAvg}</strong>
        </span>
        <span>·</span>
        <span>⭐ {suggestion.experiencedCount} com exp</span>
        <span>·</span>
        <span>
          🕒 Turnos em comum:{" "}
          <strong className="text-[var(--text)]">
            {suggestion.commonTurns.length === 0
              ? "nenhum"
              : suggestion.commonTurns.map((t) => TURNO_LABELS[t]).join(" · ")}
          </strong>
        </span>
      </div>

      {error && (
        <div className="text-xs text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {isAdminOrDev && !isDeclined && suggestion.status === "pending" && (
        <DevAcceptControls suggestion={suggestion} />
      )}

      {mySlot && !isDeclined && suggestion.status === "pending" && (
        <div className="flex items-center gap-2">
          {myLocked ? (
            <div className="flex-1 text-[12px] text-[var(--danger)] bg-[var(--danger)]/8 border border-[var(--danger)]/30 rounded px-3 py-2">
              🔒 <strong>{mySlot.characterName}</strong> está locked em outra PT fechada — aceite indisponível.
            </div>
          ) : youAccepted ? (
            <div className="flex-1 text-[12px] text-[var(--ok)] bg-[var(--ok)]/8 border border-[var(--ok)]/30 rounded px-3 py-2">
              ✓ Você aceitou com <strong>{mySlot.characterName}</strong> — aguardando os demais.
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingDecline(true)}
                className="text-xs border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10 px-3 py-2 rounded transition disabled:opacity-50"
              >
                Recusar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleAccept}
                className="flex-1 bg-[var(--accent)] hover:brightness-110 text-[#04122a] font-semibold text-sm px-3 py-2 rounded transition disabled:opacity-50"
              >
                {busy ? "..." : `Aceitar com ${mySlot.characterName}`}
              </button>
            </>
          )}
        </div>
      )}

      {isDeclined && (
        <div className="text-[12px] text-[var(--danger)] bg-[var(--danger)]/8 border border-[var(--danger)]/30 rounded px-3 py-2">
          ❌ PT não será formada — um dos players recusou o convite. Nova
          sugestão amanhã às 10h.
        </div>
      )}

      {confirmingDecline && mySlot && (
        <DeclineConfirmOverlay
          busy={busy}
          onCancel={() => setConfirmingDecline(false)}
          onConfirm={handleDecline}
        />
      )}
    </div>
  );
}

function DevAcceptControls({ suggestion }: { suggestion: PrimalSuggestion }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSim = async (slot: SuggestionSlot) => {
    setBusy(slot.characterId);
    setMsg(null);
    try {
      const r = await acceptSuggestion(suggestion.id, slot.characterId);
      if (!r.ok) setMsg(`❌ ${r.reason}`);
      else if (r.promoted)
        setMsg(`🎉 PT formada! ${suggestion.slots.length}/${suggestion.slots.length} — virou PT closed`);
      else
        setMsg(`✓ Aceite simulado para ${slot.characterName}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const pending = suggestion.slots.filter(
    (s) => !suggestion.acceptedBy.includes(s.characterId)
  );

  return (
    <div className="mb-3 bg-[var(--warn)]/8 border border-dashed border-[var(--warn)]/40 rounded px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--warn)] font-bold mb-1.5">
        🛠 DEV — simular aceite dos chars
      </div>
      <div className="flex flex-wrap gap-1">
        {pending.length === 0 ? (
          <span className="text-[10px] text-[var(--text-mute)]">Todos já aceitaram</span>
        ) : (
          pending.map((s) => (
            <button
              key={s.characterId}
              type="button"
              disabled={!!busy}
              onClick={() => handleSim(s)}
              className="text-[10px] border border-[var(--warn)]/50 text-[var(--warn)] hover:bg-[var(--warn)]/15 px-2 py-0.5 rounded transition disabled:opacity-50"
            >
              {busy === s.characterId
                ? "..."
                : `✓ aceite ${s.vocation} ${s.characterName}`}
            </button>
          ))
        )}
      </div>
      {msg && (
        <div className="mt-1.5 text-[10px] font-mono text-[var(--text)]">{msg}</div>
      )}
    </div>
  );
}

function DeclineConfirmOverlay({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const overlayProps = useOverlayClose(() => {
    if (!busy) onCancel();
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      {...overlayProps}
    >
      <div className="w-full max-w-[420px] bg-[var(--background-elev)] border border-[var(--border)] rounded-xl p-5 shadow-2xl">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span className="text-[var(--danger)]">⚠️</span> Recusar a sugestão?
        </h3>
        <p className="text-xs text-[var(--text-mute)] leading-relaxed mb-4">
          Ao recusar, a PT <strong className="text-[var(--text)]">não será formada</strong> neste ciclo. Os outros 4 chars envolvidos vão ter que esperar a próxima rodada (amanhã às 10h) pra entrar em outra sugestão.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] px-3 py-2 rounded transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="text-xs bg-[var(--danger)] hover:brightness-110 text-white font-semibold px-3 py-2 rounded transition disabled:opacity-50"
          >
            {busy ? "Recusando…" : "Sim, recusar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotCell({
  slot,
  isMine,
  isAccepted,
  isLocked,
}: {
  slot: SuggestionSlot;
  isMine: boolean;
  isAccepted: boolean;
  isLocked: boolean;
}) {
  const vocColor = VOC_COLORS[slot.vocation] ?? "text-[var(--accent)]";
  const border = isMine
    ? isAccepted
      ? "border-[#c084fc] bg-gradient-to-br from-[#c084fc]/15 to-[var(--ok)]/10 shadow-[0_0_0_2px_rgba(192,132,252,0.4),0_0_20px_rgba(192,132,252,0.25)]"
      : "border-[#c084fc] bg-[#c084fc]/12 shadow-[0_0_0_2px_rgba(192,132,252,0.4),0_0_18px_rgba(192,132,252,0.3)]"
    : isAccepted
      ? "border-[var(--ok)]/40 bg-[var(--ok)]/6"
      : "border-[var(--border-strong)] bg-[var(--background-elev-2)]";

  return (
    <div
      className={`relative p-2 rounded-md border min-h-[80px] flex flex-col items-center justify-center text-center ${border} ${isLocked ? "opacity-60" : ""}`}
    >
      <div className="absolute top-1 right-1">
        {isAccepted ? (
          <span className="w-4 h-4 rounded-full bg-[var(--ok)] text-[#063817] text-[9px] font-bold flex items-center justify-center">
            ✓
          </span>
        ) : (
          <span className="w-4 h-4 rounded-full border border-dashed border-[var(--text-dim)] text-[var(--text-dim)] text-[9px] flex items-center justify-center">
            ⏳
          </span>
        )}
      </div>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${vocColor}`}>
        {slot.vocation}
      </div>
      <div className={`text-[11px] font-medium mt-0.5 truncate w-full ${isMine ? "text-[#e9d5ff]" : "text-[var(--text)]"}`}>
        {slot.characterName}
      </div>
      <div className="text-[9px] text-[var(--text-dim)] tabular-nums">{slot.level}</div>
      {isMine && (
        <div className="text-[8px] font-bold text-[#c084fc] uppercase tracking-wider mt-0.5">
          {isLocked ? "VOCÊ · 🔒" : "VOCÊ"}
        </div>
      )}
      {slot.hasExperience && (
        <div className="absolute bottom-1 left-1 text-[8px]">⭐</div>
      )}
    </div>
  );
}

function Countdown({ expiresAt }: { expiresAt: Date | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const label = useMemo(() => {
    if (!expiresAt) return "—";
    const diff = expiresAt.getTime() - now;
    if (diff <= 0) return "expirando…";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  }, [expiresAt, now]);
  const urgent = expiresAt && expiresAt.getTime() - now < 60 * 60 * 1000;
  return (
    <span
      className={`text-[11px] font-bold font-mono px-2 py-1 rounded border whitespace-nowrap ${
        urgent
          ? "text-[var(--danger)] bg-[var(--danger)]/8 border-[var(--danger)]/30"
          : "text-[var(--warn)] bg-[var(--warn)]/8 border-[var(--warn)]/30"
      }`}
    >
      ⏳ {label}
    </span>
  );
}
