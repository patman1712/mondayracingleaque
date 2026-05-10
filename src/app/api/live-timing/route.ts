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
  leagueKey: z.string().optional(),
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

type LiveTimingAlertMeta = {
  bestLapMs: number | null;
  bestSectorMs: { s1: number | null; s2: number | null; s3: number | null };
  lastEmitMsByKey: Record<string, number>;
  lastValueByKey: Record<string, string>;
  driverStatsByName: Record<string, { warnings: number; penaltySeconds: number; penaltyRaw: string }>;
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
  _alertMeta?: LiveTimingAlertMeta;
};

declare global {
  // eslint-disable-next-line no-var
  var __mrlLiveTimingStore: Record<string, LiveTimingState> | undefined;
}

const LIVE_TIMING_APP_CONFIG_KEY = "liveTimingState";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeAlertType(input: string) {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_");
}

function parseLapTimeMs(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s || s === "—") return null;
  const m = /^(\d+):(\d{1,2})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3].padEnd(3, "0"));
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return min * 60000 + sec * 1000 + ms;
}

function parseSectorTimeMs(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s || s === "—") return null;
  const m = /^(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const sec = Number(m[1]);
  const ms = Number(m[2].padEnd(3, "0"));
  if (!Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return sec * 1000 + ms;
}

function parsePenaltySeconds(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return 0;
  const m = /([+-]?\d+)\s*s/i.exec(s);
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function sessionModeByName(sessionName: string) {
  const n = (sessionName ?? "").trim().toLowerCase();
  const isSprintQuali =
    n.includes("sprint qualifying") || n.includes("sprint shootout") || n.includes("sq1") || n.includes("sq2") || n.includes("sq3");
  if (!isSprintQuali) {
    const isRace = n.includes(" race") || n.startsWith("race") || n.includes("grand prix") || n.includes("sprint");
    if (isRace) return "race" as const;
  }
  const isQuali =
    n.includes("practice") ||
    n.includes("qualifying") ||
    n.includes("q1") ||
    n.includes("q2") ||
    n.includes("q3") ||
    n.includes("time trial") ||
    isSprintQuali;
  if (isQuali) return "qualifying" as const;
  return "unknown" as const;
}

function ensureAlertMeta(state: LiveTimingState): LiveTimingAlertMeta {
  if (!state._alertMeta) {
    state._alertMeta = {
      bestLapMs: null,
      bestSectorMs: { s1: null, s2: null, s3: null },
      lastEmitMsByKey: {},
      lastValueByKey: {},
      driverStatsByName: {}
    };
  }
  if (!state._alertMeta.bestSectorMs) state._alertMeta.bestSectorMs = { s1: null, s2: null, s3: null };
  if (!state._alertMeta.lastEmitMsByKey) state._alertMeta.lastEmitMsByKey = {};
  if (!state._alertMeta.lastValueByKey) state._alertMeta.lastValueByKey = {};
  if (!state._alertMeta.driverStatsByName) state._alertMeta.driverStatsByName = {};
  return state._alertMeta;
}

function resetAlertMeta(state: LiveTimingState) {
  state._alertMeta = {
    bestLapMs: null,
    bestSectorMs: { s1: null, s2: null, s3: null },
    lastEmitMsByKey: {},
    lastValueByKey: {},
    driverStatsByName: {}
  };
}

function shouldEmit(meta: LiveTimingAlertMeta, key: string, value: string, cooldownMs: number, now: number) {
  if (meta.lastValueByKey[key] === value) return false;
  const last = meta.lastEmitMsByKey[key] ?? 0;
  if (cooldownMs > 0 && now - last < cooldownMs) return false;
  meta.lastValueByKey[key] = value;
  meta.lastEmitMsByKey[key] = now;
  return true;
}

function alertPriority(type: string) {
  const t = normalizeAlertType(type);
  if (t === "red_flag") return 1;
  if (t === "safety_car") return 2;
  if (t === "virtual_safety_car" || t === "vsc") return 3;
  if (t === "penalty") return 4;
  if (t === "track_limits") return 5;
  if (t === "fastest_lap") return 6;
  if (t === "fastest_sector") return 7;
  if (t === "yellow_flag") return 8;
  if (t === "drs_enabled") return 9;
  if (t === "drs_disabled") return 10;
  return 99;
}

function alertFingerprint(a: LiveTimingAlert) {
  const t = normalizeAlertType(a.type);
  const d = (a.driver ?? "").trim();
  const s = typeof a.sector === "number" ? String(a.sector) : "";
  const time = (a.time ?? "").trim();
  const msg = (a.message ?? "").trim();
  const title = (a.title ?? "").trim();
  return `${t}|${title}|${d}|${s}|${time}|${msg}`;
}

function makeAlert(input: {
  type: string;
  title: string;
  message: string;
  driver?: string;
  sector?: number | null;
  time?: string;
  createdAt: number;
}): LiveTimingAlert {
  const t = normalizeAlertType(input.type);
  const driver = input.driver?.trim() ? input.driver.trim() : undefined;
  const sector = typeof input.sector === "number" ? input.sector : input.sector === null ? null : undefined;
  const time = input.time?.trim() ? input.time.trim() : undefined;
  const msg = input.message ?? "";
  const title = input.title ?? "";
  const id = `${t}|${title}|${driver ?? ""}|${sector ?? ""}|${time ?? ""}|${msg}`.trim();
  return { id, type: t, title, message: msg, driver, sector, time, createdAt: input.createdAt };
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

function defaultState(): LiveTimingState {
  return {
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
      entries: [],
      _alertMeta: {
        bestLapMs: null,
        bestSectorMs: { s1: null, s2: null, s3: null },
        lastEmitMsByKey: {},
        lastValueByKey: {},
        driverStatsByName: {}
      }
    };
}

function allowedLeagueKeys(): Array<{ key: string; label: string }> {
  return [
    { key: "liga-one", label: "Liga One" },
    { key: "liga-two", label: "Liga Two" },
    { key: "rookie", label: "Rookie" },
    { key: "one-mini-wm", label: "MRL One Mini WM" },
    { key: "two-mini-wm", label: "MRL Two Mini WM" }
  ];
}

function normalizeLeagueKey(input: string | null | undefined): string {
  const k = (input ?? "").trim().toLowerCase();
  if (!k) return "liga-one";
  const allowed = new Set(allowedLeagueKeys().map((x) => x.key));
  return allowed.has(k) ? k : "liga-one";
}

function getStore() {
  if (!globalThis.__mrlLiveTimingStore) {
    globalThis.__mrlLiveTimingStore = Object.create(null);
  }
  return globalThis.__mrlLiveTimingStore!;
}

function getState(leagueKey: string): LiveTimingState {
  const store = getStore();
  if (!store[leagueKey]) {
    store[leagueKey] = defaultState();
  }
  ensureAlertMeta(store[leagueKey]);
  return store[leagueKey];
}

async function loadStateFromDb(leagueKey: string): Promise<LiveTimingState | null> {
  const rowKey = `${LIVE_TIMING_APP_CONFIG_KEY}:${leagueKey}`;
  const row = await prisma.appConfig
    .findUnique({ where: { key: rowKey } })
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const all = url.searchParams.get("all");
  const leagueKey = normalizeLeagueKey(url.searchParams.get("leagueKey"));
  if (all) {
    const out: Record<string, unknown> = {};
    for (const { key } of allowedLeagueKeys()) {
      const st = getState(key);
      if (!st.updatedAtMs || st.entries.length === 0) {
        const dbState = await loadStateFromDb(key);
        if (dbState && dbState.updatedAtMs > st.updatedAtMs) {
          getStore()[key] = dbState;
        }
      }
      const o = getState(key);
      out[key] = {
        ok: true,
        sessionId: o.sessionId,
        sessionName: o.sessionName,
        sessionType: o.sessionType,
        sessionTimeLeft: o.sessionTimeLeft,
        sessionDuration: o.sessionDuration,
        totalLaps: o.totalLaps,
        currentLap: o.currentLap,
        lapsRemaining: o.lapsRemaining,
        trackStatus: o.trackStatus,
        raceStatus: o.raceStatus,
        racePhase: o.racePhase,
        weather: o.weather,
        airTemp: o.airTemp,
        trackTemp: o.trackTemp,
        rainIntensity: o.rainIntensity,
        trackGrip: o.trackGrip,
        trackMap: o.trackMap,
        alerts: o.alerts,
        updatedAtMs: o.updatedAtMs,
        entries: o.entries
      };
    }
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } else {
    const st = getState(leagueKey);
    if (!st.updatedAtMs || st.entries.length === 0) {
      const dbState = await loadStateFromDb(leagueKey);
      if (dbState && dbState.updatedAtMs > st.updatedAtMs) {
        getStore()[leagueKey] = dbState;
      }
    }
    const o = getState(leagueKey);
    return NextResponse.json(
      {
        ok: true,
        sessionId: o.sessionId,
        sessionName: o.sessionName,
        sessionType: o.sessionType,
        sessionTimeLeft: o.sessionTimeLeft,
        sessionDuration: o.sessionDuration,
        totalLaps: o.totalLaps,
        currentLap: o.currentLap,
        lapsRemaining: o.lapsRemaining,
        trackStatus: o.trackStatus,
        raceStatus: o.raceStatus,
        racePhase: o.racePhase,
        weather: o.weather,
        airTemp: o.airTemp,
        trackTemp: o.trackTemp,
        rainIntensity: o.rainIntensity,
        trackGrip: o.trackGrip,
        trackMap: o.trackMap,
        alerts: o.alerts,
        updatedAtMs: o.updatedAtMs,
        entries: o.entries
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
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
  const leagueKey = normalizeLeagueKey(data.leagueKey);
  const state = getState(leagueKey);
  const prevSessionId = state.sessionId;

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

  if (state.sessionId !== prevSessionId) {
    state.alerts = [];
    resetAlertMeta(state);
  }

  const meta = ensureAlertMeta(state);
  const now = state.updatedAtMs;
  const mode = sessionModeByName(state.sessionName ?? "");
  const acceptedIncoming = new Set([
    "red_flag",
    "safety_car",
    "virtual_safety_car",
    "vsc",
    "yellow_flag",
    "drs_enabled",
    "drs_disabled"
  ]);

  const incomingAlerts = Array.isArray(data.alerts) ? (data.alerts as LiveTimingAlert[]) : [];
  const candidates: LiveTimingAlert[] = [];

  for (const raw of incomingAlerts) {
    if (!raw || typeof raw !== "object") continue;
    const t = normalizeAlertType((raw as LiveTimingAlert).type);
    if (!acceptedIncoming.has(t)) continue;
    const createdAt = typeof (raw as LiveTimingAlert).createdAt === "number" ? (raw as LiveTimingAlert).createdAt : now;
    const a = makeAlert({
      type: t,
      title: (raw as LiveTimingAlert).title,
      message: (raw as LiveTimingAlert).message,
      driver: (raw as LiveTimingAlert).driver,
      sector: (raw as LiveTimingAlert).sector ?? undefined,
      time: (raw as LiveTimingAlert).time,
      createdAt
    });
    const fp = alertFingerprint(a);
    const key = `incoming:${t}`;
    if (!shouldEmit(meta, key, fp, 0, now)) continue;
    candidates.push(a);
  }

  const entriesByPosition = state.entries.slice().sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  for (const e of entriesByPosition) {
    const driver = e.driver?.trim();
    if (!driver) continue;
    const warnings = typeof e.warnings === "number" && Number.isFinite(e.warnings) ? e.warnings : 0;
    const penaltyRaw = typeof e.penalties === "string" ? e.penalties.trim() : "";
    const penaltySeconds = penaltyRaw ? parsePenaltySeconds(penaltyRaw) : 0;
    const prev = meta.driverStatsByName[driver] ?? { warnings: 0, penaltySeconds: 0, penaltyRaw: "" };

    if (warnings > prev.warnings) {
      meta.driverStatsByName[driver] = { warnings, penaltySeconds, penaltyRaw };
      const key = `track_limits:${driver}`;
      const value = String(warnings);
      if (shouldEmit(meta, key, value, 0, now)) {
        candidates.push(
          makeAlert({
            type: "track_limits",
            title: "TRACK LIMITS",
            message: `Warning ${warnings}`,
            driver,
            createdAt: now
          })
        );
      }
      continue;
    }

    if (penaltySeconds !== prev.penaltySeconds || penaltyRaw !== prev.penaltyRaw) {
      meta.driverStatsByName[driver] = { warnings, penaltySeconds, penaltyRaw };
      if (penaltySeconds > 0) {
        const key = `penalty:${driver}`;
        const value = String(penaltySeconds);
        if (shouldEmit(meta, key, value, 0, now)) {
          candidates.push(
            makeAlert({
              type: "penalty",
              title: "PENALTY",
              message: `+${penaltySeconds}s`,
              driver,
              createdAt: now
            })
          );
        }
      }
      continue;
    }

    meta.driverStatsByName[driver] = { warnings, penaltySeconds, penaltyRaw };
  }

  const bestLap = (() => {
    let best: { ms: number; driver: string; text: string } | null = null;
    for (const e of state.entries) {
      const ms = parseLapTimeMs(e.bestLap ?? null);
      if (ms === null) continue;
      const d = e.driver?.trim();
      if (!d) continue;
      if (!best || ms < best.ms) best = { ms, driver: d, text: (e.bestLap ?? "").toString().trim() };
    }
    return best;
  })();

  if (bestLap) {
    const improved = meta.bestLapMs === null || bestLap.ms < meta.bestLapMs;
    meta.bestLapMs = bestLap.ms;
    if (improved) {
      const key = "fastest_lap";
      const value = String(bestLap.ms);
      if (shouldEmit(meta, key, value, 8000, now)) {
        candidates.push(
          makeAlert({
            type: "fastest_lap",
            title: "FASTEST LAP",
            message: bestLap.text,
            driver: bestLap.driver,
            time: bestLap.text,
            createdAt: now
          })
        );
      }
    }
  }

  if (mode !== "race") {
    const sectorBest: Array<{ sector: 1 | 2 | 3; ms: number; driver: string; text: string }> = [];
    for (const e of state.entries) {
      const d = e.driver?.trim();
      if (!d) continue;
      const s1 = parseSectorTimeMs(e.sector1 ?? null);
      const s2 = parseSectorTimeMs(e.sector2 ?? null);
      const s3 = parseSectorTimeMs(e.sector3 ?? null);
      if (s1 !== null) sectorBest.push({ sector: 1, ms: s1, driver: d, text: (e.sector1 ?? "").toString().trim() });
      if (s2 !== null) sectorBest.push({ sector: 2, ms: s2, driver: d, text: (e.sector2 ?? "").toString().trim() });
      if (s3 !== null) sectorBest.push({ sector: 3, ms: s3, driver: d, text: (e.sector3 ?? "").toString().trim() });
    }
    const bestBySector = new Map<number, { ms: number; driver: string; text: string }>();
    for (const x of sectorBest) {
      const prev = bestBySector.get(x.sector);
      if (!prev || x.ms < prev.ms) bestBySector.set(x.sector, { ms: x.ms, driver: x.driver, text: x.text });
    }
    for (const [sector, best] of bestBySector) {
      const keyMs = sector === 1 ? "s1" : sector === 2 ? "s2" : "s3";
      const prevMs = meta.bestSectorMs[keyMs];
      const improved = prevMs === null || best.ms < prevMs;
      meta.bestSectorMs[keyMs] = best.ms;
      if (!improved) continue;
      const key = `fastest_sector:s${sector}`;
      const value = String(best.ms);
      if (!shouldEmit(meta, key, value, 5000, now)) continue;
      candidates.push(
        makeAlert({
          type: "fastest_sector",
          title: `FASTEST S${sector}`,
          message: best.text,
          driver: best.driver,
          sector,
          time: best.text,
          createdAt: now
        })
      );
    }
  }

  const picked = candidates
    .slice()
    .sort((a, b) => {
      const pa = alertPriority(a.type);
      const pb = alertPriority(b.type);
      if (pa !== pb) return pa - pb;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    })[0];

  if (picked) {
    const cutoff = now - 10 * 60 * 1000;
    const kept = (state.alerts ?? []).filter((a) => typeof a?.createdAt === "number" && a.createdAt >= cutoff);
    kept.push(picked);
    const dedup = new Map<string, LiveTimingAlert>();
    for (const a of kept) dedup.set(a.id, a);
    state.alerts = Array.from(dedup.values())
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .slice(-50);
  } else {
    const cutoff = now - 10 * 60 * 1000;
    state.alerts = (state.alerts ?? []).filter((a) => typeof a?.createdAt === "number" && a.createdAt >= cutoff).slice(-50);
  }

  await prisma.appConfig
    .upsert({
      where: { key: `${LIVE_TIMING_APP_CONFIG_KEY}:${leagueKey}` },
      create: { key: `${LIVE_TIMING_APP_CONFIG_KEY}:${leagueKey}`, value: JSON.stringify(state) },
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
