"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Brand } from "../(components)/Brand";

export default function PerfilPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

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

        <div className="bg-[var(--background-elev)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="font-semibold mb-3">Conta criada ✓</h2>
          <p className="text-sm text-[var(--text-mute)]">
            Auth funcionando. Próximo passo: cadastro de personagens (nome, vocação, level, servidor).
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[var(--text-dim)] font-mono">
            <div>
              <span className="text-[var(--text-mute)]">UID:</span> {user.uid}
            </div>
            <div>
              <span className="text-[var(--text-mute)]">Provider:</span>{" "}
              {user.providerData[0]?.providerId ?? "—"}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
