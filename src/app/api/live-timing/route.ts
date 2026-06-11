import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sessionModeFromName } from "@/lib/liveTimingDisplay";

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
  sessionId: z.string().optional(),
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
  entries: z.array(entrySchema).optional(),
  csv: z.string().optional()
})
  .passthrough()
  .refine((data) => (Array.isArray(data.entries) && data.entries.length >= 0) || Boolean(data.csv?.trim()), {
    message: "entries_or_csv_required"
  });

type LiveTimingSchema = z.infer<typeof schema>;
type LiveTimingPostEntry = NonNullable<LiveTimingSchema["entries"]>[number];
type LiveTimingAlert = z.infer<typeof alertsSchema>;
type LiveTimingParticipant = z.infer<typeof participantSchema>;

type LiveTimingEntry = LiveTimingPostEntry & {
  portraitUrl: string | null;
  accent: string;
  teamLogoUrl?: string | null;
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
  participants: LiveTimingParticipant[];
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

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

function stripUtf8Bom(input: string) {
  return input.replace(/^\uFEFF/, "");
}

function normalizeCsvHeader(input: string) {
  return stripUtf8Bom(input)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsvInteger(raw: string | null | undefined, fallback: number) {
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function parseCsvFloat(raw: string | null | undefined, fallback: number | null = null) {
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  const num = Number(value.replace(",", "."));
  return Number.isFinite(num) ? num : fallback;
}

function parseCsvBoolean(raw: string | null | undefined) {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "ja", "on", "active"].includes(value)) return true;
  if (["0", "false", "no", "nein", "off", "inactive"].includes(value)) return false;
  return null;
}

function normalizeCsvStatus(raw: string | null | undefined) {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return "ACTIVE";
  if (value === "ACTIVE") return "ACTIVE";
  if (value === "RETIRED") return "RETIRED";
  if (value === "WAITING") return "WAITING";
  return value;
}

function normalizeCsvGap(position: number, raw: string | null | undefined) {
  const value = (raw ?? "").trim();
  if (position <= 1) return value || "Leader";
  return value || "—";
}

function normalizeCsvTime(raw: string | null | undefined) {
  const value = (raw ?? "").trim();
  return value || "—";
}

function normalizeCsvTyre(raw: string | null | undefined) {
  const value = (raw ?? "").trim().toUpperCase();
  return value || "UNKNOWN";
}

function isPlaceholderCar(driver: string) {
  return /^car\s+/i.test(driver.trim());
}

function parseLiveTimingCsv(csv: string) {
  const warnings: string[] = [];
  const text = stripUtf8Bom(csv);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    warnings.push("csv_empty");
    return { entries: [] as LiveTimingPostEntry[], warnings };
  }

  const headerCells = lines[0].split(";").map((cell) => stripUtf8Bom(cell).trim());
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < headerCells.length; i++) {
    const normalized = normalizeCsvHeader(headerCells[i]);
    if (normalized && !headerIndex.has(normalized)) headerIndex.set(normalized, i);
  }

  const requiredHeaders = ["pos", "fahrer", "team", "runde", "gap", "besterunde", "status", "tyre"];
  for (const header of requiredHeaders) {
    if (!headerIndex.has(header)) warnings.push(`missing_header:${header}`);
  }

  function readColumn(cells: string[], header: string, fallback = "") {
    const idx = headerIndex.get(header);
    if (idx === undefined) return fallback;
    return (cells[idx] ?? "").trim();
  }

  const entries: LiveTimingPostEntry[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const cells = rawLine.split(";");
    const driver = readColumn(cells, "fahrer", "");
    const status = normalizeCsvStatus(readColumn(cells, "status", "ACTIVE"));

    if (!driver) warnings.push(`row_${lineIndex + 1}:missing_driver`);
    if (isPlaceholderCar(driver)) continue;
    if (status === "WAITING") continue;
    if (status !== "ACTIVE" && status !== "RETIRED") {
      warnings.push(`row_${lineIndex + 1}:unexpected_status:${status}`);
      continue;
    }

    const position = Math.max(1, parseCsvInteger(readColumn(cells, "pos", ""), lineIndex));
    const team = readColumn(cells, "team", "");

    entries.push({
      position,
      driver: driver || `Unknown ${lineIndex}`,
      team,
      lap: Math.max(0, parseCsvInteger(readColumn(cells, "runde", ""), 0)),
      gap: normalizeCsvGap(position, readColumn(cells, "gap", "")),
      bestLap: normalizeCsvTime(readColumn(cells, "besterunde", "")),
      lastLap: normalizeCsvTime(readColumn(cells, "letzterunde", "")),
      currentLap: normalizeCsvTime(readColumn(cells, "aktuellerunde", "")),
      sector1: normalizeCsvTime(readColumn(cells, "s1", "")),
      sector2: normalizeCsvTime(readColumn(cells, "s2", "")),
      sector3: normalizeCsvTime(readColumn(cells, "s3", "")),
      sector1Color: readColumn(cells, "s1color", "") || null,
      sector2Color: readColumn(cells, "s2color", "") || null,
      sector3Color: readColumn(cells, "s3color", "") || null,
      penalties: readColumn(cells, "strafen", ""),
      warnings: Math.max(0, parseCsvInteger(readColumn(cells, "warnungen", ""), 0)),
      stops: Math.max(0, parseCsvInteger(readColumn(cells, "stops", ""), 0)),
      status,
      drs: parseCsvBoolean(readColumn(cells, "drs", "")),
      ers: parseCsvFloat(readColumn(cells, "ers", ""), null),
      tyre: normalizeCsvTyre(readColumn(cells, "tyre", "UNKNOWN")),
      x: parseCsvFloat(readColumn(cells, "x", ""), null),
      y: parseCsvFloat(readColumn(cells, "y", ""), null),
      z: parseCsvFloat(readColumn(cells, "z", ""), null),
      angle: parseCsvFloat(readColumn(cells, "angle", ""), null)
    });
  }

  return { entries, warnings };
}

