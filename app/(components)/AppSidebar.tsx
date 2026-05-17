"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Brand } from "./Brand";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  const initial = (user?.displayName || user?.email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <aside className="w-[260px] shrink-0 border-r border-[var(--border)] bg-[var(--background-elev)]/40 min-h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 border-b border-[var(--border)]">
        <Brand />
      </div>

      <div className="px-4 py-4">
        <Link
          href="/perfil?new=1"
          className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-semibold py-2.5 rounded-md transition text-sm"
        >
          <span className="text-base leading-none">+</span> Cadastrar novo char
        </Link>
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-1">
        <SectionLabel>Quests</SectionLabel>
        <SideLink
          href="/quest/primal"
          icon="⚔️"
          label="The Primal Order"
          active={pathname?.startsWith("/quest/primal")}
        />
        <SideLink
          href="/quest/soulwar"
          icon="💀"
          label="Soulwar"
          active={pathname?.startsWith("/quest/soulwar")}
          badge="em breve"
        />

        <SectionLabel className="mt-5">Conta</SectionLabel>
        <SideLink
          href="/perfil"
          icon="👤"
          label="Meus personagens"
          active={pathname === "/perfil"}
        />
      </nav>

      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent-dim)] to-[var(--background-elev-2)] flex items-center justify-center font-semibold">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {user?.displayName || user?.email?.split("@")[0]}
            </div>
            <div className="text-[11px] text-[var(--text-mute)] truncate">
              {user?.email}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-xs text-[var(--text-mute)] hover:text-[var(--text)] border border-[var(--border-strong)] hover:border-[var(--accent-dim)] rounded-md py-1.5 transition"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-wider text-[var(--text-dim)] px-3 mb-2 ${className}`}
    >
      {children}
    </div>
  );
}

function SideLink({
  href,
  icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${
        active
          ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
          : "text-[var(--text-mute)] hover:bg-[var(--background-elev-2)] hover:text-[var(--text)] border border-transparent"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--background-elev-2)] border border-[var(--border-strong)] text-[var(--text-dim)]">
          {badge}
        </span>
      )}
    </Link>
  );
}
