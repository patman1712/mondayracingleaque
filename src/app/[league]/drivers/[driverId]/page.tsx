import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { getLeagueColors } from "@/lib/leagueColors";
import { League } from "@prisma/client";
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

  const currentSeason = await prisma.season
    .findFirst({
      where: { league: l, placement: "CALENDAR" },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      select: { id: true }
    })
    .catch(() => null);

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
        teamRef: {
          select: {
            name: true,
            color: true,
            logoPath: true,
            participations: currentSeason
              ? { where: { seasonId: currentSeason.id }, select: { color: true }, take: 1 }
              : { select: { color: true }, take: 1 }
          }
        }
      }
    })
    .catch(() => null);

  if (!driver || driver.league !== l) notFound();

  const leagueColors = await getLeagueColors().catch(() => null);
  const leagueKey = l === League.ONE ? "ONE" : l === League.TWO ? "TWO" : "ROOKIE";
  const fallback = leagueColors?.[leagueKey] ?? "#E10600";

  const accent =
    driver.teamRef?.participations?.[0]?.color ??
    driver.teamRef?.color ??
    fallback;

  const portraitUrl = imageUrl(driver.portraitPath);
  const teamLogoUrl = imageUrl(driver.teamRef?.logoPath);

  return (
    <>
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0" style={heroBg(accent)} />
        <div className="absolute inset-0 opacity-25" style={{ ...f1Dots(), clipPath: "polygon(0 0, 92% 0, 70% 100%, 0 100%)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/80" />
        <div className="absolute left-0 top-0 h-[8px] w-full" style={{ backgroundColor: accent }} />

        <Container>
          <div className="relative py-10 sm:py-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_420px] lg:items-end">
              <div>
                {teamLogoUrl ? (
                  <img
                    src={teamLogoUrl}
                    alt=""
                    className="h-9 w-auto bg-black/15 object-contain"
                  />
                ) : null}
                <div className="mt-5 flex items-end gap-5">
                  <div className="text-6xl font-extrabold leading-none text-white/90 sm:text-7xl">
                    {driver.number ?? "—"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-3xl font-extrabold uppercase tracking-wide text-white sm:text-4xl">
                      {driver.name}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white/75">
                      {driver.gamertag ? driver.gamertag : driver.teamRef?.name ? driver.teamRef.name : "Fahrer"}
                      {driver.country ? ` · ${driver.country}` : ""}
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="relative h-[320px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 sm:h-[380px]">
                  {portraitUrl ? (
                    <img
                      src={portraitUrl}
                      alt=""
                      className="absolute inset-x-0 bottom-0 mx-auto h-[420px] w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/35">
                      PORTRAIT
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="mt-8">
          <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Stats
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stat("Rennstarts", driver.starts)}
            {stat("Siege", driver.wins)}
            {stat("Podien", driver.podiums)}
            {stat("Fahrer des Tages", driver.driverOfDay)}
            {stat("Fahrer WM Titel", driver.driverTitles)}
            {stat("Konstrukteurs WM Titel", driver.constructorTitles)}
          </div>
        </div>
      </Container>
    </>
  );
}