async function resolvePortraitUrlsByDriverName(names: string[], seasonId?: string | null) {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (wanted.length === 0) return new Map<string, string | null>();

  const byNorm = new Map<string, string | null>();
  if (seasonId) {
    const rows = await prisma.driverSeason
      .findMany({
        where: { seasonId },
        select: { portraitPath: true, driver: { select: { name: true, gamertag: true } } },
        take: 5000
      })
      .catch(() => []);

    for (const r of rows) {
      const url = imageUrl(r.portraitPath);
      const keys = [normalize(r.driver.name), r.driver.gamertag ? normalize(r.driver.gamertag) : ""].filter(Boolean);
      for (const k of keys) {
        if (!k) continue;
        const prev = byNorm.get(k);
        if (prev === undefined) {
          byNorm.set(k, url);
          continue;
        }
        if (prev === null && url !== null) byNorm.set(k, url);
      }
    }
  } else {
    const drivers = await prisma.driver
      .findMany({
        select: { id: true, name: true, gamertag: true, portraitPath: true },
        take: 5000
      })
      .catch(() => []);

    for (const d of drivers) {
      const url = imageUrl(d.portraitPath);
      const keys = [normalize(d.name), d.gamertag ? normalize(d.gamertag) : ""].filter(Boolean);
      for (const k of keys) {
        if (!k) continue;
        if (byNorm.has(k)) continue;
        byNorm.set(k, url);
      }
    }
  }

  const out = new Map<string, string | null>();
  for (const raw of wanted) {
    const n = normalize(raw);
    out.set(raw, n ? (byNorm.get(n) ?? null) : null);
  }

  return out;
}

