import { prisma } from "@/lib/db";
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

  const currentSeason = await prisma.season
    .findFirst({
      where: { league, placement: "CALENDAR" },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      select: { id: true, year: true, seasonNo: true, isTest: true }
    })
    .catch(() => null);

  const select = {
    id: true,
    color: true,
    carImagePath: true,
    team: { select: { id: true, name: true, color: true, logoPath: true } },
    season: { select: { year: true, seasonNo: true, isTest: true } }
  } satisfies Prisma.TeamSeasonSelect;

  type Row = Prisma.TeamSeasonGetPayload<{ select: typeof select }>;

  let rows: Row[] = [];
  if (currentSeason) {
    rows = await prisma.teamSeason
      .findMany({
        where: { seasonId: currentSeason.id },
        orderBy: [{ team: { name: "asc" } }],
        select
      })
      .catch(() => []);
  }

  if (!rows.length) {
    const teams = await prisma.team
      .findMany({
        orderBy: [{ name: "asc" }],
        take: 200,
        select: { id: true, name: true, color: true, logoPath: true }
      })
      .catch(() => []);
    return Response.json(
      {
        league,
        season: currentSeason ? { year: currentSeason.year, seasonNo: currentSeason.seasonNo, isTest: currentSeason.isTest } : null,
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          logoUrl: imageUrl(t.logoPath),
          carUrl: null
        }))
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  return Response.json(
    {
      league,
      season: rows[0]
        ? { year: rows[0].season.year, seasonNo: rows[0].season.seasonNo, isTest: rows[0].season.isTest }
        : null,
      teams: rows.map((r) => ({
        id: r.team.id,
        name: r.team.name,
        color: r.color ?? r.team.color ?? null,
        logoUrl: imageUrl(r.team.logoPath),
        carUrl: imageUrl(r.carImagePath)
      }))
    },
    { headers: { "cache-control": "no-store" } }
  );
}

