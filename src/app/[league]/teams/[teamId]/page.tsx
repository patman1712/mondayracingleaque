import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { League } from "@prisma/client";
import Image from "next/image";
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

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
}

function splitDriverName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: "", last: name.trim() };
  return { first: parts.slice(0, -1).join(" "), last: parts.slice(-1).join("") };
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
          select: { color: true, carImagePath: true, heroBackgroundPath: true }
        })
        .catch(() => null)
    : null;

  const fallbackParticipation = !participation
    ? await prisma.teamSeason
        .findFirst({
          where: { teamId: team.id, season: { league: l } },
          orderBy: [{ season: { year: "desc" } }, { season: { seasonNo: "desc" } }, { season: { isTest: "asc" } }],
          select: {
            color: true,
            carImagePath: true,
            heroBackgroundPath: true,
            season: { select: { year: true, seasonNo: true, isTest: true } }
          }
        })
        .catch(() => null)
    : null;

  const color = participation?.color ?? team.color ?? fallbackParticipation?.color ?? null;
  const carUrl = imageUrl(participation?.carImagePath ?? fallbackParticipation?.carImagePath ?? null);
  const heroBackgroundUrl = imageUrl(
    participation?.heroBackgroundPath ?? fallbackParticipation?.heroBackgroundPath ?? null
  );
  const logoUrl = imageUrl(team.logoPath);
  const accent = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : "#e10600";

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

  const heroNames = driverTiles
    .filter(Boolean)
    .map((d) => (d ? d.name : ""))
    .filter(Boolean)
    .slice(0, 2);

  return (
    <>
      <div className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen overflow-hidden">
        <div className="relative overflow-hidden">
          <div
            className="relative h-[320px] sm:h-[380px] lg:h-[430px]"
            style={{ backgroundImage: heroBg(color) }}
          >
            {heroBackgroundUrl ? (
              <Image
                src={heroBackgroundUrl}
                alt=""
                fill
                priority
                sizes="100vw"
                className="object-cover object-center opacity-95"
              />
            ) : null}
            <div
              className="absolute inset-0 opacity-30"
              style={{ ...f1Dots(), clipPath: "polygon(0 0, 78% 0, 52% 100%, 0 100%)" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/65" />

            <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
              <Link
                href={`/${league}/teams`}
                className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-black/35 hover:text-white"
              >
                ← Teams
              </Link>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8 sm:pt-12">
              {carUrl ? (
                <div className="relative h-[200px] w-[min(1100px,96vw)] sm:h-[260px] lg:h-[320px]">
                  <Image
                    src={carUrl}
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 640px) 96vw, (max-width: 1024px) 96vw, 1100px"
                    className="object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
                    quality={80}
                  />
                </div>
              ) : (
                <div className="flex h-[200px] w-[min(1100px,96vw)] items-center justify-center text-sm font-semibold text-white/35 sm:h-[260px] lg:h-[320px]">
                  CAR
                </div>
              )}
            </div>
          </div>

          <div className="relative bg-black/70">
            <div
              className="absolute left-0 top-0 h-[10px] w-full opacity-85"
              style={{
                backgroundImage: `linear-gradient(90deg, ${hexToRgba(accent, 0.95)}, ${hexToRgba(accent, 0.65)}, transparent)`
              }}
            />
            <div className="relative pb-7 pt-4 sm:pb-8 sm:pt-5">
              <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/55 to-black/80" />
              <div className="pointer-events-none absolute inset-0 z-0">
                <div
                  className="absolute left-0 top-[44%] hidden h-[12px] w-[30%] -translate-y-1/2 bg-white sm:block"
                  style={{ clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)" }}
                />
                <div
                  className="absolute left-0 top-[44%] hidden h-[3px] w-[34%] -translate-y-1/2 translate-y-[14px] bg-white/90 sm:block"
                  style={{ clipPath: "polygon(0 0, 100% 0, 94% 100%, 0 100%)" }}
                />
                <div
                  className="absolute right-0 top-[44%] hidden h-[12px] w-[30%] -translate-y-1/2 bg-white sm:block"
                  style={{ clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0 100%)" }}
                />
                <div
                  className="absolute right-0 top-[44%] hidden h-[3px] w-[34%] -translate-y-1/2 translate-y-[14px] bg-white/90 sm:block"
                  style={{ clipPath: "polygon(6% 0, 100% 0, 100% 100%, 0 100%)" }}
                />
                <div
                  className="absolute left-1/2 top-[44%] hidden h-[14px] w-[56px] -translate-x-[150px] -translate-y-1/2 bg-white/95 sm:block"
                  style={{ clipPath: "polygon(12% 0, 100% 0, 88% 100%, 0 100%)" }}
                />
                <div
                  className="absolute left-1/2 top-[44%] hidden h-[14px] w-[56px] translate-x-[94px] -translate-y-1/2 bg-white/95 sm:block"
                  style={{ clipPath: "polygon(12% 0, 100% 0, 88% 100%, 0 100%)" }}
                />
              </div>
              <Container>
                <div className="relative z-10 -mt-1 sm:-mt-2">
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex min-w-0 items-center justify-center gap-3">
                    {logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="hidden rounded-xl bg-black/25 object-contain sm:block"
                      />
                    ) : null}
                    <div className="truncate text-center text-2xl font-extrabold uppercase tracking-wide text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)] sm:text-4xl lg:text-5xl">
                      {team.name}
                    </div>
                  </div>
                </div>

                {heroNames.length ? (
                  <div className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wider text-white/70 sm:text-xs">
                    {heroNames.join(" · ")}
                  </div>
                ) : null}
                {seasonLabel ? (
                  <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-white/80 drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)] sm:text-sm">
                    {seasonLabel}
                  </div>
                ) : null}
                </div>
              </Container>
            </div>
          </div>
        </div>
      </div>

      <Container>
        <div className="mt-10 sm:mt-12">
          <div className="text-lg font-extrabold uppercase tracking-wider">
            Drivers
          </div>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {driverTiles.map((d, idx) => (
            <div
              key={d?.id ?? `empty-${idx}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
              style={{ backgroundImage: heroBg(color) }}
            >
              <div
                className="absolute inset-0 opacity-25"
                style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/75" />
              <div className="absolute left-0 top-0 h-full w-[62%] bg-gradient-to-r from-black/70 via-black/25 to-transparent" />

              <div className="relative p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                      {team.name}
                    </div>
                    <div className="mt-3 text-2xl font-extrabold leading-[1.05] text-white">
                      {d ? (
                        <>
                          <div className="text-base font-semibold text-white/85">
                            {splitDriverName(d.name).first}
                          </div>
                          <div className="text-3xl font-extrabold tracking-tight">
                            {splitDriverName(d.name).last}
                          </div>
                        </>
                      ) : (
                        "TBA"
                      )}
                    </div>
                  </div>
                  <div className="text-3xl font-extrabold text-white/85">
                    {d?.number ?? "—"}
                  </div>
                </div>

                <div className="mt-3 text-sm text-white/70">
                  {d?.country ?? ""}
                </div>

                <div className="pointer-events-none absolute bottom-0 right-0 h-[92%] w-[56%] opacity-25 transition duration-300 group-hover:opacity-30">
                  <div className="absolute inset-0 bg-gradient-to-l from-white/60 to-transparent" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}
