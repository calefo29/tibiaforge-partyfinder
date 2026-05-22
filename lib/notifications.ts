import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";

export type NotificationType =
  // Eventos de PT manual (formador)
  | "apply_received" // host: alguém aplicou na sua vaga
  | "invite_received" // player: host te convidou
  | "application_accepted" // player: host aceitou sua candidatura
  | "invite_accepted" // host: player aceitou seu convite
  | "party_closed" // player (não-host): PT foi fechada
  // Eventos da Sugestão Automática
  | "suggestion_new" // player: PT aleatória formada, avalie
  | "suggestion_closing_soon"; // player: faltam ~3h e você não aceitou ainda

export type Notification = {
  id: string;
  userId: string; // recipient
  type: NotificationType;
  title: string;
  body?: string;
  /** Rota relativa pra navegar quando clicar. */
  link?: string;
  read: boolean;
  createdAt: Timestamp | null;
  /** Metadados livres (partyId, suggestionId, etc) — útil pra deduplicar. */
  meta?: Record<string, string | number | boolean>;
};

const COL = "notifications";

function notifCol() {
  return collection(db, COL);
}

/**
 * Cria uma notificação. Falhas são silenciadas (notif não é crítica — não
 * queremos derrubar uma mutation por causa disso).
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, string | number | boolean>;
}) {
  if (!input.userId) return;
  try {
    const payload: Record<string, unknown> = {
      userId: input.userId,
      type: input.type,
      title: input.title,
      read: false,
      createdAt: serverTimestamp(),
    };
    if (input.body) payload.body = input.body;
    if (input.link) payload.link = input.link;
    if (input.meta) payload.meta = input.meta;
    await addDoc(notifCol(), payload);
  } catch (err) {
    // Notif é best-effort. Loga e segue.
    console.error("createNotification falhou:", err);
  }
}

/** Cria N notificações em batch (uma por destinatário, mesmo conteúdo). */
export async function createNotificationsBulk(
  userIds: string[],
  base: {
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
    meta?: Record<string, string | number | boolean>;
  }
) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return;
  try {
    // addDoc não suporta batch; criamos individualmente.
    await Promise.all(
      unique.map((uid) =>
        addDoc(notifCol(), {
          userId: uid,
          type: base.type,
          title: base.title,
          body: base.body ?? null,
          link: base.link ?? null,
          meta: base.meta ?? null,
          read: false,
          createdAt: serverTimestamp(),
        })
      )
    );
  } catch (err) {
    console.error("createNotificationsBulk falhou:", err);
  }
}

export function subscribeToUserNotifications(
  userId: string,
  cb: (items: Notification[]) => void,
  onError?: (err: Error) => void
) {
  // 30 mais recentes. Sem filtro de read no servidor pra evitar índice composto.
  const q = query(
    notifCol(),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapNotif(d));
      cb(list);
    },
    onError
  );
}

function mapNotif(
  d: import("firebase/firestore").QueryDocumentSnapshot
): Notification {
  const data = d.data();
  return {
    id: d.id,
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body ?? undefined,
    link: data.link ?? undefined,
    read: data.read ?? false,
    createdAt: data.createdAt ?? null,
    meta: data.meta ?? undefined,
  };
}

/**
 * Marca todas as notif não-lidas do usuário como lidas.
 * Filtra `read === false` no client pra evitar índice composto no Firestore.
 */
export async function markAllNotificationsAsRead(userId: string) {
  if (!userId) return;
  const snap = await getDocs(
    query(notifCol(), where("userId", "==", userId), limit(50))
  );
  const unread = snap.docs.filter((d) => d.data().read === false);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  unread.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

/** Marca uma notificação específica como lida. */
export async function markNotificationAsRead(id: string) {
  try {
    await updateDoc(doc(db, COL, id), { read: true });
  } catch (err) {
    console.error("markNotificationAsRead falhou:", err);
  }
}

/**
 * Hook compartilhado: subscreve às notificações do user e devolve items + count.
 * Pode ser usado por múltiplos consumidores (ex: bell + tab badges).
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
