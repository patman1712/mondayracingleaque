import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { configuredOrDefaultLiveTimingLeagueKey } from "@/lib/liveTimingLeagueKey";
import { parseGapMs, parseRaceTimeMs, recalcRaceResults } from "@/lib/raceResults";
import { applyRaceScoring } from "@/lib/scoring";
import { applyPublishedRaceStats, recalcSeasonStatsForRace } from "@/lib/seasonStats";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { RaceResultsBulkEditorClient } from "@/components/RaceResultsBulkEditorClient";
import { RaceResultsPosterExportClient } from "@/components/RaceResultsPosterExportClient";
import { RaceResultsCsvImportClient } from "@/components/RaceResultsCsvImportClient";
import { RaceResultsPenaltiesEditorClient } from "@/components/RaceResultsPenaltiesEditorClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const driverSelect = {
  driverId: true,
  role: true,
  teamId: true,
  portraitPath: true,
  driver: { select: { id: true, name: true, gamertag: true, portraitPath: true } },
  teamRef: { select: { name: true, color: true } }
} as const;
type DriverRow = {
  driverId: string;
  role: "MAIN" | "RESERVE";
  teamId: string | null;
  portraitPath: string | null;
  driver: { id: string; name: string; gamertag: string | null; portraitPath: string | null };
  teamRef: { name: string; color: string | null } | null;
};

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
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

  await recalcSeasonStatsForRace(prisma, raceId).catch(() => null);

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

async function clearRaceResults(
  adminLeague: string,
  league: League,
  raceId: string
) {
  "use server";
  await requireAdmin();

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true }
    })
    .catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  await prisma.$transaction(async (tx) => {
    await tx.raceResult.deleteMany({ where: { raceId } }).catch(() => null);
    await tx.race
      .update({
        where: { id: raceId },
        data: {
          resultsPublishedAt: null,
          driverOfDayDriverId: null,
          resultsCsvDraftJson: null
        }
      })
      .catch(() => null);
  });

  await recalcSeasonStatsForRace(prisma, raceId).catch(() => null);

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
    revalidatePath(`/${l.publicSlug}/drivers`);
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
    penaltySeconds: number;
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
          const penaltyRaw = obj.penaltySeconds != null && String(obj.penaltySeconds).trim() !== "" ? Number(obj.penaltySeconds) : 0;
          const penaltySeconds = Number.isFinite(penaltyRaw) ? Math.max(0, Math.floor(penaltyRaw)) : 0;
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
            penaltySeconds,
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
            penaltySeconds: number;
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
        .findMany({ where: { raceId }, select: { driverId: true, points: true, fastestLap: true, penaltySeconds: true }, take: 5000 })
        .catch(() => [])
    ).map((r) => [r.driverId, { points: r.points, fastestLap: r.fastestLap, penaltySeconds: r.penaltySeconds }] as const)
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
    penaltySeconds: number;
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

  const baseMs =
    included
      .map((r) => (r.timeText && !r.timeText.trim().startsWith("+") ? parseRaceTimeMs(r.timeText) : null))
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b)[0] ?? null;

  const finishMsByDriverId = new Map<string, number | null>();
  for (const r of included) {
    const tt = (r.timeText ?? "").trim();
    const status = (r.status ?? "").trim().toUpperCase();
    if (status && ["DNF", "DSQ", "DNS", "RET"].includes(status)) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (tt && ["DNF", "DSQ", "DNS", "RET"].includes(tt.toUpperCase())) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (!tt) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (tt.startsWith("+")) {
      const gap = parseGapMs(tt);
      finishMsByDriverId.set(r.driverId, typeof gap === "number" && typeof baseMs === "number" ? baseMs + gap : null);
      continue;
    }
    const ms = parseRaceTimeMs(tt);
    finishMsByDriverId.set(r.driverId, typeof ms === "number" ? ms : null);
  }

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
          penaltySeconds: current ? current.penaltySeconds : 0,
          finishTimeMs: null,
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
      const current = existing.get(r.driverId) ?? null;
      const penaltySeconds = current ? current.penaltySeconds : 0;
      const finishTimeMs = finishMsByDriverId.get(r.driverId) ?? null;
      await tx.raceResult.update({
        where: { raceId_driverId: { raceId, driverId: r.driverId } },
        data: {
          position: pos,
          grid: r.grid,
          stops: r.stops,
          bestTime: r.bestTime,
          timeText: r.timeText,
          status: r.status,
          penaltySeconds,
          finishTimeMs,
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

  await applyRaceScoring(prisma, raceId).catch(() => null);
  await applyPublishedRaceStats(prisma, raceId).catch(() => null);

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

async function applyPenalties(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const raw = String(formData.get("penaltiesJson") ?? "").trim();
  if (!raw) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  let rows: Array<{ driverId: string; penaltySeconds: number }> = [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) {
      rows = v
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const obj = r as Record<string, unknown>;
          const driverId = String(obj.driverId ?? "").trim();
          const penRaw = obj.penaltySeconds != null && String(obj.penaltySeconds).trim() !== "" ? Number(obj.penaltySeconds) : 0;
          const penaltySeconds = Number.isFinite(penRaw) ? Math.max(0, Math.floor(penRaw)) : 0;
          if (!driverId) return null;
          return { driverId, penaltySeconds };
        })
        .filter((x): x is { driverId: string; penaltySeconds: number } => Boolean(x));
    }
  } catch {}

  const race = await prisma.race
    .findUnique({ where: { id: raceId }, select: { id: true, league: true } })
    .catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.raceResult
        .update({
          where: { raceId_driverId: { raceId, driverId: r.driverId } },
          data: { penaltySeconds: r.penaltySeconds }
        })
        .catch(() => null);
    }
  });

  await recalcRaceResults(prisma, raceId).catch(() => null);
  await applyRaceScoring(prisma, raceId).catch(() => null);
  await applyPublishedRaceStats(prisma, raceId).catch(() => null);

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

