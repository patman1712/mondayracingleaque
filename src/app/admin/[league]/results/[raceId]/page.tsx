import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RaceResultsOcrClient } from "@/components/RaceResultsOcrClient";
import { RaceResultsBulkEditorClient } from "@/components/RaceResultsBulkEditorClient";
import { RaceResultsPosterExportClient } from "@/components/RaceResultsPosterExportClient";
import { RaceEntriesBulkEditorClient } from "@/components/RaceEntriesBulkEditorClient";
import { RaceResultsCsvImportClient } from "@/components/RaceResultsCsvImportClient";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const driverSelect = {
  driverId: true,
  role: true,
  teamId: true,
  driver: { select: { id: true, name: true, gamertag: true, portraitPath: true } },
  teamRef: { select: { name: true, color: true } }
} as const;
type DriverRow = {
  driverId: string;
  role: "MAIN" | "RESERVE";
  teamId: string | null;
  driver: { id: string; name: string; gamertag: string | null; portraitPath: string | null };
  teamRef: { name: string; color: string | null } | null;
};

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function dataRootDir() {
  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return railwayMount;
  return path.join(process.cwd(), "data");
}

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

function asUploadFile(v: unknown): File | null {
  if (!v || typeof v !== "object") return null;
  const f = v as { arrayBuffer?: unknown; size?: unknown; type?: unknown };
  if (typeof f.arrayBuffer !== "function") return null;
  if (typeof f.size !== "number") return null;
  if (typeof f.type !== "string") return null;
  return v as File;
}

async function writeUpload(fileName: string, file: File) {
  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
}

function deleteUpload(fileName: string | null | undefined) {
  if (!fileName) return;
  const abs = path.join(dataRootDir(), "uploads", fileName);
  try {
    fs.unlinkSync(abs);
  } catch {}
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toBerlinDateTimeLocalValue(d: Date) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);

  const map = new Map(parts.map((p) => [p.type, p.value] as const));
  const y = Number(map.get("year") ?? "0");
  const m = Number(map.get("month") ?? "0");
  const day = Number(map.get("day") ?? "0");
  const h = Number(map.get("hour") ?? "0");
  const min = Number(map.get("minute") ?? "0");
  if (!y || !m || !day) return "";
  return `${y}-${pad2(m)}-${pad2(day)}T${pad2(h)}:${pad2(min)}`;
}

function utcDateFromBerlinDateTimeLocalValue(input: string) {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const tz = "Europe/Berlin";
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(utcGuess);
  const map = new Map(parts.map((p) => [p.type, p.value] as const));
  const tzY = Number(map.get("year") ?? "0");
  const tzM = Number(map.get("month") ?? "0");
  const tzD = Number(map.get("day") ?? "0");
  const tzH = Number(map.get("hour") ?? "0");
  const tzMin = Number(map.get("minute") ?? "0");
  const tzS = Number(map.get("second") ?? "0");
  const asIfUtc = Date.UTC(tzY, tzM - 1, tzD, tzH, tzMin, tzS);
  const offsetMs = utcGuess.getTime() - asIfUtc;
  return new Date(utcGuess.getTime() + offsetMs);
}

function parseOcrToRows(raw: string) {
  const lines = raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: Array<{ position: number; driver: string; points: number; status?: string | null }> = [];

  for (const line of lines) {
    const simple = line.match(/^(?:P\s*)?(\d{1,2})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/i);
    if (simple) {
      const pos = Number(simple[1]);
      const pts = Number(String(simple[3]).replace(",", "."));
      const driver = simple[2].replace(/\s{2,}/g, " ").trim();
      if (Number.isFinite(pos) && Number.isFinite(pts) && driver) {
        rows.push({ position: pos, driver, points: pts });
        continue;
      }
    }

    const columns = line.match(/^(?:P\s*)?(\d{1,2})\s+(.+?)\s{2,}(.+?)\s{2,}(\d+(?:[.,]\d+)?)\s*$/i);
    if (columns) {
      const pos = Number(columns[1]);
      const pts = Number(String(columns[4]).replace(",", "."));
      const driver = columns[2].replace(/\s{2,}/g, " ").trim();
      if (Number.isFinite(pos) && Number.isFinite(pts) && driver) {
        rows.push({ position: pos, driver, points: pts });
        continue;
      }
    }
  }

  const uniqueByPos = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!uniqueByPos.has(r.position)) uniqueByPos.set(r.position, r);
  }
  return Array.from(uniqueByPos.values()).sort((a, b) => a.position - b.position).slice(0, 30);
}

