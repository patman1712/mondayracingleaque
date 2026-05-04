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

function cleanTileText(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/[\s·•\-–—]+$/g, "").trim() || null;
}

function formatRaceDateTime(d: Date, includeTime: boolean) {
  const date = d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "short"
  });
  if (!includeTime) return date.toUpperCase();
  const time = d.toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${date} · ${time}`.toUpperCase();
}

export default async function LeagueCalendarPage({
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
      where: { league: l, placement: "CALENDAR" },
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
      take: 400,
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
              Rennkalender · {leagueLabel[l]}
            </div>
            <div className="mt-2 text-sm text-white/70">
              Aktuelle Seasons (im Admin steuerbar)
            </div>
          </div>
          <Link
            href={`/${league}/archive`}
            className="rounded-lg border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-white hover:bg-black/30"
          >
            Archiv ansehen
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {races.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 sm:col-span-2 lg:col-span-3">
            Noch keine Rennen eingetragen.
          </div>
        ) : (
          races.map((r) => (
            (() => {
              const start = new Date(r.startsAt);
              const isUpcoming = start.getTime() > Date.now();
              const location = cleanTileText(r.location);
              const circuit = cleanTileText(r.circuit);
              const trackLine = [location, circuit].filter(Boolean).join(" · ");
              const title = cleanTileText(
                r.seasonIsTest ? r.name.replace(/^TEST\s*·\s*/i, "") : r.name
              );

              return (
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
                  <div />
                  <div className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80">
                    {formatRaceDateTime(start, isUpcoming)}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="truncate text-2xl font-extrabold tracking-tight text-white">
                    {title}
                  </div>
                  {isUpcoming ? (
                    <div className="mt-3">
                      {trackLine ? (
                        <div className="truncate text-sm text-white/70">
                          {trackLine}
                        </div>
                      ) : null}
                      <div className="mt-2 text-xs text-white/60">
                        {r.seasonIsTest ? "TEST · " : ""}Saison {r.season} · Season {r.seasonNo} · Runde {r.round}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
              );
            })()
          ))
        )}
      </div>
    </Container>
  );
}
