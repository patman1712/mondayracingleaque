import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { getActiveSeason } from "@/lib/currentSeason";
import Link from "next/link";
import { League } from "@prisma/client";
import Image from "next/image";

export const dynamic = "auto";
export const revalidate = 90;

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

function hexToRgba(hex: string, a: number) {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function heroBg(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.32) : "rgba(255,255,255,0.08)";
  const b = c ? hexToRgba(c, 0.06) : "rgba(255,255,255,0.03)";
  const d = c ? hexToRgba(c, 0.22) : "rgba(255,255,255,0.06)";
  return `radial-gradient(900px circle at 20% 18%, ${d}, transparent 62%), linear-gradient(145deg, ${a}, ${b})`;
}

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
}

const TARGET_LEAGUES: League[] = [League.ONE, League.TWO, League.THREE];

type AggregatedTeamStanding = {
  teamId: string;
  points: number;
  name: string;
  accent: string | null;
  logoPath: string | null;
  leagueBreakdown: { league: League; points: number }[];
  drivers: string[];
};

export default async function MrlTeamWmPage() {
  type SeasonInfo = {
    id: string;
    year: number;
    seasonNo: number;
    isTest: boolean;
    league: League;
  };
  type RaceInfo = {
    id: string;
    round: number;
    isSprint: boolean;
    league: League;
    results: { driverId: string; position: number; points: number; status: string | null }[];
    entries: { driverId: string; teamId: string | null }[];
  };
  type SeasonDriverInfo = {
    driverId: string;
    teamId: string | null;
    role: "MAIN" | "RESERVE";
    league: League;
    driver: {
      name: string;
      gamertag: string | null;
    };
  };

  const teamStandings: AggregatedTeamStanding[] = [];
  let seasonLabels: { league: League; label: string }[] = [];
  const allRacesByLeague: Record<string, number> = {};

  try {
    const initialSeasons = new Map<League, SeasonInfo | null>();
    for (const l of TARGET_LEAGUES) {
      const s = await getActiveSeason({
        league: l,
        select: { id: true, year: true, seasonNo: true, isTest: true }
      }).catch(() => null);
      initialSeasons.set(l, s ? { ...s, league: l } : null);
    }

    const leadCandidate = Array.from(initialSeasons.values())
      .filter((s): s is SeasonInfo => Boolean(s))
      .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.seasonNo - a.seasonNo))[0] ?? null;

    const targetYear = leadCandidate?.year ?? 0;
    const targetSeasonNo = leadCandidate?.seasonNo ?? 1;
    const targetIsTest = leadCandidate?.isTest ?? false;

    const syncedSeasons = new Map<League, SeasonInfo | null>();
    for (const l of TARGET_LEAGUES) {
      const direct = await prisma.season
        .findFirst({
          where: {
            league: l,
            year: targetYear,
            seasonNo: targetSeasonNo,
            isTest: targetIsTest
          },
          select: { id: true, year: true, seasonNo: true, isTest: true }
        })
        .catch(() => null);
      if (direct) {
        syncedSeasons.set(l, { ...direct, league: l });
      } else {
        const active = initialSeasons.get(l) ?? null;
        syncedSeasons.set(l, active);
      }
    }

    seasonLabels = TARGET_LEAGUES.map((l) => {
      const s = syncedSeasons.get(l) ?? null;
      const leagueName =
        l === League.ONE ? "MRL One" : l === League.TWO ? "MRL Two" : l === League.THREE ? "MRL Three" : String(l);
      if (s) {
        const synced =
          s.year === targetYear && s.seasonNo === targetSeasonNo && s.isTest === targetIsTest;
        return {
          league: l,
          label: `${leagueName} · Saison ${s.year} · Season ${s.seasonNo}${s.isTest ? " · TEST" : ""}${synced ? "" : " (Abweichung)"}`
        };
      }
      return { league: l, label: `${leagueName} · Keine Saison gefunden` };
    });

    const activeSeasons = Array.from(syncedSeasons.values()).filter(
      (s): s is SeasonInfo => Boolean(s)
    );
    if (activeSeasons.length === 0) notFound();
    const activeSeasonIds = activeSeasons.map((s) => s.id);

    const seasonDriversRaw = await prisma.driverSeason
      .findMany({
        where: { seasonId: { in: activeSeasonIds }, driver: { status: "ACTIVE" } },
        select: {
          driverId: true,
          teamId: true,
          role: true,
          seasonId: true,
          driver: { select: { name: true, gamertag: true } }
        },
        take: 20000
      })
      .catch(() => []);

    const seasonBySeasonId = new Map<string, SeasonInfo>();
    for (const s of activeSeasons) seasonBySeasonId.set(s.id, s);

    const seasonDrivers: SeasonDriverInfo[] = seasonDriversRaw.map((d) => {
      const season = seasonBySeasonId.get(d.seasonId) ?? null;
      return {
        driverId: d.driverId,
        teamId: d.teamId ?? null,
        role: d.role,
        league: season?.league ?? League.ONE,
        driver: {
          name: d.driver.name,
          gamertag: d.driver.gamertag ?? null
        }
      };
    });

    const teamsSeasonRaw = await prisma.teamSeason
      .findMany({
        where: { seasonId: { in: activeSeasonIds } },
        select: {
          color: true,
          seasonId: true,
          team: { select: { id: true, name: true, logoPath: true, color: true } }
        },
        take: 20000
      })
      .catch(() => []);

    const teamSeasonAccentByTeamLeague = new Map<string, string | null>();
    const teamByTeamId = new Map<string, { id: string; name: string; color: string | null; logoPath: string | null }>();
    for (const ts of teamsSeasonRaw) {
      const season = seasonBySeasonId.get(ts.seasonId) ?? null;
      if (!season) continue;
      const accent = ts.color ?? ts.team.color ?? null;
      const key = `${ts.team.id}::${season.league}`;
      teamSeasonAccentByTeamLeague.set(key, accent);
      if (!teamByTeamId.has(ts.team.id)) {
        teamByTeamId.set(ts.team.id, {
          id: ts.team.id,
          name: ts.team.name,
          color: ts.team.color ?? null,
          logoPath: ts.team.logoPath ?? null
        });
      }
    }

    const racesRaw = await prisma.race
      .findMany({
        where: {
          league: { in: TARGET_LEAGUES },
          resultsPublishedAt: { not: null },
          OR: activeSeasons.map((s) => ({
            league: s.league,
            season: s.year,
            seasonNo: s.seasonNo,
            seasonIsTest: s.isTest
          }))
        },
        orderBy: [{ round: "asc" }, { isSprint: "desc" }],
        select: {
          id: true,
          round: true,
          isSprint: true,
          league: true,
          results: { select: { driverId: true, position: true, points: true, status: true }, take: 10000 },
          entries: { select: { driverId: true, teamId: true }, take: 10000 }
        },
        take: 1000
      })
      .catch(() => []);

    const races: RaceInfo[] = racesRaw.map((r) => ({
      id: r.id,
      round: r.round,
      isSprint: r.isSprint,
      league: r.league,
      results: r.results.map((x) => ({
        driverId: x.driverId,
        position: x.position,
        points: Number(x.points ?? 0),
        status: x.status ?? null
      })),
      entries: r.entries.map((e) => ({ driverId: e.driverId, teamId: e.teamId ?? null }))
    }));

    for (const r of races) {
      allRacesByLeague[r.league] = (allRacesByLeague[r.league] ?? 0) + 1;
    }

    const aggregatedTeamPoints = new Map<string, number>();
    const teamPointsByLeague = new Map<string, Map<League, number>>();
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
        const teamId = raceTeamByDriverId.get(r.driverId) ?? null;
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
        aggregatedTeamPoints.set(teamId, (aggregatedTeamPoints.get(teamId) ?? 0) + sum);

        const perLeague = teamPointsByLeague.get(teamId) ?? new Map<League, number>();
        perLeague.set(race.league, (perLeague.get(race.league) ?? 0) + sum);
        teamPointsByLeague.set(teamId, perLeague);
      }
    }

    const seasonTeamIds = new Set<string>();
    for (const d of seasonDrivers) {
      if (d.role === "MAIN" && d.teamId) seasonTeamIds.add(d.teamId);
    }

    const teamDriverBuckets = new Map<string, { main: string[] }>();
    for (const d of seasonDrivers) {
      if (d.role !== "MAIN") continue;
      const teamId = d.teamId;
      if (!teamId) continue;
      const label = (d.driver.gamertag ?? "").trim() ? String(d.driver.gamertag) : String(d.driver.name);
      const bucket = teamDriverBuckets.get(teamId) ?? { main: [] };
      bucket.main.push(label);
      teamDriverBuckets.set(teamId, bucket);
    }
    const teamDriverNames = new Map<string, string[]>();
    for (const [teamId, bucket] of teamDriverBuckets.entries()) {
      const main = bucket.main.slice().sort((a, b) => a.localeCompare(b));
      teamDriverNames.set(teamId, Array.from(new Set(main)).slice(0, 4));
    }

    const relevantTeamIds = Array.from(
      new Set([...seasonTeamIds, ...raceTeamIds, ...aggregatedTeamPoints.keys()])
    );
    const teams = await prisma.team
      .findMany({
        where: { id: { in: relevantTeamIds } },
        select: { id: true, name: true, color: true, logoPath: true },
        take: 20000
      })
      .catch(() => []);
    for (const t of teams) {
      if (!teamByTeamId.has(t.id)) {
        teamByTeamId.set(t.id, {
          id: t.id,
          name: t.name,
          color: t.color ?? null,
          logoPath: t.logoPath ?? null
        });
      }
    }

    teamStandings.push(
      ...relevantTeamIds
        .map((teamId) => {
          const t = teamByTeamId.get(teamId) ?? null;
          if (!t) return null;
          const n = (t.name ?? "").trim().toLowerCase();
          if (n === "ersatzfahrer" || n === "reserve" || n === "reserves") return null;

          const breakdown: { league: League; points: number }[] = [];
          const perLeague = teamPointsByLeague.get(teamId) ?? null;
          for (const l of TARGET_LEAGUES) {
            breakdown.push({ league: l, points: perLeague?.get(l) ?? 0 });
          }

          let accent: string | null = null;
          for (const l of TARGET_LEAGUES) {
            const candidate = teamSeasonAccentByTeamLeague.get(`${teamId}::${l}`);
            if (candidate) {
              accent = candidate;
              break;
            }
          }
          if (!accent) accent = t.color ?? null;

          const logo = teamByTeamId.get(teamId)?.logoPath ?? null;

          return {
            teamId: t.id,
            points: aggregatedTeamPoints.get(t.id) ?? 0,
            name: t.name,
            accent,
            logoPath: logo,
            leagueBreakdown: breakdown,
            drivers: teamDriverNames.get(t.id) ?? []
          } as AggregatedTeamStanding;
        })
        .filter((t): t is AggregatedTeamStanding => Boolean(t))
        .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name)))
    );
  } catch (e) {}

  const leagueShort: Record<League, string> = {
    [League.ONE]: "One",
    [League.TWO]: "Two",
    [League.THREE]: "Three",
    [League.ROOKIE]: "Rookie",
    [League.FOUR]: "Four",
    [League.FIVE]: "Five",
    [League.SIX]: "Six",
    [League.SEVEN]: "Seven",
    [League.EIGHT]: "Eight",
    [League.NINE]: "Nine",
    [League.TEN]: "Ten"
  };

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">MRL Team WM</div>
        <div className="mt-2 text-sm text-white/70">
          Gesamt-Teamwertung über MRL One · MRL Two · MRL Three der aktuellen Saison · Punkte basieren auf veröffentlichten Ergebnissen
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
          {seasonLabels.map((s) => (
            <div
              key={s.league}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
            >
              {s.label}
              {allRacesByLeague[s.league] != null ? (
                <span className="ml-2 text-white/50">· {allRacesByLeague[s.league]} Rennen</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {teamStandings.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Noch keine veröffentlichten Ergebnisse in MRL One / Two / Three.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {(() => {
              const mid = Math.ceil(teamStandings.length / 2);
              const cols = [teamStandings.slice(0, mid), teamStandings.slice(mid)];
              return cols.filter((c) => c.length > 0).map((col, colIdx) => (
                <div key={colIdx} className="grid gap-3">
                  {col.map((t, idxInCol) => {
                    const idx = colIdx === 0 ? idxInCol : mid + idxInCol;
                    const pos = idx + 1;
                    const logoUrl = imageUrl(t.logoPath) ?? null;

                    return (
                      <div
                        key={t.teamId}
                        className="group grid grid-cols-[56px_1fr_100px] gap-2"
                      >
                        <div
                          className="flex items-center justify-center overflow-hidden rounded-2xl border-2 bg-black/25"
                          style={{ borderColor: t.accent ?? "rgba(255,255,255,0.15)" }}
                        >
                          <div className="text-xl font-extrabold text-white">{pos}</div>
                        </div>

                        <div
                          className="relative overflow-hidden rounded-2xl border border-white/10"
                          style={{ backgroundImage: heroBg(t.accent) }}
                        >
                          <div
                            className="absolute inset-0 opacity-25"
                            style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                          />
                          <div
                            className="absolute left-0 top-0 h-[4px] w-full"
                            style={{ backgroundColor: t.accent ?? "#ffffff" }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

                          <div className="relative p-4">
                            <div className="flex items-center gap-3">
                              {logoUrl ? (
                                <div className="flex h-10 w-10 items-center justify-center sm:h-12 sm:w-12">
                                  <img
                                    src={logoUrl}
                                    alt=""
                                    className="h-full w-full object-contain opacity-95"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/20 text-xs font-extrabold text-white/70 sm:h-12 sm:w-12">
                                  {t.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-extrabold uppercase tracking-wide text-white">
                                  {t.name}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                                  {t.leagueBreakdown
                                    .filter((b) => b.points > 0)
                                    .map((b) => (
                                      <span
                                        key={b.league}
                                        className="rounded-md bg-black/30 px-2 py-0.5"
                                      >
                                        {leagueShort[b.league]} · {b.points}
                                      </span>
                                    ))}
                                  {t.leagueBreakdown.every((b) => b.points === 0) ? (
                                    <span className="rounded-md bg-black/30 px-2 py-0.5">
                                      Noch keine Punkte
                                    </span>
                                  ) : null}
                                </div>
                                {t.drivers.length ? (
                                  <div className="mt-1 truncate text-[11px] font-semibold text-white/70">
                                    {t.drivers.join(" · ")}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center justify-end overflow-hidden rounded-2xl border-2 bg-black/25 px-3 py-2 text-right"
                          style={{ borderColor: t.accent ?? "rgba(255,255,255,0.15)" }}
                        >
                          <div>
                            <div className="text-xl font-extrabold text-white">{t.points.toFixed(0)}</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">PTS</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </Container>
  );
}
