import type { PrismaClient } from "@prisma/client";

const BAD_STATUSES = new Set(["DNF", "DSQ", "DNS", "RET"]);

function isClassified(status: string | null | undefined, timeText: string | null | undefined) {
  const up = (status ?? "").trim().toUpperCase();
  if (up && BAD_STATUSES.has(up)) return false;
  return Boolean((timeText ?? "").trim());
}

export async function applyPublishedRaceStats(prisma: PrismaClient, raceId: string) {
  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true, resultsPublishedAt: true }
    })
    .catch(() => null);
  if (!race || !race.resultsPublishedAt) return;

  await recalcSeasonStatsForRace(prisma, raceId);
}

export async function recalcSeasonStatsForRace(prisma: PrismaClient, raceId: string) {
  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, league: true, season: true, seasonNo: true, seasonIsTest: true }
    })
    .catch(() => null);
  if (!race) return;

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
      select: { id: true, league: true, year: true, seasonNo: true, isTest: true }
    })
    .catch(() => null);
  if (!season) return;

  await recalcSeasonStats(prisma, season.id);
}

export async function recalcSeasonStats(prisma: PrismaClient, seasonId: string) {
  const season = await prisma.season
    .findUnique({ where: { id: seasonId }, select: { id: true, league: true, year: true, seasonNo: true, isTest: true } })
    .catch(() => null);
  if (!season) return;

  const driverSeasons = await prisma.driverSeason
    .findMany({ where: { seasonId }, select: { driverId: true, role: true }, take: 5000 })
    .catch(() => []);

  const driverIds = driverSeasons.map((d) => d.driverId);
  const roleByDriverId = new Map(driverSeasons.map((d) => [d.driverId, d.role] as const));

  const races = await prisma.race
    .findMany({
      where: {
        league: season.league,
        season: season.year,
        seasonNo: season.seasonNo,
        seasonIsTest: season.isTest,
        resultsPublishedAt: { not: null }
      },
      orderBy: [{ round: "asc" }],
      select: {
        id: true,
        driverOfDayDriverId: true,
        entries: { where: { participates: true }, select: { driverId: true }, take: 5000 },
        results: { select: { driverId: true, position: true, status: true, timeText: true }, take: 5000 }
      },
      take: 5000
    })
    .catch(() => []);

  const starts = new Map<string, number>();
  const wins = new Map<string, number>();
  const podiums = new Map<string, number>();
  const driverOfDay = new Map<string, number>();

  for (const race of races) {
    const participants = new Set(race.entries.map((e) => e.driverId));
    for (const driverId of participants) starts.set(driverId, (starts.get(driverId) ?? 0) + 1);

    for (const r of race.results) {
      if (!isClassified(r.status, r.timeText)) continue;
      if (r.position === 1) wins.set(r.driverId, (wins.get(r.driverId) ?? 0) + 1);
      if (r.position >= 1 && r.position <= 3) podiums.set(r.driverId, (podiums.get(r.driverId) ?? 0) + 1);
    }

    if (race.driverOfDayDriverId) {
      driverOfDay.set(race.driverOfDayDriverId, (driverOfDay.get(race.driverOfDayDriverId) ?? 0) + 1);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const d of driverSeasons) {
      const s = starts.get(d.driverId) ?? 0;
      const w = wins.get(d.driverId) ?? 0;
      const p = podiums.get(d.driverId) ?? 0;
      const dod = driverOfDay.get(d.driverId) ?? 0;
      await tx.driverSeason
        .update({
          where: { driverId_seasonId: { driverId: d.driverId, seasonId } },
          data: { starts: s, wins: w, podiums: p, driverOfDay: dod }
        })
        .catch(() => null);
    }
  });

  const totals = await prisma.driverSeason
    .findMany({
      where: { driverId: { in: driverIds } },
      select: { driverId: true, starts: true, wins: true, podiums: true, driverOfDay: true },
      take: 50000
    })
    .catch(() => []);

  const agg = new Map<string, { starts: number; wins: number; podiums: number; driverOfDay: number }>();
  for (const row of totals) {
    const a = agg.get(row.driverId) ?? { starts: 0, wins: 0, podiums: 0, driverOfDay: 0 };
    a.starts += row.starts;
    a.wins += row.wins;
    a.podiums += row.podiums;
    a.driverOfDay += row.driverOfDay;
    agg.set(row.driverId, a);
  }

  await prisma.$transaction(async (tx) => {
    for (const driverId of driverIds) {
      const a = agg.get(driverId) ?? { starts: 0, wins: 0, podiums: 0, driverOfDay: 0 };
      await tx.driver
        .update({
          where: { id: driverId },
          data: { starts: a.starts, wins: a.wins, podiums: a.podiums, driverOfDay: a.driverOfDay }
        })
        .catch(() => null);
    }
  });

  return { seasonId, roleByDriverId };
}