async function resolveTeamLogoUrlsByTeamName(names: string[]) {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (wanted.length === 0) return new Map<string, string | null>();

  const teams = await prisma.team
    .findMany({
      select: { name: true, logoPath: true },
      take: 5000
    })
    .catch(() => []);

  const byNorm = new Map<string, string | null>();
  for (const t of teams) {
    const url = imageUrl(t.logoPath);
    const k = normalize(t.name);
    if (!k) continue;
    if (byNorm.has(k)) continue;
    byNorm.set(k, url);
  }

  const out = new Map<string, string | null>();
  for (const raw of wanted) {
    const n = normalize(raw);
    out.set(raw, n ? (byNorm.get(n) ?? null) : null);
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
      participants: [],
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
        participants: z.array(participantSchema).optional(),
        alerts: z.array(alertsSchema),
        updatedAtMs: z.number(),
        entries: z.array(
          entrySchema.extend({
            portraitUrl: z.string().nullable().optional(),
            accent: z.string().optional(),
            teamLogoUrl: z.string().nullable().optional()
          })
        )
      })
      .passthrough()
      .safeParse(parsed);
    if (!safe.success) return null;
    const s = safe.data;
    const entries = s.entries.map((e) => {
      const maybe = e as unknown as { accent?: unknown; portraitUrl?: unknown; teamLogoUrl?: unknown };
      const accent = typeof maybe.accent === "string" && maybe.accent.trim() ? maybe.accent : "#E10600";
      const portraitUrl = typeof maybe.portraitUrl === "string" ? maybe.portraitUrl : null;
      const teamLogoUrl = typeof maybe.teamLogoUrl === "string" ? maybe.teamLogoUrl : null;
      return {
        ...(e as unknown as LiveTimingEntry),
        accent,
        portraitUrl,
        teamLogoUrl
      };
    });
    const participants = Array.isArray(s.participants) ? (s.participants as LiveTimingParticipant[]) : [];
    return { ...(s as unknown as LiveTimingState), entries, participants } as LiveTimingState;
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
  const seasonId = url.searchParams.get("seasonId");
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
        participants: o.participants,
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
    const entriesRaw = Array.isArray(o.entries) ? o.entries : [];
    const entries =
      seasonId && entriesRaw.length
        ? await (async () => {
            const portraitByName = await resolvePortraitUrlsByDriverName(
              entriesRaw.map((e) => (typeof (e as { driver?: unknown })?.driver === "string" ? (e as { driver: string }).driver : "")),
              seasonId
            );
            return entriesRaw.map((e) => {
              const driver = typeof (e as { driver?: unknown })?.driver === "string" ? (e as { driver: string }).driver : "";
              return { ...(e as object), portraitUrl: driver ? (portraitByName.get(driver) ?? null) : null };
            });
          })()
        : entriesRaw;
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
        participants: o.participants,
        alerts: o.alerts,
        updatedAtMs: o.updatedAtMs,
        entries
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
  let rawText = "";
  try {
    rawText = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  if (!rawText.trim()) {
    body = {};
  } else {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = { csv: rawText };
    }
  }

  const url = new URL(req.url);
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? {
          sessionId: url.searchParams.get("sessionId") ?? undefined,
          sessionName: url.searchParams.get("sessionName") ?? undefined,
          leagueKey: url.searchParams.get("leagueKey") ?? undefined,
          ...body
        }
      : body;

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const data = parsed.data;
  const leagueKey = normalizeLeagueKey(data.leagueKey);
  const state = getState(leagueKey);
  const prevSessionId = state.sessionId;

  const csvParsed = typeof data.csv === "string" && data.csv.trim() ? parseLiveTimingCsv(data.csv) : null;
  if (csvParsed?.warnings.length) {
    console.warn("[live-timing] CSV parse warnings:", csvParsed.warnings);
  }
  const incomingEntries = Array.isArray(data.entries)
    ? data.entries.slice()
    : csvParsed
      ? csvParsed.entries
      : [];
  const participants = Array.isArray(data.participants) ? (data.participants as LiveTimingParticipant[]) : [];

  state.sessionId = typeof data.sessionId === "string" && data.sessionId.trim() ? data.sessionId : state.sessionId || "default";
  state.sessionName = typeof data.sessionName === "string" ? data.sessionName : state.sessionName;
  state.sessionType = typeof data.sessionType === "number" ? data.sessionType : state.sessionType;
  state.sessionTimeLeft = typeof data.sessionTimeLeft === "string" ? data.sessionTimeLeft : state.sessionTimeLeft;
  state.sessionDuration = typeof data.sessionDuration === "string" ? data.sessionDuration : state.sessionDuration;
  state.totalLaps = typeof data.totalLaps === "number" ? data.totalLaps : state.totalLaps;
  state.currentLap = typeof data.currentLap === "number" ? data.currentLap : state.currentLap;
  state.lapsRemaining = typeof data.lapsRemaining === "number" ? data.lapsRemaining : state.lapsRemaining;
  state.trackStatus = typeof data.trackStatus === "string" ? data.trackStatus : state.trackStatus;
  state.raceStatus = typeof data.raceStatus === "string" ? data.raceStatus : state.raceStatus;
  state.racePhase = typeof data.racePhase === "string" ? data.racePhase : state.racePhase;
  state.weather = typeof data.weather === "string" ? data.weather : state.weather;
  state.airTemp = typeof data.airTemp === "number" ? data.airTemp : state.airTemp;
  state.trackTemp = typeof data.trackTemp === "number" ? data.trackTemp : state.trackTemp;
  state.rainIntensity = typeof data.rainIntensity === "number" ? data.rainIntensity : state.rainIntensity;
  state.trackGrip = typeof data.trackGrip === "number" ? data.trackGrip : state.trackGrip;
  state.trackMap = data.trackMap ?? state.trackMap;
  state.updatedAtMs = Date.now();

  function str(v: unknown, fallback: string) {
    return typeof v === "string" && v.trim() ? v : fallback;
  }
  function num(v: unknown, fallback: number) {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  }

  state.participants = participants
    .slice()
    .sort((a, b) => a.participantIndex - b.participantIndex)
    .map((p) => ({
      ...p,
      driver: typeof p.driver === "string" ? p.driver.trim() : "",
      team: typeof p.team === "string" ? p.team.trim() : undefined
    }));

  const normalized = incomingEntries
    .map((e) => {
    const position = num(e.position, 0);
    const driver = str(e.driver, "—");
    const team = str(e.team, "");
    const statusRaw = typeof e.status === "string" && e.status.trim() ? e.status.trim() : undefined;
    const status = statusRaw?.toUpperCase() === "WAITING" ? "WAITING" : statusRaw;
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
      status,
      penalties: typeof e.penalties === "string" ? e.penalties : undefined,
      warnings: typeof e.warnings === "number" ? e.warnings : undefined,
      stops: typeof e.stops === "number" ? e.stops : undefined,
      participantIndex: typeof e.participantIndex === "number" ? e.participantIndex : undefined
    } as LiveTimingPostEntry;
  })
    .filter((e) => !isPlaceholderCar(e.driver))
    .filter((e) => (e.status ?? "").toUpperCase() !== "WAITING");

  const portraitByName = await resolvePortraitUrlsByDriverName(normalized.map((e) => e.driver));
  const teamLogoByName = await resolveTeamLogoUrlsByTeamName(
    Array.from(
      new Set(
        [
          ...normalized.map((e) => e.team ?? ""),
          ...state.participants.map((p) => (typeof p.team === "string" ? p.team : ""))
        ].map((x) => x.trim())
      )
    ).filter(Boolean)
  );
  if (state.participants.length) {
    state.participants = state.participants.map((p) => {
      const team = typeof p.team === "string" ? p.team.trim() : "";
      return {
        ...p,
        teamLogoUrl: team ? (teamLogoByName.get(team) ?? null) : null
      };
    });
  }
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
      portraitUrl: portraitByName.get(e.driver) ?? null,
      teamLogoUrl: e.team?.trim() ? (teamLogoByName.get(e.team.trim()) ?? null) : null
    }));

  if (state.sessionId !== prevSessionId) {
    state.alerts = [];
    resetAlertMeta(state);
  }

  const meta = ensureAlertMeta(state);
  const now = state.updatedAtMs;
  const mode = sessionModeFromName(state.sessionName ?? "");
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
      participants: state.participants,
      alerts: state.alerts,
      updatedAtMs: state.updatedAtMs,
      entries: state.entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}
