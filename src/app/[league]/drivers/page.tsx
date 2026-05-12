import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { getActiveSeason } from "@/lib/currentSeason";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { resolveLeagueByPublicSlug } from "@/lib/league";

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

function cardBg(color: string | null | undefined) {
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

export default async function LeagueDriversPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;

  type DriverItem = {
    id: string;
    name: string;
    gamertag: string | null;
    number: number | null;
    team: string | null;
    country: string | null;
    portraitPath: string | null;
    accent: string | null;
  };

  let drivers: DriverItem[] = [];
  try {
    const currentSeason = await getActiveSeason({
      league: l,
      select: { id: true }
    }).catch(() => null);

    if (currentSeason) {
      const select = {
        portraitPath: true,
        driver: {
          select: {
            id: true,
            name: true,
            gamertag: true,
            number: true,
            country: true,
            portraitPath: true,
          }
        },
        teamRef: {
          select: {
            color: true,
            participations: {
              where: { seasonId: currentSeason.id },
              select: { color: true },
              take: 1
            }
          }
        }
      } as const;

      const rows = await prisma.driverSeason
        .findMany({
          where: { seasonId: currentSeason.id, driver: { status: "ACTIVE" } },
          orderBy: [{ driver: { name: "asc" } }],
          select
        })
        .catch(() => []);

      const out: DriverItem[] = [];
      for (const r of rows) {
        const t = r.teamRef;
        const accent = t?.participations?.[0]?.color ?? t?.color ?? null;
        out.push({
          id: r.driver.id,
          name: r.driver.name,
          gamertag: r.driver.gamertag ?? null,
          number: r.driver.number ?? null,
          team: null,
          country: r.driver.country ?? null,
          portraitPath: r.portraitPath ?? r.driver.portraitPath ?? null,
          accent
        });
      }
      drivers = out;
    }

    if (!drivers.length) {
      const select = {
        portraitPath: true,
        driver: {
          select: {
            id: true,
            name: true,
            gamertag: true,
            number: true,
            country: true,
            portraitPath: true
          }
        }
      } as const;

      const rows = await prisma.driverSeason
        .findMany({
          where: { season: { league: l }, driver: { status: "ACTIVE" } },
          distinct: ["driverId"],
          orderBy: [{ driver: { name: "asc" } }],
          select,
          take: 5000
        })
        .catch(() => []);

      drivers = rows.map((r) => ({
        id: r.driver.id,
        name: r.driver.name,
        gamertag: r.driver.gamertag ?? null,
        number: r.driver.number ?? null,
        team: null,
        country: r.driver.country ?? null,
        portraitPath: r.portraitPath ?? r.driver.portraitPath ?? null,
        accent: null
      }));
    }
  } catch {}
  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          Fahrer · {cfg.name}
        </div>
        <div className="mt-2 text-sm text-white/70">Fahrerübersicht</div>
      </div>


      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {drivers.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 sm:col-span-2 lg:col-span-3">
            Noch keine Fahrer eingetragen.
          </div>
        ) : (
          drivers.map((d) => (
            <Link
              key={d.id}
              href={`/${league}/drivers/${d.id}`}
              className="group relative rounded-2xl"
            >
              <div
                className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-black/30 sm:min-h-[460px]"
                style={{ backgroundImage: cardBg(d.accent) }}
              >
                <div
                  className="absolute inset-0 opacity-25"
                  style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/75" />
                <div className="absolute left-0 top-0 h-[6px] w-full" style={{ backgroundColor: d.accent ?? "#ffffff" }} />

                <div className="pointer-events-none absolute right-4 top-2 font-racing text-[96px] font-bold leading-none tracking-[0.08em] text-white/20 sm:text-[120px]">
                  {d.number ?? "—"}
                </div>

                <div className="relative p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-racing text-2xl font-bold uppercase tracking-[0.16em] text-white sm:text-3xl">
                        {d.gamertag ? d.gamertag : d.name}
                      </div>
                    </div>
                    {countryToFlagEmoji(d.country) ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[18px]">
                        {countryToFlagEmoji(d.country)}
                      </div>
                    ) : null}
                  </div>

                  <div className="relative mt-6 h-[280px] sm:h-[320px]">
                    {d.portraitPath ? (
                      <img
                        src={imageUrl(d.portraitPath) ?? ""}
                        alt=""
                        className="absolute inset-x-0 bottom-0 mx-auto h-[300px] w-full object-contain sm:h-[350px]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/35">
                        PORTRAIT
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Container>
  );
}
