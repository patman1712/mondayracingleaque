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
  const l = leagueEnum[league];
  if (!l) notFound();

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
    const currentSeason = await prisma.season
      .findFirst({
        where: { league: l, placement: "CALENDAR" },
        orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
        select: { id: true }
      })
      .catch(() => null);

    if (currentSeason) {
      const rows = await prisma.driverSeason
        .findMany({
          where: { seasonId: currentSeason.id, driver: { league: l } },
          orderBy: [{ driver: { name: "asc" } }],
          select: {
            driver: {
              select: {
                id: true,
                name: true,
                gamertag: true,
                number: true,
                team: true,
                country: true,
                portraitPath: true,
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
              }
            }
          }
        })
        .catch(() => []);

      const out: DriverItem[] = [];
      for (const r of rows) {
        const t = r.driver.teamRef;
        const accent = t?.participations?.[0]?.color ?? t?.color ?? null;
        out.push({
          id: r.driver.id,
          name: r.driver.name,
          gamertag: r.driver.gamertag ?? null,
          number: r.driver.number ?? null,
          team: r.driver.team ?? null,
          country: r.driver.country ?? null,
          portraitPath: r.driver.portraitPath ?? null,
          accent
        });
      }
      drivers = out;
    }

    if (!drivers.length) {
      const rows = await prisma.driver.findMany({
        where: { league: l },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          gamertag: true,
          number: true,
          team: true,
          country: true,
          portraitPath: true,
          teamRef: { select: { color: true } }
        }
      });
      drivers = rows.map((d) => ({
        id: d.id,
        name: d.name,
        gamertag: d.gamertag ?? null,
        number: d.number ?? null,
        team: d.team ?? null,
        country: d.country ?? null,
        portraitPath: d.portraitPath ?? null,
        accent: d.teamRef?.color ?? null
      }));
    }
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          Fahrer · {leagueLabel[l]}
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
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
              style={{ backgroundImage: cardBg(d.accent) }}
            >
              <div
                className="absolute inset-0 opacity-25"
                style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/10 to-black/70" />
              <div className="absolute left-0 top-0 h-[6px] w-full" style={{ backgroundColor: d.accent ?? "#ffffff" }} />

              <div className="relative p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-racing text-xl font-bold uppercase tracking-[0.14em] text-white sm:text-2xl">
                      {d.name}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/75">
                      {d.gamertag ? <span className="truncate">{d.gamertag}</span> : <span className="truncate">Fahrer</span>}
                      {countryToFlagEmoji(d.country) ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[14px]">
                          {countryToFlagEmoji(d.country)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="font-racing text-4xl font-bold leading-none tracking-[0.08em] text-white/90">
                    {d.number ?? "—"}
                  </div>
                </div>

                <div className="relative mt-5 h-[200px] overflow-hidden">
                  {d.portraitPath ? (
                    <img
                      src={imageUrl(d.portraitPath) ?? ""}
                      alt=""
                      className="absolute inset-x-0 bottom-0 mx-auto h-[220px] w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-[200px] w-full items-center justify-center text-xs font-semibold text-white/35">
                      PORTRAIT
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Container>
  );
}
