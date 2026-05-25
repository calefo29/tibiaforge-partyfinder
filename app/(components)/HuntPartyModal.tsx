"use client";

import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useOverlayClose } from "./useOverlayClose";
import {
  Character,
  subscribeToUserCharacters,
} from "@/lib/characters";
import {
  createHuntParty,
  fetchAllCharactersOnce,
  HUNT_PARTY_MIN_SIZE,
  HuntPartyMember,
  calcLevelTop4Avg,
} from "@/lib/hunts";

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

const SLOT_COUNT = HUNT_PARTY_MIN_SIZE; // 5 slots fixos (1 líder + 4)

type SlotState = HuntPartyMember | null;

function charToMember(c: Character): HuntPartyMember {
  return {
    characterId: c.id,
    ownerId: c.ownerId,
    name: c.name,
    vocation: c.vocation,
    level: c.level,
  };
}

export function HuntPartyModal({ open, ownerId, onClose, onSuccess }: Props) {
  /** Chars do próprio user (pra escolher o líder). */
  const [myChars, setMyChars] = useState<Character[] | null>(null);
  /** Char escolhido como líder. Define o server da PT. */
  const [leaderCharId, setLeaderCharId] = useState<string | null>(null);
  /** Slots 1..4 (líder ocupa slot 0 implicitamente). */
  const [otherSlots, setOtherSlots] = useState<SlotState[]>(() =>
    Array(SLOT_COUNT - 1).fill(null)
  );
  /** Índice do slot atualmente sendo preenchido (abre o picker inline). */
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Cache de todos os chars do site (carregado on demand quando vai abrir picker). */
  const [allChars, setAllChars] = useState<Character[] | null>(null);
  const [loadingAllChars, setLoadingAllChars] = useState(false);

  const overlayProps = useOverlayClose(onClose);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setLeaderCharId(null);
      setOtherSlots(Array(SLOT_COUNT - 1).fill(null));
      setPickingSlot(null);
      setSearch("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // ESC fecha picker (se aberto) ou modal
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

  // Subscribe nos chars do próprio user
  useEffect(() => {
    if (!open) return;
    return subscribeToUserCharacters(ownerId, setMyChars);
  }, [open, ownerId]);

  // Carrega allChars na primeira vez que o user vai abrir um picker
  useEffect(() => {
    if (!open || pickingSlot === null || allChars !== null || loadingAllChars)
      return;
    let cancelled = false;
    setLoadingAllChars(true);
    fetchAllCharactersOnce()
      .then((cs) => {
        if (!cancelled) setAllChars(cs);
      })
      .catch((err) => {
        console.error("[HuntPartyModal] fetchAllCharactersOnce", err);
        if (!cancelled) setAllChars([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAllChars(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pickingSlot, allChars, loadingAllChars]);

  const leaderChar = useMemo(
    () => myChars?.find((c) => c.id === leaderCharId) ?? null,
    [myChars, leaderCharId]
  );

  const server = leaderChar?.server ?? "";

  const filledOthers = useMemo(
    () => otherSlots.filter((s): s is HuntPartyMember => s !== null),
    [otherSlots]
  );

  const allMembers = useMemo<HuntPartyMember[]>(() => {
    if (!leaderChar) return filledOthers;
    return [charToMember(leaderChar), ...filledOthers];
  }, [leaderChar, filledOthers]);

  const filledCount = allMembers.length;

  // Candidatos pro picker do slot ativo (apenas chars de OUTROS players, mesmo server)
  const candidates = useMemo(() => {
    if (allChars === null || pickingSlot === null || !leaderChar) return [];
    const q = search.trim().toLowerCase();
    const usedCharIds = new Set(allMembers.map((m) => m.characterId));
    const usedOwnerIds = new Set(allMembers.map((m) => m.ownerId));

    return allChars
      .filter((c) => c.server === leaderChar.server)
      .filter((c) => !usedCharIds.has(c.id))
      // Bloqueia chars do próprio líder e chars de qualquer player já na PT
      .filter((c) => !usedOwnerIds.has(c.ownerId))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50);
  }, [allChars, search, allMembers, leaderChar, pickingSlot]);

  const selectLeader = (charId: string) => {
    setError(null);
    if (leaderCharId && leaderCharId !== charId && filledOthers.length > 0) {
      const leaderChanged = myChars?.find((c) => c.id === leaderCharId);
      const newLeader = myChars?.find((c) => c.id === charId);
      if (
        leaderChanged &&
        newLeader &&
        leaderChanged.server !== newLeader.server
      ) {
        if (
          !confirm(
            "Trocar pra um líder de outro servidor vai limpar os chars convidados. Continuar?"
          )
        ) {
          return;
        }
        setOtherSlots(Array(SLOT_COUNT - 1).fill(null));
      }
    }
    setLeaderCharId(charId);
    setPickingSlot(null);
    setSearch("");
  };

  const openPicker = (slotIdx: number) => {
    if (!leaderChar) {
      setError("Escolha primeiro o char líder.");
      return;
    }
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
    setOtherSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = charToMember(char);
      return next;
    });
    closePicker();
  };

  const clearSlot = (slotIdx: number) => {
    setOtherSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
    setError(null);
  };

  const levelAvg = useMemo(() => calcLevelTop4Avg(allMembers), [allMembers]);

  const canSubmit =
    !!leaderChar && filledCount >= SLOT_COUNT && !busy;

  const handleSubmit = async () => {
    if (!canSubmit || !leaderChar) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createHuntParty(ownerId, {
        server: leaderChar.server,
        members: allMembers,
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
      <div className="w-full max-w-xl bg-[var(--background-elev)] border border-[var(--border)] rounded-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--background-elev)] z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold">📅 Registrar PT de Hunt</h2>
            <p className="text-[11px] text-[var(--text-mute)] mt-0.5">
              {leaderChar
                ? `${filledCount}/${SLOT_COUNT} chars · ${server}`
                : "Escolha primeiro seu char líder"}
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
          {/* Step 1 — escolher líder */}
          <section>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2">
              1. Seu char líder *
            </label>
            <p className="text-[11px] text-[var(--text-mute)] mb-3">
              O servidor da PT vem do char líder. Convidados precisam estar no
              mesmo servidor.
            </p>

            {myChars === null ? (
              <p className="text-xs text-[var(--text-mute)] py-3 text-center">
                Carregando seus chars...
              </p>
            ) : myChars.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                Você ainda não tem nenhum personagem cadastrado. Vá em{" "}
                <em>Meus personagens</em> e cadastre primeiro.
              </div>
            ) : (
              <div className="space-y-2">
                {myChars.map((c) => {
                  const selected = c.id === leaderCharId;
                  const vocColor =
                    VOC_COLORS[c.vocation] ?? "text-[var(--text-mute)]";
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => selectLeader(c.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-[1.5px] text-left transition ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)]/6"
                          : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)]"
                      }`}
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
                      <span
                        className={`w-[18px] h-[18px] rounded-full border-2 flex-shrink-0 relative ${
                          selected
                            ? "border-[var(--accent)]"
                            : "border-[var(--border-strong)]"
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

          {/* Step 2 — convidar 4 chars */}
          <section
            className={
              leaderChar ? "" : "opacity-50 pointer-events-none select-none"
            }
          >
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs uppercase tracking-wider text-[var(--text-dim)]">
                2. Convidar chars ({filledCount}/{SLOT_COUNT})
              </label>
              {filledCount > 0 && (
                <span className="text-xs text-[var(--text-mute)]">
                  Lvl médio (top 4):{" "}
                  <strong className="text-[var(--accent)]">{levelAvg}</strong>
                </span>
              )}
            </div>

            <div className="space-y-2">
              {/* Slot do líder (read-only) */}
              {leaderChar ? (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--accent)]/8 border border-[var(--accent)]/40 rounded-md text-sm">
                  <span className="text-[10px] text-[var(--accent)] uppercase tracking-wider w-12 shrink-0 font-semibold">
                    Líder
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--background-elev-2)] ${
                      VOC_COLORS[leaderChar.vocation] ??
                      "text-[var(--text-mute)]"
                    }`}
                  >
                    {leaderChar.vocation}
                  </span>
                  <span className="flex-1 truncate font-medium">
                    {leaderChar.name}
                  </span>
                  <span className="text-[var(--text-mute)] text-xs">
                    lvl {leaderChar.level}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 border-2 border-dashed border-[var(--border-strong)] rounded-md text-sm text-[var(--text-dim)]">
                  <span className="text-[10px] uppercase tracking-wider w-12 shrink-0 font-semibold">
                    Líder
                  </span>
                  <span className="flex-1 text-left">
                    Escolha o char líder acima
                  </span>
                </div>
              )}

              {/* Slots 1-4 */}
              {otherSlots.map((slot, idx) => {
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

                        {loadingAllChars ? (
                          <p className="text-xs text-[var(--text-mute)] text-center py-3">
                            Carregando personagens...
                          </p>
                        ) : candidates.length === 0 ? (
                          <p className="text-xs text-[var(--text-mute)] text-center py-3">
                            Nenhum char disponível em{" "}
                            <strong>{server}</strong>.
                          </p>
                        ) : (
                          <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border)]">
                            {candidates.map((char) => (
                              <button
                                key={char.id}
                                type="button"
                                onClick={() => assignChar(idx, char)}
                                className="w-full text-left flex items-center gap-3 px-2 py-1.5 text-sm rounded transition hover:bg-[var(--background-elev-2)]"
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
          </section>

          {/* Erro */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--background-elev)] flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
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
          Vaga {idx + 1}
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
        Vaga {idx + 1}
      </span>
      <span className="flex-1 text-left">
        {active ? "Escolha um char abaixo..." : "+ Convidar char"}
      </span>
    </button>
  );
}
