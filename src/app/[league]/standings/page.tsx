import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { resolveLeagueByPublicSlug } from "@/lib/league";
import { getActiveSeason } from "@/lib/currentSeason";
import Link from "next/link";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

function countryToFlagEmoji(country: string | null | undefined) {
  const code = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const a = 0x1f1e6;
  const first = code.charCodeAt(0) - 65 + a;
  const second = code.charCodeAt(1) - 65 + a;
  return String.fromCodePoint(first, second);
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

export default async function LeagueStandingsPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { league } = await params;
  const sp = await searchParams;
  const tabRaw = (sp.tab ?? "").trim().toLowerCase();
  const tab = tabRaw === "teams" ? "teams" : "drivers";

  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;
  const currentSeason = await getActiveSeason({
    league: l,
    select: { id: true, year: true, seasonNo: true, isTest: true }
  }).catch(() => null);

  if (!currentSeason) notFound();

  type DriverStanding = {
    driverId: string;
    points: number;
    name: string;
    gamertag: string | null;
    number: number | null;
    country: string | null;
    portraitPath: string | null;
    accent: string | null;
    teamId: string | null;
    teamName: string | null;
    teamLogoPath: string | null;
    isReserve: boolean;
  };

  type TeamStanding = {
    teamId: string;
    points: number;
    name: string;
    accent: string | null;
    logoPath: string | null;
    drivers: string[];
  };

  let driverStandings: DriverStanding[] = [];
  let teamStandings: TeamStanding[] = [];

  try {
    type SeasonDriverRow = {
      driverId: string;
      teamId: string | null;
      role: "MAIN" | "RESERVE";
      driver: {
        id: string;
        name: string;
        gamertag: string | null;
        number: number | null;
        country: string | null;
        portraitPath: string | null;
      };
      teamRef: {
        id: string;
        name: string;
        logoPath: string | null;
        color: string | null;
        participations: Array<{ color: string | null }>;
      } | null;
    };

    const seasonDrivers = (await prisma.driverSeason
      .findMany({
        where: { seasonId: currentSeason.id, driver: { status: "ACTIVE" } },
        select: {
          driverId: true,
          teamId: true,
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
              id: true,
              name: true,
              logoPath: true,
              color: true,
              participations: { where: { seasonId: currentSeason.id }, select: { color: true }, take: 1 }
            }
          }
        },
        take: 5000
      })
      .catch(() => [])) as SeasonDriverRow[];

    const driverInfo = new Map<
      string,
      {
        name: string;
        gamertag: string | null;
        number: number | null;
        country: string | null;
        portraitPath: string | null;
        accent: string | null;
        teamId: string | null;
        teamName: string | null;
        teamLogoPath: string | null;
        role: "MAIN" | "RESERVE";
      }
    >();
    for (const r of seasonDrivers) {
      const t = r.teamRef;
      const accent = t?.participations?.[0]?.color ?? t?.color ?? null;
      driverInfo.set(r.driverId, {
        name: r.driver.name,
        gamertag: r.driver.gamertag ?? null,
        number: r.driver.number ?? null,
        country: r.driver.country ?? null,
        portraitPath: r.driver.portraitPath ?? null,
        accent,
        teamId: r.teamId ?? t?.id ?? null,
        teamName: t?.name ?? null,
        teamLogoPath: t?.logoPath ?? null
        , role: r.role
      });
    }

    const driverRoleById = new Map<string, "MAIN" | "RESERVE">(seasonDrivers.map((r) => [r.driverId, r.role] as const));

    const teamBuckets = new Map<string, { main: string[] }>();
    for (const r of seasonDrivers) {
      const teamId = r.teamId ?? null;
      if (!teamId) continue;
      if (r.role !== "MAIN") continue;
      const label = (r.driver.gamertag ?? "").trim() ? String(r.driver.gamertag) : String(r.driver.name);
      const bucket = teamBuckets.get(teamId) ?? { main: [] };
      bucket.main.push(label);
      teamBuckets.set(teamId, bucket);
    }
    const teamDriverNames = new Map<string, string[]>();
    for (const [teamId, bucket] of teamBuckets.entries()) {
      const main = bucket.main.slice().sort((a, b) => a.localeCompare(b));
      teamDriverNames.set(teamId, Array.from(new Set(main)).slice(0, 2));
    }

    const teamsSeason = await prisma.teamSeason
      .findMany({
        where: { seasonId: currentSeason.id },
        select: {
          color: true,
          team: { select: { id: true, name: true, logoPath: true, color: true } }
        },
        take: 5000
      })
      .catch(() => []);

    const races = await prisma.race
      .findMany({
        where: {
          league: l,
          season: currentSeason.year,
          seasonNo: currentSeason.seasonNo,
          seasonIsTest: currentSeason.isTest,
          resultsPublishedAt: { not: null }
        },
        orderBy: [{ round: "asc" }],
        select: {
          id: true,
          results: { select: { driverId: true, points: true, status: true, timeText: true }, take: 5000 },
          entries: { select: { driverId: true, teamId: true }, take: 5000 }
        },
        take: 200
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

    driverStandings = Array.from(driverInfo.entries())
      .map(([driverId, d]) => ({
        driverId,
        points: driverPoints.get(driverId) ?? 0,
        name: d.name,
        gamertag: d.gamertag,
        number: d.number,
        country: d.country,
        portraitPath: d.portraitPath,
        accent: d.accent,
        teamId: d.role === "MAIN" ? d.teamId : null,
        teamName: d.role === "MAIN" ? d.teamName : null,
        teamLogoPath: d.role === "MAIN" ? d.teamLogoPath : null,
        isReserve: d.role !== "MAIN"
      }))
      .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name)));

    teamStandings = teamsSeason
      .map((t) => ({
        teamId: t.team.id,
        points: teamPoints.get(t.team.id) ?? 0,
        name: t.team.name,
        accent: t.color ?? t.team.color ?? null,
        logoPath: t.team.logoPath ?? null,
        drivers: teamDriverNames.get(t.team.id) ?? []
      }))
      .sort((a, b) => (b.points !== a.points ? b.points - a.points : a.name.localeCompare(b.name)));
  } catch {}

  const seasonLabel = `Saison ${currentSeason.year} · Season ${currentSeason.seasonNo}${currentSeason.isTest ? " · TEST" : ""}`;

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          WM Stand · {cfg.name}
        </div>
        <div className="mt-2 text-sm text-white/70">
          {seasonLabel} · Punkte basieren auf veröffentlichten Ergebnissen
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/${league}/standings`}
            className={
              "rounded-lg px-4 py-2 text-sm font-semibold " +
              (tab === "drivers"
                ? "bg-white/10 text-white"
                : "border border-white/10 bg-black/20 text-white/70 hover:text-white")
            }
          >
            Fahrer WM
          </Link>
          <Link
            href={`/${league}/standings?tab=teams`}
            className={
              "rounded-lg px-4 py-2 text-sm font-semibold " +
              (tab === "teams"
                ? "bg-white/10 text-white"
                : "border border-white/10 bg-black/20 text-white/70 hover:text-white")
            }
          >
            Team WM
          </Link>
        </div>
      </div>

      {tab === "drivers" ? (
        <div className="mt-6">
          {driverStandings.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Noch keine Ergebnisse.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {(() => {
                const mid = Math.ceil(driverStandings.length / 2);
                const cols = [driverStandings.slice(0, mid), driverStandings.slice(mid)];
                return cols.filter((c) => c.length > 0).map((col, colIdx) => (
                  <div key={colIdx} className="grid gap-3">
                    {col.map((d, idxInCol) => {
                      const idx = colIdx === 0 ? idxInCol : mid + idxInCol;
                      const pos = idx + 1;
                      const flag = countryToFlagEmoji(d.country);
                      const portraitUrl = imageUrl(d.portraitPath) ?? null;
                      const teamLogoUrl = imageUrl(d.teamLogoPath) ?? null;

                      return (
                        <Link
                          key={d.driverId}
                          href={`/${league}/drivers/${d.driverId}`}
                          className="group grid grid-cols-[56px_1fr_88px] gap-2"
                        >
                          <div
                            className="flex items-center justify-center overflow-hidden rounded-2xl border-2 bg-black/25"
                            style={{ borderColor: d.accent ?? "rgba(255,255,255,0.15)" }}
                          >
                            <div className="text-xl font-extrabold text-white">{pos}</div>
                          </div>

                          <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ backgroundImage: heroBg(d.accent) }}>
                            <div
                              className="absolute inset-0 opacity-25"
                              style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                            />
                            <div className="absolute left-0 top-0 h-[4px] w-full" style={{ backgroundColor: d.accent ?? "#ffffff" }} />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

                            {portraitUrl ? (
                              <div className="absolute inset-y-0 right-0 w-[38%] p-2">
                                <div className="relative h-full w-full">
                                  <img
                                    src={portraitUrl}
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-contain object-right object-bottom opacity-95 transition duration-300 group-hover:scale-[1.02]"
                                  />
                                </div>
                              </div>
                            ) : null}

                            <div className="relative p-4">
                              <div className="flex items-center gap-2">
                                {flag ? <div className="text-base leading-none">{flag}</div> : null}
                                <div className="min-w-0 truncate text-base font-extrabold uppercase tracking-wide text-white">
                                  {d.gamertag ? d.gamertag : d.name}
                                </div>
                                {d.number ? (
                                  <div className="shrink-0 text-xs font-extrabold text-white/70">#{d.number}</div>
                                ) : null}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-white/80">
                                {d.isReserve ? (
                                  <span className="truncate text-white/70">Ersatzfahrer</span>
                                ) : (
                                  <>
                                    <span className="truncate">{d.teamName ?? ""}</span>
                                    {teamLogoUrl ? (
                                      <span className="ml-auto flex items-center">
                                        <img
                                          src={teamLogoUrl}
                                          alt=""
                                          className="h-8 w-auto object-contain opacity-95 sm:h-9 md:h-10"
                                        />
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div
                            className="flex items-center justify-end overflow-hidden rounded-2xl border-2 bg-black/25 px-3 py-2 text-right"
                            style={{ borderColor: d.accent ?? "rgba(255,255,255,0.15)" }}
                          >
                            <div>
                              <div className="text-xl font-extrabold text-white">{d.points.toFixed(0)}</div>
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">PTS</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {teamStandings.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Noch keine Teams.
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
                        <Link
                          key={t.teamId}
                          href={`/${league}/teams/${t.teamId}`}
                          className="group grid grid-cols-[56px_1fr_88px] gap-2"
                        >
                          <div
                            className="flex items-center justify-center overflow-hidden rounded-2xl border-2 bg-black/25"
                            style={{ borderColor: t.accent ?? "rgba(255,255,255,0.15)" }}
                          >
                            <div className="text-xl font-extrabold text-white">{pos}</div>
                          </div>

                          <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ backgroundImage: heroBg(t.accent) }}>
                            <div
                              className="absolute inset-0 opacity-25"
                              style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                            />
                            <div className="absolute left-0 top-0 h-[4px] w-full" style={{ backgroundColor: t.accent ?? "#ffffff" }} />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

                            <div className="relative p-4">
                              <div className="flex items-center gap-3">
                                {logoUrl ? (
                                  <div className="flex h-12 w-12 items-center justify-center sm:h-14 sm:w-14">
                                    <img src={logoUrl} alt="" className="h-full w-full object-contain opacity-95" />
                                  </div>
                                ) : (
                                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/20 text-sm font-extrabold text-white/70 sm:h-14 sm:w-14">
                                    {t.name.slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="truncate text-base font-extrabold uppercase tracking-wide text-white">{t.name}</div>
                                  <div className="mt-1 truncate text-xs font-semibold text-white/70">
                                    {t.drivers.length ? t.drivers.join(" · ") : ""}
                                  </div>
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
                        </Link>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </Container>
  );
}
