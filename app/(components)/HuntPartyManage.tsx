"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HuntParty,
  HuntPartyMember,
  fetchAllCharactersOnce,
} from "@/lib/hunts";
import { Character } from "@/lib/characters";

const VOC_COLORS: Record<string, string> = {
  EK: "text-[#fbbf24]",
  ED: "text-[#4ade80]",
  RP: "text-[#a78bfa]",
  MS: "text-[#f87171]",
  EM: "text-[#22d3ee]",
};

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--background-elev)] border border-[var(--border-strong)] rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function MemberRadio({
  member,
  selected,
  onSelect,
}: {
  member: HuntPartyMember;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer transition ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--border)] hover:border-[var(--accent-dim)]"
      }`}
    >
      <input
        type="radio"
        checked={selected}
        onChange={onSelect}
        className="accent-[var(--accent)]"
      />
      <span className={`font-semibold w-7 text-xs ${VOC_COLORS[member.vocation] ?? ""}`}>
        {member.vocation}
      </span>
      <span className="flex-1 text-sm truncate">{member.name}</span>
      <span className="text-xs text-[var(--text-mute)]">{member.level}</span>
    </label>
  );
}

/* ───────── Modal: Sair da PT (não-líder) ───────── */

export function LeavePartyModal({
  onClose,
  onConfirm,
  busy,
}: {
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  return (
    <Backdrop onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Sair da PT</h3>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Você vai perder seu lugar e não poderá voltar a menos que o líder te
            adicione de novo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span>Estou ciente que vou sair da PT.</span>
        </label>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm px-3 py-1.5 border border-[var(--border-strong)] rounded-md hover:bg-[var(--background-elev-2)] transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!agreed || busy}
            className="text-sm px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-400/40 hover:bg-red-500/25 rounded-md transition disabled:opacity-50"
          >
            {busy ? "Saindo..." : "Sair da PT"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/* ───────── Modal: Líder sai (transfere + sai) ───────── */

export function LeaderLeaveModal({
  party,
  onClose,
  onConfirm,
  busy,
}: {
  party: HuntParty;
  onClose: () => void;
  onConfirm: (newOwnerUid: string) => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const candidates = party.members.filter((m) => m.ownerId !== party.ownerId);

  return (
    <Backdrop onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Sair da PT (líder)</h3>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Antes de sair, escolha um novo líder entre os members atuais. Ele
            herda todos os direitos da PT.
          </p>
        </div>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {candidates.map((m) => (
            <MemberRadio
              key={m.characterId}
              member={m}
              selected={picked === m.ownerId}
              onSelect={() => setPicked(m.ownerId)}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span>Confirmo a passagem de liderança e minha saída.</span>
        </label>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm px-3 py-1.5 border border-[var(--border-strong)] rounded-md hover:bg-[var(--background-elev-2)] transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => picked && onConfirm(picked)}
            disabled={!picked || !agreed || busy}
            className="text-sm px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-400/40 hover:bg-red-500/25 rounded-md transition disabled:opacity-50"
          >
            {busy ? "Saindo..." : "Transferir + Sair"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/* ───────── Modal: Transferir liderança (líder fica) ───────── */

export function TransferLeadershipModal({
  party,
  onClose,
  onConfirm,
  busy,
}: {
  party: HuntParty;
  onClose: () => void;
  onConfirm: (newOwnerUid: string) => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const candidates = party.members.filter((m) => m.ownerId !== party.ownerId);

  return (
    <Backdrop onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Transferir liderança</h3>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Você continua na PT como member normal. O escolhido assume os
            direitos de líder.
          </p>
        </div>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {candidates.map((m) => (
            <MemberRadio
              key={m.characterId}
              member={m}
              selected={picked === m.ownerId}
              onSelect={() => setPicked(m.ownerId)}
            />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm px-3 py-1.5 border border-[var(--border-strong)] rounded-md hover:bg-[var(--background-elev-2)] transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => picked && onConfirm(picked)}
            disabled={!picked || busy}
            className="text-sm px-3 py-1.5 bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40 hover:bg-[var(--accent)]/25 rounded-md transition disabled:opacity-50"
          >
            {busy ? "Transferindo..." : "Transferir"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

/* ───────── Modal: Adicionar player ───────── */

export function AddMemberModal({
  party,
  onClose,
  onConfirm,
  busy,
}: {
  party: HuntParty;
  onClose: () => void;
  onConfirm: (member: HuntPartyMember) => void;
  busy: boolean;
}) {
  const [allChars, setAllChars] = useState<Character[] | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    fetchAllCharactersOnce()
      .then(setAllChars)
      .catch(() => setAllChars([]));
  }, []);

  const usedOwners = useMemo(
    () => new Set(party.members.map((m) => m.ownerId)),
    [party.members]
  );
  const usedChars = useMemo(
    () => new Set(party.members.map((m) => m.characterId)),
    [party.members]
  );

  const filtered = useMemo(() => {
    if (!allChars) return [];
    const q = search.trim().toLowerCase();
    return allChars
      .filter((c) => c.server === party.server)
      .filter((c) => !usedOwners.has(c.ownerId))
      .filter((c) => !usedChars.has(c.id))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .slice(0, 50);
  }, [allChars, search, party.server, usedOwners, usedChars]);

  const handleConfirm = () => {
    if (!picked || !allChars) return;
    const c = allChars.find((x) => x.id === picked);
    if (!c) return;
    onConfirm({
      characterId: c.id,
      ownerId: c.ownerId,
      name: c.name,
      vocation: c.vocation,
      level: c.level,
    });
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="p-5 space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Adicionar player</h3>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Apenas chars de <strong>{party.server}</strong> que não estejam na
            PT. 1 char por player.
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome..."
          className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          autoFocus
        />
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {allChars === null && (
            <p className="text-center text-sm text-[var(--text-mute)] py-6">
              Carregando chars...
            </p>
          )}
          {allChars !== null && filtered.length === 0 && (
            <p className="text-center text-sm text-[var(--text-mute)] py-6">
              Nenhum char elegível pra essa PT.
            </p>
          )}
          {filtered.map((c) => {
            const selected = picked === c.id;
            return (
              <label
                key={c.id}
                className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer transition ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--accent-dim)]"
                }`}
              >
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => setPicked(c.id)}
                  className="accent-[var(--accent)]"
                />
                <span className={`font-semibold w-7 text-xs ${VOC_COLORS[c.vocation] ?? ""}`}>
                  {c.vocation}
                </span>
                <span className="flex-1 text-sm truncate">{c.name}</span>
                <span className="text-xs text-[var(--text-mute)]">{c.level}</span>
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm px-3 py-1.5 border border-[var(--border-strong)] rounded-md hover:bg-[var(--background-elev-2)] transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!picked || busy}
            className="text-sm px-3 py-1.5 bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40 hover:bg-[var(--accent)]/25 rounded-md transition disabled:opacity-50"
          >
            {busy ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
