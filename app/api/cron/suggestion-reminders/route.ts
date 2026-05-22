import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createNotificationsBulk } from "@/lib/notifications";

// Roda a ~3h antes do próximo SS (10h UTC = 07h BRT, SS é 13h UTC).
// Dispara alerta "faltando 3h" pros players que ainda não aceitaram a sugestão.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado" },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // Lê todas as sugestões pending
  const snap = await getDocs(
    query(collection(db, "primalSuggestions"), where("status", "==", "pending"))
  );

  let totalNotified = 0;
  const perSuggestion: Array<{ id: string; notified: number }> = [];

  for (const d of snap.docs) {
    const data = d.data();
    const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
    if (!expiresAt) continue;
    const hoursLeft = (expiresAt - Date.now()) / (1000 * 60 * 60);
    // Janela: entre 2h e 4h faltando. Evita disparar fora.
    if (hoursLeft < 2 || hoursLeft > 4) continue;

    const slots = (data.slots ?? []) as Array<{ ownerId?: string }>;
    const acceptedBy: string[] = data.acceptedBy ?? [];
    const acceptedSet = new Set(acceptedBy);

    // Notifica só quem AINDA NÃO aceitou
    const pendingOwners = slots
      .map((s) => s.ownerId)
      .filter(
        (uid): uid is string =>
          !!uid && !uid.startsWith("dummy_") && !acceptedSet.has(uid)
      );

    if (pendingOwners.length === 0) continue;

    await createNotificationsBulk(pendingOwners, {
      type: "suggestion_closing_soon",
      title: "⏰ Faltam ~3h pra fechar!",
      body: `Você ainda não aceitou a PT aleatória no ${data.server ?? "seu mundo"}. Confirme ou ela vai expirar.`,
      link: "/quest/primal",
      meta: { suggestionId: d.id, server: data.server ?? "" },
    });

    totalNotified += pendingOwners.length;
    perSuggestion.push({ id: d.id, notified: pendingOwners.length });
  }

  return NextResponse.json({
    ok: true,
    suggestionsChecked: snap.size,
    totalNotified,
    perSuggestion,
  });
}

// Endpoint manual pra testar em dev (mesma rota, POST). Desabilitado em prod.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "dev only" }, { status: 403 });
  }
  return GET(req);
}
