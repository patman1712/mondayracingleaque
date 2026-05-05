import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League, Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { RaceDriverField } from "@/components/RaceDriverField";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const driverSelect = {
  driverId: true,
  role: true,
  teamId: true,
  driver: { select: { id: true, name: true } },
  teamRef: { select: { name: true } }
} satisfies Prisma.DriverSeasonSelect;
type DriverRow = Prisma.DriverSeasonGetPayload<{ select: typeof driverSelect }>;

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

  const rows: Array<{
    position: number;
    driver: string;
    grid: number | null;
    stops: number | null;
    bestTime: string | null;
    timeText: string | null;
    status?: string | null;
  }> = [];

  for (const line of lines) {
    const cleaned = line
      .replace(/[|]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const m = cleaned.match(
      /^(\d{1,2})\s+(.+?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d+:\d{2}\.\d{3})\s+([+\d:\.]+|DNF|DSQ|DNS|RET)\s*$/i
    );
    if (!m) continue;

    const position = Number(m[1]);
    const driver = m[2].trim();
    const grid = Number(m[3]);
    const stops = Number(m[4]);
    const bestTime = m[5].trim();
    const timeText = m[6].trim().toUpperCase();
    if (!Number.isFinite(position) || !driver) continue;

    const status = ["DNF", "DSQ", "DNS", "RET"].includes(timeText) ? timeText : null;
    rows.push({
      position,
      driver,
      grid: Number.isFinite(grid) ? grid : null,
      stops: Number.isFinite(stops) ? stops : null,
      bestTime: bestTime || null,
      timeText: timeText || null,
      status
    });
  }

  const uniqueByPos = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!uniqueByPos.has(r.position)) uniqueByPos.set(r.position, r);
  }
  return Array.from(uniqueByPos.values()).sort((a, b) => a.position - b.position).slice(0, 30);
}

async function upsertResult(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";

  await requireAdmin();
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

  const driverId = String(formData.get("driverId") ?? "");
  const position = Number(formData.get("position") ?? "");
  const points = Number(formData.get("points") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  const fastestLap = formData.get("fastestLap") === "on";

  if (!driverId || !Number.isFinite(position) || !Number.isFinite(points)) return;

  if (season) {
    const eligible = await prisma.driverSeason
      .findUnique({ where: { driverId_seasonId: { driverId, seasonId: season.id } }, select: { id: true } })
      .catch(() => null);
    if (!eligible) return;
  }

  const anyEntries = await prisma.raceEntry.findFirst({ where: { raceId }, select: { id: true } }).catch(() => null);
  if (anyEntries) {
    const entry = await prisma.raceEntry
      .findUnique({ where: { raceId_driverId: { raceId, driverId } }, select: { participates: true } })
      .catch(() => null);
    if (!entry?.participates) return;
  }

  await prisma.raceResult.upsert({
    where: { raceId_driverId: { raceId, driverId } },
    create: {
      raceId,
      driverId,
      position,
      points,
      status: status || null,
      fastestLap
    },
    update: {
      position,
      points,
      status: status || null,
      fastestLap
    }
  });

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);
  revalidatePath("/admin");
  revalidatePath("/mrl-one/results");
  revalidatePath("/mrl-two/results");
  revalidatePath("/mrl-rookie/results");
  revalidatePath("/mrl-one/standings");
  revalidatePath("/mrl-two/standings");
  revalidatePath("/mrl-rookie/standings");
}

