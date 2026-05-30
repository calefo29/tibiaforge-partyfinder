import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
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

/**
 * Mapeia notif type → tab da página da Primal. Usado pelo link da notif pra
 * abrir a página já no tab certo + scroll/highlight do alvo.
 *
 * - apply_received / invite_accepted: ações chegam pro HOST → tab "minhas"
 * - invite_received / application_accepted: ações chegam pro PLAYER → "pts"
 * - party_closed: PT em que o player é membro (não host) → tab "pts"
 * - suggestion_*: PT aleatória → tab "sugestao"
 */
export type PrimalTab = "pool" | "pts" | "sugestao" | "minhas";

export function primalTabForNotif(type: NotificationType): PrimalTab {
  switch (type) {
    case "apply_received":
    case "invite_accepted":
      return "minhas";
    case "invite_received":
    case "application_accepted":
    case "party_closed":
      return "pts";
    case "suggestion_new":
    case "suggestion_closing_soon":
      return "sugestao";
  }
}

/**
 * Monta o link de uma notif da Primal com query params para a página
 * navegar até o contexto exato (tab + PT + slot) e aplicar highlight.
 */
export function buildPrimalNotifLink(input: {
  type: NotificationType;
  partyId?: string;
  slotIndex?: number;
  suggestionId?: string;
}): string {
  const params = new URLSearchParams();
  params.set("tab", primalTabForNotif(input.type));
  if (input.partyId) params.set("partyId", input.partyId);
  if (typeof input.slotIndex === "number") params.set("slot", String(input.slotIndex));
  if (input.suggestionId) params.set("suggestionId", input.suggestionId);
  return `/quest/primal?${params.toString()}`;
}

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
  // Sem orderBy no server pra evitar requerimento de índice composto
  // (equality + orderBy em campos diferentes pede índice). Ordena no client.
  const q = query(notifCol(), where("userId", "==", userId), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapNotif(d));
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      cb(list.slice(0, 30));
    },
    (err) => {
      console.error("subscribeToUserNotifications falhou:", err);
      onError?.(err);
    }
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
