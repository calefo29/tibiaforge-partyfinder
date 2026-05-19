import { NextRequest, NextResponse } from "next/server";
import {
  collection,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Scope = "parties" | "suggestions" | "all";

async function wipeCollection(name: string): Promise<number> {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return 0;
  const docs = snap.docs;
  let deleted = 0;
  // Firestore writeBatch limit: 500 operações por batch
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function handle(req: NextRequest) {
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

  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "all") as Scope;
  if (!["parties", "suggestions", "all"].includes(scope)) {
    return NextResponse.json(
      { ok: false, error: "scope inválido (parties|suggestions|all)" },
      { status: 400 }
    );
  }

  const result: Record<string, number> = {};
  if (scope === "parties" || scope === "all") {
    result.primalParties = await wipeCollection("primalParties");
  }
  if (scope === "suggestions" || scope === "all") {
    result.primalSuggestions = await wipeCollection("primalSuggestions");
  }

  return NextResponse.json({ ok: true, scope, deleted: result });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
