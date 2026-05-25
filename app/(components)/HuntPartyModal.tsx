"use client";

import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useOverlayClose } from "./useOverlayClose";
import { Character, VOCATION_LABELS } from "@/lib/characters";
import {
  createHuntParty,
  fetchAllCharactersOnce,
  HUNT_PARTY_MIN_SIZE,
  HuntPartyMember,
  calcLevelTop4Avg,
} from "@/lib/hunts";
import type { ServerInfo, ServersResponse } from "@/app/api/servers/route";

type Props = {
  open: boolean;
  ownerId: string;
  onClose: () => void;
  onSuccess?: (partyId: string) => void;
};

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

export function HuntPartyModal({ open, ownerId, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [server, setServer] = useState("");
  const [members, setMembers] = useState<HuntPartyMember[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allChars, setAllChars] = useState<Character[] | null>(null);
  const [loadingChars, setLoadingChars] = useState(false);

  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  const overlayProps = useOverlayClose(onClose);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setName("");
      setServer("");
      setMembers([]);
      setSearch("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // ESC pra fechar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Carrega chars uma vez ao abrir
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingChars(true);
    fetchAllCharactersOnce()
      .then((cs) => {
        if (!cancelled) setAllChars(cs);
      })
      .catch((err) => {
        console.error("[HuntPartyModal] fetchAllCharactersOnce", err);
        if (!cancelled) setAllChars([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChars(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Carrega servers ao abrir
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingServers(true);
    fetch("/api/servers")
      .then((r) => r.json() as Promise<ServersResponse>)
      .then((data) => {
        if (!cancelled) setServers(data.servers || []);
      })
      .catch((err) => {
        console.error("[HuntPartyModal] /api/servers", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Auto-seleciona o server se 1º char escolhido define
  useEffect(() => {
    if (!server && members.length > 0) {
      const firstChar = allChars?.find((c) => c.id === members[0].characterId);
      if (firstChar?.server) setServer(firstChar.server);
    }
  }, [members, allChars, server]);

  // Filtra candidatos pra autocomplete
  const candidates = useMemo(() => {
    if (!allChars) return [];
    const q = search.trim().toLowerCase();
    const memberIds = new Set(members.map((m) => m.characterId));
    const memberOwners = new Set(members.map((m) => m.ownerId));

    return allChars
      .filter((c) => !memberIds.has(c.id))
      .filter((c) => !server || c.server === server)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .map((c) => ({
        char: c,
        ownerConflict: memberOwners.has(c.ownerId),
      }))
      .sort((a, b) => {
        // chars sem conflito primeiro, depois alfabético
        if (a.ownerConflict !== b.ownerConflict) {
          return a.ownerConflict ? 1 : -1;
        }
        return a.char.name.localeCompare(b.char.name);
      })
      .slice(0, 30);
  }, [allChars, search, members, server]);

  const addMember = (char: Character) => {
    setError(null);

    // Define server se ainda não tem
    if (!server) setServer(char.server);

    // Server conflict
    if (server && char.server !== server) {
      setError(`${char.name} é de ${char.server}, não de ${server}.`);
      return;
    }

    // Owner conflict
    if (members.some((m) => m.ownerId === char.ownerId)) {
      setError(
        `Já existe um personagem do mesmo player (${char.name}) na PT. Só 1 char por player.`
      );
      return;
    }

    setMembers((prev) => [
      ...prev,
      {
        characterId: char.id,
        ownerId: char.ownerId,
        name: char.name,
        vocation: char.vocation,
        level: char.level,
      },
    ]);
    setSearch("");
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.characterId !== id));
  };

  const levelAvg = useMemo(() => calcLevelTop4Avg(members), [members]);

  const canSubmit =
    !!name.trim() &&
    !!server &&
    members.length >= HUNT_PARTY_MIN_SIZE &&
    !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createHuntParty(ownerId, {
        name: name.trim(),
        server,
        members,
      });
      onSuccess?.(id);
      onClose();
    } catch (err) {
      const msg =
        err instanceof FirebaseError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Erro desconhecido ao criar PT.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      {...overlayProps}
    >
      <div className="w-full max-w-2xl bg-[var(--background-elev)] border border-[var(--border)] rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold">📅 Nova PT de Hunt</h2>
            <p className="text-xs text-[var(--text-mute)] mt-0.5">
              Cadastre sua PT pra concorrer no planilhado
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text)] text-xl leading-none px-2"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Nome + Server */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                Nome da PT *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Os Fudidos"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] focus:border-[var(--accent)] rounded-md px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
                Servidor *
              </label>
              <select
                value={server}
                onChange={(e) => {
                  // Trocar de server limpa members (todos precisam ser do mesmo)
                  if (e.target.value !== server && members.length > 0) {
                    if (
                      !confirm(
                        "Trocar de servidor vai limpar todos os personagens adicionados. Continuar?"
                      )
                    ) {
                      return;
                    }
                    setMembers([]);
                  }
                  setServer(e.target.value);
                }}
                disabled={loadingServers}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] focus:border-[var(--accent)] rounded-md px-3 py-2 text-sm outline-none disabled:opacity-50"
              >
                <option value="">— escolha o servidor —</option>
                {servers.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.pvp})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Composição */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)]">
                Composição ({members.length}/{HUNT_PARTY_MIN_SIZE}+ mínimo)
              </label>
              {members.length >= HUNT_PARTY_MIN_SIZE && (
                <span className="text-xs text-[var(--text-mute)]">
                  Lvl médio (top 4):{" "}
                  <strong className="text-[var(--accent)]">{levelAvg}</strong>
                </span>
              )}
            </div>

            {/* Lista de members atuais */}
            {members.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {members.map((m) => (
                  <div
                    key={m.characterId}
                    className="flex items-center gap-3 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm"
                  >
                    <span
                      className={`font-semibold ${
                        VOC_COLORS[m.vocation] ?? "text-[var(--text-mute)]"
                      }`}
                    >
                      {m.vocation}
                    </span>
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-[var(--text-mute)] text-xs">
                      lvl {m.level}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMember(m.characterId)}
                      className="text-[var(--text-mute)] hover:text-red-400 text-xs px-1"
                      aria-label="Remover"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Busca de char */}
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Buscar personagem por nome..."
                disabled={loadingChars}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] focus:border-[var(--accent)] rounded-md px-3 py-2 text-sm outline-none disabled:opacity-50"
              />
              {loadingChars && (
                <p className="text-xs text-[var(--text-mute)] mt-1">
                  Carregando personagens...
                </p>
              )}
            </div>

            {/* Resultados */}
            {search.trim() && !loadingChars && (
              <div className="mt-2 max-h-60 overflow-y-auto border border-[var(--border)] rounded-md divide-y divide-[var(--border)]">
                {candidates.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-[var(--text-mute)] text-center">
                    Nenhum personagem encontrado.
                    {server && (
                      <>
                        {" "}
                        Lembre que só aparecem chars do servidor{" "}
                        <strong>{server}</strong>.
                      </>
                    )}
                  </p>
                ) : (
                  candidates.map(({ char, ownerConflict }) => (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => !ownerConflict && addMember(char)}
                      disabled={ownerConflict}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 text-sm transition ${
                        ownerConflict
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-[var(--background-elev-2)]"
                      }`}
                      title={
                        ownerConflict
                          ? "Já tem outro char do mesmo player na PT"
                          : undefined
                      }
                    >
                      <span
                        className={`font-semibold w-8 ${
                          VOC_COLORS[char.vocation] ?? "text-[var(--text-mute)]"
                        }`}
                      >
                        {char.vocation}
                      </span>
                      <span className="flex-1 truncate">{char.name}</span>
                      <span className="text-[var(--text-mute)] text-xs">
                        lvl {char.level}
                      </span>
                      <span className="text-[var(--text-dim)] text-[10px] uppercase">
                        {char.server}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Regras */}
          <div className="text-[11px] text-[var(--text-mute)] bg-[var(--background)]/50 border border-[var(--border)] rounded-md p-3 space-y-1">
            <p>
              <strong>⚠ Regras validadas automaticamente:</strong>
            </p>
            <p>• Mínimo {HUNT_PARTY_MIN_SIZE} personagens</p>
            <p>• Todos no mesmo servidor</p>
            <p>• 1 personagem por player (sem 2 chars do mesmo dono)</p>
            <p>
              • Personagem precisa estar cadastrado no site (em{" "}
              <em>Meus personagens</em>)
            </p>
          </div>

          {/* Erro */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-[var(--text-mute)] hover:text-[var(--text)] transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-semibold rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Criando..." : "Criar PT"}
          </button>
        </div>
      </div>
    </div>
  );
}
