import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const alertsSchema = z
  .object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  driver: z.string().optional(),
  sector: z.number().nullable().optional(),
  time: z.string().optional(),
  createdAt: z.number()
})
  .passthrough();

const trackMapSchema = z
  .object({
    circuit: z.string().optional(),
    length: z.number().optional()
  })
  .nullable()
  .optional();

const participantSchema = z
  .object({
  participantIndex: z.number(),
  driver: z.string(),
  team: z.string().optional(),
  accent: z.string().nullable().optional()
})
  .passthrough();

const entrySchema = z
  .object({
  position: z.number(),
  participantIndex: z.number().optional(),
  driver: z.string(),
  team: z.string().nullable().optional(),
  lap: z.number().nullable().optional(),
  gap: z.string().nullable().optional(),
  lastLap: z.string().nullable().optional(),
  bestLap: z.string().nullable().optional(),
  currentLap: z.string().nullable().optional(),
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
  accent: z.string().nullable().optional(),
  status: z.string().optional(),
  penalties: z.string().optional(),
  warnings: z.number().optional(),
  stops: z.number().optional()
})
  .passthrough();

const schema = z
  .object({
  sessionId: z.string(),
  sessionName: z.string().nullable().optional(),
  sessionType: z.number().nullable().optional(),
  sessionTimeLeft: z.string().nullable().optional(),
  sessionDuration: z.string().nullable().optional(),
  totalLaps: z.number().nullable().optional(),
  currentLap: z.number().nullable().optional(),
  lapsRemaining: z.number().nullable().optional(),
  trackStatus: z.string().nullable().optional(),
  raceStatus: z.string().nullable().optional(),
  racePhase: z.string().nullable().optional(),
  weather: z.string().nullable().optional(),
  airTemp: z.number().nullable().optional(),
  trackTemp: z.number().nullable().optional(),
  rainIntensity: z.number().nullable().optional(),
  trackGrip: z.number().nullable().optional(),
  trackMap: trackMapSchema,
  alerts: z.array(alertsSchema).optional(),
  participants: z.array(participantSchema).optional(),
  entries: z.array(entrySchema)
})
  .passthrough();

type LiveTimingPostEntry = z.infer<typeof schema>["entries"][number];
type LiveTimingAlert = z.infer<typeof alertsSchema>;
type LiveTimingParticipant = z.infer<typeof participantSchema>;

type LiveTimingEntry = LiveTimingPostEntry & {
  portraitUrl: string | null;
  accent: string;
};

type LiveTimingState = {
  sessionId: string;
  sessionName: string | null;
  sessionType: number | null;
  sessionTimeLeft: string | null;
  sessionDuration: string | null;
  totalLaps: number | null;
  currentLap: number | null;
  lapsRemaining: number | null;
  trackStatus: string | null;
  raceStatus: string | null;
  racePhase: string | null;
  weather: string | null;
  airTemp: number | null;
  trackTemp: number | null;
  rainIntensity: number | null;
  trackGrip: number | null;
  trackMap: { circuit?: string; length?: number } | null;
  alerts: LiveTimingAlert[];
  updatedAtMs: number;
  entries: LiveTimingEntry[];
};

declare global {
  // eslint-disable-next-line no-var
  var __mrlLiveTimingState: LiveTimingState | undefined;
}

const LIVE_TIMING_APP_CONFIG_KEY = "liveTimingState";

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

function matchEntryIndexByDriverName(wantedDriver: string, entries: LiveTimingPostEntry[], used: Set<number>) {
  const w = normalize(wantedDriver);
  if (!w) return null;
  let best: { idx: number; dist: number; len: number } | null = null;
  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue;
    const cand = entries[i];
    const c = normalize(cand.driver);
    if (!c) continue;
    if (c === w) return i;
    if (c.includes(w) || w.includes(c)) return i;
    const d = levenshtein(w, c);
    const len = Math.max(w.length, c.length);
    if (!best || d < best.dist) best = { idx: i, dist: d, len };
  }
  if (!best) return null;
  const ratio = best.len ? best.dist / best.len : 1;
  const maxDist = best.len <= 10 ? 2 : best.len <= 16 ? 3 : 4;
  if (best.dist <= maxDist && ratio <= 0.25) return best.idx;
  return null;
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
      sessionTimeLeft: null,
      sessionDuration: null,
      totalLaps: null,
      currentLap: null,
      lapsRemaining: null,
      trackStatus: null,
      raceStatus: null,
      racePhase: null,
      weather: null,
      airTemp: null,
      trackTemp: null,
      rainIntensity: null,
      trackGrip: null,
      trackMap: null,
      alerts: [],
      updatedAtMs: 0,
      entries: []
    };
  }
  return globalThis.__mrlLiveTimingState;
}

