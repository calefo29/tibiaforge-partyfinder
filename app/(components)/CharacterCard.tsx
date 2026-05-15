"use client";

import { useState } from "react";
import { Character, deleteCharacter } from "@/lib/characters";

export function CharacterCard({ char }: { char: Character }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCharacter(char.id);
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="group relative bg-[var(--background-elev)] border border-[var(--border)] hover:border-[var(--accent-dim)] rounded-lg p-4 transition">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[15px] font-semibold truncate pr-2">{char.name}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--accent)] bg-[var(--background-elev-2)] border border-[var(--border-strong)] px-2 py-0.5 rounded">
          {char.vocation}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--text-mute)] mt-2">
        <span>
          Level <strong className="text-[var(--text)] font-medium">{char.level}</strong>
        </span>
        <span>{char.server}</span>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition w-6 h-6 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded"
          aria-label="Excluir personagem"
          title="Excluir"
        >
          ✕
        </button>
      ) : (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
          <span className="text-xs text-[var(--text-mute)] flex-1">Excluir?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs bg-[var(--danger)]/10 border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/20 px-3 py-1 rounded transition disabled:opacity-60"
          >
            {deleting ? "Excluindo…" : "Sim, excluir"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="text-xs text-[var(--text-mute)] hover:text-[var(--text)] px-3 py-1 rounded transition"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
