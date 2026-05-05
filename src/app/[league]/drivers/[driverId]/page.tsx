import { Container } from "@/components/Container";
import { getActiveSeason } from "@/lib/currentSeason";
import { prisma } from "@/lib/db";
import { getLeagueColors } from "@/lib/leagueColors";
import { League } from "@prisma/client";
import Image from "next/image";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const leagueEnum: Record<string, League> = {
  "mrl-one": League.ONE,
  "mrl-two": League.TWO,
  "mrl-rookie": League.ROOKIE
};

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

function stat(label: string, value: number) {
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
  params
}: {
  params: Promise<{ league: string; driverId: string }>;
}) {
  const { league, driverId } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  const currentSeason = await getActiveSeason({
    league: l,
    select: { id: true, year: true, seasonNo: true, isTest: true, label: true }
  }).catch(() => null);

  const driver = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: {
        id: true,
        league: true,
        name: true,
        gamertag: true,
        number: true,
        country: true,
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

  if (!driver || driver.league !== l) notFound();

  const currentSeasonRow =
    currentSeason?.id
      ? await prisma.driverSeason
          .findUnique({
            where: { driverId_seasonId: { driverId: driver.id, seasonId: currentSeason.id } },
            select: {
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
    starts: sum.starts + driver.starts,
    wins: sum.wins + driver.wins,
    podiums: sum.podiums + driver.podiums,
    driverOfDay: sum.driverOfDay + driver.driverOfDay,
    driverTitles: sum.driverTitles + driver.driverTitles,
    constructorTitles: sum.constructorTitles + driver.constructorTitles
  };

  const seasonTeam = currentSeason
    ? await prisma.driverSeason
        .findUnique({
          where: { driverId_seasonId: { driverId: driver.id, seasonId: currentSeason.id } },
          select: {
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

  const accent =
    seasonTeam?.teamRef?.participations?.[0]?.color ??
    seasonTeam?.teamRef?.color ??
    driver.teamRef?.color ??
    fallback;

  const portraitUrl = imageUrl(driver.portraitPath);
  const teamLogoUrl = imageUrl(seasonTeam?.teamRef?.logoPath ?? driver.teamRef?.logoPath);
  const currentSeasonLabel = currentSeason
    ? `Saison ${currentSeason.year} · Season ${currentSeason.seasonNo}${currentSeason.isTest ? " · TEST" : ""}`
    : null;
  const displayName = driver.gamertag ?? driver.name;

  return (
    <>
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0" style={heroBg(accent)} />
        <div className="absolute inset-0 opacity-25" style={{ ...f1Dots(), clipPath: "polygon(0 0, 92% 0, 70% 100%, 0 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
        <div className="absolute left-0 top-0 h-[8px] w-full" style={{ backgroundColor: accent }} />

        <Container>
          <div className="relative py-10 sm:py-14">
            {portraitUrl ? (
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[min(520px,46vw)] sm:block">
                <Image
                  src={portraitUrl}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 46vw, 520px"
                  className="object-contain object-bottom drop-shadow-[0_28px_70px_rgba(0,0,0,0.6)]"
                  quality={80}
                />
              </div>
            ) : null}

            <div className="relative z-10 max-w-[720px]">
              {teamLogoUrl ? (
                <Image
                  src={teamLogoUrl}
                  alt=""
                  width={160}
                  height={48}
                  unoptimized
                  className="h-9 w-auto object-contain"
                />
              ) : null}

              <div className="mt-6 flex items-end gap-5">
                <div className="font-racing text-7xl font-bold leading-none tracking-[0.08em] text-white sm:text-8xl">
                  {driver.number ?? "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block">
                      <div className="h-[56px] w-[52px] bg-white/90" style={{ clipPath: "polygon(0 0, 100% 0, 68% 100%, 0 100%)" }} />
                      <div className="-mt-2 h-[10px] w-[58px] bg-white/80" style={{ clipPath: "polygon(0 0, 100% 0, 74% 100%, 0 100%)" }} />
                    </div>

                    <div className="min-w-0 font-racing text-5xl font-bold uppercase tracking-[0.16em] text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.65)] sm:text-6xl">
                      {displayName}
                    </div>

                    <div className="hidden sm:block">
                      <div className="h-[56px] w-[52px] bg-white/90" style={{ clipPath: "polygon(32% 0, 100% 0, 100% 100%, 0 100%)" }} />
                      <div className="-mt-2 h-[10px] w-[58px] bg-white/80" style={{ clipPath: "polygon(26% 0, 100% 0, 100% 100%, 0 100%)" }} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-white/75">
                    {currentSeasonLabel ? (
                      <span className="rounded-md bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/80">
                        {currentSeasonLabel}
                      </span>
                    ) : null}
                    {countryToFlagEmoji(driver.country) ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[16px]">
                        {countryToFlagEmoji(driver.country)}
                      </span>
                    ) : null}
                  </div>

                  {portraitUrl ? (
                    <div className="pointer-events-none relative mt-8 h-[340px] w-full sm:hidden">
                      <Image
                        src={portraitUrl}
                        alt=""
                        fill
                        sizes="100vw"
                        className="object-contain object-bottom drop-shadow-[0_28px_70px_rgba(0,0,0,0.6)]"
                        quality={80}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="mt-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
                Aktuelle Saison
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {stat("Rennstarts", currentSeasonRow?.starts ?? 0)}
                {stat("Siege", currentSeasonRow?.wins ?? 0)}
                {stat("Podien", currentSeasonRow?.podiums ?? 0)}
                {stat("Fahrer des Tages", currentSeasonRow?.driverOfDay ?? 0)}
                {stat("Fahrer WM Titel", currentSeasonRow?.driverTitles ?? 0)}
                {stat("Konstrukteurs WM Titel", currentSeasonRow?.constructorTitles ?? 0)}
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
      </Container>
    </>
  );
}
