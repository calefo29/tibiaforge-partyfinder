"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useUserNotifications } from "@/lib/use-user-notifications";
import { Brand } from "./Brand";

type Props = {
  /** Quando true, renderiza como drawer overlay (mobile). */
  mobileOpen?: boolean;
  /** Callback chamado ao fechar o drawer (mobile). */
  onClose?: () => void;
};

export function AppSidebar({ mobileOpen = false, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { items: notifItems } = useUserNotifications(user?.uid);

  // Conta notifs nao-lidas por quest, baseado no link de cada notif.
  const primalUnread = notifItems.filter(
    (n) => !n.read && (n.link ?? "").startsWith("/quest/primal")
  ).length;

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  const initial = (user?.displayName || user?.email || "?")
    .charAt(0)
    .toUpperCase();

  const handleNavClick = () => {
    // Ao clicar em qualquer link no drawer mobile, fecha o drawer.
    if (onClose) onClose();
  };

  return (
    <>
      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`
          flex flex-col bg-[var(--background-elev)]/95 md:bg-[var(--background-elev)]/40
          border-r border-[var(--border)]
          w-[260px] shrink-0
          md:sticky md:top-0 md:min-h-screen md:translate-x-0
          fixed inset-y-0 left-0 z-40 min-h-screen
          transition-transform duration-200 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:!translate-x-0
        `}
      >
        <div className="px-5 py-5 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <Brand />
          {/* Botão X só aparece no mobile */}
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-[var(--text-mute)] hover:text-[var(--text)] text-xl leading-none px-2"
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4">
          <Link
            href="/perfil?new=1"
            onClick={handleNavClick}
            className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#04122a] font-semibold py-2.5 rounded-md transition text-sm"
          >
            <span className="text-base leading-none">+</span> Cadastrar novo char
          </Link>
        </div>

        <nav className="flex-1 px-3 pb-4 space-y-1">
          <SectionLabel>Conta</SectionLabel>
          <SideLink
            href="/perfil"
            icon="👤"
            label="Meus personagens"
            active={pathname === "/perfil"}
            onClick={handleNavClick}
          />

          <SectionLabel className="mt-5">Quests</SectionLabel>
          <SideLink
            href="/quest/primal"
            icon="⚔️"
            label="The Primal Order"
            active={pathname?.startsWith("/quest/primal")}
            notifCount={primalUnread}
            onClick={handleNavClick}
          />
          <SideLink
            href="/quest/soulwar"
            icon="💀"
            label="Soulwar"
            active={pathname?.startsWith("/quest/soulwar")}
            badge="em breve"
            onClick={handleNavClick}
          />

          <SectionLabel className="mt-5">Hunts</SectionLabel>
          <SideLink
            href="/hunts/planilhado"
            icon="📅"
            label="Planilhado"
            active={pathname?.startsWith("/hunts/planilhado")}
            onClick={handleNavClick}
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
    </>
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
  notifCount,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  active?: boolean;
  badge?: string;
  notifCount?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${
        active
          ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30"
          : "text-[var(--text-mute)] hover:bg-[var(--background-elev-2)] hover:text-[var(--text)] border border-transparent"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {notifCount && notifCount > 0 ? (
        <span
          className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center leading-none"
          aria-label={`${notifCount} notificação(ões) não lida(s)`}
        >
          {notifCount > 9 ? "9+" : notifCount}
        </span>
      ) : null}
      {badge && (
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--background-elev-2)] border border-[var(--border-strong)] text-[var(--text-dim)]">
          {badge}
        </span>
      )}
    </Link>
  );
}
