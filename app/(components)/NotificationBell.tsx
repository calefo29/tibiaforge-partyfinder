"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  Notification,
  subscribeToUserNotifications,
} from "@/lib/notifications";

const TYPE_ICON: Record<string, string> = {
  apply_received: "📥",
  invite_received: "✉️",
  application_accepted: "✅",
  invite_accepted: "🤝",
  party_closed: "🔒",
  suggestion_new: "✨",
  suggestion_closing_soon: "⏰",
};

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Subscribe
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserNotifications(user.uid, setItems);
    return () => unsub();
  }, [user]);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((i) => !i.read).length,
    [items]
  );

  const handleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      // Ao abrir, marca todas como lidas (zera o contador).
      if (next && user && unreadCount > 0) {
        markAllNotificationsAsRead(user.uid).catch(() => {});
      }
      return next;
    });
  };

  const handleItemClick = (item: Notification) => {
    if (!item.read) markNotificationAsRead(item.id);
    setOpen(false);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative p-1.5 rounded-md text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-[var(--background-elev-2)] transition"
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-24px)] bg-[var(--background-elev)] border border-[var(--border-strong)] rounded-lg shadow-2xl overflow-hidden z-50"
        >
          <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-mute)]">
              Notificações
            </span>
            <span className="text-[10px] text-[var(--text-dim)]">
              {items.length === 0 ? "vazio" : `${items.length} recentes`}
            </span>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="text-center text-xs text-[var(--text-mute)] py-8 px-4">
                Nada por aqui ainda.
                <br />
                <span className="text-[var(--text-dim)]">
                  Atividades nas suas PTs aparecem aqui.
                </span>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onClick,
}: {
  item: Notification;
  onClick: () => void;
}) {
  const icon = TYPE_ICON[item.type] ?? "🔔";
  const ago = timeAgo(item.createdAt?.toMillis?.() ?? Date.now());

  const content = (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-[var(--background-elev-2)] transition cursor-pointer ${
        !item.read ? "bg-[var(--accent)]/5" : ""
      }`}
      onClick={onClick}
    >
      <span className="text-base shrink-0 leading-none mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--text)] leading-snug">
          {item.title}
        </div>
        {item.body && (
          <div className="text-[11px] text-[var(--text-mute)] mt-0.5 leading-snug">
            {item.body}
          </div>
        )}
        <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{ago}</div>
      </div>
      {!item.read && (
        <span
          className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0 mt-1.5"
          aria-label="Não lida"
        />
      )}
    </div>
  );

  if (item.link) {
    return (
      <li>
        <Link href={item.link} className="block">
          {content}
        </Link>
      </li>
    );
  }
  return <li>{content}</li>;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(ts).toLocaleDateString("pt-BR");
}
