import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TrackMapEntry = {
  position: number;
  driver: string;
  team: string;
  accent: string;
  x: number | null;
  y: number | null;
  z: number | null;
  angle: number | null;
};

type TrackMapState = {
  sessionId: string;
  updatedAtMs: number;
  trackMap: { circuit?: string; length?: number } | null;
  entries: TrackMapEntry[];
};

const LIVE_TIMING_APP_CONFIG_KEY = "liveTimingState";

function getState(): TrackMapState {
  const g = globalThis as typeof globalThis & { __mrlLiveTimingState?: unknown };
  const existing = g.__mrlLiveTimingState;
  if (!existing || typeof existing !== "object") {
    const next: TrackMapState = {
      sessionId: "default",
      updatedAtMs: 0,
      trackMap: null,
      entries: []
    };
    return next;
  }
  return existing as TrackMapState;
}

async function loadRawFromDb() {
  const row = await prisma.appConfig
    .findUnique({ where: { key: LIVE_TIMING_APP_CONFIG_KEY } })
    .catch(() => null);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const state = getState();
  const stateRec = state as unknown as Record<string, unknown>;
  const stateUpdatedAt = typeof stateRec.updatedAtMs === "number" ? stateRec.updatedAtMs : 0;
  const stateEntriesLen = Array.isArray(stateRec.entries) ? stateRec.entries.length : 0;

  let s = stateRec;
  if (!stateUpdatedAt || stateEntriesLen === 0) {
    const db = await loadRawFromDb();
    const dbUpdatedAt = typeof db?.updatedAtMs === "number" ? (db!.updatedAtMs as number) : 0;
    const dbEntriesLen = Array.isArray(db?.entries) ? (db!.entries as unknown[]).length : 0;
    if (db && dbUpdatedAt >= stateUpdatedAt && dbEntriesLen > 0) {
      s = db;
    }
  }

  const entriesRaw = Array.isArray(s.entries) ? s.entries : [];
  const objs: Record<string, unknown>[] = [];
  for (const raw of entriesRaw) {
    if (raw && typeof raw === "object") objs.push(raw as Record<string, unknown>);
  }
  const entries: TrackMapEntry[] = objs.map((e) => ({
      position: typeof e.position === "number" ? e.position : 0,
      driver: typeof e.driver === "string" ? e.driver : "",
      team: typeof e.team === "string" ? e.team : "",
      accent: typeof e.accent === "string" && e.accent.trim() ? e.accent : "#E10600",
      x: typeof e.x === "number" ? e.x : null,
      y: typeof e.y === "number" ? e.y : null,
      z: typeof e.z === "number" ? e.z : null,
      angle: typeof e.angle === "number" ? e.angle : null
    }));

  return NextResponse.json(
    {
      ok: true,
      sessionId: typeof s.sessionId === "string" ? s.sessionId : "default",
      updatedAtMs: typeof s.updatedAtMs === "number" ? s.updatedAtMs : 0,
      trackMap: (s.trackMap as TrackMapState["trackMap"]) ?? null,
      entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}