function parseTimeToMs(s: string) {
  const raw = s.trim();
  const m = raw.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

function parseOcrToClassificationRows(raw: string) {
  const lines = raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  function normalizeBestTime(tok: string) {
    const t = tok.trim().replace(/[^0-9:.]/g, "");
    const m1 = t.match(/^(\d+):(\d{2})\.(\d{3})$/);
    if (m1) return `${Number(m1[1])}:${m1[2]}.${m1[3]}`;
    const m2 = t.match(/^(\d{3,})\.(\d{3})$/);
    if (m2) {
      const pre = m2[1];
      const ms = m2[2];
      const min = pre.slice(0, -2);
      const sec = pre.slice(-2);
      return `${Number(min)}:${sec}.${ms}`;
    }
    return null;
  }

  function normalizeTimeText(tok: string) {
    let t = tok.trim().toUpperCase().replace(/[^0-9A-Z+:.]/g, "");
    if (!t) return null;
    t = t.replace(/:\.(\d{2})\.(\d{3})$/, ":$1.$2");
    t = t.replace(/\+(\d+):\.(\d{2})\.(\d{3})$/, "+$1:$2.$3");
    if (["DNF", "DSQ", "DNS", "RET"].includes(t)) return t;
    if (/^\+\d+(?::\d{2})?\.\d{3}$/.test(t)) return t;
    if (/^\d+:\d{2}\.\d{3}$/.test(t)) return t;
    return null;
  }

  function classifyTime(t: string | null) {
    if (!t) return "none" as const;
    if (t.startsWith("+")) return "gap" as const;
    if (["DNF", "DSQ", "DNS", "RET"].includes(t)) return "status" as const;
    const ms = parseTimeToMs(t);
    if (ms === null) return "other" as const;
    const min = Math.floor(ms / 60000);
    if (min >= 5) return "race" as const;
    return "lap" as const;
  }

  const rows: Array<{
    position: number;
    driver: string;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status: string | null;
  }> = [];

  let inferredPos = 0;

  for (const line of lines) {
    const cleaned = line
      .replace(/[|]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const tokens = cleaned.split(/\s+/g).filter(Boolean);
    if (tokens.length < 3) continue;

    let pos: number | null = null;
    for (let i = 0; i < Math.min(tokens.length, 3); i++) {
      const m = tokens[i].match(/^(\d{1,2})$/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 30) {
          pos = n;
          break;
        }
      }
    }

    let timeIdx = -1;
    let timeText: string | null = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = normalizeTimeText(tokens[i]);
      if (t) {
        timeIdx = i;
        timeText = t;
        break;
      }
    }

    let bestIdx = -1;
    let bestTime: string | null = null;
    const bestScanEnd = timeIdx >= 0 ? timeIdx - 1 : tokens.length - 1;
    for (let i = bestScanEnd; i >= 0; i--) {
      const bt = normalizeBestTime(tokens[i]);
      if (bt) {
        bestIdx = i;
        bestTime = bt;
        break;
      }
    }

    const used = new Set<number>();
    if (timeIdx >= 0) used.add(timeIdx);
    if (bestIdx >= 0) used.add(bestIdx);

    const numeric: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (used.has(i)) continue;
      const m = tokens[i].match(/^(\d{1,2})$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isFinite(n)) continue;
      if (pos !== null && n === pos) continue;
      numeric.push(n);
    }

    const grid = numeric.length >= 1 ? numeric[0] : null;
    const stops = numeric.length >= 2 ? numeric[1] : null;

    const driverTokens: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (used.has(i)) continue;
      const t = tokens[i];
      if (pos !== null && i < 3 && t === String(pos)) continue;
      if (/^[\[\]\{\}\(\)]+$/.test(t)) continue;
      if (/^[\-–—]+$/.test(t)) continue;
      if (/^[A-Z]{1,3}$/.test(t)) continue;
      if (/^[A-Za-z]$/.test(t)) continue;
      if (/^\d{1,2}$/.test(t)) continue;
      if (/^[^\p{L}0-9]+$/u.test(t)) continue;
      driverTokens.push(t);
    }

    const driverRaw = driverTokens
      .join(" ")
      .replace(/\b10([A-Za-z])/g, "O$1")
      .replace(/\b\d+([A-Za-z])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!driverRaw) continue;
    const driverNorm = normalize(driverRaw);
    if (driverNorm.length < 4) continue;
    if (!bestTime && !timeText && grid === null && stops === null) continue;

    let best = bestTime;
    let time = timeText;

    const bestKind = classifyTime(best);
    const timeKind = classifyTime(time);

    if (!best && time && timeKind === "lap") {
      best = time;
      time = null;
    } else if (best && !time && bestKind === "race") {
      time = best;
      best = null;
    } else if (best && time) {
      if ((bestKind === "race" || bestKind === "gap") && timeKind === "lap") {
        const tmp = best;
        best = time;
        time = tmp;
      }
    }

    const status = time && ["DNF", "DSQ", "DNS", "RET"].includes(time) ? time : null;

    const position = pos ?? Math.min(30, inferredPos + 1);
    inferredPos = position;

    rows.push({
      position,
      driver: driverRaw,
      grid,
      stops,
      bestTime: best,
      timeText: time,
      status
    });
  }

  const uniqueByPos = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!uniqueByPos.has(r.position)) uniqueByPos.set(r.position, r);
  }
  return Array.from(uniqueByPos.values()).sort((a, b) => a.position - b.position).slice(0, 30);
}

