import { Container } from "@/components/Container";
import { TwitchEmbed } from "@/components/TwitchEmbed";
import { getActiveSeason } from "@/lib/currentSeason";
import { prisma } from "@/lib/db";
import { getLeagueColors } from "@/lib/leagueColors";
import { League } from "@prisma/client";
import Image from "next/image";
import { notFound } from "next/navigation";
import { listPublicLeagues, resolveLeagueByPublicSlug } from "@/lib/league";
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

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
}

function heroBg(color: string) {
  const c = color.startsWith("#") ? color : `#${color}`;
  return {
    backgroundImage: `radial-gradient(1200px circle at 18% 12%, ${hexToRgba(
      c,
      0.32
    )}, transparent 62%), linear-gradient(145deg, ${hexToRgba(
      c,
      0.18
    )}, rgba(255,255,255,0.03))`
  } as const;
}

function stat(label: string, value: string | number) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-white">{value}</div>
    </div>
  );
}

export default async function DriverDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string; driverId: string }>;
  searchParams: Promise<{ allRaces?: string }>;
}) {
  const { league, driverId } = await params;
  const sp = await searchParams;
  const showAllRaces = String(sp.allRaces ?? "").trim() === "1";
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;

  const currentSeason = await getActiveSeason({
    league: l,
    select: { id: true, year: true, seasonNo: true, isTest: true, label: true }
  }).catch(() => null);

  const driver = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: {
        id: true,
        name: true,
        gamertag: true,
        number: true,
        country: true,
        twitchChannel: true,
        portraitPath: true,
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true,
        teamRef: { select: { name: true, color: true, logoPath: true } }
      }
    })
    .catch(() => null);

  if (!driver) notFound();

  const leagueMembership = await prisma.driverSeason
    .findFirst({
      where: { driverId: driver.id, season: { league: l } },
      select: { id: true }
    })
    .catch(() => null);
  if (!leagueMembership) notFound();

  const broadcastStartsAtMs = driver.twitchChannel
    ? await (async () => {
        const now = Date.now();
        const startFrom = new Date(now - 3 * 60 * 60 * 1000);
        const startTo = new Date(now + 30 * 60 * 1000);

        const inWindow = await prisma.raceEntry
          .findFirst({
            where: {
              driverId: driver.id,
              participates: true,
              race: { league: l, resultsPublishedAt: null, startsAt: { gte: startFrom, lte: startTo } }
            },
            orderBy: [{ race: { startsAt: "asc" } }],
            select: { race: { select: { startsAt: true } } }
          })
          .catch(() => null);

        if (inWindow?.race.startsAt) return inWindow.race.startsAt.getTime();

        const upcoming = await prisma.raceEntry
          .findFirst({
            where: {
              driverId: driver.id,
              participates: true,
              race: { league: l, resultsPublishedAt: null, startsAt: { gt: startTo } }
            },
            orderBy: [{ race: { startsAt: "asc" } }],
            select: { race: { select: { startsAt: true } } }
          })
          .catch(() => null);

        return upcoming?.race.startsAt ? upcoming.race.startsAt.getTime() : null;
      })()
    : null;

  const currentSeasonRow =
    currentSeason?.id
      ? await prisma.driverSeason
          .findUnique({
            where: { driverId_seasonId: { driverId: driver.id, seasonId: currentSeason.id } },
            select: {
              portraitPath: true,
              starts: true,
              wins: true,
              podiums: true,
              driverOfDay: true,
              driverTitles: true,
              constructorTitles: true
            }
          })
          .catch(() => null)
      : null;

  const seasonStats = await prisma.driverSeason
    .findMany({
      where: { driverId: driver.id },
      select: {
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true
      },
      take: 500
    })
    .catch(() => []);

  const sum = seasonStats.reduce(
    (acc, r) => {
      acc.starts += r.starts;
      acc.wins += r.wins;
      acc.podiums += r.podiums;
      acc.driverOfDay += r.driverOfDay;
      acc.driverTitles += r.driverTitles;
      acc.constructorTitles += r.constructorTitles;
      return acc;
    },
    { starts: 0, wins: 0, podiums: 0, driverOfDay: 0, driverTitles: 0, constructorTitles: 0 }
  );

  const totals = {
    starts: Math.max(0, sum.starts + (driver.starts ?? 0)),
    wins: Math.max(0, sum.wins + (driver.wins ?? 0)),
    podiums: Math.max(0, sum.podiums + (driver.podiums ?? 0)),
    driverOfDay: Math.max(0, sum.driverOfDay + (driver.driverOfDay ?? 0)),
    driverTitles: Math.max(0, sum.driverTitles + (driver.driverTitles ?? 0)),
    constructorTitles: Math.max(0, sum.constructorTitles + (driver.constructorTitles ?? 0))
  };

  const seasonTeam = currentSeason
    ? await prisma.driverSeason
        .findUnique({
          where: { driverId_seasonId: { driverId: driver.id, seasonId: currentSeason.id } },
          select: {
            role: true,
            teamRef: {
              select: {
                name: true,
                color: true,
                logoPath: true,
                participations: {
                  where: { seasonId: currentSeason.id },
                  select: { color: true },
                  take: 1
                }
              }
            }
          }
        })
        .catch(() => null)
    : null;

  const leagueColors = await getLeagueColors().catch(() => null);
  const leagueKey = l === League.ONE ? "ONE" : l === League.TWO ? "TWO" : "ROOKIE";
  const fallback = leagueColors?.[leagueKey] ?? "#E10600";

  const isReserve = seasonTeam?.role === "RESERVE";

  const accent = isReserve
    ? seasonTeam?.teamRef?.participations?.[0]?.color ??
      seasonTeam?.teamRef?.color ??
      fallback
    : seasonTeam?.teamRef?.participations?.[0]?.color ??
      seasonTeam?.teamRef?.color ??
      driver.teamRef?.color ??
      fallback;

  const portraitUrl = imageUrl(currentSeasonRow?.portraitPath);
  const teamLogoUrl = imageUrl(seasonTeam?.teamRef?.logoPath);
  const currentSeasonLabel = currentSeason
    ? `Saison ${currentSeason.year} · Season ${currentSeason.seasonNo}${currentSeason.isTest ? " · TEST" : ""}`
    : null;
  const displayName = driver.gamertag ?? driver.name;

  let currentSeasonPoints = 0;
  let currentSeasonRank: number | null = null;
  if (currentSeason) {
    const seasonDrivers = await prisma.driverSeason
      .findMany({
        where: { seasonId: currentSeason.id },
        distinct: ["driverId"],
        select: { driverId: true, driver: { select: { name: true } } },
        take: 5000
      })
      .catch(() => []);

    const pointsRows = await prisma.raceResult
      .findMany({
        where: {
          race: {
            league: l,
            season: currentSeason.year,
            seasonNo: currentSeason.seasonNo,
            seasonIsTest: currentSeason.isTest,
            resultsPublishedAt: { not: null }
          }
        },
        select: { driverId: true, points: true },
        take: 50000
      })
      .catch(() => []);

    const pointsByDriverId = new Map<string, number>();
    for (const r of pointsRows) {
      const p = Number.isFinite(r.points) ? r.points : 0;
      pointsByDriverId.set(r.driverId, (pointsByDriverId.get(r.driverId) ?? 0) + p);
    }

    currentSeasonPoints = pointsByDriverId.get(driver.id) ?? 0;

    if (pointsRows.length > 0) {
      const table = seasonDrivers.map((d) => ({
        driverId: d.driverId,
        name: d.driver.name,
        points: pointsByDriverId.get(d.driverId) ?? 0
      }));
      table.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "de-DE"));
      const idx = table.findIndex((x) => x.driverId === driver.id);
      currentSeasonRank = idx >= 0 ? idx + 1 : null;
    }
  }

  const currentSeasonPointsDisplay = Math.round(currentSeasonPoints * 10) / 10;

  const publicLeagues = await listPublicLeagues().catch(() => []);
  const publicSlugByLeague = new Map(publicLeagues.map((x) => [x.league, x.publicSlug]));
  const publicNameByLeague = new Map(publicLeagues.map((x) => [x.league, x.name]));

  const raceRows = await prisma.raceResult
    .findMany({
      where: { driverId: driver.id, race: { resultsPublishedAt: { not: null } } },
      orderBy: [{ race: { startsAt: "desc" } }],
      select: {
        position: true,
        status: true,
        race: {
          select: {
            id: true,
            startsAt: true,
            league: true,
            season: true,
            seasonNo: true,
            seasonIsTest: true,
            round: true,
            name: true
          }
        }
      },
      take: showAllRaces ? 500 : 5
    })
    .catch(() => []);

  return (
    <>
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden border-b border-white/10">
        <div className="relative h-[560px] sm:h-[660px] lg:h-[760px]">
          <div className="absolute inset-0" style={heroBg(accent)} />
          <div
            className="absolute inset-0 opacity-25"
            style={{ ...f1Dots(), clipPath: "polygon(0 0, 92% 0, 70% 100%, 0 100%)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/85" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
          <div className="absolute left-0 top-0 h-[8px] w-full" style={{ backgroundColor: accent }} />

          {countryToFlagEmoji(driver.country) ? (
            <div className="pointer-events-none absolute left-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[26px] sm:left-7 sm:top-7 sm:h-12 sm:w-12 sm:text-[28px]">
              {countryToFlagEmoji(driver.country)}
            </div>
          ) : null}

          <div className="pointer-events-none absolute right-4 top-2 z-0 font-racing text-[220px] font-bold leading-none tracking-[0.08em] text-white/10 sm:right-8 sm:top-2 sm:text-[320px]">
            {driver.number ?? "—"}
          </div>

          {portraitUrl ? (
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-full -translate-x-1/2 sm:w-[min(900px,72vw)]">
              <Image
                src={portraitUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 72vw, 900px"
                className="object-contain object-bottom drop-shadow-[0_32px_90px_rgba(0,0,0,0.65)]"
                quality={80}
                priority
              />
            </div>
          ) : null}

          <div className="absolute bottom-0 left-0 w-full bg-black/70">
            <div
              className="absolute left-0 top-0 h-[10px] w-full opacity-85"
              style={{
                backgroundImage: `linear-gradient(90deg, ${hexToRgba(accent, 0.95)}, ${hexToRgba(accent, 0.65)}, transparent)`
              }}
            />
            <div className="relative pb-7 pt-5 sm:pb-8 sm:pt-6">
              <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/55 to-black/85" />
              <div className="pointer-events-none absolute inset-0 z-0">
                <div
                  className="absolute left-0 top-[46%] hidden h-[12px] w-[30%] -translate-y-1/2 bg-white sm:block"
                  style={{ clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)" }}
                />
                <div
                  className="absolute left-0 top-[46%] hidden h-[3px] w-[34%] -translate-y-1/2 translate-y-[14px] bg-white/90 sm:block"
                  style={{ clipPath: "polygon(0 0, 100% 0, 94% 100%, 0 100%)" }}
                />
                <div
                  className="absolute right-0 top-[46%] hidden h-[12px] w-[30%] -translate-y-1/2 bg-white sm:block"
                  style={{ clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0 100%)" }}
                />
                <div
                  className="absolute right-0 top-[46%] hidden h-[3px] w-[34%] -translate-y-1/2 translate-y-[14px] bg-white/90 sm:block"
                  style={{ clipPath: "polygon(6% 0, 100% 0, 100% 100%, 0 100%)" }}
                />
              </div>
              <Container>
                <div className="relative z-10 -mt-1 sm:-mt-2">
                  <div className="flex items-center justify-center gap-4">
                    <div className="min-w-0">
                      {teamLogoUrl ? (
                        <div className="flex justify-center">
                          <Image
                            src={teamLogoUrl}
                            alt=""
                            width={96}
                            height={96}
                            unoptimized
                            className="mb-2 h-10 w-10 bg-black/25 object-contain sm:h-12 sm:w-12 lg:h-14 lg:w-14"
                          />
                        </div>
                      ) : null}
                      <div className="text-center font-racing text-3xl font-bold uppercase tracking-[0.16em] text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)] sm:text-5xl lg:text-6xl">
                        {displayName}
                      </div>
                    </div>
                  </div>

                  {currentSeasonLabel ? (
                    <div className="mt-2 flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wider text-white/80 drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)] sm:text-sm">
                      <span
                        className="h-[10px] w-[48px] bg-white/90 sm:h-[12px] sm:w-[56px]"
                        style={{ clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)" }}
                      />
                      <span className="text-center">
                        {currentSeasonLabel}
                      </span>
                      <span
                        className="h-[10px] w-[48px] bg-white/90 sm:h-[12px] sm:w-[56px]"
                        style={{ clipPath: "polygon(12% 0, 100% 0, 100% 100%, 0 100%)" }}
                      />
                    </div>
                  ) : null}

                </div>
              </Container>
            </div>
          </div>
        </div>
      </div>

      <Container>
        <div className="mt-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
                Aktuelle Saison
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {stat("Rennstarts", currentSeasonRow?.starts ?? 0)}
                {stat("Siege", currentSeasonRow?.wins ?? 0)}
                {stat("Podien", currentSeasonRow?.podiums ?? 0)}
                {stat("Fahrer des Tages", currentSeasonRow?.driverOfDay ?? 0)}
                {stat("WM Punkte", currentSeasonPointsDisplay)}
                {stat("WM Platz", currentSeasonRank ?? "—")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
                Gesamt
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stat("Rennstarts", totals.starts)}
                {stat("Siege", totals.wins)}
                {stat("Podien", totals.podiums)}
                {stat("Fahrer des Tages", totals.driverOfDay)}
                {stat("Fahrer WM Titel", totals.driverTitles)}
                {stat("Konstrukteurs WM Titel", totals.constructorTitles)}
              </div>
            </div>
          </div>
        </div>

        {driver.twitchChannel ? (
          <div className="mt-10">
            <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Twitch
            </div>
            <div className="mt-4">
              <TwitchEmbed channel={driver.twitchChannel} startsAtMs={broadcastStartsAtMs} />
            </div>
          </div>
        ) : null}

        <div className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
                Rennteilnahmen
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/50">
                {showAllRaces ? "Alle Rennen" : "Letzte 5 Rennen"} · Alle Ligen
              </div>
            </div>
            <Link
              href={
                showAllRaces
                  ? `/${league}/drivers/${driver.id}`
                  : `/${league}/drivers/${driver.id}?allRaces=1`
              }
              className="rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              {showAllRaces ? "Nur letzte 5" : "Alle Rennen"}
            </Link>
          </div>

          {raceRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Noch keine Rennen.
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5">
              <div className="grid grid-cols-[120px_170px_1fr_88px] gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60">
                <div>Liga</div>
                <div>Saison</div>
                <div>Rennen</div>
                <div className="text-right">Platz</div>
              </div>
              {raceRows.map((r) => {
                const publicSlug = publicSlugByLeague.get(r.race.league) ?? league;
                const leagueName = publicNameByLeague.get(r.race.league) ?? r.race.league;
                const seasonLabel = `Saison ${r.race.season} · Season ${r.race.seasonNo}${r.race.seasonIsTest ? " · TEST" : ""}`;
                const raceLabel = `R${r.race.round} · ${r.race.name}`;
                const statusUp = (r.status ?? "").trim().toUpperCase();
                const statusIsFinished =
                  statusUp === "FINISHED" || statusUp === "FINISH" || statusUp === "F";
                const posLabel =
                  !statusUp || statusIsFinished
                    ? r.position
                      ? `P${r.position}`
                      : "—"
                    : r.status!;
                return (
                  <Link
                    key={r.race.id}
                    href={`/${publicSlug}/races/${r.race.id}`}
                    className="grid grid-cols-[120px_170px_1fr_88px] gap-4 border-b border-white/10 px-5 py-4 last:border-b-0 hover:bg-white/5"
                  >
                    <div className="truncate font-semibold text-white">{leagueName}</div>
                    <div className="truncate text-xs font-semibold text-white/60">{seasonLabel}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{raceLabel}</div>
                      <div className="mt-1 truncate text-xs font-semibold text-white/60">
                        {new Date(r.race.startsAt).toLocaleDateString("de-DE")}
                      </div>
                    </div>
                    <div className="text-right font-extrabold text-white">{posLabel}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
