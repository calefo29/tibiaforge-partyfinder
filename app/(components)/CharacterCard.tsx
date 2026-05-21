"use client";

import { useEffect, useState } from "react";
import { Character, deleteCharacter } from "@/lib/characters";
import { MAX_CONFIRMED_PTS_PER_CHAR } from "@/lib/primal-parties";
import { useOverlayClose } from "./useOverlayClose";

type Props = {
  char: Character;
  onEdit: (c: Character) => void;
  /** Quantas PTs (forming+closed) esse char está confirmado em. */
  lockCount?: number;
};

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

export function CharacterCard({ char, onEdit, lockCount = 0 }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const vocColor = VOC_COLORS[char.vocation] ?? "text-[var(--accent)]";
  const lockFull = lockCount >= MAX_CONFIRMED_PTS_PER_CHAR;
  const lockTone = lockFull
    ? "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/40"
    : "bg-[var(--warn)]/15 text-[var(--warn)] border-[var(--warn)]/40";

  return (
    <>
      <div className="bg-[var(--background-elev)] border border-[var(--border)] hover:border-[var(--accent-dim)] rounded-lg p-4 transition flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-[15px] font-semibold truncate pr-2">{char.name}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {lockCount > 0 && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap ${lockTone}`}
                title={
                  lockFull
                    ? `Char travado em ${MAX_CONFIRMED_PTS_PER_CHAR} PTs · não pode entrar em mais`
                    : `Char travado em ${lockCount} de ${MAX_CONFIRMED_PTS_PER_CHAR} PTs`
                }
              >
                🔒 {lockCount}/{MAX_CONFIRMED_PTS_PER_CHAR}
              </span>
            )}
            <span
              className={`text-[11px] font-bold uppercase tracking-wider bg-[var(--background-elev-2)] border border-[var(--border-strong)] px-2 py-0.5 rounded ${vocColor}`}
            >
              {char.vocation}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--text-mute)] pb-3 mb-3 border-b border-[var(--border)]">
          <span>
            Level <strong className="text-[var(--text)] font-medium">{char.level}</strong>
          </span>
          <span>{char.server}</span>
        </div>

        <div className="space-y-1.5 mb-3 flex-1">
          <QuestRow icon="⚔️" name="The Primal Order" done={char.questHistory.primal} />
          <QuestRow icon="💀" name="Soulwar" done={char.questHistory.soulwar} />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => onEdit(char)}
            className="text-xs flex items-center gap-1.5 border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] text-[var(--text)] px-3 py-1.5 rounded transition"
            title="Editar personagem"
          >
            <EditIcon /> Editar
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="flex items-center justify-center w-8 h-8 border border-[var(--danger)]/40 hover:bg-[var(--danger)]/10 hover:border-[var(--danger)] text-[var(--danger)] rounded transition"
            title="Excluir personagem"
            aria-label="Excluir personagem"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <DeleteConfirmModal
        open={confirmOpen}
        char={char}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

function QuestRow({
  icon,
  name,
  done,
}: {
  icon: string;
  name: string;
  done: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md border ${
        done
          ? "border-[var(--ok)]/30 bg-[var(--ok)]/5"
          : "border-[var(--border-strong)] bg-[var(--background)]"
      }`}
    >
      <span className={done ? "text-[var(--text)]" : "text-[var(--text-mute)]"}>
        {icon} {name}
      </span>
      <span
        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
          done
            ? "bg-[var(--ok)]/15 text-[var(--ok)] border-[var(--ok)]/40"
            : "bg-[var(--background-elev-2)] text-[var(--text-dim)] border-[var(--border-strong)]"
        }`}
      >
        {done ? "já fiz" : "não fiz"}
      </span>
    </div>
  );
}

function DeleteConfirmModal({
  open,
  char,
  onClose,
}: {
  open: boolean;
  char: Character;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canDelete = typed.trim() === char.name;

  const handleDelete = async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCharacter(char.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
      setBusy(false);
    }
  };

  const overlayProps = useOverlayClose(onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      {...overlayProps}
    >
      <div
        className="w-full max-w-[460px] bg-[var(--background-elev)] border border-[var(--border)] rounded-lg shadow-2xl p-6"
      >
        <div className="w-12 h-12 rounded-full bg-[var(--danger)]/12 border border-[var(--danger)]/40 flex items-center justify-center mb-4">
          <TrashIcon size={22} />
        </div>
        <h3 className="text-[17px] font-semibold mb-2">Excluir personagem?</h3>
        <p className="text-[13px] text-[var(--text-mute)] leading-relaxed mb-4">
          Você está prestes a excluir{" "}
          <strong className="text-[var(--text)]">{char.name}</strong>. Essa ação{" "}
          <strong className="text-[var(--danger)]">não pode ser desfeita</strong> —
          todo o histórico de quests e candidaturas desse char vai sumir.
        </p>

        <label className="block text-[11px] text-[var(--text-dim)] mb-2">
          Pra confirmar, digite{" "}
          <strong className="text-[var(--text)]">{char.name}</strong> abaixo:
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Digite "${char.name}"`}
          autoFocus
          className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 mb-4 outline-none focus:border-[var(--danger)] transition text-sm"
        />

        {error && (
          <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm border border-[var(--border-strong)] hover:border-[var(--accent-dim)] rounded-md transition disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || busy}
            className="px-4 py-2 text-sm bg-[var(--danger)] text-[#3a0a0a] font-medium rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:brightness-110"
          >
            {busy ? "Excluindo…" : "Excluir definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
