import { NextRequest, NextResponse } from "next/server";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PrimalPoolEntry, Turno } from "@/lib/primal-pool";
import {
  buildBestPartitionForServer,
  computePartitionMeta,
  MatchablePool,
} from "@/lib/primal-matching";
import {
  currentCycleDate,
  nextServerSave,
  SuggestionStatus,
} from "@/lib/primal-suggestions";
import { createNotificationsBulk } from "@/lib/notifications";

// Vercel Cron entrega GET com Authorization: Bearer <CRON_SECRET>
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
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const cycleDate = currentCycleDate(now);
  const expiresAt = nextServerSave(now);

  // 1. Expira sugestões pending/declined antigas
  const oldSnap = await getDocs(
    query(
      collection(db, "primalSuggestions"),
      where("status", "in", ["pending", "declined"])
    )
  );
  if (!oldSnap.empty) {
    const batch = writeBatch(db);
    oldSnap.docs.forEach((d) => {
      batch.update(d.ref, { status: "expired" as SuggestionStatus });
    });
    await batch.commit();
  }
  const expiredCount = oldSnap.size;

  // 2. Lê pool ativa cadastrada antes do cycleStart (cycleStart = 10h BRT de hoje)
  const cycleStartUTC = new Date(expiresAt);
  cycleStartUTC.setUTCDate(cycleStartUTC.getUTCDate() - 1); // server save anterior
  const poolSnap = await getDocs(
    query(collection(db, "primalPool"), where("status", "==", "active"))
  );
  const allPool: PrimalPoolEntry[] = poolSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ownerId: data.ownerId,
      characterId: data.characterId,
      experience: data.experience ?? false,
      hazard: data.hazard ?? 0,
      availability: (data.availability ?? []) as Turno[],
      status: data.status ?? "active",
      registeredAt: data.registeredAt ?? null,
      updatedAt: data.updatedAt ?? null,
      characterName: data.characterName ?? "",
      vocation: data.vocation ?? "",
      level: data.level ?? 0,
      server: data.server ?? "",
    };
  });

  // 3. Exclui chars locked (em PT closed)
  const closedSnap = await getDocs(
    query(collection(db, "primalParties"), where("status", "==", "closed"))
  );
  const lockedCharIds = new Set<string>();
  closedSnap.docs.forEach((d) => {
    const slots = (d.data().slots ?? []) as Array<{
      entry?: { characterId?: string };
    }>;
    slots.forEach((s) => {
      if (s.entry?.characterId) lockedCharIds.add(s.entry.characterId);
    });
  });

  // 4. Filtra: registrado antes do cycleStart, voc válida, não locked
  const eligible: MatchablePool[] = allPool
    .filter((e) => {
      if (!e.vocation || !e.characterName) return false;
      if (lockedCharIds.has(e.characterId)) return false;
      const reg = e.registeredAt?.toMillis?.() ?? 0;
      if (reg === 0) return true; // sem timestamp, deixa passar (legacy)
      return reg < cycleStartUTC.getTime();
    })
    .map((e) => ({ ...e, vocation: e.vocation as MatchablePool["vocation"] }));

  // 5. Agrupa por server e roda matching
  const byServer = new Map<string, MatchablePool[]>();
  eligible.forEach((e) => {
    if (!byServer.has(e.server)) byServer.set(e.server, []);
    byServer.get(e.server)!.push(e);
  });

  const createdSuggestions: Array<{ server: string; count: number }> = [];

  for (const [server, serverPool] of byServer.entries()) {
    const partitions = buildBestPartitionForServer(serverPool, 50);
    if (partitions.length === 0) continue;

    for (const slots of partitions) {
      const meta = computePartitionMeta(slots);
      const ref = await addDoc(collection(db, "primalSuggestions"), {
        cycleDate,
        server,
        slots,
        acceptedBy: [],
        declinedBy: null,
        status: "pending" as SuggestionStatus,
        commonTurns: meta.commonTurns,
        levelAvg: meta.levelAvg,
        experiencedCount: meta.experiencedCount,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
      });

      // Notifica os 5 players sorteados — uma notif por owner.
      const ownerIds = slots
        .map((s) => s.ownerId)
        .filter(
          (uid): uid is string =>
            !!uid && !uid.startsWith("dummy_")
        );
      if (ownerIds.length > 0) {
        await createNotificationsBulk(ownerIds, {
          type: "suggestion_new",
          title: "PT aleatória formada!",
          body: `Você foi sorteado pra uma PT no ${server}. Avalie e aceite/recuse até o próximo SS.`,
          link: "/quest/primal",
          meta: { suggestionId: ref.id, server },
        });
      }
    }
    createdSuggestions.push({ server, count: partitions.length });
  }

  const created = createdSuggestions.reduce((acc, x) => acc + x.count, 0);

  return NextResponse.json({
    ok: true,
    cycleDate,
    expiredCount,
    poolSize: allPool.length,
    eligibleSize: eligible.length,
    lockedCount: lockedCharIds.size,
    created,
    byServer: createdSuggestions,
  });
}

// Endpoint manual pra testar em dev (mesma rota, POST). Desabilitado em prod.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "dev only" }, { status: 403 });
  }
  return GET(req);
}
