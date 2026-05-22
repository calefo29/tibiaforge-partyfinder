"use client";

import { useState } from "react";
import type { Vocation } from "@/lib/characters";
import { Turno, TURNO_ICONS, TURNO_LABELS } from "@/lib/primal-pool";

const VOCS: Vocation[] = ["EK", "ED", "RP", "MS", "EM"];
const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};
const TURNOS: Turno[] = ["manha", "tarde", "noite", "madrugada"];

export type PartyFiltersState = {
  server: string; // "" = todos
  schedule: Set<Turno>;
  maxMinLevel: number; // 0 = inativo
  maxMinHazard: number; // 0 = inativo
  vocsNeeded: Set<Vocation>;
  hostQuery: string;
};

export const EMPTY_PARTY_FILTERS: PartyFiltersState = {
  server: "",
  schedule: new Set(),
  maxMinLevel: 0,
  maxMinHazard: 0,
  vocsNeeded: new Set(),
  hostQuery: "",
};

export function countActiveFilters(f: PartyFiltersState): number {
  let n = 0;
  if (f.server) n++;
  if (f.schedule.size > 0) n++;
  if (f.maxMinLevel > 0) n++;
  if (f.maxMinHazard > 0) n++;
  if (f.vocsNeeded.size > 0) n++;
  if (f.hostQuery.trim()) n++;
  return n;
}

type Props = {
  value: PartyFiltersState;
  onChange: (next: PartyFiltersState) => void;
  /** Lista de servers disponíveis nas PTs atuais (pra montar o select). */
  availableServers: string[];
  totalCount: number;
  filteredCount: number;
};

export function PartyListFilters({
  value,
  onChange,
  availableServers,
  totalCount,
  filteredCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(value);

  const patch = (delta: Partial<PartyFiltersState>) =>
    onChange({ ...value, ...delta });

  const toggleSchedule = (t: Turno) => {
    const next = new Set(value.schedule);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    patch({ schedule: next });
  };

  const toggleVoc = (v: Vocation) => {
    const next = new Set(value.vocsNeeded);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    patch({ vocsNeeded: next });
  };

  const clearAll = () => onChange(EMPTY_PARTY_FILTERS);

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--background-elev)]/40 mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--background-elev-2)]/40 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <span className="text-sm font-semibold">Filtros</span>
          {active > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[#04122a]">
              {active}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-mute)]">
          <span>
            {filteredCount} de {totalCount} PT{totalCount === 1 ? "" : "s"}
          </span>
          <span className="text-base leading-none">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
          {/* Linha 1: Server + Host search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-1">
                Servidor
              </label>
              <select
                value={value.server}
                onChange={(e) => patch({ server: e.target.value })}
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">Todos</option>
                {availableServers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-1">
                Buscar host
              </label>
              <input
                type="text"
                value={value.hostQuery}
                onChange={(e) => patch({ hostQuery: e.target.value })}
                placeholder="Nome do char host..."
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Linha 2: Level + Hazard */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-1">
                Level máx exigido (seu char)
              </label>
              <input
                type="number"
                min={0}
                value={value.maxMinLevel || ""}
                onChange={(e) =>
                  patch({ maxMinLevel: Number(e.target.value) || 0 })
                }
                placeholder="ex: 700"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-1">
                Hazard máx exigido
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={value.maxMinHazard || ""}
                onChange={(e) =>
                  patch({ maxMinHazard: Number(e.target.value) || 0 })
                }
                placeholder="ex: 25"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Linha 3: Turnos */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-1">
              Horário
            </label>
            <div className="flex flex-wrap gap-1">
              {TURNOS.map((t) => {
                const active = value.schedule.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleSchedule(t)}
                    className={`text-[11px] px-2 py-1 rounded border transition flex items-center gap-1 ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "border-[var(--border-strong)] text-[var(--text-mute)] hover:border-[var(--accent-dim)]"
                    }`}
                  >
                    <span>{TURNO_ICONS[t]}</span>
                    <span>{TURNO_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Linha 4: Vocs precisando */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-dim)] font-semibold mb-1">
              Vagas abertas pra (vocação)
            </label>
            <div className="flex flex-wrap gap-1">
              {VOCS.map((v) => {
                const active = value.vocsNeeded.has(v);
                const colorCls = VOC_COLORS[v] ?? "text-[var(--accent)]";
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVoc(v)}
                    className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded border transition ${colorCls} ${
                      active
                        ? "border-current bg-[var(--background-elev-2)]"
                        : "border-[var(--border-strong)] bg-[var(--background-elev-2)]/60 hover:border-current"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {active > 0 && (
            <div className="pt-2 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-[var(--text-mute)] hover:text-[var(--text)] border border-[var(--border-strong)] hover:border-[var(--danger)]/50 px-3 py-1 rounded transition"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
