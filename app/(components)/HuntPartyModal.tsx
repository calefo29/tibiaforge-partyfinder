"use client";

import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useOverlayClose } from "./useOverlayClose";
import { Character } from "@/lib/characters";
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

const SLOT_COUNT = HUNT_PARTY_MIN_SIZE; // 5 slots fixos

type SlotState = HuntPartyMember | null;

export function HuntPartyModal({ open, ownerId, onClose, onSuccess }: Props) {
  const [server, setServer] = useState("");
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array(SLOT_COUNT).fill(null)
  );
  /** Índice do slot atualmente sendo preenchido (abre o picker inline). */
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
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
      setServer("");
      setSlots(Array(SLOT_COUNT).fill(null));
      setPickingSlot(null);
      setSearch("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // ESC fecha modal (ou picker)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pickingSlot !== null) {
        setPickingSlot(null);
        setSearch("");
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pickingSlot]);

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

  const filledMembers = useMemo(
    () => slots.filter((s): s is HuntPartyMember => s !== null),
    [slots]
  );

  const filledCount = filledMembers.length;

  // Candidatos pro picker do slot ativo
  const candidates = useMemo(() => {
    if (allChars === null || pickingSlot === null) return [];
    const q = search.trim().toLowerCase();
    const usedCharIds = new Set(filledMembers.map((m) => m.characterId));
    const usedOwnerIds = new Set(filledMembers.map((m) => m.ownerId));

    return allChars
      .filter((c) => !usedCharIds.has(c.id))
      .filter((c) => !server || c.server === server)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .map((c) => ({
        char: c,
        ownerConflict: usedOwnerIds.has(c.ownerId),
      }))
      .sort((a, b) => {
        if (a.ownerConflict !== b.ownerConflict) {
          return a.ownerConflict ? 1 : -1;
        }
        return a.char.name.localeCompare(b.char.name);
      })
      .slice(0, 50);
  }, [allChars, search, filledMembers, server, pickingSlot]);

  const openPicker = (slotIdx: number) => {
    setError(null);
    setPickingSlot(slotIdx);
    setSearch("");
  };

  const closePicker = () => {
    setPickingSlot(null);
    setSearch("");
  };

  const assignChar = (slotIdx: number, char: Character) => {
    setError(null);

    // Define server automaticamente se ainda não tem
    if (!server) {
      setServer(char.server);
    } else if (char.server !== server) {
      setError(`${char.name} é de ${char.server}, não de ${server}.`);
      return;
    }

    setSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = {
        characterId: char.id,
        ownerId: char.ownerId,
        name: char.name,
        vocation: char.vocation,
        level: char.level,
      };
      return next;
    });
    closePicker();
  };

  const clearSlot = (slotIdx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
    // Se zerar tudo, libera o server pra trocar
    setError(null);
  };

  const handleServerChange = (newServer: string) => {
    if (newServer === server) return;
    if (filledCount > 0) {
      if (
        !confirm(
          "Trocar de servidor vai limpar todos os personagens adicionados. Continuar?"
        )
      ) {
        return;
      }
      setSlots(Array(SLOT_COUNT).fill(null));
    }
    setServer(newServer);
  };

  const levelAvg = useMemo(() => calcLevelTop4Avg(filledMembers), [filledMembers]);

  const canSubmit = !!server && filledCount >= SLOT_COUNT && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createHuntParty(ownerId, {
        server,
        members: filledMembers,
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
      <div className="w-full max-w-xl bg-[var(--background-elev)] border border-[var(--border)] rounded-lg shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--background-elev)] z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold">📅 Registrar PT de Hunt</h2>
            <p className="text-[11px] text-[var(--text-mute)] mt-0.5">
              {filledCount}/{SLOT_COUNT} chars · todos do mesmo servidor · 1 char
              por player
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text)] w-8 h-8 rounded-md hover:bg-[var(--background-elev-2)] flex items-center justify-center"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Servidor */}
          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)] mb-1.5">
              Servidor *
            </label>
            <select
              value={server}
              onChange={(e) => handleServerChange(e.target.value)}
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
            <p className="text-[11px] text-[var(--text-dim)] mt-1">
              Pode escolher antes ou simplesmente adicionar o 1º char — o servidor
              é definido automaticamente.
            </p>
          </div>

          {/* Slots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)]">
                Composição ({filledCount}/{SLOT_COUNT})
              </label>
              {filledCount > 0 && (
                <span className="text-xs text-[var(--text-mute)]">
                  Lvl médio (top 4):{" "}
                  <strong className="text-[var(--accent)]">{levelAvg}</strong>
                </span>
              )}
            </div>

            <div className="space-y-2">
              {slots.map((slot, idx) => {
                const active = pickingSlot === idx;
                return (
                  <div key={idx}>
                    <SlotRow
                      idx={idx}
                      slot={slot}
                      active={active}
                      onPick={() => openPicker(idx)}
                      onClear={() => clearSlot(idx)}
                    />

                    {/* Picker inline embaixo do slot ativo */}
                    {active && (
                      <div className="mt-2 border border-[var(--accent)]/40 rounded-md bg-[var(--background)]/60 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="🔍 Buscar char por nome..."
                            className="flex-1 bg-[var(--background)] border border-[var(--border-strong)] focus:border-[var(--accent)] rounded-md px-3 py-1.5 text-sm outline-none"
                          />
                          <button
                            type="button"
                            onClick={closePicker}
                            className="text-xs text-[var(--text-mute)] hover:text-[var(--text)] px-2"
                          >
                            cancelar
                          </button>
                        </div>

                        {loadingChars ? (
                          <p className="text-xs text-[var(--text-mute)] text-center py-3">
                            Carregando personagens...
                          </p>
                        ) : candidates.length === 0 ? (
                          <p className="text-xs text-[var(--text-mute)] text-center py-3">
                            Nenhum char encontrado
                            {server && (
                              <>
                                {" "}
                                no servidor <strong>{server}</strong>
                              </>
                            )}
                            .
                          </p>
                        ) : (
                          <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border)]">
                            {candidates.map(({ char, ownerConflict }) => (
                              <button
                                key={char.id}
                                type="button"
                                disabled={ownerConflict}
                                onClick={() =>
                                  !ownerConflict && assignChar(idx, char)
                                }
                                title={
                                  ownerConflict
                                    ? "Já tem outro char do mesmo player na PT"
                                    : undefined
                                }
                                className={`w-full text-left flex items-center gap-3 px-2 py-1.5 text-sm rounded transition ${
                                  ownerConflict
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:bg-[var(--background-elev-2)]"
                                }`}
                              >
                                <span
                                  className={`font-semibold w-8 ${
                                    VOC_COLORS[char.vocation] ??
                                    "text-[var(--text-mute)]"
                                  }`}
                                >
                                  {char.vocation}
                                </span>
                                <span className="flex-1 truncate">
                                  {char.name}
                                </span>
                                <span className="text-[var(--text-mute)] text-xs">
                                  lvl {char.level}
                                </span>
                                <span className="text-[var(--text-dim)] text-[10px] uppercase">
                                  {char.server}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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

function SlotRow({
  idx,
  slot,
  active,
  onPick,
  onClear,
}: {
  idx: number;
  slot: SlotState;
  active: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  if (slot) {
    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 bg-[var(--background)] border rounded-md text-sm ${
          active
            ? "border-[var(--accent)]/40"
            : "border-[var(--border-strong)]"
        }`}
      >
        <span className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider w-12 shrink-0">
          Slot {idx + 1}
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${
            VOC_COLORS[slot.vocation] ?? "text-[var(--text-mute)]"
          }`}
        >
          {slot.vocation}
        </span>
        <span className="flex-1 truncate font-medium">{slot.name}</span>
        <span className="text-[var(--text-mute)] text-xs">lvl {slot.level}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-[var(--text-mute)] hover:text-red-400 text-xs px-1.5"
          aria-label="Remover do slot"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 border-2 border-dashed rounded-md text-sm transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border-strong)] text-[var(--text-mute)] hover:border-[var(--accent-dim)] hover:text-[var(--text)]"
      }`}
    >
      <span className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider w-12 shrink-0 text-left">
        Slot {idx + 1}
      </span>
      <span className="flex-1 text-left">
        {active ? "Escolha um char abaixo..." : "+ Adicionar char"}
      </span>
    </button>
  );
}
