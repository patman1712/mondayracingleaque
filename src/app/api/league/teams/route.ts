import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";
import { Prisma } from "@prisma/client";
import { resolveLeagueByPublicSlug } from "@/lib/league";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

function isReserveTeamName(name: string) {
  return name.toLowerCase().includes("ersatzfahrer");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("league") ?? "";
  const cfg = await resolveLeagueByPublicSlug(slug);
  if (!cfg) return new Response("Bad league", { status: 400 });
  if (!cfg.isActive) return new Response("Inactive league", { status: 404 });
  const league = cfg.league;

  const assigned = await prisma.teamLeague
    .findMany({ where: { league }, select: { teamId: true }, take: 2000 })
    .catch(() => []);
  const assignedTeamIds = new Set(assigned.map((r) => r.teamId));
  const assignedTeamIdList = Array.from(assignedTeamIds);

  const currentSeason = await getActiveSeason({
    league,
    select: { id: true, year: true, seasonNo: true, isTest: true }
  }).catch(() => null);

  const select = {
    id: true,
    color: true,
    carImagePath: true,
    team: { select: { id: true, name: true, color: true, logoPath: true } },
    season: { select: { year: true, seasonNo: true, isTest: true } }
  } satisfies Prisma.TeamSeasonSelect;

  type Row = Prisma.TeamSeasonGetPayload<{ select: typeof select }>;

  let rows: Row[] = [];
  const seasonId: string | null = currentSeason?.id ?? null;
  if (currentSeason) {
    if (assignedTeamIdList.length) {
      rows = await prisma.teamSeason
        .findMany({
          where: { seasonId: currentSeason.id, teamId: { in: assignedTeamIdList } },
          orderBy: [{ team: { name: "asc" } }],
          select
        })
        .catch(() => []);
    }
  }

  if (!rows.length) {
    const teams = await prisma.teamLeague
      .findMany({
        where: { league },
        orderBy: [{ team: { name: "asc" } }],
        take: 400,
        select: { team: { select: { id: true, name: true, color: true, logoPath: true } } }
      })
      .catch(() => []);
    const ordered = teams
      .map((t) => t.team)
      .map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        logoUrl: imageUrl(t.logoPath),
        carUrl: null
      }))
      .sort((a, b) => {
        const ar = isReserveTeamName(a.name) ? 1 : 0;
        const br = isReserveTeamName(b.name) ? 1 : 0;
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
      });
    return Response.json(
      {
        league,
        season: currentSeason ? { year: currentSeason.year, seasonNo: currentSeason.seasonNo, isTest: currentSeason.isTest } : null,
        teams: ordered
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  if (seasonId) {
    const ds = await prisma.driverSeason
      .findMany({
        where: { seasonId, teamId: { not: null } },
        distinct: ["teamId"],
        select: {
          teamId: true,
          teamRef: { select: { id: true, name: true, color: true, logoPath: true } }
        },
        take: 500
      })
      .catch(() => []);

    const byId = new Map<
      string,
      { id: string; name: string; color: string | null; logoUrl: string | null; carUrl: string | null }
    >();

    for (const r of rows) {
      byId.set(r.team.id, {
        id: r.team.id,
        name: r.team.name,
        color: r.color ?? r.team.color ?? null,
        logoUrl: imageUrl(r.team.logoPath),
        carUrl: imageUrl(r.carImagePath)
      });
    }

    for (const r of ds) {
      if (!r.teamRef) continue;
      if (byId.has(r.teamRef.id)) continue;
      if (!assignedTeamIds.has(r.teamRef.id)) continue;
      byId.set(r.teamRef.id, {
        id: r.teamRef.id,
        name: r.teamRef.name,
        color: r.teamRef.color ?? null,
        logoUrl: imageUrl(r.teamRef.logoPath),
        carUrl: null
      });
    }

    const ordered = Array.from(byId.values()).sort((a, b) => {
      const ar = isReserveTeamName(a.name) ? 1 : 0;
      const br = isReserveTeamName(b.name) ? 1 : 0;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });

    return Response.json(
      {
        league,
        season: rows[0]
          ? { year: rows[0].season.year, seasonNo: rows[0].season.seasonNo, isTest: rows[0].season.isTest }
          : null,
        teams: ordered
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
