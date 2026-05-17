"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/app/(components)/AppShell";

export default function SoulwarHubPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-mute)] text-sm">Carregando…</p>
      </main>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1180px] mx-auto px-8 py-8">
        <div className="bg-gradient-to-br from-[var(--accent)]/8 to-[var(--accent)]/0 border border-[var(--border)] rounded-xl p-6 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Soulwar</h1>
          <p className="text-sm text-[var(--text-mute)] mt-1">
            Hub da quest · em construção
          </p>
        </div>

        <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">💀</div>
          <strong className="block text-lg mb-2">Soulwar em breve</strong>
          <p className="text-sm text-[var(--text-mute)] max-w-md mx-auto">
            Vamos replicar a estrutura da Primal Order pra Soulwar assim que ela
            estiver redonda. As regras de composição e level mínimo serão definidas
            com o Lucas.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
