import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readAdminCookie, verifyAdminSession } from "@/lib/adminAuth";

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

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function formatMsAsTime(ms: number) {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

function formatSecondsAsTime(secondsRaw: number) {
  if (!Number.isFinite(secondsRaw) || secondsRaw <= 0) return null;
  const ms = Math.round(secondsRaw * 1000);
  const totalSeconds = Math.floor(ms / 1000);
  const milli = ms % 1000;
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

function statusFromResultStatus(code: number | null | undefined) {
  if (typeof code !== "number") return null;
  if (code === 5) return "DSQ";
  if (code === 6) return "NC";
  if (code === 4 || code === 7) return "DNF";
  return null;
}

const IngestSchema = z.object({
  raceId: z.string().min(1),
  replace: z.boolean().optional(),
  participants: z
    .array(
      z.object({
        carIndex: z.number().int().min(0).max(63),
        name: z.string().trim().min(1).nullable().optional(),
        aiControlled: z.number().int().optional()
      })
    )
    .optional(),
  classification: z.array(
    z.object({
      carIndex: z.number().int().min(0).max(63),
      position: z.number().int().min(0).max(50),
      gridPosition: z.number().int().min(0).max(50).optional(),
      numPitStops: z.number().int().min(0).max(50).optional(),
      bestLapTimeInMs: z.number().int().min(0).optional(),
      totalRaceTime: z.number().optional(),
      resultStatus: z.number().int().optional(),
      resultReason: z.number().int().optional(),
      points: z.number().optional()
    })
  )
});

async function isAuthorized(req: Request) {
  const ingestToken = process.env.TELEMETRY_INGEST_TOKEN?.trim() ?? "";
  const headerToken = req.headers.get("x-telemetry-token")?.trim() ?? "";

  if (ingestToken && headerToken && timingSafeEqual(headerToken, ingestToken)) return true;

  const cookie = await readAdminCookie();
  if (!cookie) return false;
  const session = await verifyAdminSession(cookie);
  return Boolean(session);
}

export async function POST(req: Request) {
  const ok = await isAuthorized(req);
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { raceId, replace = false, participants = [], classification } = parsed.data;

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true }
    })
    .catch(() => null);
  if (!race) return NextResponse.json({ ok: false, error: "race_not_found" }, { status: 404 });

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league: race.league,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) return NextResponse.json({ ok: false, error: "season_not_found" }, { status: 409 });

  const seasonDrivers: Array<{ driver: { id: string; name: string; gamertag: string | null } }> = await prisma.driverSeason
    .findMany({
      where: { seasonId: season.id },
      distinct: ["driverId"],
      select: { driver: { select: { id: true, name: true, gamertag: true } } },
      take: 5000
    })
    .catch(() => []);

  const eligibleDrivers = seasonDrivers.map((e) => e.driver);
  if (eligibleDrivers.length === 0) {
    return NextResponse.json({ ok: false, error: "no_eligible_drivers" }, { status: 409 });
  }

  const allEntries: Array<{ driverId: string; participates: boolean }> = await prisma.raceEntry
    .findMany({ where: { raceId }, select: { driverId: true, participates: true }, take: 5000 })
    .catch(() => []);
  const hasAnyEntries = allEntries.length > 0;
  const entryByDriverId = new Map(allEntries.map((e) => [e.driverId, e] as const));

  const driverByNorm = new Map<string, { id: string; name: string; gamertag: string | null }>();
  for (const d of eligibleDrivers) {
    const keys = [normalize(d.name), d.gamertag ? normalize(d.gamertag) : ""].filter(Boolean);
    for (const k of keys) {
      if (!k) continue;
      if (driverByNorm.has(k)) continue;
      driverByNorm.set(k, d);
    }
  }

  function findDriverId(name: string) {
    const n = normalize(name);
    if (driverByNorm.has(n)) return driverByNorm.get(n)!.id;
    for (const [k, v] of driverByNorm) {
      if (k.includes(n) || n.includes(k)) return v.id;
    }
    let best: { id: string; dist: number; len: number } | null = null;
    for (const [k, v] of driverByNorm) {
      const d = levenshtein(n, k);
      if (!best || d < best.dist) best = { id: v.id, dist: d, len: Math.max(n.length, k.length) };
    }
    if (!best) return null;
    const ratio = best.len ? best.dist / best.len : 1;
    const maxDist = best.len <= 10 ? 2 : best.len <= 16 ? 3 : 4;
    if (best.dist <= maxDist && ratio <= 0.25) return best.id;
    return null;
  }

  const participantNameByCarIndex = new Map<number, string>();
  for (const p of participants) {
    const n = p.name?.trim() ?? "";
    if (!n) continue;
    participantNameByCarIndex.set(p.carIndex, n);
  }

  if (replace) {
    await prisma.raceResult.deleteMany({ where: { raceId } }).catch(() => null);
  }

  const existing = replace
    ? new Map<string, { points: number; fastestLap: boolean }>()
    : new Map(
        (
          await prisma.raceResult
            .findMany({ where: { raceId }, select: { driverId: true, points: true, fastestLap: true }, take: 5000 })
            .catch(() => [])
        ).map((r) => [r.driverId, { points: r.points, fastestLap: r.fastestLap }] as const)
      );

  const bestLapTimes = classification
    .map((c) => (typeof c.bestLapTimeInMs === "number" && c.bestLapTimeInMs > 0 ? c.bestLapTimeInMs : null))
    .filter((x): x is number => typeof x === "number");
  const bestMs = bestLapTimes.length ? Math.min(...bestLapTimes) : null;
  const fastestMs = bestMs !== null && Number.isFinite(bestMs) ? bestMs : null;

  let matched = 0;
  for (const c of classification) {
    const rawName = participantNameByCarIndex.get(c.carIndex) ?? "";
    if (!rawName) continue;
    const driverId = findDriverId(rawName);
    if (!driverId) continue;

    if (hasAnyEntries) {
      const entry = entryByDriverId.get(driverId) ?? null;
      if (entry && !entry.participates) continue;
      if (!entry) {
        await prisma.raceEntry
          .upsert({
            where: { raceId_driverId: { raceId, driverId } },
            create: { raceId, driverId, participates: true, teamId: null },
            update: { participates: true }
          })
          .catch(() => null);
      }
    }

    const posRaw = c.position;
    if (!Number.isFinite(posRaw) || posRaw < 1 || posRaw > 50) continue;
    const position = Math.floor(posRaw);

    const grid = typeof c.gridPosition === "number" && Number.isFinite(c.gridPosition) ? Math.max(0, Math.floor(c.gridPosition)) : null;
    const stops = typeof c.numPitStops === "number" && Number.isFinite(c.numPitStops) ? Math.max(0, Math.floor(c.numPitStops)) : null;
    const bestTime =
      typeof c.bestLapTimeInMs === "number" && Number.isFinite(c.bestLapTimeInMs) && c.bestLapTimeInMs > 0
        ? formatMsAsTime(c.bestLapTimeInMs)
        : null;
    const timeText = typeof c.totalRaceTime === "number" ? formatSecondsAsTime(c.totalRaceTime) : null;
    const status = statusFromResultStatus(c.resultStatus);

    const current = existing.get(driverId) ?? null;
    const points = current ? current.points : 0;
    const fastestLap =
      typeof c.bestLapTimeInMs === "number" && fastestMs !== null && c.bestLapTimeInMs > 0 && c.bestLapTimeInMs === fastestMs
        ? true
        : current?.fastestLap ?? false;

    await prisma.raceResult
      .upsert({
        where: { raceId_driverId: { raceId, driverId } },
        create: {
          raceId,
          driverId,
          position,
          points,
          grid,
          stops,
          bestTime,
          timeText,
          status,
          fastestLap
        },
        update: {
          position,
          points,
          grid,
          stops,
          bestTime,
          timeText,
          status,
          fastestLap
        }
      })
      .catch(() => null);
    matched++;
  }

  const cfg = await prisma.leagueConfig
    .findUnique({ where: { league: race.league }, select: { adminSlug: true, publicSlug: true } })
    .catch(() => null);
  if (cfg?.adminSlug) {
    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath(`/admin/${cfg.adminSlug}/results/${raceId}`);
      revalidatePath(`/admin/${cfg.adminSlug}/results`);
      revalidatePath(`/admin/${cfg.adminSlug}/standings`);
    } catch {}
  }
  if (cfg?.publicSlug) {
    try {
      const { revalidatePath } = await import("next/cache");
      revalidatePath(`/${cfg.publicSlug}/races/${raceId}`);
      revalidatePath(`/${cfg.publicSlug}/results`);
      revalidatePath(`/${cfg.publicSlug}/standings`);
    } catch {}
  }

  return NextResponse.json({ ok: true, matched, replaced: replace });
}
