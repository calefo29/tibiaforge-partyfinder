"use client";

import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { Character } from "@/lib/characters";
import {
  createParty,
  PRIMAL_PARTY_MIN_LEVEL,
  hostSlotIndex,
  SLOT_TEMPLATE,
} from "@/lib/primal-parties";
import type { ServerInfo, ServersResponse } from "@/app/api/servers/route";

type Props = {
  open: boolean;
  ownerId: string;
  characters: Character[];
  onClose: () => void;
};

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

export function CreatePartyModal({ open, ownerId, characters, onClose }: Props) {
  const [hostCharId, setHostCharId] = useState<string | null>(null);
  const [server, setServer] = useState("");
  const [minLevel, setMinLevel] = useState(String(PRIMAL_PARTY_MIN_LEVEL));
  const [schedule, setSchedule] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  useEffect(() => {
    if (!open) {
      setHostCharId(null);
      setServer("");
      setMinLevel(String(PRIMAL_PARTY_MIN_LEVEL));
      setSchedule("");
      setNotes("");
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
      .then((d) => {
        if (cancelled) return;
        setServers(d.servers ?? []);
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

  const eligibleChars = characters.filter(
    (c) =>
      c.level >= PRIMAL_PARTY_MIN_LEVEL &&
      c.questHistory?.primal !== true
  );
  const selectedChar = eligibleChars.find((c) => c.id === hostCharId) ?? null;

  const handleSubmit = async () => {
    setError(null);
    if (!selectedChar) {
      setError("Escolha o char que você vai levar como host.");
      return;
    }
    const lvl = parseInt(minLevel, 10);
    if (!Number.isFinite(lvl) || lvl < PRIMAL_PARTY_MIN_LEVEL) {
      setError(`Level mínimo precisa ser ≥ ${PRIMAL_PARTY_MIN_LEVEL}.`);
      return;
    }
    if (!server) {
      setError("Escolha o servidor.");
      return;
    }
    setBusy(true);
    try {
      await createParty({
        hostUid: ownerId,
        hostCharacterId: selectedChar.id,
        hostVocation: selectedChar.vocation,
        server,
        minLevel: lvl,
        schedule: schedule.trim(),
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      const msg =
        err instanceof FirebaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Erro ao criar PT.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const hostIdx = selectedChar ? hostSlotIndex(selectedChar.vocation) : -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] max-h-[92vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--background-elev)] z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold">Criar PT da Primal Order</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text)] w-8 h-8 rounded-md hover:bg-[var(--background-elev-2)] flex items-center justify-center"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          <section>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Qual char você vai levar? <span className="text-[var(--danger)]">*</span>
            </label>
            <p className="text-xs text-[var(--text-mute)] mb-3">
              Esse char vai ocupar a primeira vaga compatível: EK → vaga 1, ED → vaga 2, outros → primeira flex.
            </p>
            {eligibleChars.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                Você não tem nenhum char elegível (level ≥ {PRIMAL_PARTY_MIN_LEVEL} e ainda não fez Primal).
              </div>
            ) : (
              <div className="space-y-2">
                {eligibleChars.map((c) => {
                  const selected = c.id === hostCharId;
                  const vocColor = VOC_COLORS[c.vocation] ?? "text-[var(--accent)]";
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setHostCharId(c.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-[1.5px] text-left transition ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)]/6 shadow-[inset_0_0_0_1px_var(--accent)]"
                          : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)]"
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${vocColor}`}
                      >
                        {c.vocation}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate">{c.name}</span>
                        <span className="block text-[11px] text-[var(--text-mute)]">
                          Level {c.level} · {c.server}
                        </span>
                      </span>
                      <span
                        className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 relative ${
                          selected ? "border-[var(--accent)]" : "border-[var(--border-strong)]"
                        }`}
                      >
                        {selected && (
                          <span className="absolute inset-[3px] rounded-full bg-[var(--accent)]" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Servidor <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                value={server}
                onChange={(e) => setServer(e.target.value)}
                disabled={loadingServers}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 outline-none focus:border-[var(--accent)] text-sm"
              >
                <option value="">
                  {loadingServers ? "Carregando…" : "Selecione…"}
                </option>
                {servers.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} · {s.pvp}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Level mínimo <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="number"
                min={PRIMAL_PARTY_MIN_LEVEL}
                value={minLevel}
                onChange={(e) => setMinLevel(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 outline-none focus:border-[var(--accent)] text-sm"
              />
              <p className="text-[10px] text-[var(--text-dim)] mt-1">
                Mínimo absoluto da quest: {PRIMAL_PARTY_MIN_LEVEL}
              </p>
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
              Quando vai sair (opcional)
            </label>
            <input
              type="text"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="Ex: hoje 21h"
              className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 outline-none focus:border-[var(--accent)] text-sm"
            />
          </section>

          <section>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: PT pra Hazard 8+, todos com vip e comida"
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 outline-none focus:border-[var(--accent)] text-sm resize-none"
            />
          </section>

          {/* Composition preview */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Composição da PT
            </h3>
            <div className="grid grid-cols-5 gap-1.5">
              {SLOT_TEMPLATE.map((voc, i) => {
                const isHostHere = selectedChar && i === hostIdx;
                return (
                  <div
                    key={i}
                    className={`p-2.5 rounded-md border text-center ${
                      isHostHere
                        ? "border-[var(--accent)] bg-[var(--accent)]/8"
                        : "border-dashed border-[var(--border-strong)] bg-[var(--background)]"
                    }`}
                  >
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isHostHere ? "text-[var(--accent)]" : "text-[var(--text-mute)]"
                      }`}
                    >
                      {voc === "ANY" ? "Flex" : voc}
                    </div>
                    <div className="text-[10px] mt-1 text-[var(--text-dim)] truncate">
                      {isHostHere ? selectedChar?.name : "Vaga aberta"}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--text-dim)] mt-2">
              Vagas 1=EK e 2=ED são obrigatórias. Vagas 3-5 (Flex) aceitam qualquer vocação exceto outro EK.
            </p>
          </section>

          {error && (
            <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-[var(--background-elev)] flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--border)]">
          <span className="text-[11px] text-[var(--text-mute)]">
            Você fica como host · pode aceitar/recusar candidaturas
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] px-3 py-1.5 rounded transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !selectedChar || !server}
              className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-3 py-1.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Criando…" : "Criar PT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
