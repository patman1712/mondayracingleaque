import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { getActiveSeason } from "@/lib/currentSeason";
import { prisma } from "@/lib/db";
import Image from "next/image";
import Link from "next/link";
import { resolveLeagueByPublicSlug } from "@/lib/league";

export const dynamic = "force-dynamic";

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

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ league: string; teamId: string }>;
}) {
  const { league, teamId } = await params;
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;

  const team = await prisma.team
    .findUnique({
      where: { id: teamId },
      select: { id: true, name: true, color: true, logoPath: true }
    })
    .catch(() => null);
  if (!team) notFound();

  const currentSeason = await getActiveSeason({
    league: l,
    select: { id: true, year: true, seasonNo: true, isTest: true }
  }).catch(() => null);

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
            season: { select: { id: true, year: true, seasonNo: true, isTest: true } }
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

  const seasonIdForDrivers = currentSeason?.id ?? fallbackParticipation?.season.id ?? null;

  const drivers = seasonIdForDrivers
    ? await prisma.driverSeason
        .findMany({
          where: { seasonId: seasonIdForDrivers, teamId: team.id, driver: { status: "ACTIVE" } },
          orderBy: [{ role: "asc" }, { driver: { number: "asc" } }, { driver: { name: "asc" } }],
          select: {
            role: true,
            driver: {
              select: { id: true, name: true, gamertag: true, number: true, country: true, portraitPath: true }
            }
          }
        })
        .then((rows) => rows)
        .catch(() => [])
    : [];

  const seasonLabel = currentSeason
    ? `Saison ${currentSeason.year} · Season ${currentSeason.seasonNo}${currentSeason.isTest ? " · TEST" : ""}`
    : fallbackParticipation
      ? `Saison ${fallbackParticipation.season.year} · Season ${fallbackParticipation.season.seasonNo}${fallbackParticipation.season.isTest ? " · TEST" : ""}`
      : null;

  const mainDrivers = drivers.filter((d) => d.role === "MAIN").map((d) => d.driver);
  const reserveDrivers = drivers.filter((d) => d.role === "RESERVE").map((d) => d.driver);

  const primaryDrivers = mainDrivers.length ? mainDrivers : reserveDrivers;

  const driverTiles: Array<(typeof mainDrivers)[number] | null> = [
    primaryDrivers[0] ?? null,
    primaryDrivers[1] ?? null
  ];

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
              </div>
              <Container>
                <div className="relative z-10 -mt-1 sm:-mt-2">
                  <div className="flex items-center justify-center gap-4">
                    <div className="min-w-0">
                      {logoUrl ? (
                        <div className="flex justify-center">
                          <Image
                            src={logoUrl}
                            alt=""
                            width={96}
                            height={96}
                            unoptimized
                            className="mb-2 h-10 w-10 bg-black/25 object-contain sm:h-12 sm:w-12 lg:h-14 lg:w-14"
                          />
                        </div>
                      ) : null}
                      <div className="truncate text-center font-racing text-3xl font-bold uppercase tracking-[0.16em] text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)] sm:text-5xl lg:text-6xl">
                        {team.name}
                      </div>
                    </div>
                  </div>

                  {seasonLabel ? (
                    <div className="mt-2 flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wider text-white/80 drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)] sm:text-sm">
                      <span
                        className="h-[10px] w-[48px] bg-white/90 sm:h-[12px] sm:w-[56px]"
                        style={{ clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)" }}
                      />
                      <span className="text-center">
                        {seasonLabel}
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
        <div className="mt-10 sm:mt-12">
          <div className="text-lg font-extrabold uppercase tracking-wider">
            Drivers
          </div>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {driverTiles.map((d, idx) =>
            d ? (
              <Link
                key={d.id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                style={{ backgroundImage: heroBg(color) }}
                href={`/${league}/drivers/${d.id}`}
              >
              <div
                className="absolute inset-0 opacity-25"
                style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/75" />
              <div className="absolute left-0 top-0 h-full w-[62%] bg-gradient-to-r from-black/70 via-black/25 to-transparent" />

              <div className="relative min-h-[260px] p-6 sm:min-h-[300px]">
                <div className="pointer-events-none absolute right-4 top-0 z-0 font-racing text-[104px] font-bold leading-none tracking-[0.08em] text-white/18 sm:text-[132px]">
                  {d.number ?? "—"}
                </div>

                <div className="relative z-10 min-w-0">
                  <div className="truncate font-racing text-2xl font-bold uppercase tracking-[0.16em] text-white sm:text-3xl">
                    {d.gamertag ?? d.name}
                  </div>
                </div>

                <div className="pointer-events-none absolute bottom-0 right-0 h-[96%] w-[56%] opacity-25 transition duration-300 group-hover:opacity-30">
                  <div className="absolute inset-0 bg-gradient-to-l from-white/60 to-transparent" />
                </div>
                <div className="pointer-events-none absolute bottom-0 right-3 z-10 h-[88%] w-[56%]">
                  {d?.portraitPath ? (
                    <Image
                      src={imageUrl(d.portraitPath) ?? ""}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 42vw, 320px"
                      className="object-contain object-bottom drop-shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
                      quality={80}
                    />
                  ) : null}
                </div>

                {d.country && /^[A-Za-z]{2}$/.test(d.country) ? (
                  <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[22px]">
                    {String.fromCodePoint(
                      0x1f1e6 + d.country.trim().toUpperCase().charCodeAt(0) - 65,
                      0x1f1e6 + d.country.trim().toUpperCase().charCodeAt(1) - 65
                    )}
                  </div>
                ) : null}
              </div>
              </Link>
            ) : (
              <div
                key={`empty-${idx}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                style={{ backgroundImage: heroBg(color) }}
              >
                <div
                  className="absolute inset-0 opacity-25"
                  style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/75" />
                <div className="absolute left-0 top-0 h-full w-[62%] bg-gradient-to-r from-black/70 via-black/25 to-transparent" />

                <div className="relative min-h-[260px] p-6 sm:min-h-[300px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                        {team.name}
                      </div>
                      <div className="mt-3 text-2xl font-extrabold leading-[1.05] text-white">
                        TBA
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-white/85">—</div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {reserveDrivers.length ? (
          <div className="mt-8">
            <div className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Ersatzfahrer
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reserveDrivers.map((d) => (
                <Link
                  key={d.id}
                  href={`/${league}/drivers/${d.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {d.number ? `#${d.number} ` : ""}
                  {d.gamertag ?? d.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </Container>
    </>
  );
}
