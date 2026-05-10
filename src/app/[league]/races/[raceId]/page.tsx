import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { TwitchEmbed } from "@/components/TwitchEmbed";
import { resolveLeagueByPublicSlug } from "@/lib/league";
import { LiveTimingMiniClient } from "@/components/LiveTimingMiniClient";

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

function formatStartsAt(d: Date) {
  return d.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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
  const a = c ? hexToRgba(c, 0.58) : "rgba(255,255,255,0.10)";
  const b = c ? hexToRgba(c, 0.14) : "rgba(255,255,255,0.05)";
  const d = c ? hexToRgba(c, 0.42) : "rgba(255,255,255,0.08)";
  return `radial-gradient(900px circle at 20% 18%, ${d}, transparent 62%), linear-gradient(145deg, ${a}, ${b})`;
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

export default async function RaceDetailPage({
  params
}: {
  params: Promise<{ league: string; raceId: string }>;
}) {
  const { league, raceId } = await params;
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: {
        id: true,
        league: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        name: true,
        circuit: true,
        location: true,
        startsAt: true,
        imagePath: true,
        twitchChannel: true,
        resultsPublishedAt: true,
        circuitRef: { select: { imagePath: true } }
      }
    })
    .catch(() => null);

  if (!race || race.league !== l) notFound();

  const now = Date.now();
  const start = new Date(race.startsAt);
  const startMs = start.getTime();
  const broadcastCloseMs = startMs + 3 * 60 * 60 * 1000;
  const published = Boolean(race.resultsPublishedAt);
  const showResults = published;
  const showBroadcast = !published && Boolean(race.twitchChannel) && now <= broadcastCloseMs;
  const showStartTime = !published && now <= broadcastCloseMs;

  const hero = imageUrl(race.imagePath) ?? imageUrl(race.circuitRef?.imagePath ?? null);
  const subLine = [race.location, race.circuit].filter(Boolean).join(" · ");

  const liveTimingSourceRow = await prisma.appConfig
    .findUnique({ where: { key: `race:liveTimingLeagueKey:${race.id}` }, select: { value: true } })
    .catch(() => null);
  const liveTimingLeagueKey = (liveTimingSourceRow?.value ?? "").trim();
  const liveTimingLabel =
    liveTimingLeagueKey === "liga-one"
      ? "Liga One"
      : liveTimingLeagueKey === "liga-two"
        ? "Liga Two"
        : liveTimingLeagueKey === "rookie"
          ? "Rookie"
          : liveTimingLeagueKey === "one-mini-wm"
            ? "MRL One Mini WM"
            : liveTimingLeagueKey === "two-mini-wm"
              ? "MRL Two Mini WM"
              : "";

  const entries = await prisma.raceEntry
    .findMany({
      where: { raceId: race.id, participates: true },
      orderBy: [{ driver: { name: "asc" } }],
      select: {
        driverId: true,
        driver: { select: { id: true, name: true, number: true, country: true, portraitPath: true } },
        teamId: true,
        team: { select: { id: true, name: true, color: true, logoPath: true } }
      },
      take: 5000
    })
    .catch(() => []);

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league: l,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);

  const driverIds = entries.map((e) => e.driverId);
  const driverSeasonRows = season?.id && driverIds.length
    ? await prisma.driverSeason
        .findMany({
          where: { seasonId: season.id, driverId: { in: driverIds } },
          select: { driverId: true, role: true, teamRef: { select: { name: true, color: true, logoPath: true } } },
          take: 5000
        })
        .catch(() => [])
    : [];

  const dsByDriverId = new Map(driverSeasonRows.map((r) => [r.driverId, r] as const));

  const field = entries.map((e) => {
    const ds = dsByDriverId.get(e.driverId) ?? null;
    const role = ds?.role ?? "MAIN";
    const roleLabel = role === "RESERVE" ? "Ersatzfahrer" : "Stammfahrer";
    const accent = e.team?.color ?? ds?.teamRef?.color ?? null;
    const teamLogoUrl =
      role === "MAIN"
        ? imageUrl(ds?.teamRef?.logoPath ?? null) ?? imageUrl(e.team?.logoPath ?? null)
        : imageUrl(e.team?.logoPath ?? null) ?? imageUrl(ds?.teamRef?.logoPath ?? null);
    return {
      id: e.driver.id,
      name: e.driver.name,
      number: e.driver.number ?? null,
      country: e.driver.country ?? null,
      portraitUrl: imageUrl(e.driver.portraitPath) ?? null,
      role,
      roleLabel,
      teamName: role === "MAIN" ? ds?.teamRef?.name ?? null : null,
      raceTeamName: e.team?.name ?? null,
      teamLogoUrl,
      accent
    };
  });

  type ResultRow = {
    id: string;
    position: number;
    points: number;
    status: string | null;
    bestTime: string | null;
    timeText: string | null;
    penaltySeconds: number;
    fastestLap: boolean;
    driver: { id: string; name: string; team: string | null; number: number | null; portraitPath: string | null };
  };

  let results: ResultRow[] = [];
  if (showResults) {
    results = await prisma.raceResult
      .findMany({
        where: { raceId: race.id },
        orderBy: [{ position: "asc" }],
        select: {
          id: true,
          position: true,
          points: true,
          status: true,
          bestTime: true,
          timeText: true,
          penaltySeconds: true,
          fastestLap: true,
          driver: { select: { id: true, name: true, team: true, number: true, portraitPath: true } }
        }
      })
      .catch(() => []);
  }

  const fieldByDriverId = new Map(field.map((d) => [d.id, d] as const));
  const splitAt = Math.ceil(results.length / 2);
  const leftResults = results.slice(0, splitAt);
  const rightResults = results.slice(splitAt);

  return (
    <>
      <Container>
        <div className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold">
                {race.name}
              </div>
              <div className="mt-2 text-sm text-white/70">
                {cfg.name}
                {subLine ? ` · ${subLine}` : ""}
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
      </Container>

      <div className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen overflow-hidden bg-black/30">
        <div className="relative h-[44vh] min-h-[320px] max-h-[720px] sm:h-[52vh]">
          {hero ? (
            <img
              src={hero}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/35" />
          <div className="absolute bottom-0 left-0 right-0 pb-6 sm:pb-8">
            <Container>
              {showStartTime ? (
                <div className="w-fit rounded-xl bg-black/40 px-4 py-3 text-sm text-white/85 backdrop-blur">
                  Startzeit · {formatStartsAt(start)}
                </div>
              ) : null}
              <div className="mt-4 text-xs text-white/70">
                {race.seasonIsTest ? "TEST · " : ""}Saison {race.season} · Season {race.seasonNo} · Runde {race.round}
              </div>
            </Container>
          </div>
        </div>
      </div>

      <Container>
        {!showResults ? (
          <>
            {liveTimingLeagueKey ? (
              <LiveTimingMiniClient
                startsAtMs={startMs}
                title={`${liveTimingLabel || "Live Timing"} • Live Timing`}
                maxRows={22}
                columns={2}
                splitAt={11}
                className="mt-6 max-w-none"
                leagueKey={liveTimingLeagueKey}
              />
            ) : null}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-5 py-4">
                <div className="text-lg font-semibold">Fahrerfeld</div>
                <div className="mt-1 text-sm text-white/70">
                  {field.length ? `${field.length} Fahrer` : "Noch nicht gepflegt"}
                </div>
              </div>

              {field.length === 0 ? (
                <div className="px-5 py-5 text-sm text-white/60">
                  Fahrerfeld ist noch nicht eingetragen.
                </div>
              ) : (
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {field.map((d) => (
                    <Link
                      key={d.id}
                      href={`/${league}/drivers/${d.id}`}
                      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-black/10"
                      style={{ backgroundImage: teamBg(d.accent) }}
                    >
                      <div
                        className="absolute inset-0 opacity-25"
                        style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                      />
                      <div
                        className="absolute left-0 top-0 h-[4px] w-full"
                        style={{ backgroundColor: d.accent ?? "#ffffff" }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/65" />
                      {d.portraitUrl ? (
                        <div className="absolute inset-y-0 right-0 w-[62%] p-2">
                          <div className="relative h-full w-full">
                            <img
                              src={d.portraitUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-contain object-right object-bottom opacity-95 transition duration-300 group-hover:scale-[1.02]"
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="relative p-5">
                        <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                          {d.roleLabel}
                          {d.country ? ` · ${d.country}` : ""}
                          {d.number ? ` · #${d.number}` : ""}
                        </div>
                        <div className="mt-2 truncate text-lg font-extrabold text-white">
                          {d.name}
                        </div>
                        <div className="mt-2 text-sm text-white/70">
                          {d.raceTeamName ? `Team: ${d.raceTeamName}` : d.teamName ? `Team: ${d.teamName}` : ""}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {showResults ? (
          <div className="mt-8">
            <div className="mb-3 px-1">
              <div className="text-xl font-extrabold uppercase tracking-wide text-white">Rennergebnis:</div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {[leftResults, rightResults].filter((c) => c.length > 0).map((col, colIdx) => (
                <div key={colIdx} className="grid gap-3">
                    {col.map((r) => {
                    const d = fieldByDriverId.get(r.driver.id) ?? null;
                    const portraitUrl = d?.portraitUrl ?? imageUrl(r.driver.portraitPath) ?? null;
                    const accent = d?.accent ?? null;
                    const statusRaw = (r.status ?? "").trim();
                    const statusUp = statusRaw.toUpperCase();
                    const statusIsFinished = statusUp === "FINISHED" || statusUp === "FINISH" || statusUp === "F";
                    const endOrStatus =
                      r.timeText && (!statusRaw || statusIsFinished) ? r.timeText : r.status ? r.status : r.timeText ? r.timeText : "";
                    const best = r.bestTime ?? "";
                    const bestClass = r.fastestLap ? "text-violet-300" : "text-white/80";
                    const penalty = typeof r.penaltySeconds === "number" && r.penaltySeconds > 0 ? r.penaltySeconds : 0;
                    const flag = countryToFlagEmoji(d?.country ?? null);
                    const number = d?.number ?? r.driver.number ?? null;
                    const teamLogoUrl = d?.teamLogoUrl ?? null;

                    return (
                      <Link
                        key={r.id}
                        href={`/${league}/drivers/${r.driver.id}`}
                        className="group grid grid-cols-[56px_1fr_88px] gap-2"
                      >
                        <div
                          className="flex items-center justify-center overflow-hidden rounded-2xl border-2 bg-black/25"
                          style={{ borderColor: accent ?? "rgba(255,255,255,0.15)" }}
                        >
                          <div className="text-xl font-extrabold text-white">{r.position}</div>
                        </div>

                        <div
                          className="relative overflow-hidden rounded-2xl border border-white/10"
                          style={{ backgroundImage: heroBg(accent) }}
                        >
                          <div
                            className="absolute inset-0 opacity-25"
                            style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                          />
                          <div
                            className="absolute left-0 top-0 h-[4px] w-full"
                            style={{ backgroundColor: accent ?? "#ffffff" }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

                          {portraitUrl ? (
                            <div className="absolute inset-y-0 right-0 w-[38%] p-2">
                              <div className="relative h-full w-full">
                                <img
                                  src={portraitUrl}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-contain object-right object-bottom opacity-95 transition duration-300 group-hover:scale-[1.02]"
                                />
                              </div>
                            </div>
                          ) : null}

                          <div className="relative p-4">
                            <div className="flex items-center gap-2">
                              {flag ? (
                                <div className="text-base leading-none">
                                  {flag}
                                </div>
                              ) : null}
                              <div className="min-w-0 truncate text-base font-extrabold uppercase tracking-wide text-white">
                                {r.driver.name}
                              </div>
                              {number ? (
                                <div className="shrink-0 text-xs font-extrabold text-white/70">
                                  #{number}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-base font-extrabold text-white">
                              <span>{endOrStatus}</span>
                              {penalty ? (
                                <span className="rounded-lg border border-red-500/35 bg-red-500/15 px-2 py-1 text-xs font-extrabold text-red-300">
                                  +{penalty}s
                                </span>
                              ) : null}
                              {teamLogoUrl ? (
                                <span className="ml-auto flex items-center">
                                  <img
                                    src={teamLogoUrl}
                                    alt=""
                                    className="h-10 w-auto object-contain opacity-95 sm:h-12 md:h-14"
                                  />
                                </span>
                              ) : null}
                            </div>

                            {best ? (
                              <div className={"mt-2 text-sm font-semibold " + bestClass}>
                                Best Lap {best}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div
                          className="flex items-center justify-end overflow-hidden rounded-2xl border-2 bg-black/25 px-3 py-2 text-right"
                          style={{ borderColor: accent ?? "rgba(255,255,255,0.15)" }}
                        >
                          <div>
                            <div className="text-xl font-extrabold text-white">{r.points.toFixed(0)}</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                              PTS
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                    })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {showBroadcast && race.twitchChannel ? (
              <TwitchEmbed channel={race.twitchChannel} startsAtMs={startMs} />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                {now > broadcastCloseMs
                  ? "Ergebnisse sind noch nicht veröffentlicht."
                  : "Noch kein Live-Stream hinterlegt."}
              </div>
            )}
          </div>
        )}
      </Container>
    </>
  );
}
