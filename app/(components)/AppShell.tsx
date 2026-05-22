"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./AppSidebar";
import { Brand } from "./Brand";
import { NotificationBell } from "./NotificationBell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Fecha drawer ao trocar de rota.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar mobile com hamburger */}
        <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border)] bg-[var(--background-elev)]/90 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="text-[var(--text)] p-1.5 rounded hover:bg-[var(--background-elev-2)] transition"
            aria-label="Abrir menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <Brand />
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
