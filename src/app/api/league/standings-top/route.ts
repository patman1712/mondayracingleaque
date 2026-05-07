import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";
import { resolveLeagueByPublicSlug } from "@/lib/league";

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
        driver: { select: { name: true, gamertag: true } },
        teamRef: { select: { id: true } }
      },
      take: 5000
    })
    .catch(() => []);

  const driverInfo = new Map<
    string,
    { name: string; role: "MAIN" | "RESERVE"; teamId: string | null }
  >();
  for (const r of seasonDrivers) {
    const name = (r.driver.gamertag ?? "").trim() ? String(r.driver.gamertag) : String(r.driver.name);
    driverInfo.set(r.driverId, {
      name,
      role: r.role,
      teamId: r.teamId ?? r.teamRef?.id ?? null
    });
  }

  const driverRoleById = new Map<string, "MAIN" | "RESERVE">(
    seasonDrivers.map((r) => [r.driverId, r.role] as const)
  );

  const teamsSeason = await prisma.teamSeason
    .findMany({
      where: { seasonId: currentSeason.id },
      select: { team: { select: { id: true, name: true } } },
      take: 5000
    })
    .catch(() => []);

  const teamsSeasonFiltered = teamsSeason.filter((t) => {
    const n = (t.team.name ?? "").trim().toLowerCase();
    return n !== "ersatzfahrer" && n !== "reserve" && n !== "reserves";
  });

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

  for (const race of races) {
    const raceTeamByDriverId = new Map<string, string | null>();
    for (const e of race.entries) {
      raceTeamByDriverId.set(e.driverId, e.teamId ?? null);
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

  const drivers = Array.from(driverInfo.entries())
    .map(([id, d]) => ({ id, name: d.name, points: driverPoints.get(id) ?? 0 }))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name, "de-DE")))
    .slice(0, 3);

  const teams = teamsSeasonFiltered
    .map((t) => ({ id: t.team.id, name: t.team.name, points: teamPoints.get(t.team.id) ?? 0 }))
    .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name, "de-DE")))
    .slice(0, 3);

  return Response.json(
    {
      league,
      season: { year: currentSeason.year, seasonNo: currentSeason.seasonNo, isTest: currentSeason.isTest },
      drivers,
      teams
    },
    { headers: { "cache-control": "no-store" } }
  );
}

