import { NextResponse } from "next/server";

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

export async function GET() {
  const state = getState();
  const s = state as unknown as Record<string, unknown>;
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
