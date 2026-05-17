"use client";

import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { Character, VOCATIONS, Vocation } from "@/lib/characters";
import {
  createParty,
  hostSlotIndexFor,
  PartyRequirements,
  PRIMAL_PARTY_MIN_LEVEL,
  SLOT_TEMPLATE,
  SlotVocation,
} from "@/lib/primal-parties";
import {
  HAZARD_MAX,
  HAZARD_MIN,
  Turno,
  TURNOS,
  TURNO_ICONS,
  TURNO_LABELS,
  TURNO_RANGES,
} from "@/lib/primal-pool";

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
  ANY: "text-[var(--text-mute)]",
};

const SLOT_OPTIONS: SlotVocation[] = ["ANY", ...VOCATIONS];

export function CreatePartyModal({ open, ownerId, characters, onClose }: Props) {
  const [hostCharId, setHostCharId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [reqLevelOn, setReqLevelOn] = useState(false);
  const [reqLevelValue, setReqLevelValue] = useState(String(PRIMAL_PARTY_MIN_LEVEL));
  const [reqHazardOn, setReqHazardOn] = useState(false);
  const [reqHazardValue, setReqHazardValue] = useState(0);
  const [reqScheduleOn, setReqScheduleOn] = useState(false);
  const [reqScheduleTurnos, setReqScheduleTurnos] = useState<Set<Turno>>(
    new Set()
  );

  const [composition, setComposition] = useState<SlotVocation[]>([...SLOT_TEMPLATE]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setHostCharId(null);
      setNotes("");
      setReqLevelOn(false);
      setReqLevelValue(String(PRIMAL_PARTY_MIN_LEVEL));
      setReqHazardOn(false);
      setReqHazardValue(0);
      setReqScheduleOn(false);
      setReqScheduleTurnos(new Set());
      setComposition([...SLOT_TEMPLATE]);
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

  const eligibleChars = useMemo(
    () =>
      characters.filter(
        (c) =>
          c.level >= PRIMAL_PARTY_MIN_LEVEL && c.questHistory?.primal !== true
      ),
    [characters]
  );
  const selectedChar = eligibleChars.find((c) => c.id === hostCharId) ?? null;

  const hostIdx = selectedChar
    ? hostSlotIndexFor(composition, selectedChar.vocation)
    : -1;
  const hostFits = hostIdx >= 0;

  const setSlot = (idx: number, voc: SlotVocation) => {
    setComposition((prev) => prev.map((v, i) => (i === idx ? voc : v)));
  };

  const toggleTurno = (t: Turno) => {
    setReqScheduleTurnos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!selectedChar) {
      setError("Escolha o char que você vai levar como host.");
      return;
    }
    if (!hostFits) {
      setError(
        `Nenhuma vaga aceita ${selectedChar.vocation}. Ajuste a composição.`
      );
      return;
    }
    let levelValue = PRIMAL_PARTY_MIN_LEVEL;
    if (reqLevelOn) {
      const parsed = parseInt(reqLevelValue, 10);
      if (!Number.isFinite(parsed) || parsed < PRIMAL_PARTY_MIN_LEVEL) {
        setError(`Level mínimo precisa ser ≥ ${PRIMAL_PARTY_MIN_LEVEL}.`);
        return;
      }
      levelValue = parsed;
    }
    if (reqScheduleOn && reqScheduleTurnos.size === 0) {
      setError("Marque pelo menos 1 turno ou desative o filtro de horário.");
      return;
    }

    const requirements: PartyRequirements = {
      minLevel: { active: reqLevelOn, value: levelValue },
      minHazard: { active: reqHazardOn, value: reqHazardValue },
      schedule: { active: reqScheduleOn, value: [...reqScheduleTurnos] },
    };

    setBusy(true);
    try {
      await createParty({
        hostUid: ownerId,
        hostCharacterId: selectedChar.id,
        hostVocation: selectedChar.vocation,
        server: selectedChar.server,
        notes: notes.trim(),
        requirements,
        slotComposition: composition,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] max-h-[92vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl shadow-2xl"
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
          {/* Step 1 — Host char */}
          <section>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Qual char você vai levar? <span className="text-[var(--danger)]">*</span>
            </label>
            <p className="text-xs text-[var(--text-mute)] mb-3">
              Servidor da PT vai ser o do char selecionado. Outros players só
              candidatam chars do mesmo servidor.
            </p>
            {eligibleChars.length === 0 ? (
              <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-6 text-center text-sm text-[var(--text-mute)]">
                Você não tem nenhum char elegível (level ≥{" "}
                {PRIMAL_PARTY_MIN_LEVEL} e ainda não fez Primal).
              </div>
            ) : (
              <div className="space-y-2">
                {eligibleChars.map((c) => {
                  const selected = c.id === hostCharId;
                  const vocColor =
                    VOC_COLORS[c.vocation] ?? "text-[var(--accent)]";
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
            {selectedChar && (
              <div className="mt-3 text-[11px] text-[var(--text-mute)]">
                📍 Servidor da PT:{" "}
                <strong className="text-[var(--text)]">{selectedChar.server}</strong>
              </div>
            )}
          </section>

          {/* Composição */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Composição da PT
            </h3>
            <p className="text-xs text-[var(--text-mute)] mb-3">
              Defina a vocação de cada vaga. Use{" "}
              <strong className="text-[var(--text)]">Flex</strong> pra aceitar
              qualquer vocação.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {composition.map((voc, i) => {
                const isHostHere = selectedChar && i === hostIdx;
                return (
                  <div
                    key={i}
                    className={`p-2.5 rounded-md border text-center ${
                      isHostHere
                        ? "border-[var(--accent)] bg-[var(--accent)]/8"
                        : "border-[var(--border-strong)] bg-[var(--background)]"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-mute)] mb-1">
                      Vaga {i + 1}
                    </div>
                    <select
                      value={voc}
                      onChange={(e) =>
                        setSlot(i, e.target.value as SlotVocation)
                      }
                      className={`w-full bg-[var(--background-elev-2)] border border-[var(--border)] rounded px-1.5 py-1 text-[12px] font-semibold outline-none focus:border-[var(--accent)] ${VOC_COLORS[voc] ?? ""}`}
                    >
                      {SLOT_OPTIONS.map((o) => (
                        <option key={o} value={o} className="text-[var(--text)]">
                          {o === "ANY" ? "Flex" : o}
                        </option>
                      ))}
                    </select>
                    <div className="text-[9px] mt-1 text-[var(--text-dim)] truncate">
                      {isHostHere ? selectedChar?.name : "Aberta"}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedChar && !hostFits && (
              <p className="text-[11px] text-[var(--danger)] mt-2">
                ⚠️ Nenhuma vaga aceita {selectedChar.vocation}. Mude pelo menos
                uma vaga pra {selectedChar.vocation} ou Flex.
              </p>
            )}
          </section>

          {/* Requirements */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Batentes (filtros pra entrar)
            </h3>
            <p className="text-xs text-[var(--text-mute)] mb-3">
              Cada toggle é opcional. Quando ativo, vira{" "}
              <strong className="text-[var(--text)]">filtro obrigatório</strong>{" "}
              pra candidatos.
            </p>

            <div className="space-y-2.5">
              {/* Min level */}
              <RequirementBlock
                active={reqLevelOn}
                onToggle={() => setReqLevelOn((v) => !v)}
                icon="🛡️"
                title="Level mínimo"
                hint={
                  reqLevelOn
                    ? `Apenas chars com level ≥ ${reqLevelValue} podem candidatar.`
                    : `Sem filtro de level (mínimo da quest: ${PRIMAL_PARTY_MIN_LEVEL}).`
                }
              >
                {reqLevelOn && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      min={PRIMAL_PARTY_MIN_LEVEL}
                      value={reqLevelValue}
                      onChange={(e) => setReqLevelValue(e.target.value)}
                      className="w-24 bg-[var(--background)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                    />
                    <span className="text-[11px] text-[var(--text-dim)]">
                      ≥ {PRIMAL_PARTY_MIN_LEVEL}
                    </span>
                  </div>
                )}
              </RequirementBlock>

              {/* Min hazard */}
              <RequirementBlock
                active={reqHazardOn}
                onToggle={() => setReqHazardOn((v) => !v)}
                icon="🔥"
                title="Hazard mínimo"
                hint={
                  reqHazardOn
                    ? `Apenas chars com Hazard ≥ ${reqHazardValue} podem candidatar (precisam estar na pool).`
                    : "Sem filtro de Hazard."
                }
              >
                {reqHazardOn && (
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-2xl font-bold text-[var(--accent)] tabular-nums">
                        {reqHazardValue}
                      </span>
                      <span className="text-[10px] text-[var(--text-dim)]">
                        escala {HAZARD_MIN}–{HAZARD_MAX}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={HAZARD_MIN}
                      max={HAZARD_MAX}
                      value={reqHazardValue}
                      onChange={(e) =>
                        setReqHazardValue(parseInt(e.target.value, 10))
                      }
                      className="hazard-slider"
                    />
                  </div>
                )}
              </RequirementBlock>

              {/* Schedule */}
              <RequirementBlock
                active={reqScheduleOn}
                onToggle={() => setReqScheduleOn((v) => !v)}
                icon="🕒"
                title="Horários aceitos"
                hint={
                  reqScheduleOn
                    ? "Char precisa ter pelo menos 1 dos turnos marcados na disponibilidade."
                    : "Sem filtro de horário."
                }
              >
                {reqScheduleOn && (
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {TURNOS.map((t) => {
                      const on = reqScheduleTurnos.has(t);
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => toggleTurno(t)}
                          className={`p-2 rounded border text-center transition ${
                            on
                              ? "border-[var(--ok)] bg-[var(--ok)]/10"
                              : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent-dim)]"
                          }`}
                        >
                          <div className="text-lg leading-none">
                            {TURNO_ICONS[t]}
                          </div>
                          <div
                            className={`text-[10px] font-semibold mt-1 ${
                              on
                                ? "text-[var(--ok)]"
                                : "text-[var(--text-mute)]"
                            }`}
                          >
                            {TURNO_LABELS[t]}
                          </div>
                          <div
                            className={`text-[9px] tabular-nums ${
                              on
                                ? "text-[var(--ok)]/70"
                                : "text-[var(--text-dim)]"
                            }`}
                          >
                            {TURNO_RANGES[t]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </RequirementBlock>
            </div>
          </section>

          {/* Notes */}
          <section>
            <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sai hoje às 21h, todos com vip e comida"
              rows={2}
              className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 outline-none focus:border-[var(--accent)] text-sm resize-none"
            />
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
              disabled={busy || !selectedChar || !hostFits}
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

function RequirementBlock({
  active,
  onToggle,
  icon,
  title,
  hint,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  icon: string;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border-strong)] bg-[var(--background)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                active
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/40"
                  : "bg-[var(--background-elev-2)] text-[var(--text-dim)] border-[var(--border-strong)]"
              }`}
            >
              {active ? "obrig." : "off"}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-mute)] mt-0.5 leading-relaxed">
            {hint}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={active}
          aria-label={active ? "Desativar requisito" : "Ativar requisito"}
          className={`relative w-[42px] h-[22px] rounded-full border-[1.5px] flex-shrink-0 transition ${
            active
              ? "bg-[var(--accent)]/30 border-[var(--accent)] shadow-[inset_0_0_8px_rgba(96,165,250,0.4)]"
              : "bg-[var(--background-elev-2)] border-[var(--border-strong)]"
          }`}
        >
          <span
            className={`absolute top-[1px] w-[16px] h-[16px] rounded-full transition-all duration-200 ${
              active
                ? "left-[22px] bg-[var(--accent)] shadow-[0_0_8px_rgba(96,165,250,0.7)]"
                : "left-[1px] bg-[var(--text-dim)]"
            }`}
          />
        </button>
      </div>
      {children}
    </div>
  );
}
