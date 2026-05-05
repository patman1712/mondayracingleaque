import { League, Prisma, SeasonPlacement } from "@prisma/client";
import { prisma } from "@/lib/db";

function keyForLeague(league: League) {
  return `activeSeasonId:${league}`;
}

export async function getActiveSeasonId(league: League): Promise<string | null> {
  const cfg = await prisma.appConfig.findUnique({ where: { key: keyForLeague(league) } }).catch(() => null);
  return cfg?.value ? String(cfg.value) : null;
}

export async function getActiveSeason<TSelect extends Prisma.SeasonSelect>(opts: {
  league: League;
  select: TSelect;
}): Promise<Prisma.SeasonGetPayload<{ select: TSelect }> | null> {
  const activeId = await getActiveSeasonId(opts.league);
  if (activeId) {
    const byId = await prisma.season
      .findFirst({
        where: { id: activeId, league: opts.league },
        select: opts.select
      })
      .catch(() => null);
    if (byId) return byId;
  }

  const fallback = await prisma.season
    .findFirst({
      where: { league: opts.league, placement: SeasonPlacement.CALENDAR },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      select: opts.select
    })
    .catch(() => null);

  return fallback ?? null;
}
