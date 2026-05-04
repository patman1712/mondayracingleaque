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

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatRange(start: Date) {
  const end = addDays(start, 2);
  const s = start.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit"
  });
  const e = end.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "short"
  });
  return `${s} – ${e}`.toUpperCase();
}

export default async function LeagueArchivePage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  type RaceItem = {
    id: string;
    season: number;
    seasonNo: number;
    seasonIsTest: boolean;
    round: number;
    name: string;
    circuit: string | null;
    location: string | null;
    startsAt: Date;
    imagePath: string | null;
  };

  let races: RaceItem[] = [];
  try {
    const seasons = await prisma.season.findMany({
      where: { league: l, placement: "ARCHIVE" },
      select: { year: true, seasonNo: true, isTest: true },
      take: 200
    });

    const seasonOr =
      seasons.length > 0
        ? seasons.map((s) => ({
            season: s.year,
            seasonNo: s.seasonNo,
            seasonIsTest: s.isTest
          }))
        : [];

    races = await prisma.race.findMany({
      where: seasonOr.length ? { league: l, OR: seasonOr } : { league: l, id: "__none__" },
      orderBy: [{ startsAt: "asc" }],
      take: 600,
      select: {
        id: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        name: true,
        circuit: true,
        location: true,
        startsAt: true,
        imagePath: true
      }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold">
              Archiv · {leagueLabel[l]}
            </div>
            <div className="mt-2 text-sm text-white/70">
              Saisons, die im Admin ins Archiv verschoben wurden
            </div>
          </div>
          <Link
            href={`/${league}/calendar`}
            className="rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-white hover:bg-black/30"
          >
            Zurück zum Kalender
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {races.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 sm:col-span-2 lg:col-span-3">
            Noch keine Archiv-Rennen vorhanden.
          </div>
        ) : (
          races.map((r) => (
            <div key={r.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/70" />
              {imageUrl(r.imagePath) ? (
                <img
                  src={imageUrl(r.imagePath) ?? ""}
                  alt=""
                  className="absolute right-0 top-0 h-full w-[55%] object-cover opacity-60"
                />
              ) : null}

              <div className="relative p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    {r.seasonIsTest ? "Testing" : `Round ${r.round}`}
                  </div>
                  <div className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80">
                    {formatRange(new Date(r.startsAt))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="truncate text-2xl font-extrabold tracking-tight text-white">
                    {r.circuit || r.name}
                  </div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/50">
                    {r.name}
                  </div>
                  <div className="mt-3 text-sm text-white/70">
                    {r.circuit || r.location ? (
                      <div className="truncate">
                        {[r.circuit, r.location].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs text-white/60">
                      {r.seasonIsTest ? "TEST · " : ""}Saison {r.season} · Season {r.seasonNo} · Runde {r.round}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}