async function setDriverOfDay(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const driverId = String(formData.get("driverOfDayDriverId") ?? "").trim();

  const race = await prisma.race.findUnique({ where: { id: raceId }, select: { id: true, league: true } }).catch(() => null);
  if (!race || race.league !== league) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);

  if (driverId) {
    const ok =
      (await prisma.raceEntry
        .findFirst({ where: { raceId, driverId, participates: true }, select: { id: true } })
        .catch(() => null)) ??
      (await prisma.raceResult.findFirst({ where: { raceId, driverId }, select: { id: true } }).catch(() => null));
    if (!ok) redirect(`/admin/${adminLeague}/results/${raceId}?error=invalid`);
  }

  await prisma.race
    .update({
      where: { id: raceId },
      data: { driverOfDayDriverId: driverId || null }
    })
    .catch(() => null);

  await applyPublishedRaceStats(prisma, raceId).catch(() => null);

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
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
    revalidatePath(`/${l.publicSlug}/drivers`);
    revalidatePath(`/${l.publicSlug}/standings`);
  }

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
        .findMany({ where: { raceId }, select: { driverId: true, points: true, fastestLap: true, penaltySeconds: true }, take: 5000 })
        .catch(() => [])
    ).map((r) => [r.driverId, { points: r.points, fastestLap: r.fastestLap, penaltySeconds: r.penaltySeconds }] as const)
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

  const baseMs =
    included
      .map((r) => (r.timeText && !r.timeText.trim().startsWith("+") ? parseRaceTimeMs(r.timeText) : null))
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b)[0] ?? null;

  const finishMsByDriverId = new Map<string, number | null>();
  for (const r of included) {
    const tt = (r.timeText ?? "").trim();
    const status = (r.status ?? "").trim().toUpperCase();
    if (status && ["DNF", "DSQ", "DNS", "RET"].includes(status)) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (tt && ["DNF", "DSQ", "DNS", "RET"].includes(tt.toUpperCase())) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (!tt) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (tt.startsWith("+")) {
      const gap = parseGapMs(tt);
      finishMsByDriverId.set(r.driverId, typeof gap === "number" && typeof baseMs === "number" ? baseMs + gap : null);
      continue;
    }
    const ms = parseRaceTimeMs(tt);
    finishMsByDriverId.set(r.driverId, typeof ms === "number" ? ms : null);
  }

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
          penaltySeconds: current ? current.penaltySeconds : 0,
          finishTimeMs: null,
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
      const current = existing.get(r.driverId) ?? null;
      const finishTimeMs = finishMsByDriverId.get(r.driverId) ?? null;
      await tx.raceResult.update({
        where: { raceId_driverId: { raceId, driverId: r.driverId } },
        data: {
          position: pos,
          grid: r.grid,
          stops: r.stops,
          bestTime: r.bestTime,
          timeText: r.timeText,
          status: r.status,
          penaltySeconds: current ? current.penaltySeconds : 0,
          finishTimeMs,
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

  await applyRaceScoring(prisma, raceId).catch(() => null);
  await applyPublishedRaceStats(prisma, raceId).catch(() => null);

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
  const configuredLiveTimingRow = await prisma.appConfig
    .findUnique({ where: { key: `liveTimingLeagueKeyForPublicSlug:${cfg.publicSlug}` }, select: { value: true } })
    .catch(() => null);
  const liveTimingLeagueKey = configuredOrDefaultLiveTimingLeagueKey({
    configured: configuredLiveTimingRow?.value,
    publicSlug: cfg.publicSlug
  });

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
        driverOfDayDriverId: true,
        resultsCsvDraftJson: true,
        resultsPublishedAt: true,
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
    finishTimeMs: number | null;
    penaltySeconds: number;
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
      portraitUrl: imageUrl(r.portraitPath)
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
        finishTimeMs: true,
        penaltySeconds: true,
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

  const entryByDriverId = new Map(entries.map((e) => [e.driverId, e] as const));
  const participatingDriverIds = new Set(entries.filter((e) => e.participates).map((e) => e.driverId));
  const participatingDrivers = drivers.filter((d) => participatingDriverIds.has(d.id));
  const driverById = new Map(participatingDrivers.map((d) => [d.id, d] as const));

  const bulkDrivers = participatingDrivers.map((d) => {
    const entry = entryByDriverId.get(d.id) ?? null;
    const teamName = entry?.team?.name ?? (d.role === "MAIN" ? d.teamName : null);
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
      penaltySeconds: r.penaltySeconds,
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
          <div className="text-base font-semibold">Ergebnis · {race.name}</div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/admin/${league}/results`}
              className="text-sm font-semibold text-white/70 hover:text-white"
            >
              Zur Übersicht
            </Link>
            <Link
              href={`/admin/${league}/races/${raceId}`}
              className="text-sm font-semibold text-white/70 hover:text-white"
            >
              Rennkalender
            </Link>
          </div>
        </div>
        <div className="mt-2 text-sm text-white/70">
          {race.seasonIsTest ? "TEST · " : ""}Saison {race.season} · Season {race.seasonNo} · Runde {race.round} ·{" "}
          {new Date(race.startsAt).toLocaleString("de-DE")}
        </div>
      </div>

      <details className="rounded-2xl border border-white/10 bg-white/5">
        <summary className="cursor-pointer list-none px-6 py-5 text-base font-semibold text-white">
          Automatisch auslesen (CSV)
          <div className="mt-2 text-sm font-normal text-white/70">
            CSV einlesen, Fahrer automatisch zuordnen und importieren.
          </div>
        </summary>

        <div className="px-6 pb-6">

        {error && ["invalid"].includes(error) ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            Ungültige Datei oder Daten.
          </div>
        ) : null}

        <div className="mt-4">
          <RaceResultsCsvImportClient
            drivers={participatingDrivers.map((d) => ({ id: d.id, name: d.name, gamertag: d.gamertag }))}
            existingDraftJson={race.resultsCsvDraftJson ?? null}
            liveTimingLeagueKey={liveTimingLeagueKey}
            action={importResultsFromCsv.bind(null, league, l, raceId)}
          />
        </div>
        </div>
      </details>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
        Fahrerfeld pflegst du jetzt im Rennkalender:
        <Link href={`/admin/${league}/races/${raceId}#driver-field`} className="ml-2 font-semibold text-white hover:underline">
          Fahrerfeld öffnen
        </Link>
      </div>

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

        {(results.length > 0 || race.resultsCsvDraftJson) ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <div className="text-sm text-white/80">
              Ergebnis komplett entfernen, damit du es danach sauber neu importieren oder manuell neu anlegen kannst.
            </div>
            <form action={clearRaceResults.bind(null, league, l, raceId)}>
              <FormSubmitButton
                className="w-fit rounded-lg border border-red-500/35 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20"
                pendingText="Lösche…"
              >
                Ergebnis löschen
              </FormSubmitButton>
            </form>
          </div>
        ) : null}

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
                finishTimeMs: r.finishTimeMs,
                penaltySeconds: r.penaltySeconds,
                status: r.status,
                fastestLap: r.fastestLap
              }))}
              action={bulkUpsertResults.bind(null, league, l, raceId)}
            />
          )}
        </div>

        {results.length > 0 ? (
          <details className="mt-6 rounded-2xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-white">
              Fahrer des Tages
              <div className="mt-1 text-xs font-normal text-white/70">
                Wird zur Fahrer-Statistik addiert (Saison + Gesamt), sobald Ergebnisse veröffentlicht sind.
              </div>
            </summary>
            <div className="px-4 pb-4">
              <form
                action={setDriverOfDay.bind(null, league, l, raceId)}
                className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
              >
                <select
                  name="driverOfDayDriverId"
                  defaultValue={race.driverOfDayDriverId ?? ""}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                >
                  <option value="">(Kein Fahrer des Tages)</option>
                  {results
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((r) => (
                      <option key={r.driverId} value={r.driverId}>
                        P{r.position} · {r.driver.name}
                      </option>
                    ))}
                </select>
                <FormSubmitButton
                  className="w-fit rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                  pendingText="Speichern…"
                >
                  Speichern
                </FormSubmitButton>
              </form>
            </div>
          </details>
        ) : null}

        {results.length > 0 ? (
          <details className="mt-6 rounded-2xl border border-white/10 bg-black/20">
            <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-white">
              Stewards (Strafen)
              <div className="mt-1 text-xs font-normal text-white/70">
                Sekunden-Strafen werden zur Endzeit addiert und das Ergebnis wird automatisch neu sortiert.
              </div>
            </summary>
            <div className="px-4 pb-4">
              <RaceResultsPenaltiesEditorClient
                results={results.map((r) => ({
                  driverId: r.driverId,
                  driverName: r.driver.name,
                  penaltySeconds: r.penaltySeconds
                }))}
                action={applyPenalties.bind(null, league, l, raceId)}
              />
            </div>
          </details>
        ) : null}
      </div>
      </div>
    </AdminShell>
  );
}
