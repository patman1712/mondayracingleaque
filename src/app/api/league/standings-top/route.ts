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
      { league, season: null, drivers: [], teams: [] },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const seasonDrivers = await prisma.driverSeason
    .findMany({
      where: { seasonId: currentSeason.id, driver: { status: "ACTIVE" } },
      select: {
        driverId: true,
        teamId: true,
        role: true,
        portraitPath: true,
        driver: { select: { name: true, gamertag: true, portraitPath: true } },
        teamRef: { select: { id: true } }
      },
      take: 5000
    })
    .catch(() => []);

  const driverInfo = new Map<
    string,
    {
      name: string;
      role: "MAIN" | "RESERVE";
      teamId: string | null;
      portraitUrl: string | null;
    }
  >();
  const seasonTeamIds = new Set<string>();
  for (const r of seasonDrivers) {
    const name = (r.driver.gamertag ?? "").trim() ? String(r.driver.gamertag) : String(r.driver.name);
    const teamId = r.teamId ?? r.teamRef?.id ?? null;
    if (r.role === "MAIN" && teamId) seasonTeamIds.add(teamId);
    driverInfo.set(r.driverId, {
      name,
      role: r.role,
      teamId,
      portraitUrl: imageUrl(r.portraitPath ?? r.driver.portraitPath)
    });
  }

  const driverRoleById = new Map<string, "MAIN" | "RESERVE">(
    seasonDrivers.map((r) => [r.driverId, r.role] as const)
  );

  const races = await prisma.race
    .findMany({
      where: {
        league,
        season: currentSeason.year,
        seasonNo: currentSeason.seasonNo,
        seasonIsTest: currentSeason.isTest,
        resultsPublishedAt: { not: null }
      },
      select: {
        id: true,
        results: { select: { driverId: true, points: true }, take: 5000 },
        entries: { select: { driverId: true, teamId: true }, take: 5000 }
      },
      take: 250
    })
    .catch(() => []);

  const driverPoints = new Map<string, number>();
  const teamPoints = new Map<string, number>();
  const raceTeamIds = new Set<string>();

  for (const race of races) {
    const raceTeamByDriverId = new Map<string, string | null>();
    for (const e of race.entries) {
      raceTeamByDriverId.set(e.driverId, e.teamId ?? null);
      if (e.teamId) raceTeamIds.add(e.teamId);
    }

    const teamRacePoints = new Map<string, number[]>();
    for (const r of race.results) {
      const p = Number(r.points ?? 0);
      if (Number.isFinite(p)) driverPoints.set(r.driverId, (driverPoints.get(r.driverId) ?? 0) + p);

      const role = driverRoleById.get(r.driverId) ?? "MAIN";
      const teamId =
        raceTeamByDriverId.get(r.driverId) ??
        (role === "MAIN" ? driverInfo.get(r.driverId)?.teamId ?? null : null);
      if (!teamId) continue;
      const list = teamRacePoints.get(teamId) ?? [];
      list.push(Number.isFinite(p) ? p : 0);
      teamRacePoints.set(teamId, list);
    }

    for (const [teamId, pts] of teamRacePoints.entries()) {
      const sum = pts
        .slice()
        .sort((a, b) => b - a)
        .slice(0, 2)
        .reduce((acc, v) => acc + v, 0);
      teamPoints.set(teamId, (teamPoints.get(teamId) ?? 0) + sum);
    }
  }

  const relevantTeamIds = Array.from(new Set([...seasonTeamIds, ...raceTeamIds, ...teamPoints.keys()]));

  const teams = await prisma.team
    .findMany({
      where: { id: { in: relevantTeamIds } },
      select: { id: true, name: true, color: true, logoPath: true },
      take: 5000
    })
    .catch(() => []);
  const teamById = new Map(teams.map((t) => [t.id, t] as const));

  const teamsSeason = await prisma.teamSeason
    .findMany({
      where: { seasonId: currentSeason.id, teamId: { in: relevantTeamIds } },
      select: { teamId: true, color: true, team: { select: { color: true, logoPath: true } } },
      take: 5000
    })
    .catch(() => []);
  const teamSeasonById = new Map(teamsSeason.map((t) => [t.teamId, t] as const));

  const teamAccentById = new Map<string, string | null>();
  const teamLogoUrlById = new Map<string, string | null>();
  for (const teamId of relevantTeamIds) {
    const t = teamById.get(teamId) ?? null;
    const ts = teamSeasonById.get(teamId) ?? null;
    const accent = ts?.color ?? ts?.team.color ?? t?.color ?? null;
    teamAccentById.set(teamId, accent);
    const logoPath = ts?.team.logoPath ?? t?.logoPath ?? null;
    teamLogoUrlById.set(teamId, imageUrl(logoPath));
  }

  const drivers = Array.from(driverInfo.entries())
    .map(([id, d]) => {
      const accent = d.role === "MAIN" && d.teamId ? teamAccentById.get(d.teamId) ?? null : null;
      return { id, name: d.name, points: driverPoints.get(id) ?? 0, accent, portraitUrl: d.portraitUrl };
    })
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name, "de-DE")))
    .slice(0, 3);

  const teamsTop = relevantTeamIds
    .map((teamId) => {
      const t = teamById.get(teamId) ?? null;
      if (!t) return null;
      const n = (t.name ?? "").trim().toLowerCase();
      if (n === "ersatzfahrer" || n === "reserve" || n === "reserves") return null;
      return {
        id: t.id,
        name: t.name,
        points: teamPoints.get(t.id) ?? 0,
        accent: teamAccentById.get(t.id) ?? null,
        logoUrl: teamLogoUrlById.get(t.id) ?? null
      };
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name, "de-DE")))
    .slice(0, 3);

  return Response.json(
    {
      league,
      season: { year: currentSeason.year, seasonNo: currentSeason.seasonNo, isTest: currentSeason.isTest },
      drivers,
      teams: teamsTop
    },
    { headers: { "cache-control": "no-store" } }
  );
}
