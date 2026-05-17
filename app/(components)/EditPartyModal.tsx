"use client";

import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { VOCATIONS } from "@/lib/characters";
import {
  PartyRequirements,
  PrimalParty,
  PRIMAL_PARTY_MIN_LEVEL,
  SlotVocation,
  updateParty,
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
  party: PrimalParty | null;
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

export function EditPartyModal({ open, party, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [reqLevelOn, setReqLevelOn] = useState(false);
  const [reqLevelValue, setReqLevelValue] = useState(String(PRIMAL_PARTY_MIN_LEVEL));
  const [reqHazardOn, setReqHazardOn] = useState(false);
  const [reqHazardValue, setReqHazardValue] = useState(0);
  const [reqScheduleOn, setReqScheduleOn] = useState(false);
  const [reqScheduleTurnos, setReqScheduleTurnos] = useState<Set<Turno>>(new Set());
  const [reqExperiencedOn, setReqExperiencedOn] = useState(false);
  const [composition, setComposition] = useState<SlotVocation[]>([
    "EK", "ED", "ANY", "ANY", "ANY",
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !party) return;
    setNotes(party.notes ?? "");
    setReqLevelOn(party.requirements.minLevel.active);
    setReqLevelValue(String(party.requirements.minLevel.value));
    setReqHazardOn(party.requirements.minHazard.active);
    setReqHazardValue(party.requirements.minHazard.value);
    setReqScheduleOn(party.requirements.schedule.active);
    setReqScheduleTurnos(new Set(party.requirements.schedule.value));
    setReqExperiencedOn(party.requirements.experienced?.active ?? false);
    setComposition(party.slots.map((s) => s.vocation) as SlotVocation[]);
    setBusy(false);
    setError(null);
  }, [open, party]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !party) return null;

  const toggleTurno = (t: Turno) => {
    setReqScheduleTurnos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const setSlot = (idx: number, voc: SlotVocation) => {
    if (idx < 2) return;
    setComposition((prev) => prev.map((v, i) => (i === idx ? voc : v)));
  };

  const handleSave = async () => {
    setError(null);
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
      experienced: { active: reqExperiencedOn },
    };
    setBusy(true);
    try {
      await updateParty(party.id, party, {
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
            : "Erro ao atualizar PT.";
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
        className="w-full max-w-[600px] max-h-[92vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--background-elev)] z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold">Editar PT</h2>
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
          <p className="text-xs text-[var(--text-mute)]">
            Servidor da PT: <strong className="text-[var(--text)]">{party.server}</strong> · não pode ser alterado.
            Pra adicionar players, clique nas vagas abertas no card da PT.
          </p>

          {/* Composição */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Composição da PT
            </h3>
            <p className="text-xs text-[var(--text-mute)] mb-3">
              Vagas 1 (EK) e 2 (ED) são fixas. Apenas vagas 3, 4 e 5 podem ser
              alteradas.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {composition.map((voc, i) => {
                const locked = i < 2;
                return (
                  <div
                    key={i}
                    className={`p-2.5 rounded-md border text-center ${
                      locked
                        ? "border-[var(--border)] bg-[var(--background-elev-2)]"
                        : "border-[var(--border-strong)] bg-[var(--background)]"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-mute)] mb-1">
                      Vaga {i + 1}
                      {locked && (
                        <span className="ml-1 text-[var(--text-dim)]">🔒</span>
                      )}
                    </div>
                    {locked ? (
                      <div
                        className={`bg-[var(--background)] border border-[var(--border)] rounded px-1.5 py-1 text-[12px] font-bold ${VOC_COLORS[voc] ?? ""}`}
                      >
                        {voc}
                      </div>
                    ) : (
                      <select
                        value={voc}
                        onChange={(e) => setSlot(i, e.target.value as SlotVocation)}
                        className={`w-full bg-[var(--background-elev-2)] border border-[var(--border)] rounded px-1.5 py-1 text-[12px] font-semibold outline-none focus:border-[var(--accent)] ${VOC_COLORS[voc] ?? ""}`}
                      >
                        {SLOT_OPTIONS.map((o) => (
                          <option key={o} value={o} className="text-[var(--text)]">
                            {o === "ANY" ? "Flex" : o}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Requirements */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-mute)] mb-2">
              Batentes
            </h3>
            <div className="space-y-2.5">
              <RequirementBlock
                active={reqLevelOn}
                onToggle={() => setReqLevelOn((v) => !v)}
                icon="🛡️"
                title="Level mínimo"
                hint={
                  reqLevelOn
                    ? `Apenas chars com level ≥ ${reqLevelValue} podem candidatar.`
                    : `Sem filtro (mínimo da quest: ${PRIMAL_PARTY_MIN_LEVEL}).`
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

              <RequirementBlock
                active={reqHazardOn}
                onToggle={() => setReqHazardOn((v) => !v)}
                icon="🔥"
                title="Hazard mínimo"
                hint={
                  reqHazardOn
                    ? `Chars com Hazard ≥ ${reqHazardValue} (precisam estar na pool).`
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

              <RequirementBlock
                active={reqExperiencedOn}
                onToggle={() => setReqExperiencedOn((v) => !v)}
                icon="🎯"
                title="Apenas com experiência"
                hint={
                  reqExperiencedOn
                    ? "Apenas chars marcados como 'com experiência' na pool."
                    : "Sem filtro de experiência."
                }
              />

              <RequirementBlock
                active={reqScheduleOn}
                onToggle={() => setReqScheduleOn((v) => !v)}
                icon="🕒"
                title="Horários aceitos"
                hint={
                  reqScheduleOn
                    ? "Char precisa ter pelo menos 1 turno em comum."
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
                          <div className="text-lg leading-none">{TURNO_ICONS[t]}</div>
                          <div
                            className={`text-[10px] font-semibold mt-1 ${
                              on ? "text-[var(--ok)]" : "text-[var(--text-mute)]"
                            }`}
                          >
                            {TURNO_LABELS[t]}
                          </div>
                          <div
                            className={`text-[9px] tabular-nums ${
                              on ? "text-[var(--ok)]/70" : "text-[var(--text-dim)]"
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
              Observações
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
            Alterar batentes pode tornar candidatos atuais inelegíveis.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] px-3 py-1.5 rounded transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-3 py-1.5 rounded transition disabled:opacity-40"
            >
              {busy ? "Salvando…" : "Salvar alterações"}
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
