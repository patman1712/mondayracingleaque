import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";
import { resolveLeagueByPublicSlug } from "@/lib/league";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("league") ?? "";
  const cfg = await resolveLeagueByPublicSlug(slug);
  if (!cfg) return new Response("Bad league", { status: 400 });
  if (!cfg.isActive) return new Response("Inactive league", { status: 404 });
  const league = cfg.league;

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
    portraitPath: true,
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
  } as const;

  const rows = await prisma.driverSeason
    .findMany({
      where: { seasonId: currentSeason.id, driver: { status: "ACTIVE" } },
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
          portraitUrl: imageUrl(r.portraitPath ?? r.driver.portraitPath),
          accent,
          role: r.role
        };
      })
    },
    { headers: { "cache-control": "no-store" } }
  );
}
