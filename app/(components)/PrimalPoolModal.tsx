"use client";

import { useEffect, useMemo, useState } from "react";
import { FirebaseError } from "firebase/app";
import { Character } from "@/lib/characters";
import {
  addToPrimalPool,
  hazardTier,
  HAZARD_MAX,
  HAZARD_MIN,
  PrimalPoolEntry,
  PRIMAL_MIN_LEVEL,
  Turno,
  TURNOS,
  TURNO_ICONS,
  TURNO_LABELS,
  TURNO_RANGES,
  updatePrimalPoolEntry,
} from "@/lib/primal-pool";

type Props = {
  open: boolean;
  ownerId: string;
  characters: Character[];
  alreadyInPool: Set<string>;
  editing?: PrimalPoolEntry | null;
  onClose: () => void;
};

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

type Step = 1 | 2 | 3;

export function PrimalPoolModal({
  open,
  ownerId,
  characters,
  alreadyInPool,
  editing,
  onClose,
}: Props) {
  const isEdit = !!editing;
  const [step, setStep] = useState<Step>(1);
  const [charId, setCharId] = useState<string | null>(null);
  const [experience, setExperience] = useState<boolean | null>(null);
  const [hazard, setHazard] = useState(0);
  const [turnos, setTurnos] = useState<Set<Turno>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCharName, setSavedCharName] = useState("");

  const reset = () => {
    setStep(1);
    setCharId(null);
    setExperience(null);
    setHazard(0);
    setTurnos(new Set());
    setBusy(false);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStep(2);
      setCharId(editing.characterId);
      setExperience(editing.experience);
      setHazard(editing.hazard);
      setTurnos(new Set(editing.availability));
      setBusy(false);
      setError(null);
    } else {
      reset();
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selectedChar = useMemo(
    () => characters.find((c) => c.id === charId) ?? null,
    [characters, charId]
  );

  const canSubmit =
    !!charId && experience !== null && turnos.size >= 1 && !busy;

  if (!open) return null;

  const toggleTurno = (t: Turno) => {
    setTurnos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const goNext = async () => {
    if (step === 1) {
      if (!charId) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!canSubmit || !selectedChar) return;
      setBusy(true);
      setError(null);
      try {
        if (editing) {
          await updatePrimalPoolEntry(editing.id, {
            experience: experience === true,
            hazard,
            availability: [...turnos],
          });
        } else {
          await addToPrimalPool(ownerId, {
            characterId: selectedChar.id,
            experience: experience === true,
            hazard,
            availability: [...turnos],
          });
        }
        setSavedCharName(selectedChar.name);
        setStep(3);
      } catch (err) {
        const msg =
          err instanceof FirebaseError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Erro ao adicionar à pool.";
        setError(msg);
      } finally {
        setBusy(false);
      }
    }
  };

  const goBack = () => {
    if (step === 2) setStep(1);
  };

  const tier = hazardTier(hazard);
  const tierBg =
    tier.cls === "low"
      ? "bg-[var(--ok)]/10 text-[var(--ok)] border-[var(--ok)]/40"
      : tier.cls === "mid"
        ? "bg-[var(--warn)]/10 text-[var(--warn)] border-[var(--warn)]/40"
        : "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] max-h-[92vh] overflow-y-auto bg-[var(--background-elev)] border border-[var(--border)] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--background-elev)] z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold">
            {step === 3
              ? isEdit
                ? "Inscrição atualizada!"
                : "Char adicionado!"
              : selectedChar && step === 2
                ? `${isEdit ? "Editar inscrição · " : "Cadastrar "}${selectedChar.name}`
                : "Cadastrar char na pool da Primal"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-mute)] hover:text-[var(--text)] w-8 h-8 rounded-md hover:bg-[var(--background-elev-2)] flex items-center justify-center"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {step !== 3 && !isEdit && (
            <div className="flex items-center gap-2 mb-4 text-[11px] uppercase tracking-wider text-[var(--text-dim)]">
              <StepPill n={1} current={step} label="Escolha" />
              <span className="text-[var(--text-dim)]">→</span>
              <StepPill n={2} current={step} label="Detalhes" />
              <span className="text-[var(--text-dim)]">→</span>
              <StepPill n={3} current={step} label="Pronto" />
            </div>
          )}

          {step === 1 && (
            <Step1Picker
              characters={characters}
              alreadyInPool={alreadyInPool}
              charId={charId}
              onSelect={setCharId}
            />
          )}

          {step === 2 && (
            <Step2Details
              experience={experience}
              setExperience={setExperience}
              hazard={hazard}
              setHazard={setHazard}
              tier={tier}
              tierBg={tierBg}
              turnos={turnos}
              toggleTurno={toggleTurno}
              selectedChar={selectedChar}
              error={error}
            />
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-[var(--ok)]/12 border-2 border-[var(--ok)] text-[var(--ok)] text-3xl flex items-center justify-center mx-auto mb-4">
                ✓
              </div>
              <h3 className="text-[var(--ok)] text-lg font-semibold mb-1">
                {isEdit ? "Inscrição atualizada!" : "Char adicionado à pool!"}
              </h3>
              <p className="text-sm text-[var(--text-mute)] leading-relaxed">
                <strong className="text-[var(--text)]">{savedCharName}</strong>{" "}
                {isEdit
                  ? "teve a inscrição na pool atualizada."
                  : "agora aparece pros líderes formarem PT de Primal."}
              </p>
              {!isEdit && (
                <p className="text-xs text-[var(--text-dim)] mt-3">
                  Pra ajustar disponibilidade ou hazard, edite a inscrição no hub da
                  Primal.
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-2.5 mt-6">
                {!isEdit && (
                  <button
                    type="button"
                    onClick={reset}
                    className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm"
                  >
                    + Adicionar novo personagem
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-4 py-2 rounded-md transition text-sm font-medium ${
                    isEdit
                      ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a]"
                      : "border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] text-[var(--text)]"
                  }`}
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>

        {step !== 3 && (
          <div className="sticky bottom-0 bg-[var(--background-elev)] flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--border)]">
            <span className="text-[11px] text-[var(--text-mute)]">
              {isEdit
                ? "Editar inscrição"
                : step === 1
                  ? "Passo 1 de 2 · escolher char"
                  : "Passo 2 de 2 · detalhes da inscrição"}
            </span>
            <div className="flex gap-2">
              {step === 2 && !isEdit && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={busy}
                  className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] px-3 py-1.5 rounded transition disabled:opacity-60"
                >
                  ← Voltar
                </button>
              )}
              {(step === 1 || isEdit) && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs border border-[var(--border-strong)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)] px-3 py-1.5 rounded transition"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={
                  (step === 1 && !charId) || (step === 2 && !canSubmit)
                }
                className="text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-3 py-1.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === 1
                  ? "Continuar →"
                  : busy
                    ? "Salvando…"
                    : isEdit
                      ? "Salvar alterações"
                      : "Adicionar à pool"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepPill({
  n,
  current,
  label,
}: {
  n: number;
  current: Step;
  label: string;
}) {
  const isActive = current === n;
  const isDone = current > n;
  const cls = isActive
    ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]"
    : isDone
      ? "bg-[var(--ok)]/10 border-[var(--ok)]/40 text-[var(--ok)]"
      : "bg-[var(--background)] border-[var(--border-strong)] text-[var(--text-dim)]";
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}
    >
      {n} · {label}
    </span>
  );
}

function Step1Picker({
  characters,
  alreadyInPool,
  charId,
  onSelect,
}: {
  characters: Character[];
  alreadyInPool: Set<string>;
  charId: string | null;
  onSelect: (id: string) => void;
}) {
  if (characters.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-[var(--border-strong)] rounded-lg">
        <p className="text-sm text-[var(--text-mute)] mb-3">
          Você ainda não tem personagens cadastrados.
        </p>
        <p className="text-xs text-[var(--text-dim)]">
          Cadastre um char no perfil antes de adicioná-lo à pool.
        </p>
      </div>
    );
  }

  return (
    <>
      <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
        Qual char você quer colocar na pool? <span className="text-[var(--danger)]">*</span>
      </label>
      <p className="text-xs text-[var(--text-mute)] mb-3">
        Só aparecem chars com level ≥ {PRIMAL_MIN_LEVEL} que ainda{" "}
        <strong className="text-[var(--text)]">não fizeram</strong> a Primal e que
        ainda não estão na pool.
      </p>

      <div className="space-y-2">
        {characters.map((c) => {
          const alreadyDone = c.questHistory?.primal === true;
          const lowLevel = c.level < PRIMAL_MIN_LEVEL;
          const inPool = alreadyInPool.has(c.id);
          const disabled = alreadyDone || lowLevel || inPool;
          const reason = alreadyDone
            ? "já fez Primal"
            : lowLevel
              ? `level < ${PRIMAL_MIN_LEVEL}`
              : inPool
                ? "já na pool"
                : null;
          const selected = c.id === charId;
          const vocColor = VOC_COLORS[c.vocation] ?? "text-[var(--accent)]";

          return (
            <button
              type="button"
              key={c.id}
              disabled={disabled}
              onClick={() => onSelect(c.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-[1.5px] text-left transition ${
                disabled
                  ? "opacity-50 cursor-not-allowed border-[var(--border-strong)] bg-[var(--background)]"
                  : selected
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
              {disabled ? (
                <span className="text-[10px] font-semibold text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-2 py-0.5 rounded-full">
                  {reason}
                </span>
              ) : (
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
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Step2Details({
  experience,
  setExperience,
  hazard,
  setHazard,
  tier,
  tierBg,
  turnos,
  toggleTurno,
  selectedChar,
  error,
}: {
  experience: boolean | null;
  setExperience: (v: boolean) => void;
  hazard: number;
  setHazard: (v: number) => void;
  tier: { label: string; cls: string };
  tierBg: string;
  turnos: Set<Turno>;
  toggleTurno: (t: Turno) => void;
  selectedChar: Character | null;
  error: string | null;
}) {
  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold">Experiência com Primal Order</h3>
          <RequiredTag />
        </div>
        <p className="text-xs text-[var(--text-mute)] mb-3">
          {selectedChar ? selectedChar.name : "Esse char"} já participou de PTs de
          Primal antes (mesmo sem concluir)?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ExpButton
            icon="🎯"
            title="Sim, tem experiência"
            sub="Já participou de pelo menos 1 tentativa."
            active={experience === true}
            onClick={() => setExperience(true)}
          />
          <ExpButton
            icon="🌱"
            title="Não, primeira vez"
            sub="Iniciante na quest. PT vai me explicar."
            active={experience === false}
            onClick={() => setExperience(false)}
          />
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold">Nível de Hazard do char</h3>
          <RequiredTag />
        </div>
        <p className="text-xs text-[var(--text-mute)] mb-3">
          Mecânica de Hazard da quest. Quanto maior, mais difícil — e mais loot.
          Escala {HAZARD_MIN} a {HAZARD_MAX}.
        </p>
        <div className="p-4 bg-[var(--background)] border border-[var(--border-strong)] rounded-lg">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-bold text-[var(--accent)] tabular-nums">
              {hazard}
            </span>
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${tierBg}`}
            >
              {tier.label}
            </span>
          </div>
          <input
            type="range"
            min={HAZARD_MIN}
            max={HAZARD_MAX}
            value={hazard}
            onChange={(e) => setHazard(parseInt(e.target.value, 10))}
            className="hazard-slider"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-dim)] mt-1 tabular-nums">
            <span>0</span>
            <span>2</span>
            <span>4</span>
            <span>6</span>
            <span>8</span>
            <span>10</span>
            <span>11</span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold">Disponibilidade de horário</h3>
          <RequiredTag label="obrig. ≥1" />
          <TurnosHelp />
        </div>
        <p className="text-xs text-[var(--text-mute)] mb-3">
          Marque todos os turnos em que esse char tá disponível pra fazer Primal.
          Pode escolher mais de um.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {TURNOS.map((t) => {
            const on = turnos.has(t);
            return (
              <button
                type="button"
                key={t}
                onClick={() => toggleTurno(t)}
                className={`p-2.5 rounded-lg border-[1.5px] text-center transition ${
                  on
                    ? "border-[var(--ok)] bg-[var(--ok)]/10 shadow-[inset_0_0_0_1px_var(--ok)]"
                    : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)]"
                }`}
              >
                <span className="text-xl block leading-none">
                  {TURNO_ICONS[t]}
                </span>
                <span
                  className={`block text-[11px] font-semibold mt-1.5 ${
                    on ? "text-[var(--ok)]" : "text-[var(--text-mute)]"
                  }`}
                >
                  {TURNO_LABELS[t]}
                </span>
                <span
                  className={`block text-[9px] tabular-nums mt-0.5 ${
                    on ? "text-[var(--ok)]/70" : "text-[var(--text-dim)]"
                  }`}
                >
                  {TURNO_RANGES[t]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

function ExpButton({
  icon,
  title,
  sub,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-lg border-[1.5px] text-left transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/8 shadow-[inset_0_0_0_1px_var(--accent)]"
          : "border-[var(--border-strong)] bg-[var(--background)] hover:border-[var(--accent-dim)] hover:bg-[var(--background-elev-2)]"
      }`}
    >
      <span className="text-lg block mb-1">{icon}</span>
      <span
        className={`block text-sm font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
      >
        {title}
      </span>
      <span className="block text-[11px] text-[var(--text-mute)] mt-0.5">
        {sub}
      </span>
    </button>
  );
}

function RequiredTag({ label = "obrig." }: { label?: string }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-1.5 py-0.5 rounded-full">
      {label}
    </span>
  );
}

function TurnosHelp() {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative ml-auto"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="w-[18px] h-[18px] rounded-full bg-[var(--background-elev-2)] border border-[var(--border-strong)] text-[var(--text-mute)] text-[11px] font-bold cursor-help flex items-center justify-center"
        aria-label="Ajuda sobre turnos"
      >
        ?
      </button>
      {open && (
        <span className="absolute right-0 top-6 w-[240px] bg-[var(--background)] border border-[var(--border-strong)] rounded-lg p-3 text-[11px] text-[var(--text-mute)] shadow-xl z-10 text-left">
          <strong className="block text-[var(--text)] mb-1.5">
            Intervalos dos turnos
          </strong>
          {TURNOS.map((t) => (
            <span
              key={t}
              className="flex justify-between py-0.5 border-b border-dashed border-[var(--border)] last:border-0"
            >
              <span>
                {TURNO_ICONS[t]} {TURNO_LABELS[t]}
              </span>
              <strong className="text-[var(--text)]">{TURNO_RANGES[t]}</strong>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
