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

function teamBg(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.22) : "rgba(255,255,255,0.06)";
  const b = c ? hexToRgba(c, 0.04) : "rgba(255,255,255,0.02)";
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export default async function LeagueTeamsPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  const currentSeason = await prisma.season
    .findFirst({
      where: { league: l, placement: "CALENDAR" },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      select: { id: true, year: true, seasonNo: true, isTest: true }
    })
    .catch(() => null);

  type TeamTile = {
    id: string;
    name: string;
    color: string | null;
    logoPath: string | null;
    carPath: string | null;
  };

  let teams: TeamTile[] = [];
  if (currentSeason) {
    const rows = await prisma.teamSeason
      .findMany({
        where: { seasonId: currentSeason.id },
        orderBy: [{ team: { name: "asc" } }],
        select: {
          color: true,
          carImagePath: true,
          team: { select: { id: true, name: true, color: true, logoPath: true } }
        }
      })
      .catch(() => []);
    teams = rows.map((r) => ({
      id: r.team.id,
      name: r.team.name,
      color: r.color ?? r.team.color ?? null,
      logoPath: r.team.logoPath ?? null,
      carPath: r.carImagePath ?? null
    }));
  }

  if (!teams.length) {
    const rows = await prisma.team
      .findMany({
        orderBy: [{ name: "asc" }],
        take: 200,
        select: { id: true, name: true, color: true, logoPath: true }
      })
      .catch(() => []);
    teams = rows.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? null,
      logoPath: t.logoPath ?? null,
      carPath: null
    }));
  }

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          Teams · {leagueLabel[l]}
        </div>
        <div className="mt-2 text-sm text-white/70">
          {currentSeason
            ? `Saison ${currentSeason.year} · Season ${currentSeason.seasonNo}${currentSeason.isTest ? " · TEST" : ""}`
            : "Teams Übersicht"}
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {teams.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 sm:col-span-2 lg:col-span-3">
            Noch keine Teams.
          </div>
        ) : (
          teams.map((t) => (
            <Link
              key={t.id}
              href={`/${league}/teams/${t.id}`}
              className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black/30"
              style={{ backgroundImage: teamBg(t.color) }}
            >
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-white/90">
                      {t.name}
                    </div>
                  </div>

                  {t.logoPath ? (
                    <img
                      src={imageUrl(t.logoPath) ?? ""}
                      alt=""
                      className="h-11 w-11 rounded-xl bg-black/20 object-contain"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/20 text-xs font-extrabold text-white/50">
                      {t.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("")}
                    </div>
                  )}
                </div>

                <div className="mt-5 h-[110px] overflow-hidden rounded-2xl bg-black/20">
                  {t.carPath ? (
                    <img
                      src={imageUrl(t.carPath) ?? ""}
                      alt=""
                      className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/35">
                      CAR
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
