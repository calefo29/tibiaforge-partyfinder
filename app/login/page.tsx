"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { ensureUserDoc, mapAuthError } from "@/lib/auth-helpers";
import { Brand } from "../(components)/Brand";
import { GoogleIcon } from "../(components)/GoogleIcon";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/perfil");
  }, [user, loading, router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await ensureUserDoc(cred.user);
      router.replace("/perfil");
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : undefined;
      setError(mapAuthError(code));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(cred.user);
      router.replace("/perfil");
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : undefined;
      setError(mapAuthError(code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Brand size={32} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo de volta</h1>
          <p className="text-[var(--text-mute)] mt-2 text-sm">
            Monte parties organizadas para Primal Order, Soulwar e Brakagore.
          </p>
        </div>

        <div className="bg-[var(--background-elev)] border border-[var(--border)] rounded-lg p-6">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 hover:bg-zinc-100 font-medium py-2.5 rounded-md transition disabled:opacity-60"
          >
            <GoogleIcon />
            Entrar com Google
          </button>

          <div className="flex items-center gap-3 my-5 text-xs text-[var(--text-dim)]">
            <span className="flex-1 h-px bg-[var(--border)]" />
            ou
            <span className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition"
              />
            </div>

            {error && (
              <div className="text-sm text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-medium py-2.5 rounded-md transition disabled:opacity-60"
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--text-dim)] mt-4">
            Primeira vez?{" "}
            <Link href="/cadastro" className="text-[var(--accent)] hover:underline">
              Criar conta
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-[var(--text-dim)] mt-6">
          Standalone · sem scraping · cadastro 100% manual
        </p>
      </div>
    </main>
  );
}