async function setResultsPublished(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const publish = String(formData.get("publish") ?? "").trim() === "1";

  const race = await prisma.race
    .findUnique({ where: { id: raceId }, select: { id: true, league: true } })
    .catch(() => null);
  if (!race || race.league !== league) return;

  await prisma.race
    .update({
      where: { id: raceId },
      data: { resultsPublishedAt: publish ? new Date() : null }
    })
    .catch(() => null);

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);

  const slugs =
    (await prisma.leagueConfig
      .findMany({ select: { publicSlug: true } })
      .catch(() => [])) ?? [];
  const list =
    slugs.length > 0
      ? slugs
      : [{ publicSlug: "mrl-one" }, { publicSlug: "mrl-two" }, { publicSlug: "mrl-rookie" }];
  for (const l of list) {
    revalidatePath(`/${l.publicSlug}/races/${raceId}`);
    revalidatePath(`/${l.publicSlug}/results`);
    revalidatePath(`/${l.publicSlug}/standings`);
  }

  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function bulkUpsertResults(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const replace = formData.get("replace") === "on";
  const raw = String(formData.get("bulkJson") ?? "").trim();
  if (!raw) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  let rows: Array<{
    driverId: string;
    position: number;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status: string | null;
    fastestLap: boolean;
  }> = [];

  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) {
      rows = v
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const obj = r as Record<string, unknown>;
          const driverId = String(obj.driverId ?? "").trim();
          const position = Number(obj.position ?? "");
          const gridRaw = obj.grid != null && String(obj.grid).trim() !== "" ? Number(obj.grid) : null;
          const stopsRaw = obj.stops != null && String(obj.stops).trim() !== "" ? Number(obj.stops) : null;
          const grid = Number.isFinite(gridRaw as number) ? Math.floor(gridRaw as number) : null;
          const stops = Number.isFinite(stopsRaw as number) ? Math.floor(stopsRaw as number) : null;
          const bestTime = obj.bestTime ? String(obj.bestTime).trim() : null;
          const timeText = obj.timeText ? String(obj.timeText).trim() : null;
          const status = obj.status ? String(obj.status).trim() : null;
          const fastestLap = Boolean(obj.fastestLap);
          if (!driverId) return null;
          if (!Number.isFinite(position) || position < 1 || position > 60) return null;
          return {
            driverId,
            position: Math.floor(position),
            grid,
            stops,
            bestTime: bestTime || null,
            timeText: timeText || null,
            status: status || null,
            fastestLap
          };
        })
        .filter(
          (x): x is {
            driverId: string;
            position: number;
            grid: number | null;
            stops: number | null;
            bestTime: string | null;
            timeText: string | null;
            status: string | null;
            fastestLap: boolean;
          } => Boolean(x)
        );
    }
  } catch {}

  if (rows.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true }
    })
    .catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const existing = new Map(
    (
      await prisma.raceResult
        .findMany({ where: { raceId }, select: { driverId: true, points: true, fastestLap: true }, take: 5000 })
        .catch(() => [])
    ).map((r) => [r.driverId, { points: r.points, fastestLap: r.fastestLap }] as const)
  );

  const anyEntries = await prisma.raceEntry.findFirst({ where: { raceId }, select: { id: true } }).catch(() => null);
  const participating = anyEntries
    ? new Set(
        (
          await prisma.raceEntry
            .findMany({ where: { raceId, participates: true }, select: { driverId: true }, take: 5000 })
            .catch(() => [])
        ).map((e) => e.driverId)
      )
    : null;

  const eligible = new Set(
    (
      await prisma.driverSeason
        .findMany({ where: { seasonId: season.id }, distinct: ["driverId"], select: { driverId: true }, take: 5000 })
        .catch(() => [])
    ).map((e) => e.driverId)
  );

  const unique: Array<{
    driverId: string;
    position: number;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status: string | null;
    fastestLap: boolean;
  }> = [];
  const used = new Set<string>();
  for (const r of rows.sort((a, b) => a.position - b.position)) {
    if (used.has(r.driverId)) continue;
    used.add(r.driverId);
    if (!eligible.has(r.driverId)) continue;
    if (participating && !participating.has(r.driverId)) continue;
    unique.push(r);
  }

  const included = unique.filter((r) => Boolean(r.timeText || r.status || r.bestTime));
  if (included.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const fastestDriverId = included.find((r) => r.fastestLap)?.driverId ?? null;

  const base = 1000 + (Date.now() % 100000);
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < included.length; i++) {
      const r = included[i];
      const tempPos = base + i;
      const current = existing.get(r.driverId) ?? null;
      await tx.raceResult.upsert({
        where: { raceId_driverId: { raceId, driverId: r.driverId } },
        create: {
          raceId,
          driverId: r.driverId,
          position: tempPos,
          points: current ? current.points : 0,
          bestTime: null,
          timeText: null,
          status: null,
          fastestLap: false
        },
        update: { position: tempPos }
      });
    }

    for (let i = 0; i < included.length; i++) {
      const r = included[i];
      const pos = i + 1;
      await tx.raceResult.update({
        where: { raceId_driverId: { raceId, driverId: r.driverId } },
        data: {
          position: pos,
          grid: r.grid,
          stops: r.stops,
          bestTime: r.bestTime,
          timeText: r.timeText,
          status: r.status,
          fastestLap: false
        }
      });
    }

    await tx.raceResult.updateMany({ where: { raceId }, data: { fastestLap: false } });
    if (fastestDriverId) {
      await tx.raceResult
        .update({ where: { raceId_driverId: { raceId, driverId: fastestDriverId } }, data: { fastestLap: true } })
        .catch(() => null);
    }

    if (replace) {
      const ids = included.map((r) => r.driverId);
      await tx.raceResult.deleteMany({ where: { raceId, driverId: { notIn: ids } } }).catch(() => null);
    }
  });

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);

  const slugs =
    (await prisma.leagueConfig
      .findMany({ select: { publicSlug: true } })
      .catch(() => [])) ?? [];
  const list =
    slugs.length > 0
      ? slugs
      : [{ publicSlug: "mrl-one" }, { publicSlug: "mrl-two" }, { publicSlug: "mrl-rookie" }];
  for (const l of list) {
    revalidatePath(`/${l.publicSlug}/races/${raceId}`);
    revalidatePath(`/${l.publicSlug}/results`);
    revalidatePath(`/${l.publicSlug}/standings`);
  }

  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function setBroadcast(
  adminLeague: string,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();
  const twitchChannel = String(formData.get("twitchChannel") ?? "").trim();
  await prisma.race
    .update({
      where: { id: raceId },
      data: { twitchChannel: twitchChannel || null }
    })
    .catch(() => null);

  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  const pub =
    cfg?.publicSlug ??
    (adminLeague === "one"
      ? "mrl-one"
      : adminLeague === "two"
        ? "mrl-two"
        : adminLeague === "rookie"
          ? "mrl-rookie"
          : null);
  if (pub) revalidatePath(`/${pub}/races/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
}

async function updateRaceDetails(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const roundRaw = String(formData.get("round") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const circuit = String(formData.get("circuit") ?? "").trim();

  const round = roundRaw ? Number(roundRaw) : null;
  const startsAt = startsAtRaw ? utcDateFromBerlinDateTimeLocalValue(startsAtRaw) : null;
  if (!name || !round || !Number.isFinite(round) || !startsAt) {
    redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);
  }

  const current = await prisma.race
    .findUnique({ where: { id: raceId }, select: { id: true, league: true } })
    .catch(() => null);
  if (!current || current.league !== league) notFound();

  await prisma.race
    .update({
      where: { id: raceId },
      data: {
        name,
        round: Math.max(1, Math.floor(round)),
        startsAt,
        location: location || null,
        circuit: circuit || null
      }
    })
    .catch(() => null);

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/races`);
  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  const pub =
    cfg?.publicSlug ??
    (adminLeague === "one"
      ? "mrl-one"
      : adminLeague === "two"
        ? "mrl-two"
        : adminLeague === "rookie"
          ? "mrl-rookie"
          : null);
  if (pub) {
    revalidatePath(`/${pub}/races/${raceId}`);
    revalidatePath(`/${pub}/calendar`);
  }
  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function uploadResultsImages(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const race = await prisma.race
    .findUnique({ where: { id: raceId }, select: { id: true, league: true, resultsImagePath: true } })
    .catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const replaceImages = formData.get("replaceImages") === "on";

  const files = formData
    .getAll("images")
    .map((v) => asUploadFile(v))
    .filter((x): x is File => Boolean(x))
    .filter((f) => f.size > 0);

  if (files.length === 0) return;

  if (replaceImages) {
    const existing = await prisma.raceResultImage
      .findMany({ where: { raceId }, select: { id: true, imagePath: true }, take: 100 })
      .catch(() => []);
    await prisma.raceResultImage.deleteMany({ where: { raceId } }).catch(() => null);
    for (const e of existing) deleteUpload(e.imagePath);
  }

  const createdPaths: string[] = [];
  for (let i = 0; i < Math.min(files.length, 6); i++) {
    const image = files[i];
    if (image.size > 8_000_000) continue;
    const ext = extFromMime(image.type);
    if (!ext) continue;
    const fileName = `results-${raceId}-${Date.now()}-${i}.${ext}`;
    await writeUpload(fileName, image);
    createdPaths.push(fileName);
    await prisma.raceResultImage.create({ data: { raceId, imagePath: fileName } }).catch(() => null);
  }

  const first = createdPaths[0] ?? null;
  if (first) {
    await prisma.race
      .update({
        where: { id: raceId },
        data: { resultsImagePath: first }
      })
      .catch(() => null);
  }

  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  const pub =
    cfg?.publicSlug ??
    (adminLeague === "one"
      ? "mrl-one"
      : adminLeague === "two"
        ? "mrl-two"
        : adminLeague === "rookie"
          ? "mrl-rookie"
          : null);
  if (pub) revalidatePath(`/${pub}/races/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function ocrImportResultsFromImages(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const replace = formData.get("replace") === "on";
  const combined = String(formData.get("ocrText") ?? "").trim();
  const rowsJson = String(formData.get("ocrRowsJson") ?? "").trim();
  if (!combined) redirect(`/admin/${adminLeague}/results/${raceId}?error=ocr`);

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true }
    })
    .catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  await prisma.race.update({ where: { id: raceId }, data: { resultsOcrText: combined } }).catch(() => null);

  const seasonDrivers: Array<{ driver: { id: string; name: string; gamertag: string | null } }> = await prisma.driverSeason
    .findMany({
      where: { seasonId: season.id },
      distinct: ["driverId"],
      select: { driver: { select: { id: true, name: true, gamertag: true } } },
      take: 5000
    })
    .catch(() => []);

  const eligibleDrivers = seasonDrivers.map((e) => e.driver);
  if (eligibleDrivers.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=entries`);

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

  let parsed: Array<{
    position: number;
    driver: string;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status: string | null;
  }> = [];

  if (rowsJson) {
    try {
      const v = JSON.parse(rowsJson) as unknown;
      if (Array.isArray(v)) {
        parsed = v
          .map((r) => {
            if (!r || typeof r !== "object") return null;
            const obj = r as Record<string, unknown>;
            const position = Number(obj.position ?? "");
            const driver = String(obj.driver ?? "").trim();
            const gridRaw = obj.grid === null || typeof obj.grid === "undefined" ? null : Number(obj.grid);
            const stopsRaw = obj.stops === null || typeof obj.stops === "undefined" ? null : Number(obj.stops);
            const bestTime = obj.bestTime ? String(obj.bestTime).trim() : null;
            const timeText = obj.timeText ? String(obj.timeText).trim() : null;
            const status = obj.status ? String(obj.status).trim() : null;
            if (!Number.isFinite(position) || position < 1 || position > 30) return null;
            if (!driver) return null;
            return {
              position,
              driver,
              grid: gridRaw !== null && Number.isFinite(gridRaw) ? gridRaw : null,
              stops: stopsRaw !== null && Number.isFinite(stopsRaw) ? stopsRaw : null,
              bestTime: bestTime || null,
              timeText: timeText || null,
              status: status || null
            };
          })
          .filter((x): x is { position: number; driver: string; grid: number | null; stops: number | null; bestTime: string | null; timeText: string | null; status: string | null } => Boolean(x));
      }
    } catch {}
  }

  const pointsParsed = parsed.length === 0 ? parseOcrToRows(combined) : [];
  if (parsed.length === 0 && pointsParsed.length === 0) {
    parsed = parseOcrToClassificationRows(combined);
  }
  if (parsed.length === 0 && pointsParsed.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=ocr`);

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

  let matched = 0;

  if (parsed.length) {
    const bestTimes = parsed
      .map((r) => (r.bestTime ? parseTimeToMs(r.bestTime) : null))
      .filter((x): x is number => typeof x === "number");
    const bestMs = bestTimes.length ? Math.min(...bestTimes) : null;
    const fastestNorm = bestMs !== null && Number.isFinite(bestMs) ? bestMs : null;

    const usedPos = new Set<number>();
    for (const row of parsed) {
      if (usedPos.has(row.position)) continue;
      usedPos.add(row.position);
      const driverId = findDriverId(row.driver);
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

      const current = existing.get(driverId) ?? null;
      const points = current ? current.points : 0;
      const fastestLap =
        row.bestTime && fastestNorm !== null && parseTimeToMs(row.bestTime) === fastestNorm ? true : current?.fastestLap ?? false;

      await prisma.raceResult
        .upsert({
          where: { raceId_driverId: { raceId, driverId } },
          create: {
            raceId,
            driverId,
            position: row.position,
            points,
            grid: row.grid,
            stops: row.stops,
            bestTime: row.bestTime,
            timeText: row.timeText,
            status: row.status ?? null,
            fastestLap
          },
          update: {
            position: row.position,
            points,
            grid: row.grid,
            stops: row.stops,
            bestTime: row.bestTime,
            timeText: row.timeText,
            status: row.status ?? null,
            fastestLap
          }
        })
        .catch(() => null);
      matched++;
    }
  } else {
    for (const row of pointsParsed) {
      const driverId = findDriverId(row.driver);
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
      const current = existing.get(driverId) ?? null;
      const points = current ? current.points : row.points;
      await prisma.raceResult
        .upsert({
          where: { raceId_driverId: { raceId, driverId } },
          create: { raceId, driverId, position: row.position, points, status: row.status ?? null, fastestLap: current?.fastestLap ?? false },
          update: { position: row.position, points, status: row.status ?? null }
        })
        .catch(() => null);
      matched++;
    }
  }

  if (matched === 0) {
    await prisma.race
      .update({
        where: { id: raceId },
        data: { resultsOcrText: combined + "\n\nIMPORT: 0 Matches (Namen stimmen nicht mit teilnehmenden Fahrern überein)" }
      })
      .catch(() => null);
    redirect(`/admin/${adminLeague}/results/${raceId}?error=nomatch`);
  }
  await prisma.race
    .update({ where: { id: raceId }, data: { resultsOcrText: combined + `\n\nIMPORT: ${matched} Matches` } })
    .catch(() => null);

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);

  const slugs =
    (await prisma.leagueConfig
      .findMany({ select: { publicSlug: true } })
      .catch(() => [])) ?? [];
  const list =
    slugs.length > 0
      ? slugs
      : [{ publicSlug: "mrl-one" }, { publicSlug: "mrl-two" }, { publicSlug: "mrl-rookie" }];
  for (const l of list) {
    revalidatePath(`/${l.publicSlug}/results`);
    revalidatePath(`/${l.publicSlug}/standings`);
  }

  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  const pub =
    cfg?.publicSlug ??
    (adminLeague === "one"
      ? "mrl-one"
      : adminLeague === "two"
        ? "mrl-two"
        : adminLeague === "rookie"
          ? "mrl-rookie"
          : null);
  if (pub) revalidatePath(`/${pub}/races/${raceId}`);
  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function importResultsFromCsv(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const replace = formData.get("replace") === "on";
  const raw = String(formData.get("csvJson") ?? "").trim();
  if (!raw) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  let rows: Array<{
    position: number;
    driverName: string;
    driverId: string | null;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status: string | null;
    points: number | null;
    fastestLap: boolean;
  }> = [];

  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) {
      rows = v
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const obj = r as Record<string, unknown>;
          const position = Number(obj.position ?? "");
          const driverName = String(obj.driverName ?? "").trim();
          const driverIdRaw = obj.driverId ? String(obj.driverId).trim() : "";
          const driverId = driverIdRaw ? driverIdRaw : null;
          const gridRaw = obj.grid != null && String(obj.grid).trim() !== "" ? Number(obj.grid) : null;
          const stopsRaw = obj.stops != null && String(obj.stops).trim() !== "" ? Number(obj.stops) : null;
          const grid = Number.isFinite(gridRaw as number) ? Math.floor(gridRaw as number) : null;
          const stops = Number.isFinite(stopsRaw as number) ? Math.floor(stopsRaw as number) : null;
          const bestTime = obj.bestTime ? String(obj.bestTime).trim() : null;
          const timeText = obj.timeText ? String(obj.timeText).trim() : null;
          const status = obj.status ? String(obj.status).trim() : null;
          const pointsRaw = obj.points != null && String(obj.points).trim() !== "" ? Number(obj.points) : null;
          const points = Number.isFinite(pointsRaw as number) ? Number(pointsRaw) : null;
          const fastestLap = Boolean(obj.fastestLap);
          if (!Number.isFinite(position) || position < 1 || position > 60) return null;
          return {
            position: Math.floor(position),
            driverName,
            driverId,
            grid,
            stops,
            bestTime: bestTime || null,
            timeText: timeText || null,
            status: status || null,
            points,
            fastestLap
          };
        })
        .filter(
          (x): x is {
            position: number;
            driverName: string;
            driverId: string | null;
            grid: number | null;
            stops: number | null;
            bestTime: string | null;
            timeText: string | null;
            status: string | null;
            points: number | null;
            fastestLap: boolean;
          } => Boolean(x)
        );
    }
  } catch {}

  if (rows.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true }
    })
    .catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  const eligible = new Set(
    (
      await prisma.driverSeason
        .findMany({ where: { seasonId: season.id }, distinct: ["driverId"], select: { driverId: true }, take: 5000 })
        .catch(() => [])
    ).map((e) => e.driverId)
  );

  const anyEntries = await prisma.raceEntry.findFirst({ where: { raceId }, select: { id: true } }).catch(() => null);
  const participating = anyEntries
    ? new Set(
        (
          await prisma.raceEntry
            .findMany({ where: { raceId, participates: true }, select: { driverId: true }, take: 5000 })
            .catch(() => [])
        ).map((e) => e.driverId)
      )
    : null;

  const existing = new Map(
    (
      await prisma.raceResult
        .findMany({ where: { raceId }, select: { driverId: true, points: true, fastestLap: true }, take: 5000 })
        .catch(() => [])
    ).map((r) => [r.driverId, { points: r.points, fastestLap: r.fastestLap }] as const)
  );

  const used = new Set<string>();
  const included = rows
    .filter((r) => Boolean(r.driverId))
    .map((r) => ({
      driverId: r.driverId as string,
      position: r.position,
      grid: r.grid,
      stops: r.stops,
      bestTime: r.bestTime,
      timeText: r.timeText,
      status: r.status,
      fastestLap: r.fastestLap
    }))
    .sort((a, b) => a.position - b.position)
    .filter((r) => {
      if (used.has(r.driverId)) return false;
      used.add(r.driverId);
      if (!eligible.has(r.driverId)) return false;
      if (participating && !participating.has(r.driverId)) return false;
      return Boolean(r.timeText || r.status || r.bestTime);
    });

  const fastestDriverId = included.find((r) => r.fastestLap)?.driverId ?? null;

  const draft = rows
    .filter((r) => !r.driverId)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      position: r.position,
      driverName: r.driverName,
      driverId: null,
      grid: r.grid,
      stops: r.stops,
      bestTime: r.bestTime,
      timeText: r.timeText,
      status: r.status,
      points: r.points,
      fastestLap: r.fastestLap
    }));

  const base = 1000 + (Date.now() % 100000);
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < included.length; i++) {
      const r = included[i];
      const tempPos = base + i;
      const current = existing.get(r.driverId) ?? null;

      await tx.raceEntry
        .upsert({
          where: { raceId_driverId: { raceId, driverId: r.driverId } },
          create: { raceId, driverId: r.driverId, participates: true, teamId: null },
          update: { participates: true }
        })
        .catch(() => null);

      await tx.raceResult.upsert({
        where: { raceId_driverId: { raceId, driverId: r.driverId } },
        create: {
          raceId,
          driverId: r.driverId,
          position: tempPos,
          points: current ? current.points : 0,
          grid: null,
          stops: null,
          bestTime: null,
          timeText: null,
          status: null,
          fastestLap: false
        },
        update: { position: tempPos }
      });
    }

    for (let i = 0; i < included.length; i++) {
      const r = included[i];
      const pos = i + 1;
      await tx.raceResult.update({
        where: { raceId_driverId: { raceId, driverId: r.driverId } },
        data: {
          position: pos,
          grid: r.grid,
          stops: r.stops,
          bestTime: r.bestTime,
          timeText: r.timeText,
          status: r.status,
          fastestLap: false
        }
      });
    }

    await tx.raceResult.updateMany({ where: { raceId }, data: { fastestLap: false } });
    if (fastestDriverId) {
      await tx.raceResult
        .update({ where: { raceId_driverId: { raceId, driverId: fastestDriverId } }, data: { fastestLap: true } })
        .catch(() => null);
    }

    if (replace) {
      const ids = included.map((r) => r.driverId);
      await tx.raceResult.deleteMany({ where: { raceId, driverId: { notIn: ids } } }).catch(() => null);
    }

    await tx.race.update({ where: { id: raceId }, data: { resultsCsvDraftJson: draft.length ? JSON.stringify(draft) : null } });
  });

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);

  const slugs =
    (await prisma.leagueConfig
      .findMany({ select: { publicSlug: true } })
      .catch(() => [])) ?? [];
  const list =
    slugs.length > 0
      ? slugs
      : [{ publicSlug: "mrl-one" }, { publicSlug: "mrl-two" }, { publicSlug: "mrl-rookie" }];
  for (const l of list) {
    revalidatePath(`/${l.publicSlug}/races/${raceId}`);
    revalidatePath(`/${l.publicSlug}/results`);
    revalidatePath(`/${l.publicSlug}/standings`);
  }

  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function bulkUpsertRaceEntries(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const raw = String(formData.get("entriesJson") ?? "").trim();
  let rows: Array<{ driverId?: unknown; participates?: unknown; teamId?: unknown }> = [];
  try {
    rows = raw ? JSON.parse(raw) : [];
  } catch {
    redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);
  }

  const race = await prisma.race
    .findUnique({ where: { id: raceId }, select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true } })
    .catch(() => null);
  if (!race || race.league !== league) return;

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) return;

  const eligible = await prisma.driverSeason
    .findMany({
      where: { seasonId: season.id },
      select: { driverId: true, role: true },
      take: 5000
    })
    .catch((): Array<{ driverId: string; role: "MAIN" | "RESERVE" }> => []);
  const roleByDriverId = new Map(eligible.map((e) => [e.driverId, e.role] as const));

  const allowedTeams = await prisma.teamLeague
    .findMany({ where: { league }, select: { teamId: true }, take: 5000 })
    .catch((): Array<{ teamId: string }> => []);
  const allowedTeamIds = new Set(allowedTeams.map((t) => t.teamId));

  for (const r of rows) {
    const driverId = String(r?.driverId ?? "").trim();
    if (!driverId) continue;
    const role = roleByDriverId.get(driverId) ?? null;
    if (!role) continue;

    const participates = String(r?.participates ?? "").trim() === "true" || String(r?.participates ?? "").trim() === "1";
    const teamIdRaw = String(r?.teamId ?? "").trim();
    const teamId =
      role === "RESERVE" && participates && teamIdRaw && allowedTeamIds.has(teamIdRaw) ? teamIdRaw : null;

    await prisma.raceEntry
      .upsert({
        where: { raceId_driverId: { raceId, driverId } },
        create: { raceId, driverId, participates, teamId },
        update: { participates, teamId: participates ? teamId : null }
      })
      .catch(() => null);
  }

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1#driver-field`);
}

export default async function AdminRaceResultsPage({
  params
  , searchParams
}: {
  params: Promise<{ league: string; raceId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const { league, raceId } = await params;
  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: {
        id: true,
        league: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        name: true,
        circuit: true,
        location: true,
        startsAt: true,
        twitchChannel: true,
        resultsImagePath: true,
        resultsOcrText: true,
        resultsCsvDraftJson: true,
        resultsPublishedAt: true,
        resultImages: {
          select: { id: true, imagePath: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }],
          take: 50
        }
      }
    })
    .catch(() => null);

  if (!race || race.league !== l) notFound();

  type DriverItem = {
    id: string;
    name: string;
    gamertag: string | null;
    role: "MAIN" | "RESERVE";
    teamName: string | null;
    teamColor: string | null;
    portraitUrl: string | null;
  };
  type ResultItem = {
    id: string;
    driverId: string;
    position: number;
    points: number;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status: string | null;
    fastestLap: boolean;
    driver: { name: string };
  };

  let drivers: DriverItem[] = [];
  let results: ResultItem[] = [];
  let entries: Array<{
    driverId: string;
    participates: boolean;
    teamId: string | null;
    team: { id: string; name: string; color: string | null } | null;
  }> = [];
  let leagueTeams: Array<{ id: string; name: string }> = [];

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league: l,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);

  try {
    const rows: DriverRow[] = season
      ? await prisma.driverSeason
          .findMany({
            where: { seasonId: season.id },
            orderBy: [{ driver: { name: "asc" } }],
            select: driverSelect,
            take: 5000
          })
          .catch((): DriverRow[] => [])
      : await prisma.driverSeason
          .findMany({
            where: { season: { league: l } },
            orderBy: [{ driver: { name: "asc" } }],
            select: driverSelect,
            take: 5000
          })
          .catch((): DriverRow[] => []);

    drivers = rows.map((r) => ({
      id: r.driver.id,
      name: r.driver.name,
      gamertag: r.driver.gamertag ?? null,
      role: r.role,
      teamName: r.role === "MAIN" ? r.teamRef?.name ?? null : null,
      teamColor: r.role === "MAIN" ? r.teamRef?.color ?? null : null,
      portraitUrl: imageUrl(r.driver.portraitPath)
    }));
  } catch {}

  try {
    results = await prisma.raceResult.findMany({
      where: { raceId },
      orderBy: [{ position: "asc" }],
      select: {
        id: true,
        driverId: true,
        position: true,
        points: true,
        grid: true,
        stops: true,
        bestTime: true,
        timeText: true,
        status: true,
        fastestLap: true,
        driver: { select: { name: true } }
      }
    });
  } catch {}

  entries = await prisma.raceEntry
    .findMany({
      where: { raceId },
      select: { driverId: true, participates: true, teamId: true, team: { select: { id: true, name: true, color: true } } },
      take: 5000
    })
    .catch(() => []);

  const leagueTeamRows = await prisma.teamLeague
    .findMany({
      where: { league: l },
      orderBy: [{ team: { name: "asc" } }],
      select: { team: { select: { id: true, name: true } } },
      take: 2000
    })
    .catch((): Array<{ team: { id: string; name: string } }> => []);
  leagueTeams = leagueTeamRows.map((r) => r.team);

  const entryByDriverId = new Map(entries.map((e) => [e.driverId, e] as const));
  const participatingDriverIds = new Set(entries.filter((e) => e.participates).map((e) => e.driverId));
  const participatingDrivers = drivers.filter((d) => participatingDriverIds.has(d.id));
  const driverById = new Map(participatingDrivers.map((d) => [d.id, d] as const));

  const bulkDrivers = participatingDrivers.map((d) => {
    const entry = entryByDriverId.get(d.id) ?? null;
    const teamName = d.role === "MAIN" ? d.teamName : entry?.team?.name ?? null;
    return { driverId: d.id, name: d.name, teamName };
  });

  const posterRows = results.map((r) => {
    const d = driverById.get(r.driverId) ?? null;
    const entry = entryByDriverId.get(r.driverId) ?? null;
    const accent = entry?.team?.color ?? d?.teamColor ?? null;
    return {
      position: r.position,
      driverId: r.driverId,
      driverName: r.driver.name,
      portraitUrl: d?.portraitUrl ?? null,
      accent,
      points: r.points,
      timeText: r.timeText,
      status: r.status,
      bestTime: r.bestTime,
      fastestLap: r.fastestLap
    };
  });

  return (
    <AdminShell>
      <div className="space-y-6">
      {ok ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Gespeichert.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Fehler: {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base font-semibold">Rennen Details</div>
          <Link
            href={`/admin/${league}/races`}
            className="text-sm font-semibold text-white/70 hover:text-white"
          >
            Zurück
          </Link>
        </div>
        <div className="mt-2 text-sm text-white/70">
          {race.seasonIsTest ? "TEST · " : ""}Saison {race.season} · Season {race.seasonNo} · Runde {race.round} · {race.name} ·{" "}
          {new Date(race.startsAt).toLocaleString("de-DE")}
        </div>

        <form action={updateRaceDetails.bind(null, league, l, raceId)} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Name
            </label>
            <input
              name="name"
              defaultValue={race.name}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Runde
            </label>
            <input
              name="round"
              inputMode="numeric"
              defaultValue={race.round}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Startzeit (Europe/Berlin)
            </label>
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={toBerlinDateTimeLocalValue(new Date(race.startsAt))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Location (optional)
            </label>
            <input
              name="location"
              defaultValue={race.location ?? ""}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Circuit (optional)
            </label>
            <input
              name="circuit"
              defaultValue={race.circuit ?? ""}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div className="md:col-span-2">
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Rennen speichern
            </button>
          </div>
        </form>

        <form action={setBroadcast.bind(null, league, raceId)} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Twitch Channel (oder URL)
            </label>
            <input
              name="twitchChannel"
              defaultValue={race.twitchChannel ?? ""}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="https://twitch.tv/deinchannel"
            />
            <div className="mt-2 text-xs text-white/60">
              Wird vor dem Rennen auf der Detailseite eingeblendet und nach dem Rennen ausgeblendet.
            </div>
          </div>
          <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
            Speichern
          </button>
        </form>
      </div>

      <details className="rounded-2xl border border-white/10 bg-white/5">
        <summary className="cursor-pointer list-none px-6 py-5 text-base font-semibold text-white">
          Automatisch auslesen (Bilder/OCR/Telemetry)
          <div className="mt-2 text-sm font-normal text-white/70">
            Optional: Ergebnisse per Bilder-Upload + OCR oder per F1 2025 UDP Telemetry importieren.
          </div>
        </summary>

        <div className="px-6 pb-6">

        {error && ["image", "ocr", "entries", "invalid", "nomatch"].includes(error) ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            {error === "entries"
              ? "Bitte zuerst im Fahrerfeld die Fahrer auf „Nimmt teil“ setzen, dann OCR ausführen."
              : error === "image"
                ? "Keine gültigen Ergebnisbilder gefunden."
                : error === "nomatch"
                  ? "Import hat keinen Fahrer zugeordnet. Meist stimmt der Name aus der OCR nicht mit den teilnehmenden Fahrern überein."
                : error === "ocr"
                  ? "OCR konnte keine verwertbaren Zeilen erkennen."
                  : "Ungültige Anfrage."}
          </div>
        ) : null}

        <form
          action={uploadResultsImages.bind(null, league, l, raceId)}
          encType="multipart/form-data"
          className="mt-6 grid gap-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Ergebnis-Bilder
            </label>
            <input
              name="images"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80 md:col-span-2">
            <input type="checkbox" name="replaceImages" className="h-4 w-4" />{" "}
            Vorhandene Bilder ersetzen
          </label>
          <FormSubmitButton
            className="w-fit rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            pendingText="Hochladen…"
          >
            Hochladen
          </FormSubmitButton>
        </form>

        {race.resultsImagePath || race.resultImages.length ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              {race.resultImages.length ? (
                <div className="grid grid-cols-2 gap-2 p-2">
                  {race.resultImages.map((img) => (
                    <img
                      key={img.id}
                      src={imageUrl(img.imagePath) ?? ""}
                      alt=""
                      className="h-[160px] w-full rounded-lg bg-black/20 object-cover"
                    />
                  ))}
                </div>
              ) : race.resultsImagePath ? (
                <img src={imageUrl(race.resultsImagePath) ?? ""} alt="" className="w-full" />
              ) : null}
            </div>
            <div className="space-y-3">
              <form id="ocr-import-form" action={ocrImportResultsFromImages.bind(null, league, l, raceId)}>
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input type="checkbox" name="replace" className="h-4 w-4" />{" "}
                  Vorhandene Ergebnisse ersetzen
                </label>
                <textarea name="ocrText" className="hidden" defaultValue="" />
                <textarea name="ocrRowsJson" className="hidden" defaultValue="" />
                <RaceResultsOcrClient
                  formId="ocr-import-form"
                  imageUrls={race.resultImages.map((img) => imageUrl(img.imagePath) ?? "").filter(Boolean)}
                />
              </form>

              {race.resultsOcrText ? (
                <textarea
                  readOnly
                  value={race.resultsOcrText}
                  className="h-[220px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 outline-none"
                />
              ) : null}

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
                <div className="font-semibold text-white">Telemetry (F1 2025 UDP)</div>
                <div className="mt-2">
                  Race ID: <span className="font-mono text-white/90">{raceId}</span>
                </div>
                <div className="mt-1">
                  Endpoint: <span className="font-mono text-white/90">/api/telemetry/ingest</span>
                </div>
                <div className="mt-2 text-xs text-white/70">
                  PC-Bridge: scripts/telemetry-bridge.mjs (Env: TELEMETRY_RACE_ID, TELEMETRY_TARGET_URL, TELEMETRY_INGEST_TOKEN)
                </div>
              </div>

              <div className="mt-4">
                <RaceResultsCsvImportClient
                  drivers={participatingDrivers.map((d) => ({ id: d.id, name: d.name, gamertag: d.gamertag }))}
                  existingDraftJson={race.resultsCsvDraftJson ?? null}
                  action={importResultsFromCsv.bind(null, league, l, raceId)}
                />
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </details>

      <details id="driver-field" className="rounded-2xl border border-white/10 bg-white/5">
        <summary className="cursor-pointer list-none px-6 py-5 text-base font-semibold text-white">
          Fahrerfeld
          <div className="mt-2 text-sm font-normal text-white/70">
            Teilnahme pro Fahrer bestätigen. Mehrere Fahrer anklicken und unten einmal speichern.
          </div>
        </summary>
        <div className="px-6 pb-6">
          {drivers.length === 0 ? (
            <div className="text-sm text-white/60">Keine Fahrer gefunden.</div>
          ) : (
            <RaceEntriesBulkEditorClient
              drivers={drivers.map((d) => {
                const entry = entryByDriverId.get(d.id) ?? null;
                return {
                  driverId: d.id,
                  name: d.name,
                  role: d.role,
                  teamName: d.teamName,
                  participates: entry?.participates ?? false,
                  teamId: entry?.teamId ?? null
                };
              })}
              teams={leagueTeams}
              action={bulkUpsertRaceEntries.bind(null, league, l, raceId)}
            />
          )}
        </div>
      </details>

      <div id="manual-results" className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base font-semibold">Rennergebnis (Manuell)</div>
        </div>
        <div className="mt-2 text-sm text-white/70">
          Saison {race.season} · Runde {race.round} · {race.name} ·{" "}
          {new Date(race.startsAt).toLocaleString("de-DE")}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm text-white/80">
            Status:{" "}
            {race.resultsPublishedAt ? (
              <span className="font-semibold text-white">Veröffentlicht</span>
            ) : (
              <span className="font-semibold text-white/80">Nur Admin</span>
            )}
          </div>
          <form action={setResultsPublished.bind(null, league, l, raceId)}>
            <input type="hidden" name="publish" value={race.resultsPublishedAt ? "0" : "1"} />
            <FormSubmitButton
              className={
                "w-fit rounded-lg px-4 py-2 text-sm font-semibold " +
                (race.resultsPublishedAt ? "bg-white/10 text-white hover:bg-white/15" : "bg-mrl-red text-white")
              }
              pendingText="Speichern…"
            >
              {race.resultsPublishedAt ? "Veröffentlichung zurücknehmen" : "Ergebnis veröffentlichen"}
            </FormSubmitButton>
          </form>
        </div>

        {results.length > 0 ? (
          <div className="mt-4">
            <RaceResultsPosterExportClient
              raceId={raceId}
              title="Rennergebnis"
              subtitle={`Saison ${race.season} · Runde ${race.round} · ${race.name}`}
              rows={posterRows}
              saveEnabled
            />
          </div>
        ) : null}

        <div className="mt-6">
          {bulkDrivers.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              Bitte zuerst im Fahrerfeld die Fahrer auf „Nimmt teil“ setzen, dann kannst du hier alle Ergebnisse in einem Schritt eintragen.
            </div>
          ) : (
            <RaceResultsBulkEditorClient
              drivers={bulkDrivers}
              existingResults={results.map((r) => ({
                driverId: r.driverId,
                position: r.position,
                bestTime: r.bestTime,
                timeText: r.timeText,
                status: r.status,
                fastestLap: r.fastestLap
              }))}
              action={bulkUpsertResults.bind(null, league, l, raceId)}
            />
          )}
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
