import { League, Prisma, SeasonPlacement } from "@prisma/client";
import { prisma } from "@/lib/db";

function keyForLeague(league: League) {
  return `activeSeasonId:${league}`;
}

function teamWmKeyForLeague(league: League) {
  return `teamWm:seasonId:${league}`;
}

export async function getActiveSeasonId(league: League): Promise<string | null> {
  const cfg = await prisma.appConfig.findUnique({ where: { key: keyForLeague(league) } }).catch(() => null);
  return cfg?.value ? String(cfg.value) : null;
}

export async function getTeamWmSeasonId(league: League): Promise<string | null> {
  const cfg = await prisma.appConfig
    .findUnique({ where: { key: teamWmKeyForLeague(league) } })
    .catch(() => null);
  return cfg?.value ? String(cfg.value) : null;
}

export async function setTeamWmSeasonId(league: League, seasonId: string | null): Promise<void> {
  const key = teamWmKeyForLeague(league);
  if (!seasonId) {
    await prisma.appConfig.delete({ where: { key } }).catch(() => null);
    return;
  }
  await prisma.appConfig
    .upsert({
      where: { key },
      create: { key, value: seasonId },
      update: { value: seasonId }
    })
    .catch(() => null);
}

export async function getTeamWmSeason<TSelect extends Prisma.SeasonSelect>(opts: {
  league: League;
  select: TSelect;
}): Promise<Prisma.SeasonGetPayload<{ select: TSelect }> | null> {
  const explicitId = await getTeamWmSeasonId(opts.league);
  if (explicitId) {
    const byId = await prisma.season
      .findFirst({
        where: { id: explicitId, league: opts.league },
        select: opts.select
      })
      .catch(() => null);
    if (byId) return byId;
  }
  return getActiveSeason(opts);
}

const ENABLED_LEAGUES_KEY = "teamWm:enabledLeaguesJson";
const DEFAULT_ENABLED_FALLBACK: League[] = [League.ONE, League.TWO, League.THREE];

export async function getTeamWmEnabledLeagues(): Promise<League[]> {
  const cfg = await prisma.appConfig
    .findUnique({ where: { key: ENABLED_LEAGUES_KEY }, select: { value: true } })
    .catch(() => null);
  if (!cfg?.value) return DEFAULT_ENABLED_FALLBACK;
  try {
    const parsed = JSON.parse(cfg.value);
    if (!Array.isArray(parsed)) return DEFAULT_ENABLED_FALLBACK;
    const filtered = parsed.filter(
      (v) =>
        v === League.ONE || v === League.TWO || v === League.THREE || v === League.ROOKIE
    );
    return filtered.length ? filtered : DEFAULT_ENABLED_FALLBACK;
  } catch {
    return DEFAULT_ENABLED_FALLBACK;
  }
}

export async function setTeamWmEnabledLeagues(leagues: League[]): Promise<void> {
  const value = JSON.stringify(leagues);
  await prisma.appConfig
    .upsert({
      where: { key: ENABLED_LEAGUES_KEY },
      create: { key: ENABLED_LEAGUES_KEY, value },
      update: { value }
    })
    .catch(() => null);
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
