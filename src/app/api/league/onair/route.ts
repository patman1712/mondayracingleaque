import { prisma } from "@/lib/db";
import { resolveLeagueByPublicSlug } from "@/lib/league";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("league") ?? "";
  const cfg = await resolveLeagueByPublicSlug(slug);
  if (!cfg) return new Response("Bad league", { status: 400 });
  if (!cfg.isActive) return new Response("Inactive league", { status: 404 });

  const league = cfg.league;
  const now = new Date();
  const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

  const select = {
    id: true,
    name: true,
    round: true,
    startsAt: true,
    twitchChannel: true,
    seasonIsTest: true
  } satisfies Prisma.RaceSelect;

  type RaceCard = Prisma.RaceGetPayload<{ select: typeof select }>;

  async function findPreferred(where: Prisma.RaceWhereInput, orderBy: Prisma.RaceOrderByWithRelationInput) {
    const normal = await prisma.race
      .findFirst({
        where: { ...where, league, seasonIsTest: false },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
    if (normal) return normal;
    return prisma.race
      .findFirst({
        where: { ...where, league },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
  }

  const race = await findPreferred({ startsAt: { gte: windowStart, lte: windowEnd } }, { startsAt: "desc" });

  return Response.json(
    {
      league: cfg.league,
      leagueLabel: cfg.name,
      accent: cfg.accentColor,
      hasOnAir: Boolean(race),
      race: race
        ? {
            id: race.id,
            title: race.name,
            round: race.round,
            startsAtMs: new Date(race.startsAt).getTime(),
            twitchChannel: race.twitchChannel
          }
        : null
    },
    { headers: { "cache-control": "no-store" } }
  );
}

