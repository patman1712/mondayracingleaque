import type { PrismaClient } from "@prisma/client";

const BAD_STATUSES = new Set(["DNF", "DSQ", "DNS", "RET"]);

function isClassified(status: string | null | undefined, timeText: string | null | undefined) {
  const up = (status ?? "").trim().toUpperCase();
  if (up && BAD_STATUSES.has(up)) return false;
  return Boolean((timeText ?? "").trim());
}

type RaceFilter = {
  league?: string;
  season?: number;
  seasonNo?: number;
  seasonIsTest?: boolean;
};

function buildRaceWhere(filter?: RaceFilter) {
  return {
    resultsPublishedAt: { not: null as null | Date },
    ...(filter?.league ? { league: filter.league } : {}),
    ...(typeof filter?.season === "number" ? { season: filter.season } : {}),
    ...(typeof filter?.seasonNo === "number" ? { seasonNo: filter.seasonNo } : {}),
    ...(typeof filter?.seasonIsTest === "boolean" ? { seasonIsTest: filter.seasonIsTest } : {})
  };
}

export async function getDriverComputedStats(prisma: PrismaClient, driverId: string, filter?: RaceFilter) {
  const raceWhere = buildRaceWhere(filter);

  const [starts, results, driverOfDay] = await Promise.all([
    prisma.raceEntry
      .count({
        where: {
          driverId,
          participates: true,
          race: raceWhere
        }
      })
      .catch(() => 0),
    prisma.raceResult
      .findMany({
        where: {
          driverId,
          race: raceWhere
        },
        select: { position: true, status: true, timeText: true },
        take: 5000
      })
      .catch(() => []),
    prisma.race
      .count({
        where: {
          ...raceWhere,
          driverOfDayDriverId: driverId
        }
      })
      .catch(() => 0)
  ]);

  let wins = 0;
  let podiums = 0;
  for (const r of results) {
    if (!isClassified(r.status, r.timeText)) continue;
    if (r.position === 1) wins += 1;
    if (r.position >= 1 && r.position <= 3) podiums += 1;
  }

  return { starts, wins, podiums, driverOfDay };
}
