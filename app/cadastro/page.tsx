"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { ensureUserDoc, mapAuthError } from "@/lib/auth-helpers";
import { Brand } from "../(components)/Brand";
import { GoogleIcon } from "../(components)/GoogleIcon";

export default function CadastroPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/perfil");
  }, [user, loading, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
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
          <h1 className="text-3xl font-semibold tracking-tight">Criar conta</h1>
          <p className="text-[var(--text-mute)] mt-2 text-sm">
            Cadastre seus personagens e ache PTs organizadas.
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
            Cadastrar com Google
          </button>

          <div className="flex items-center gap-3 my-5 text-xs text-[var(--text-dim)]">
            <span className="flex-1 h-px bg-[var(--border)]" />
            ou
            <span className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[var(--text-mute)] mb-1.5">
                Nome (apelido)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como te chamam no jogo"
                className="w-full bg-[var(--background)] border border-[var(--border-strong)] rounded-md px-3 py-2.5 outline-none focus:border-[var(--accent)] transition"
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
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
              {busy ? "Criando conta…" : "Criar conta"}
            </button>
          </form>

          <p className="text-center text-xs text-[var(--text-dim)] mt-4">
            Já tem conta?{" "}
            <Link href="/login" className="text-[var(--accent)] hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
