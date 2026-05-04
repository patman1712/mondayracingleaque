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

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
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

  return (
    <>
      <Container>
        <div className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold">
                {team.name}
              </div>
              <div className="mt-2 text-sm text-white/70">
                {leagueLabel[l]}
                {seasonLabel ? ` · ${seasonLabel}` : ""}
              </div>
            </div>
            <Link
              href={`/${league}/teams`}
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-white hover:bg-black/30"
            >
              Zurück zu Teams
            </Link>
          </div>
        </div>
      </Container>

      <div
        className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen overflow-hidden bg-black/30"
        style={{ backgroundImage: heroBg(color) }}
      >
        <div className="relative h-[46vh] min-h-[360px] max-h-[760px] sm:h-[56vh]">
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
          <div className="absolute inset-0">
            <div className="absolute left-0 top-0 h-full w-[55%] bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
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

          <div className="absolute inset-0 flex items-end pb-8">
            <Container>
              <div className="min-w-0">
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-14 w-14 rounded-2xl bg-black/30 object-contain"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-2xl bg-black/30" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-3xl font-extrabold tracking-tight text-white">
                      {team.name}
                    </div>
                    <div className="mt-2 text-sm text-white/70">
                      {leagueLabel[l]}
                    </div>
                  </div>
                </div>
              </div>
            </Container>
          </div>
        </div>
      </div>

      <Container>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Fahrer</div>
          <div className="mt-4 space-y-2">
            {drivers.length === 0 ? (
              <div className="text-sm text-white/60">
                Noch keine Fahrer zugeordnet.
              </div>
            ) : (
              drivers.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {d.number ? `#${d.number} ` : ""}
                      {d.name}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      {d.country ?? ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
