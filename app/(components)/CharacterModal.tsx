"use client";

import { useEffect, useState } from "react";
import { useOverlayClose } from "./useOverlayClose";
import { FirebaseError } from "firebase/app";
import {
  addCharacter,
  updateCharacter,
  VOCATIONS,
  VOCATION_LABELS,
  Vocation,
  Server,
  Character,
  QuestHistory,
  DEFAULT_QUEST_HISTORY,
} from "@/lib/characters";
import type { ServerInfo, ServersResponse } from "@/app/api/servers/route";

type Props = {
  open: boolean;
  ownerId: string;
  editing?: Character | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export function CharacterModal({ open, ownerId, editing, onClose, onSuccess }: Props) {
  const isEdit = !!editing;

  const [name, setName] = useState("");
  const [vocation, setVocation] = useState<Vocation | "">("");
  const [level, setLevel] = useState("");
  const [server, setServer] = useState<Server | "">("");
  const [questHistory, setQuestHistory] = useState<QuestHistory>(DEFAULT_QUEST_HISTORY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setVocation(editing.vocation);
      setLevel(String(editing.level));
      setServer(editing.server);
      setQuestHistory({
        primal: editing.questHistory?.primal ?? false,
        soulwar: editing.questHistory?.soulwar ?? false,
      });
    } else {
      setName("");
      setVocation("");
      setLevel("");
      setServer("");
      setQuestHistory(DEFAULT_QUEST_HISTORY);
    }
    setError(null);
    setBusy(false);
  }, [open, editing]);

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
      const payload = {
        name: trimmedName,
        vocation,
        level: parsedLevel,
        server,
        questHistory,
      };
      if (editing) {
        await updateCharacter(editing.id, payload);
      } else {
        await addCharacter(ownerId, payload);
      }
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

  const overlayProps = useOverlayClose(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      {...overlayProps}
    >
      <div
        className="w-full max-w-[520px] max-h-[92vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-lg shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background-elev)] z-10">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Editar personagem" : "Cadastrar personagem"}
          </h2>
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

          <div className="pt-2 border-t border-[var(--border)]">
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)]">
                Histórico de quests
              </label>
              <span className="text-[10px] uppercase tracking-wider text-[var(--danger)]">
                obrigatório
              </span>
            </div>
            <p className="text-xs text-[var(--text-dim)] mb-3">
              Esse char <strong className="text-[var(--text)]">já completou</strong>{" "}
              alguma dessas quests? Só serve pra registrar o histórico — não entra na
              pool automaticamente.
            </p>

            <div className="space-y-2">
              <QuestToggle
                icon="⚔️"
                title="The Primal Order"
                active={questHistory.primal}
                onToggle={() =>
                  setQuestHistory((q) => ({ ...q, primal: !q.primal }))
                }
              />
              <QuestToggle
                icon="💀"
                title="Soulwar"
                active={questHistory.soulwar}
                onToggle={() =>
                  setQuestHistory((q) => ({ ...q, soulwar: !q.soulwar }))
                }
              />
            </div>
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
              {busy
                ? "Salvando…"
                : isEdit
                  ? "Salvar alterações"
                  : "Salvar personagem"}
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

function QuestToggle({
  icon,
  title,
  active,
  onToggle,
}: {
  icon: string;
  title: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border-[1.5px] transition text-left ${
        active
          ? "border-[var(--ok)] bg-[var(--ok)]/10 shadow-[0_0_0_1px_rgba(74,222,128,0.15),0_0_20px_rgba(74,222,128,0.08)]"
          : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)]"
      }`}
    >
      <span
        className={`w-10 h-10 rounded-md flex items-center justify-center text-xl flex-shrink-0 border transition ${
          active
            ? "bg-[var(--ok)]/15 border-[var(--ok)]/45 shadow-[0_0_14px_rgba(74,222,128,0.25)]"
            : "bg-[var(--background-elev-2)] border-[var(--border-strong)]"
        }`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={active ? "text-[#bef5d0]" : "text-[var(--text)]"}>
            {title}
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
              active
                ? "bg-[var(--ok)]/15 text-[var(--ok)] border-[var(--ok)]/40"
                : "bg-[var(--background-elev-2)] text-[var(--text-dim)] border-[var(--border-strong)]"
            }`}
          >
            {active ? "já fiz" : "não fiz"}
          </span>
        </div>
        <div
          className={`text-[11px] mt-0.5 ${
            active ? "text-[#bef5d0]/70" : "text-[var(--text-mute)]"
          }`}
        >
          {active ? (
            <>
              Char marcado como <strong className="text-[var(--ok)]">já feita</strong>.
            </>
          ) : (
            <>
              Ative se o char <strong>já completou</strong> a {title}.
            </>
          )}
        </div>
      </div>
      <span
        className={`relative w-[46px] h-[24px] rounded-full border-[1.5px] flex-shrink-0 transition ${
          active
            ? "bg-[var(--ok)]/25 border-[var(--ok)] shadow-[inset_0_0_8px_rgba(74,222,128,0.4),0_0_10px_rgba(74,222,128,0.25)]"
            : "bg-[var(--background-elev-2)] border-[var(--border-strong)]"
        }`}
      >
        <span
          className={`absolute top-[1px] w-[18px] h-[18px] rounded-full transition-all duration-200 ${
            active
              ? "left-[24px] bg-[var(--ok)] shadow-[0_0_8px_rgba(74,222,128,0.7)]"
              : "left-[1px] bg-[var(--text-dim)]"
          }`}
        />
      </span>
    </button>
  );
}