async function loadStateFromDb(): Promise<LiveTimingState | null> {
  const row = await prisma.appConfig
    .findUnique({ where: { key: LIVE_TIMING_APP_CONFIG_KEY } })
    .catch(() => null);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    const safe = z
      .object({
        sessionId: z.string(),
        sessionName: z.string().nullable(),
        sessionType: z.number().nullable(),
        sessionTimeLeft: z.string().nullable(),
        sessionDuration: z.string().nullable(),
        totalLaps: z.number().nullable(),
        currentLap: z.number().nullable(),
        lapsRemaining: z.number().nullable(),
        trackStatus: z.string().nullable(),
        raceStatus: z.string().nullable(),
        racePhase: z.string().nullable(),
        weather: z.string().nullable(),
        airTemp: z.number().nullable(),
        trackTemp: z.number().nullable(),
        rainIntensity: z.number().nullable(),
        trackGrip: z.number().nullable(),
        trackMap: z.object({ circuit: z.string().optional(), length: z.number().optional() }).nullable(),
        alerts: z.array(alertsSchema),
        updatedAtMs: z.number(),
        entries: z.array(
          entrySchema.extend({
            portraitUrl: z.string().nullable().optional(),
            accent: z.string().optional()
          })
        )
      })
      .passthrough()
      .safeParse(parsed);
    if (!safe.success) return null;
    const s = safe.data;
    const entries = s.entries.map((e) => {
      const maybe = e as unknown as { accent?: unknown; portraitUrl?: unknown };
      const accent = typeof maybe.accent === "string" && maybe.accent.trim() ? maybe.accent : "#E10600";
      const portraitUrl = typeof maybe.portraitUrl === "string" ? maybe.portraitUrl : null;
      return {
        ...(e as unknown as LiveTimingEntry),
        accent,
        portraitUrl
      };
    });
    return { ...s, entries } as LiveTimingState;
  } catch {
    return null;
  }
}

function isAuthorized(req: Request) {
  const required = process.env.LIVE_TIMING_TOKEN?.trim() ?? "";
  if (!required) return true;
  const got = req.headers.get("x-live-timing-token")?.trim() ?? "";
  return Boolean(got && got === required);
}

