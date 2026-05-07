import { prisma } from "@/lib/db";
import { listPublicLeagues } from "@/lib/league";
import { League, Prisma } from "@prisma/client";

export async function GET() {
  const leagues = await listPublicLeagues();
  const activeLeagues = leagues.map((l) => l.league);
  const meta = new Map(
    leagues.map((l) => [
      l.league,
      { publicSlug: l.publicSlug, name: l.name, accentColor: l.accentColor }
    ])
  );

  const now = new Date();
  const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

  const select = {
    id: true,
    league: true,
    name: true,
    round: true,
    startsAt: true,
    seasonIsTest: true
  } satisfies Prisma.RaceSelect;

  type RaceCard = Prisma.RaceGetPayload<{ select: typeof select }>;

  const races = await prisma.race
    .findMany({
      where: { league: { in: activeLeagues }, startsAt: { gte: windowStart, lte: windowEnd } },
      orderBy: [{ startsAt: "desc" }],
      take: 80,
      select
    })
    .catch((): RaceCard[] => []);

  const byLeague = new Map<League, RaceCard[]>();
  for (const r of races) {
    const list = byLeague.get(r.league) ?? [];
    list.push(r);
    byLeague.set(r.league, list);
  }

  const items = Array.from(byLeague.entries())
    .map(([league, list]) => {
      const preferred = list.find((r) => !r.seasonIsTest) ?? list[0] ?? null;
      if (!preferred) return null;
      const m = meta.get(league);
      if (!m) return null;
      return {
        leagueSlug: m.publicSlug,
        leagueLabel: m.name,
        accent: m.accentColor,
        race: {
          id: preferred.id,
          title: preferred.name,
          round: preferred.round,
          startsAtMs: new Date(preferred.startsAt).getTime()
        }
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .sort((a, b) => b.race.startsAtMs - a.race.startsAtMs)
    .slice(0, 6);

  return Response.json(
    { hasOnAir: items.length > 0, items },
    { headers: { "cache-control": "no-store" } }
  );
}

