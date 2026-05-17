"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Character, subscribeToUserCharacters } from "@/lib/characters";
import { Brand } from "../(components)/Brand";
import { CharacterCard } from "../(components)/CharacterCard";
import { CharacterModal } from "../(components)/CharacterModal";

export default function PerfilPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const [chars, setChars] = useState<Character[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (c: Character) => {
    setEditing(c);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserCharacters(
      user.uid,
      (list) => {
        setChars(list);
        setListError(null);
      },
      (err) => setListError(err.message)
    );
    return () => unsub();
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-mute)] text-sm">Carregando…</p>
      </main>
    );
  }

  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <>
      <nav className="sticky top-0 z-10 bg-[var(--background)]/90 backdrop-blur border-b border-[var(--border)] px-8 py-3.5 flex items-center justify-between">
        <Brand />
        <button
          onClick={handleLogout}
          className="text-sm text-[var(--text-mute)] hover:text-[var(--text)] border border-[var(--border-strong)] hover:border-[var(--accent-dim)] rounded-md px-4 py-1.5 transition"
        >
          Sair
        </button>
      </nav>

      <main className="max-w-[1200px] mx-auto px-8 py-12">
        <div className="flex items-center gap-5 mb-10">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold bg-gradient-to-br from-[var(--accent-dim)] to-[var(--background-elev-2)]">
            {initial}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">
              {user.displayName || user.email?.split("@")[0]}
            </h1>
            <p className="text-sm text-[var(--text-mute)] mt-1">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Meus personagens</h2>
          <button
            type="button"
            onClick={openCreate}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm"
          >
            + Adicionar personagem
          </button>
        </div>

        {listError && (
          <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2 mb-4">
            Erro ao carregar personagens: {listError}
          </div>
        )}

        {chars === null ? (
          <div className="text-[var(--text-mute)] text-sm py-8 text-center">
            Carregando personagens…
          </div>
        ) : chars.length === 0 ? (
          <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-12 text-center">
            <strong className="block text-[15px] mb-1">Nenhum personagem ainda</strong>
            <p className="text-sm text-[var(--text-mute)]">
              Clica em &quot;+ Adicionar personagem&quot; pra cadastrar o primeiro.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {chars.map((c) => (
              <CharacterCard key={c.id} char={c} onEdit={openEdit} />
            ))}
          </div>
        )}

        <div className="mt-12 bg-gradient-to-br from-[var(--accent)]/6 to-[var(--accent)]/0 border border-[var(--border)] rounded-lg p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-base font-semibold mb-1">
                The Primal Order — pool de chars
              </h3>
              <p className="text-sm text-[var(--text-mute)]">
                Cadastre seus chars na pool da Primal pra ficarem disponíveis pros líderes
                formarem PT.
              </p>
            </div>
            <Link
              href="/quest/primal"
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium px-4 py-2 rounded-md transition text-sm whitespace-nowrap"
            >
              Ir pro hub →
            </Link>
          </div>
        </div>
      </main>

      <CharacterModal
        open={modalOpen}
        ownerId={user.uid}
        editing={editing}
        onClose={closeModal}
      />
    </>
  );
}
