import { NextResponse } from "next/server";

/**
 * Lista de fallback caso o scrape do rubinot.com falhe.
 * Capturado em mai/2026. Atualiza automaticamente via /api/servers quando o site
 * oficial está acessível.
 */
const FALLBACK_SERVERS = [
  { name: "Auroria", pvp: "Open PvP" },
  { name: "Belaria", pvp: "Open PvP" },
  { name: "Bellum", pvp: "Retro PvP" },
  { name: "Cellenium", pvp: "Retro PvP" },
  { name: "Divinian", pvp: "Optional PvP" },
  { name: "Elysian", pvp: "Optional PvP" },
  { name: "Etherian", pvp: "Optional PvP" },
  { name: "Grimoria I", pvp: "Open PvP" },
  { name: "Grimoria II", pvp: "Open PvP" },
  { name: "Grimoria III", pvp: "Open PvP" },
  { name: "Grimoria IV", pvp: "Open PvP" },
  { name: "Halorian", pvp: "Optional PvP" },
  { name: "Lunarian", pvp: "Optional PvP" },
  { name: "Mystian", pvp: "Optional PvP" },
  { name: "Serenian", pvp: "Optional PvP" },
  { name: "Solarian", pvp: "Optional PvP" },
  { name: "Spectrum", pvp: "Retro PvP" },
  { name: "Tenebrium", pvp: "Retro PvP" },
  { name: "Vesperia", pvp: "Open PvP" },
];

export type ServerInfo = { name: string; pvp: string };

export type ServersResponse = {
  servers: ServerInfo[];
  source: "live" | "fallback";
  updatedAt: string;
  error?: string;
};

/**
 * GET /api/servers
 * Faz scrape da home do rubinot.com pra pegar lista de mundos atualizada.
 * Cache de 24h via fetch revalidate. Se falhar, devolve fallback hardcoded.
 */
export async function GET() {
  try {
    const res = await fetch("https://rubinot.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (TibiaForge Party Finder)",
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const servers = parseWorlds(html);

    if (servers.length === 0) throw new Error("Nenhum mundo extraído do HTML");

    return NextResponse.json<ServersResponse>({
      servers: servers.sort((a, b) => a.name.localeCompare(b.name)),
      source: "live",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json<ServersResponse>({
      servers: FALLBACK_SERVERS,
      source: "fallback",
      error: err instanceof Error ? err.message : "Erro desconhecido",
      updatedAt: new Date().toISOString(),
    });
  }
}

function parseWorlds(html: string): ServerInfo[] {
  // Padrão observado no HTML do rubinot.com:
  //   <p class="... text-amber-500">Halorian</p>
  //   <p class="text-sm text-white/60">Optional PvP</p>
  const pattern = /text-amber-500[^"]*"[^>]*>([^<]+)<\/p>\s*<p[^>]*>([^<]+)<\/p>/g;
  const seen = new Set<string>();
  const out: ServerInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const name = m[1].trim();
    const pvp = m[2].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push({ name, pvp });
    }
  }
  return out;
}
