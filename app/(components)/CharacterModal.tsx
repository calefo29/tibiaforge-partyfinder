"use client";

import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import {
  addCharacter,
  VOCATIONS,
  VOCATION_LABELS,
  Vocation,
  Server,
} from "@/lib/characters";
import type { ServerInfo, ServersResponse } from "@/app/api/servers/route";

type Props = {
  open: boolean;
  ownerId: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export function CharacterModal({ open, ownerId, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [vocation, setVocation] = useState<Vocation | "">("");
  const [level, setLevel] = useState("");
  const [server, setServer] = useState<Server | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setVocation("");
      setLevel("");
      setServer("");
      setError(null);
      setBusy(false);
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingServers(true);
    fetch("/api/servers")
      .then((r) => r.json() as Promise<ServersResponse>)
      .then((data) => {
        if (cancelled) return;
        setServers(data.servers ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setServers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const parsedLevel = parseInt(level, 10);

    if (!trimmedName) {
      setError("Informe o nome do personagem.");
      return;
    }
    if (!vocation) {
      setError("Escolha a vocação.");
      return;
    }
    if (!Number.isFinite(parsedLevel) || parsedLevel < 1 || parsedLevel > 9999) {
      setError("Level inválido. Use um número entre 1 e 9999.");
      return;
    }
    if (!server) {
      setError("Escolha o servidor.");
      return;
    }

    setBusy(true);
    try {
      await addCharacter(ownerId, {
        name: trimmedName,
        vocation,
        level: parsedLevel,
        server,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      const msg =
        err instanceof FirebaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Erro ao salvar.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-[var(--background-elev)] border border-[var(--border)] rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">Cadastrar personagem</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text)] transition w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--background-elev-2)]"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
              Nome do personagem
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Lucao Knight"
              autoFocus
              className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition"
            />
            <p className="text-xs text-[var(--text-dim)] mt-1">
              Como aparece no jogo (case-sensitive).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Vocação
              </label>
              <select
                value={vocation}
                onChange={(e) => setVocation(e.target.value as Vocation)}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition"
              >
                <option value="">Selecione…</option>
                {VOCATIONS.map((v) => (
                  <option key={v} value={v}>
                    {v} · {VOCATION_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Level
              </label>
              <input
                type="number"
                min={1}
                max={9999}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Ex: 850"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
              Servidor
            </label>
            <select
              value={server}
              onChange={(e) => setServer(e.target.value as Server)}
              disabled={loadingServers}
              className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition disabled:opacity-60"
            >
              <option value="">
                {loadingServers ? "Carregando servidores…" : "Selecione…"}
              </option>
              {servers.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {s.pvp}
                </option>
              ))}
            </select>
            {!loadingServers && servers.length > 0 && (
              <p className="text-xs text-[var(--text-dim)] mt-1">
                {servers.length} servidores · sincronizado do RubinOT
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium py-2.5 rounded-md transition disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Salvar personagem"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-5 border border-[var(--border-strong)] hover:border-[var(--accent-dim)] text-[var(--text)] py-2.5 rounded-md transition disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
