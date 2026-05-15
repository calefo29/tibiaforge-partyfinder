"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/perfil" : "/login");
  }, [user, loading, router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-[var(--text-mute)] text-sm">Carregando…</p>
    </main>
  );
}
