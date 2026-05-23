"use client";

export type ScopeMode = "all" | "host" | "accepted";

type Props = {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  serverValue: string;
  onServerChange: (v: string) => void;
  availableServers: string[];
  /** Se passado, renderiza o toggle de 3 modos (PTs criadas). */
  scope?: ScopeMode;
  onScopeChange?: (s: ScopeMode) => void;
  totalCount?: number;
  filteredCount?: number;
};

const SCOPES: { value: ScopeMode; label: string; icon: string }[] = [
  { value: "all", label: "Todas", icon: "🌐" },
  { value: "host", label: "Sou host", icon: "👑" },
  { value: "accepted", label: "Fui aceito", icon: "✅" },
];

export function SimpleFilters({
  searchValue,
  onSearchChange,
  searchPlaceholder = "🔍 Buscar por nome de char...",
  serverValue,
  onServerChange,
  availableServers,
  scope,
  onScopeChange,
  totalCount,
  filteredCount,
}: Props) {
  return (
    <div className="bg-[var(--background-elev)]/40 border border-[var(--border)] rounded-lg p-2.5 mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 min-w-[180px] bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
        />
        <select
          value={serverValue}
          onChange={(e) => onServerChange(e.target.value)}
          className="bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
        >
          <option value="">Todos servers</option>
          {availableServers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {typeof totalCount === "number" && typeof filteredCount === "number" && (
          <span className="text-[11px] text-[var(--text-mute)] whitespace-nowrap">
            {filteredCount} de {totalCount}
          </span>
        )}
      </div>

      {scope !== undefined && onScopeChange && (
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => {
            const active = scope === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onScopeChange(s.value)}
                className={`text-[11px] px-2.5 py-1 rounded border transition flex items-center gap-1 ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] font-semibold"
                    : "border-[var(--border-strong)] text-[var(--text-mute)] hover:border-[var(--accent-dim)]"
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
