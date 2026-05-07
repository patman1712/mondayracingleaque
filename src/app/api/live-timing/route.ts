import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string(),
  sessionName: z.string().optional(),
  sessionType: z.number().optional(),
  entries: z.array(
    z.object({
      position: z.number(),
      driver: z.string(),
      team: z.string(),
      lap: z.number(),
      gap: z.string(),
      lastLap: z.string(),
      bestLap: z.string().nullable().optional(),
      sector1: z.string().nullable().optional(),
      sector2: z.string().nullable().optional(),
      sector3: z.string().nullable().optional(),
      sector1Color: z.string().nullable().optional(),
      sector2Color: z.string().nullable().optional(),
      sector3Color: z.string().nullable().optional(),
      drs: z.boolean().nullable().optional(),
      ers: z.number().nullable().optional(),
      tyre: z.string().nullable().optional(),
      x: z.number().nullable().optional(),
      y: z.number().nullable().optional(),
      z: z.number().nullable().optional(),
      angle: z.number().nullable().optional(),
      accent: z.string(),
      penalties: z.string().optional(),
      stops: z.number().optional()
    })
  )
});

type LiveTimingPostEntry = z.infer<typeof schema>["entries"][number];

type LiveTimingEntry = LiveTimingPostEntry & {
  portraitUrl: string | null;
};

type LiveTimingState = {
  sessionId: string;
  sessionName: string | null;
  sessionType: number | null;
  updatedAtMs: number;
  entries: LiveTimingEntry[];
};

declare global {
  // eslint-disable-next-line no-var
  var __mrlLiveTimingState: LiveTimingState | undefined;
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) v0[j] = j;

  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }

  return v0[bl] as number;
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

async function resolvePortraitUrlsByDriverName(names: string[]) {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (wanted.length === 0) return new Map<string, string | null>();

  const drivers = await prisma.driver
    .findMany({
      select: { id: true, name: true, gamertag: true, portraitPath: true },
      take: 5000
    })
    .catch(() => []);

  const byNorm = new Map<string, string | null>();
  for (const d of drivers) {
    const url = imageUrl(d.portraitPath);
    const keys = [normalize(d.name), d.gamertag ? normalize(d.gamertag) : ""].filter(Boolean);
    for (const k of keys) {
      if (!k) continue;
      if (byNorm.has(k)) continue;
      byNorm.set(k, url);
    }
  }

  const out = new Map<string, string | null>();
  for (const raw of wanted) {
    const n = normalize(raw);
    if (!n) {
      out.set(raw, null);
      continue;
    }
    if (byNorm.has(n)) {
      out.set(raw, byNorm.get(n) ?? null);
      continue;
    }
    for (const [k, v] of byNorm) {
      if (k.includes(n) || n.includes(k)) {
        out.set(raw, v ?? null);
        break;
      }
    }
    if (out.has(raw)) continue;
    let best: { v: string | null; dist: number; len: number } | null = null;
    for (const [k, v] of byNorm) {
      const d = levenshtein(n, k);
      if (!best || d < best.dist) best = { v: v ?? null, dist: d, len: Math.max(n.length, k.length) };
    }
    if (!best) {
      out.set(raw, null);
      continue;
    }
    const ratio = best.len ? best.dist / best.len : 1;
    const maxDist = best.len <= 10 ? 2 : best.len <= 16 ? 3 : 4;
    out.set(raw, best.dist <= maxDist && ratio <= 0.25 ? best.v : null);
  }

  return out;
}

function getState(): LiveTimingState {
  if (!globalThis.__mrlLiveTimingState) {
    globalThis.__mrlLiveTimingState = {
      sessionId: "default",
      sessionName: null,
      sessionType: null,
      updatedAtMs: 0,
      entries: []
    };
  }
  return globalThis.__mrlLiveTimingState;
}

function isAuthorized(req: Request) {
  const required = process.env.LIVE_TIMING_TOKEN?.trim() ?? "";
  if (!required) return true;
  const got = req.headers.get("x-live-timing-token")?.trim() ?? "";
  return Boolean(got && got === required);
}

export async function GET() {
  const state = getState();
  return NextResponse.json(
    {
      ok: true,
      sessionId: state.sessionId,
      sessionName: state.sessionName,
      sessionType: state.sessionType,
      updatedAtMs: state.updatedAtMs,
      entries: state.entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const data = parsed.data;
  const state = getState();

  state.sessionId = data.sessionId;
  state.sessionName = data.sessionName ?? null;
  state.sessionType = typeof data.sessionType === "number" ? data.sessionType : null;
  state.updatedAtMs = Date.now();
  const portraitByName = await resolvePortraitUrlsByDriverName(data.entries.map((e) => e.driver));
  state.entries = data.entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      ...e,
      portraitUrl: portraitByName.get(e.driver) ?? null
    }));

  return NextResponse.json(
    {
      ok: true,
      sessionId: state.sessionId,
      sessionName: state.sessionName,
      sessionType: state.sessionType,
      updatedAtMs: state.updatedAtMs,
      entries: state.entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}