export async function GET() {
  const state = getState();
  if (!state.updatedAtMs || state.entries.length === 0) {
    const dbState = await loadStateFromDb();
    if (dbState && dbState.updatedAtMs > state.updatedAtMs) {
      globalThis.__mrlLiveTimingState = dbState;
    }
  }
  const out = getState();
  return NextResponse.json(
    {
      ok: true,
      sessionId: out.sessionId,
      sessionName: out.sessionName,
      sessionType: out.sessionType,
      sessionTimeLeft: out.sessionTimeLeft,
      sessionDuration: out.sessionDuration,
      totalLaps: out.totalLaps,
      currentLap: out.currentLap,
      lapsRemaining: out.lapsRemaining,
      trackStatus: out.trackStatus,
      raceStatus: out.raceStatus,
      racePhase: out.racePhase,
      weather: out.weather,
      airTemp: out.airTemp,
      trackTemp: out.trackTemp,
      rainIntensity: out.rainIntensity,
      trackGrip: out.trackGrip,
      trackMap: out.trackMap,
      alerts: out.alerts,
      updatedAtMs: out.updatedAtMs,
      entries: out.entries
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
  state.sessionName = typeof data.sessionName === "string" ? data.sessionName : null;
  state.sessionType = typeof data.sessionType === "number" ? data.sessionType : null;
  state.sessionTimeLeft = typeof data.sessionTimeLeft === "string" ? data.sessionTimeLeft : null;
  state.sessionDuration = typeof data.sessionDuration === "string" ? data.sessionDuration : null;
  state.totalLaps = typeof data.totalLaps === "number" ? data.totalLaps : null;
  state.currentLap = typeof data.currentLap === "number" ? data.currentLap : null;
  state.lapsRemaining = typeof data.lapsRemaining === "number" ? data.lapsRemaining : null;
  state.trackStatus = typeof data.trackStatus === "string" ? data.trackStatus : null;
  state.raceStatus = typeof data.raceStatus === "string" ? data.raceStatus : null;
  state.racePhase = typeof data.racePhase === "string" ? data.racePhase : null;
  state.weather = typeof data.weather === "string" ? data.weather : null;
  state.airTemp = typeof data.airTemp === "number" ? data.airTemp : null;
  state.trackTemp = typeof data.trackTemp === "number" ? data.trackTemp : null;
  state.rainIntensity = typeof data.rainIntensity === "number" ? data.rainIntensity : null;
  state.trackGrip = typeof data.trackGrip === "number" ? data.trackGrip : null;
  state.trackMap = data.trackMap ?? null;
  state.alerts = Array.isArray(data.alerts) ? (data.alerts as LiveTimingAlert[]) : [];
  state.updatedAtMs = Date.now();
  const incomingEntries = data.entries.slice();
  const participants = Array.isArray(data.participants) ? (data.participants as LiveTimingParticipant[]) : [];
  const merged: LiveTimingPostEntry[] = [];

  function str(v: unknown, fallback: string) {
    return typeof v === "string" && v.trim() ? v : fallback;
  }
  function num(v: unknown, fallback: number) {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  }

  if (participants.length) {
    const used = new Set<number>();
    const ordered = participants.slice().sort((a, b) => a.participantIndex - b.participantIndex);
    for (const p of ordered) {
      const idx = matchEntryIndexByDriverName(p.driver, incomingEntries, used);
      if (idx !== null) {
        used.add(idx);
        const e = incomingEntries[idx];
        merged.push({
          ...e,
          participantIndex: typeof e.participantIndex === "number" ? e.participantIndex : p.participantIndex,
          driver: str(e.driver, p.driver),
          team: str(e.team, str(p.team, "")),
          accent: typeof e.accent === "string" ? e.accent : p.accent ?? null
        });
      } else {
        merged.push({
          position: p.participantIndex + 1,
          participantIndex: p.participantIndex,
          driver: p.driver,
          team: str(p.team, ""),
          lap: 0,
          gap: "—",
          lastLap: "—",
          bestLap: "—",
          currentLap: "—",
          sector1: "—",
          sector2: "—",
          sector3: "—",
          tyre: null,
          drs: null,
          ers: null,
          x: null,
          y: null,
          z: null,
          angle: null,
          accent: p.accent ?? null,
          status: "WAITING"
        });
      }
    }
    for (let i = 0; i < incomingEntries.length; i++) {
      if (used.has(i)) continue;
      merged.push(incomingEntries[i]);
    }
  } else {
    merged.push(...incomingEntries);
  }

  const normalized = merged.map((e) => {
    const position = num(e.position, 0);
    const driver = str(e.driver, "—");
    const team = str(e.team, "");
    const lap = num(e.lap, 0);
    const gap = str(e.gap, "—");
    const lastLap = str(e.lastLap, "—");
    const bestLap = str(e.bestLap, "—");
    const currentLap = str(e.currentLap, "—");
    return {
      ...e,
      position,
      driver,
      team,
      lap,
      gap,
      lastLap,
      bestLap,
      currentLap,
      sector1: str(e.sector1, "—"),
      sector2: str(e.sector2, "—"),
      sector3: str(e.sector3, "—"),
      sector1Color: typeof e.sector1Color === "string" ? e.sector1Color : null,
      sector2Color: typeof e.sector2Color === "string" ? e.sector2Color : null,
      sector3Color: typeof e.sector3Color === "string" ? e.sector3Color : null,
      drs: typeof e.drs === "boolean" ? e.drs : null,
      ers: typeof e.ers === "number" ? e.ers : null,
      tyre: typeof e.tyre === "string" ? e.tyre : null,
      x: typeof e.x === "number" ? e.x : null,
      y: typeof e.y === "number" ? e.y : null,
      z: typeof e.z === "number" ? e.z : null,
      angle: typeof e.angle === "number" ? e.angle : null,
      status: typeof e.status === "string" && e.status.trim() ? e.status : undefined,
      penalties: typeof e.penalties === "string" ? e.penalties : undefined,
      warnings: typeof e.warnings === "number" ? e.warnings : undefined,
      stops: typeof e.stops === "number" ? e.stops : undefined,
      participantIndex: typeof e.participantIndex === "number" ? e.participantIndex : undefined
    } as LiveTimingPostEntry;
  });

  const portraitByName = await resolvePortraitUrlsByDriverName(normalized.map((e) => e.driver));
  state.entries = normalized
    .slice()
    .sort((a, b) => {
      const ap = typeof a.position === "number" ? a.position : 0;
      const bp = typeof b.position === "number" ? b.position : 0;
      if (ap !== bp) return ap - bp;
      const ai = typeof a.participantIndex === "number" ? a.participantIndex : Number.MAX_SAFE_INTEGER;
      const bi = typeof b.participantIndex === "number" ? b.participantIndex : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    })
    .map((e) => ({
      ...e,
      accent: typeof e.accent === "string" && e.accent.trim() ? e.accent : "#E10600",
      portraitUrl: portraitByName.get(e.driver) ?? null
    }));

  await prisma.appConfig
    .upsert({
      where: { key: LIVE_TIMING_APP_CONFIG_KEY },
      create: { key: LIVE_TIMING_APP_CONFIG_KEY, value: JSON.stringify(state) },
      update: { value: JSON.stringify(state) }
    })
    .catch(() => null);

  return NextResponse.json(
    {
      ok: true,
      sessionId: state.sessionId,
      sessionName: state.sessionName,
      sessionType: state.sessionType,
      sessionTimeLeft: state.sessionTimeLeft,
      sessionDuration: state.sessionDuration,
      totalLaps: state.totalLaps,
      currentLap: state.currentLap,
      lapsRemaining: state.lapsRemaining,
      trackStatus: state.trackStatus,
      raceStatus: state.raceStatus,
      racePhase: state.racePhase,
      weather: state.weather,
      airTemp: state.airTemp,
      trackTemp: state.trackTemp,
      rainIntensity: state.rainIntensity,
      trackGrip: state.trackGrip,
      trackMap: state.trackMap,
      alerts: state.alerts,
      updatedAtMs: state.updatedAtMs,
      entries: state.entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}
