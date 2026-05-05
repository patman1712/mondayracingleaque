import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";
import { League, Prisma } from "@prisma/client";

function leagueFromSlug(slug: string): League | null {
  if (slug === "mrl-one") return League.ONE;
  if (slug === "mrl-two") return League.TWO;
  if (slug === "mrl-rookie") return League.ROOKIE;
  return null;
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("league") ?? "";
  const league = leagueFromSlug(slug);
  if (!league) return new Response("Bad league", { status: 400 });

  const currentSeason = await getActiveSeason({
    league,
    select: { id: true, year: true, seasonNo: true, isTest: true }
  }).catch(() => null);

  if (!currentSeason) {
    return Response.json(
      { league, season: null, drivers: [] },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const select = {
    role: true,
    driver: {
      select: {
        id: true,
        name: true,
        gamertag: true,
        number: true,
        country: true,
        portraitPath: true
      }
    },
    teamRef: {
      select: {
        color: true,
        participations: {
          where: { seasonId: currentSeason.id },
          select: { color: true },
          take: 1
        }
      }
    }
  } satisfies Prisma.DriverSeasonSelect;

  const rows = await prisma.driverSeason
    .findMany({
      where: { seasonId: currentSeason.id },
      orderBy: [{ role: "asc" }, { driver: { name: "asc" } }],
      select
    })
    .catch(() => []);

  return Response.json(
    {
      league,
      season: { year: currentSeason.year, seasonNo: currentSeason.seasonNo, isTest: currentSeason.isTest },
      drivers: rows.map((r) => {
        const accent = r.teamRef?.participations?.[0]?.color ?? r.teamRef?.color ?? null;
        return {
          id: r.driver.id,
          name: r.driver.name,
          gamertag: r.driver.gamertag ?? null,
          number: r.driver.number ?? null,
          country: r.driver.country ?? null,
          portraitUrl: imageUrl(r.driver.portraitPath),
          accent,
          role: r.role
        };
      })
    },
    { headers: { "cache-control": "no-store" } }
  );
}

