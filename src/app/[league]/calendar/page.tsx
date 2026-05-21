import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { resolveLeagueByPublicSlug } from "@/lib/league";
import { flagBackgroundUrl, flagCodeForRaceLike } from "@/lib/flags";

export const dynamic = "force-dynamic";

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

function driverCode(name: string) {
  const s = (name ?? "").trim().toUpperCase();
  if (!s) return "—";
  const compact = s.replace(/[^A-Z0-9]+/g, " ").trim();
  const parts = compact.split(/\s+/g).filter(Boolean);
  if (parts.length >= 3) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}${parts[2][0] ?? ""}`.toUpperCase();
  const base = (parts[0] ?? "").replace(/[^A-Z0-9]+/g, "");
  return base.slice(0, 3).padEnd(3, base.slice(-1) || "X");
}

function parseRaceTimeMs(text: string) {
  const t = (text ?? "").trim();
  const m = t.match(/^(\d+):(\d{2})\.(\d{1,3})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return ((min * 60 + sec) * 1000) + ms;
}

function formatGapMs(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  if (minutes > 0) return `+${minutes}:${String(seconds).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
  return `+${seconds}.${String(milli).padStart(3, "0")}`;
}

function getResultDisplayTime(
  result: { position: number; status: string | null; timeText: string | null; finishTimeMs: number | null },
  winnerRaceTimeMs: number | null
) {
  const statusUp = (result.status ?? "").trim().toUpperCase();
  if (statusUp === "DNF") return "DNF";
  if (statusUp === "RET" || statusUp === "RETIRED") return "RET";
  if (statusUp === "DSQ") return "DSQ";
  if (statusUp === "DNS") return "DNS";

  const tt = (result.timeText ?? "").trim();
  if (result.position === 1) {
    if (tt && tt.toUpperCase() !== "WINNER") return tt;
    if (typeof result.finishTimeMs === "number" && Number.isFinite(result.finishTimeMs)) return formatGapMs(result.finishTimeMs).slice(1);
    return "—";
  }

  if (tt.startsWith("+")) return tt;
  if (typeof result.finishTimeMs === "number" && Number.isFinite(result.finishTimeMs) && typeof winnerRaceTimeMs === "number") {
    return formatGapMs(result.finishTimeMs - winnerRaceTimeMs);
  }
  const raceMs = parseRaceTimeMs(tt);
  if (typeof raceMs === "number" && typeof winnerRaceTimeMs === "number") return formatGapMs(raceMs - winnerRaceTimeMs);
  return "—";
}

export default async function LeagueCalendarPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;

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
    resultsPublishedAt: Date | null;
    results: { position: number; status: string | null; timeText: string | null; finishTimeMs: number | null; driver: { name: string } }[];
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
        imagePath: true,
        resultsPublishedAt: true,
        results: {
          orderBy: { position: "asc" },
          take: 3,
          select: { position: true, status: true, timeText: true, finishTimeMs: true, driver: { select: { name: true } } }
        }
      }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold">
              Rennkalender · {cfg.name}
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
              const flagUrl = flagBackgroundUrl(
                flagCodeForRaceLike({ name: r.name, location: r.location, circuit: r.circuit })
              );
              const imgUrl = imageUrl(r.imagePath);
              const hasPublishedResults = Boolean(r.resultsPublishedAt) && r.results.length > 0;
              const winner = r.results.find((x) => x.position === 1) ?? null;
              const winnerRaceTimeMs =
                winner && typeof winner.finishTimeMs === "number" && Number.isFinite(winner.finishTimeMs)
                  ? winner.finishTimeMs
                  : winner?.timeText
                    ? parseRaceTimeMs(winner.timeText)
                    : null;

              return (
            <Link
              key={r.id}
              href={`/${league}/races/${r.id}`}
              className="relative block min-h-[190px] overflow-hidden rounded-2xl border border-white/10 bg-black/30 sm:min-h-[210px]"
            >
              {flagUrl ? (
                <img
                  src={flagUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-center opacity-55"
                />
              ) : imgUrl ? (
                <img
                  src={imgUrl ?? ""}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-center opacity-75"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/35 to-black/70" />

              <div className="relative p-5">
                <div className="flex justify-end">
                  <div className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80">
                    {formatRaceDateTime(start, isUpcoming)}
                  </div>
                </div>

                {isUpcoming ? (
                  <div className="mt-4">
                    {trackLine ? (
                      <div className="truncate text-sm text-white/70">
                        {trackLine}
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs text-white/60">
                      {r.seasonIsTest ? "TEST · " : ""}Saison {r.season} · Season {r.seasonNo} · Runde {r.round}
                    </div>
                  </div>
                ) : title ? (
                  <div className="mt-4">
                    <div className={["truncate font-extrabold tracking-tight text-white", hasPublishedResults ? "text-xl" : "text-2xl"].join(" ")}>
                      {title}
                    </div>
                    {hasPublishedResults ? (
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {r.results.map((res) => (
                          <div
                            key={res.position}
                            className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-2 py-2 backdrop-blur-sm"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[11px] font-extrabold text-white/85">
                              {res.position}
                            </div>
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-extrabold text-white/85">
                              {driverCode(res.driver.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-semibold leading-tight text-white/70">
                                {getResultDisplayTime(res, winnerRaceTimeMs)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Link>
              );
            })()
          ))
        )}
      </div>
    </Container>
  );
}
