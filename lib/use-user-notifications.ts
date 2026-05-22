"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Notification,
  subscribeToUserNotifications,
} from "./notifications";

/**
 * Hook compartilhado: subscreve às notificações do user e devolve items + count.
 * Pode ser usado por múltiplos consumidores (ex: bell + tab badges).
 *
 * Vive em arquivo separado de `lib/notifications.ts` porque aquele é importado
 * por rotas server-side (cron), e React hooks só funcionam em Client Components.
 */
export function useUserNotifications(userId: string | null | undefined) {
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    const unsub = subscribeToUserNotifications(userId, setItems);
    return () => unsub();
  }, [userId]);

  const unreadCount = useMemo(
    () => items.filter((i) => !i.read).length,
    [items]
  );

  return { items, unreadCount };
}