async function deleteResult(
  adminLeague: string,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.raceResult.delete({ where: { id } });
  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);
  revalidatePath("/mrl-one/results");
  revalidatePath("/mrl-two/results");
  revalidatePath("/mrl-rookie/results");
  revalidatePath("/mrl-one/standings");
  revalidatePath("/mrl-two/standings");
  revalidatePath("/mrl-rookie/standings");
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

  const imgs = await prisma.raceResultImage
    .findMany({
      where: { raceId },
      orderBy: [{ createdAt: "asc" }],
      select: { imagePath: true },
      take: 20
    })
    .catch(() => []);
  if (imgs.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=image`);

  const uploadsDir = path.join(dataRootDir(), "uploads");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  const texts: string[] = [];
  for (const img of imgs) {
    const abs = path.join(uploadsDir, img.imagePath);
    const rel = path.relative(uploadsDir, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(abs)) continue;
    const res = await worker.recognize(abs);
    const text = (res.data.text ?? "").trim();
    if (text) texts.push(text);
  }
  await worker.terminate();

  const combined = texts.join("\n\n");
  if (!combined) redirect(`/admin/${adminLeague}/results/${raceId}?error=ocr`);

  await prisma.race.update({ where: { id: raceId }, data: { resultsOcrText: combined } }).catch(() => null);

  const entryDrivers = await prisma.raceEntry
    .findMany({
      where: { raceId, participates: true },
      select: { driver: { select: { id: true, name: true } } },
      take: 5000
    })
    .catch((): Array<{ driver: { id: string; name: string } }> => []);

  const eligibleDrivers = entryDrivers.map((e) => e.driver);
  if (eligibleDrivers.length === 0) redirect(`/admin/${adminLeague}/results/${raceId}?error=entries`);

  const driverByNorm = new Map<string, { id: string; name: string }>();
  for (const d of eligibleDrivers) {
    const k = normalize(d.name);
    if (!k) continue;
    if (driverByNorm.has(k)) continue;
    driverByNorm.set(k, d);
  }

  function findDriverId(name: string) {
    const n = normalize(name);
    if (driverByNorm.has(n)) return driverByNorm.get(n)!.id;
    for (const [k, v] of driverByNorm) {
      if (k.includes(n) || n.includes(k)) return v.id;
    }
    return null;
  }

  const parsed = parseOcrToClassificationRows(combined);
  const pointsParsed = parsed.length === 0 ? parseOcrToRows(combined) : [];
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

  if (parsed.length) {
    const bestMs = Math.min(
      ...parsed
        .map((r) => (r.bestTime ? parseTimeToMs(r.bestTime) : null))
        .filter((x): x is number => typeof x === "number")
    );
    const fastestNorm = Number.isFinite(bestMs) ? bestMs : null;

    const usedPos = new Set<number>();
    for (const row of parsed) {
      if (usedPos.has(row.position)) continue;
      usedPos.add(row.position);
      const driverId = findDriverId(row.driver);
      if (!driverId) continue;

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
    }
  } else {
    for (const row of pointsParsed) {
      const driverId = findDriverId(row.driver);
      if (!driverId) continue;
      const current = existing.get(driverId) ?? null;
      const points = current ? current.points : row.points;
      await prisma.raceResult
        .upsert({
          where: { raceId_driverId: { raceId, driverId } },
          create: { raceId, driverId, position: row.position, points, status: row.status ?? null, fastestLap: current?.fastestLap ?? false },
          update: { position: row.position, points, status: row.status ?? null }
        })
        .catch(() => null);
    }
  }

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

async function ocrImportResults(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const replace = formData.get("replace") === "on";

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true, resultsImagePath: true }
    })
    .catch(() => null);
  if (!race || race.league !== league || !race.resultsImagePath) {
    redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);
  }

  const uploadsDir = path.join(dataRootDir(), "uploads");
  const abs = path.join(uploadsDir, race.resultsImagePath);
  const rel = path.relative(uploadsDir, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(abs)) {
    redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);
  }

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const res = await worker.recognize(abs);
  await worker.terminate();
  const text = (res.data.text ?? "").trim();

  await prisma.race.update({ where: { id: raceId }, data: { resultsOcrText: text } }).catch(() => null);

  const parsed = parseOcrToRows(text);
  if (parsed.length === 0) {
    redirect(`/admin/${adminLeague}/results/${raceId}?error=ocr`);
  }

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

  const driverRows: DriverRow[] = season
    ? await prisma.driverSeason
        .findMany({
          where: { seasonId: season.id },
          distinct: ["driverId"],
          select: driverSelect,
          take: 5000
        })
        .catch((): DriverRow[] => [])
    : await prisma.driverSeason
        .findMany({
          where: { season: { league } },
          distinct: ["driverId"],
          select: driverSelect,
          take: 5000
        })
        .catch((): DriverRow[] => []);

  const drivers = driverRows.map((r) => r.driver);
  const driverByNorm = new Map<string, { id: string; name: string }>();
  for (const d of drivers) {
    driverByNorm.set(normalize(d.name), d);
  }

  function findDriverId(name: string) {
    const n = normalize(name);
    if (driverByNorm.has(n)) return driverByNorm.get(n)!.id;
    for (const [k, v] of driverByNorm) {
      if (k.includes(n) || n.includes(k)) return v.id;
    }
    return null;
  }

  if (replace) {
    await prisma.raceResult.deleteMany({ where: { raceId } }).catch(() => null);
  }

  for (const row of parsed) {
    const driverId = findDriverId(row.driver);
    if (!driverId) continue;
    await prisma.raceResult.upsert({
      where: { raceId_driverId: { raceId, driverId } },
      create: {
        raceId,
        driverId,
        position: row.position,
        points: row.points,
        status: row.status ?? null,
        fastestLap: false
      },
      update: {
        position: row.position,
        points: row.points,
        status: row.status ?? null
      }
    });
  }

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

async function setParticipation(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();
  const driverId = String(formData.get("driverId") ?? "").trim();
  const participates = String(formData.get("participates") ?? "").trim() === "1";
  if (!driverId) return;

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
    .findUnique({ where: { driverId_seasonId: { driverId, seasonId: season.id } }, select: { role: true } })
    .catch(() => null);
  if (!eligible) return;

  await prisma.raceEntry
    .upsert({
      where: { raceId_driverId: { raceId, driverId } },
      create: { raceId, driverId, participates, teamId: null },
      update: { participates, ...(participates ? {} : { teamId: null }) }
    })
    .catch(() => null);

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
}

async function setReserveTeamForRace(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();
  const driverId = String(formData.get("driverId") ?? "").trim();
  const teamIdRaw = String(formData.get("teamId") ?? "").trim();
  const teamId = teamIdRaw ? teamIdRaw : null;
  if (!driverId) return;

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

  const ds = await prisma.driverSeason
    .findUnique({ where: { driverId_seasonId: { driverId, seasonId: season.id } }, select: { role: true } })
    .catch(() => null);
  if (!ds || ds.role !== "RESERVE") return;

  if (teamId) {
    const allowed = await prisma.teamLeague
      .findUnique({ where: { teamId_league: { teamId, league } }, select: { teamId: true } })
      .catch(() => null);
    if (!allowed) return;
  }

  await prisma.raceEntry
    .upsert({
      where: { raceId_driverId: { raceId, driverId } },
      create: { raceId, driverId, participates: true, teamId },
      update: { participates: true, teamId }
    })
    .catch(() => null);

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  redirect(`/admin/${adminLeague}/results/${raceId}?ok=1`);
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
        resultImages: {
          select: { id: true, imagePath: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }],
          take: 50
        }
      }
    })
    .catch(() => null);

  if (!race || race.league !== l) notFound();

  type DriverItem = { id: string; name: string; role: "MAIN" | "RESERVE"; teamName: string | null };
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
  let entries: Array<{ driverId: string; participates: boolean; teamId: string | null; team: { id: string; name: string } | null }> = [];
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
      role: r.role,
      teamName: r.role === "MAIN" ? r.teamRef?.name ?? null : null
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
      select: { driverId: true, participates: true, teamId: true, team: { select: { id: true, name: true } } },
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
  const driverOptions =
    entries.length > 0 ? (participatingDrivers.length > 0 ? participatingDrivers : drivers) : drivers;

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

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Ergebnis-Upload</div>
        <div className="mt-2 text-sm text-white/70">
          Mehrere Bilder hochladen (max. 6), dann OCR ausführen und Ergebnisse automatisch eintragen.
        </div>

        {error && ["image", "ocr", "entries", "invalid"].includes(error) ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            {error === "entries"
              ? "Bitte zuerst im Fahrerfeld die Fahrer auf „Nimmt teil“ setzen, dann OCR ausführen."
              : error === "image"
                ? "Keine gültigen Ergebnisbilder gefunden."
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
              <form action={ocrImportResultsFromImages.bind(null, league, l, raceId)}>
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input type="checkbox" name="replace" className="h-4 w-4" />{" "}
                  Vorhandene Ergebnisse ersetzen
                </label>
                <FormSubmitButton
                  className="mt-3 w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white"
                  pendingText="OCR läuft…"
                >
                  OCR aus Bildern → Ergebnisse eintragen
                </FormSubmitButton>
              </form>

              {race.resultsOcrText ? (
                <textarea
                  readOnly
                  value={race.resultsOcrText}
                  className="h-[220px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 outline-none"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Fahrerfeld</div>
        <div className="mt-2 text-sm text-white/70">
          Teilnahme pro Fahrer bestätigen. Bei Ersatzfahrern kannst du fürs einzelne Rennen ein Team setzen.
        </div>

        <div className="mt-4 space-y-2">
          {drivers.length === 0 ? (
            <div className="text-sm text-white/60">Keine Fahrer gefunden.</div>
          ) : (
            drivers.map((d) => {
              const entry = entryByDriverId.get(d.id) ?? null;
              const participates = entry?.participates ?? false;
              const reserve = d.role === "RESERVE";
              return (
                <div
                  key={d.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {d.name}
                      <span className="text-white/60"> · {reserve ? "Ersatzfahrer" : "Stammfahrer"}</span>
                      {d.teamName ? <span className="text-white/60"> · {d.teamName}</span> : null}
                    </div>
                    {reserve && participates ? (
                      <div className="mt-2 text-sm text-white/70">
                        Team (nur für dieses Rennen): {entry?.team?.name ?? "(keins)"}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setParticipation.bind(null, league, l, raceId)}>
                      <input type="hidden" name="driverId" value={d.id} />
                      <input type="hidden" name="participates" value={participates ? "0" : "1"} />
                      <button
                        className={
                          "rounded-lg px-3 py-2 text-xs font-semibold " +
                          (participates ? "bg-mrl-red text-white" : "bg-white/10 text-white hover:bg-white/15")
                        }
                      >
                        {participates ? "Nimmt teil" : "Nimmt nicht teil"}
                      </button>
                    </form>

                    {reserve ? (
                      <form action={setReserveTeamForRace.bind(null, league, l, raceId)} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="driverId" value={d.id} />
                        <select
                          name="teamId"
                          defaultValue={entry?.teamId ?? ""}
                          disabled={!participates}
                          className="w-[220px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25 disabled:opacity-50"
                        >
                          <option value="">(kein Team)</option>
                          {leagueTeams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={!participates}
                          className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                        >
                          Team setzen
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base font-semibold">Ergebnisse eintragen</div>
          <Link
            href={`/admin/${league}/results`}
            className="text-sm font-semibold text-white/70 hover:text-white"
          >
            Zurück
          </Link>
        </div>
        <div className="mt-2 text-sm text-white/70">
          Saison {race.season} · Runde {race.round} · {race.name} ·{" "}
          {new Date(race.startsAt).toLocaleString("de-DE")}
        </div>

        <form
          action={upsertResult.bind(null, league, l, raceId)}
          className="mt-6 grid gap-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Fahrer
            </label>
            <RaceDriverField name="driverId" drivers={driverOptions.map((d) => ({ id: d.id, name: d.name, active: participatingDriverIds.has(d.id), role: d.role, teamName: d.teamName }))} />
            {entries.length > 0 ? (
              <div className="mt-2 text-xs text-white/60">
                Es werden nur Fahrer angeboten, die im Fahrerfeld als teilnehmend markiert sind.
              </div>
            ) : (
              <div className="mt-2 text-xs text-white/60">
                Tipp: Erst im Fahrerfeld Teilnahme setzen, dann Ergebnisse eintragen.
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Position
            </label>
            <input
              name="position"
              inputMode="numeric"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Punkte
            </label>
            <input
              name="points"
              inputMode="decimal"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="25"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Status (optional)
            </label>
            <input
              name="status"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="DNF, DSQ, ..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="fastestLap" className="h-4 w-4" />{" "}
            Schnellste Runde
          </label>
          <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
            Speichern
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Aktuelle Einträge</div>
        <div className="mt-4 space-y-2">
          {results.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Ergebnisse.</div>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    P{r.position} · {r.driver.name} · {r.points.toFixed(0)} P
                    {r.fastestLap ? " · FL" : ""}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {r.grid !== null ? `Grid ${r.grid}` : "Grid -"}
                    {r.stops !== null ? ` · Stops ${r.stops}` : " · Stops -"}
                    {r.bestTime ? ` · Best ${r.bestTime}` : ""}
                    {r.timeText ? ` · Time ${r.timeText}` : ""}
                  </div>
                  {entryByDriverId.get(r.driverId)?.team?.name ? (
                    <div className="mt-1 text-sm text-white/60">
                      Team (für dieses Rennen): {entryByDriverId.get(r.driverId)!.team!.name}
                    </div>
                  ) : null}
                  {r.status ? (
                    <div className="mt-1 text-sm text-white/60">{r.status}</div>
                  ) : null}
                </div>
                <form action={deleteResult.bind(null, league, raceId)}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                    Löschen
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
