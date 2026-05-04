import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { League } from "@prisma/client";
import Link from "next/link";

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

function heroBg(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.55) : "rgba(255,255,255,0.10)";
  const b = c ? hexToRgba(c, 0.10) : "rgba(255,255,255,0.02)";
  return `radial-gradient(900px circle at 30% 10%, ${a}, transparent 60%), linear-gradient(180deg, ${b}, rgba(0,0,0,0.65))`;
}

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ league: string; teamId: string }>;
}) {
  const { league, teamId } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  const team = await prisma.team
    .findUnique({
      where: { id: teamId },
      select: { id: true, name: true, color: true, logoPath: true }
    })
    .catch(() => null);
  if (!team) notFound();

  const currentSeason = await prisma.season
    .findFirst({
      where: { league: l, placement: "CALENDAR" },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      select: { id: true, year: true, seasonNo: true, isTest: true }
    })
    .catch(() => null);

  const participation = currentSeason
    ? await prisma.teamSeason
        .findFirst({
          where: { teamId: team.id, seasonId: currentSeason.id },
          select: { color: true, carImagePath: true }
        })
        .catch(() => null)
    : null;

  const fallbackParticipation = !participation
    ? await prisma.teamSeason
        .findFirst({
          where: { teamId: team.id, season: { league: l } },
          orderBy: [{ season: { year: "desc" } }, { season: { seasonNo: "desc" } }, { season: { isTest: "asc" } }],
          select: { color: true, carImagePath: true, season: { select: { year: true, seasonNo: true, isTest: true } } }
        })
        .catch(() => null)
    : null;

  const color = participation?.color ?? team.color ?? fallbackParticipation?.color ?? null;
  const carUrl = imageUrl(participation?.carImagePath ?? fallbackParticipation?.carImagePath ?? null);
  const logoUrl = imageUrl(team.logoPath);

  const drivers = await prisma.driver
    .findMany({
      where: { league: l, teamId: team.id },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: { id: true, name: true, number: true, country: true }
    })
    .catch(() => []);

  const seasonLabel = currentSeason
    ? `Saison ${currentSeason.year} · Season ${currentSeason.seasonNo}${currentSeason.isTest ? " · TEST" : ""}`
    : fallbackParticipation
      ? `Saison ${fallbackParticipation.season.year} · Season ${fallbackParticipation.season.seasonNo}${fallbackParticipation.season.isTest ? " · TEST" : ""}`
      : null;

  const driverTiles: Array<(typeof drivers)[number] | null> = [
    drivers[0] ?? null,
    drivers[1] ?? null
  ];

  return (
    <>
      <div
        className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen overflow-hidden bg-black/30"
        style={{ backgroundImage: heroBg(color) }}
      >
        <div className="relative h-[46vh] min-h-[360px] max-h-[760px] sm:h-[56vh]">
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
          <div className="absolute inset-0">
            <div className="absolute left-0 top-0 h-full w-[55%] bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
          </div>

          <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
            <Link
              href={`/${league}/teams`}
              className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-black/35 hover:text-white"
            >
              ← Teams
            </Link>
          </div>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pb-24 sm:pb-28">
            {carUrl ? (
              <img
                src={carUrl}
                alt=""
                className="h-[min(320px,34vh)] w-[min(980px,96vw)] object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.55)] sm:h-[min(420px,40vh)]"
              />
            ) : (
              <div className="flex h-[min(320px,34vh)] w-[min(980px,96vw)] items-center justify-center text-sm font-semibold text-white/35 sm:h-[min(420px,40vh)]">
                CAR
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 pb-8">
            <Container>
              <div className="flex flex-col items-center gap-4">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-12 w-12 rounded-2xl bg-black/25 object-contain"
                  />
                ) : null}

                <div className="flex w-full items-center justify-center gap-4">
                  <div className="h-[6px] w-[22%] max-w-[240px] bg-gradient-to-r from-transparent via-white/70 to-white/70" />
                  <div className="px-2 text-center text-3xl font-extrabold uppercase tracking-wide text-white sm:text-4xl">
                    {team.name}
                  </div>
                  <div className="h-[6px] w-[22%] max-w-[240px] bg-gradient-to-l from-transparent via-white/70 to-white/70" />
                </div>

                {seasonLabel ? (
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                    {seasonLabel}
                  </div>
                ) : null}
              </div>
            </Container>
          </div>
        </div>
      </div>

      <Container>
        <div className="mt-10">
          <div className="text-lg font-extrabold uppercase tracking-wider">
            Drivers
          </div>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {driverTiles.map((d, idx) => (
            <div
              key={d?.id ?? `empty-${idx}`}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
              style={{ backgroundImage: heroBg(color) }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/60" />
              <div className="absolute left-0 top-0 h-full w-[55%] bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

              <div className="relative p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                      {team.name}
                    </div>
                    <div className="mt-2 text-2xl font-extrabold leading-tight text-white">
                      {d ? d.name : "TBA"}
                    </div>
                    <div className="mt-2 text-sm text-white/70">
                      {d?.country ?? ""}
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-white/85">
                    {d?.number ?? "—"}
                  </div>
                </div>

                <div className="pointer-events-none absolute bottom-0 right-0 h-[78%] w-[54%] opacity-20">
                  <div className="absolute inset-0 bg-gradient-to-l from-white/70 to-transparent" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}
