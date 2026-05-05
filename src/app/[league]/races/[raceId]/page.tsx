import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { TwitchEmbed } from "@/components/TwitchEmbed";
import { resolveLeagueByPublicSlug } from "@/lib/league";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
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
        circuitRef: { select: { imagePath: true } }
      }
    })
    .catch(() => null);

  if (!race || race.league !== l) notFound();

  const now = Date.now();
  const start = new Date(race.startsAt);
  const startMs = start.getTime();
  const broadcastCloseMs = startMs + 3 * 60 * 60 * 1000;
  const showBroadcast = Boolean(race.twitchChannel) && now <= broadcastCloseMs;
  const showStartTime = now <= broadcastCloseMs;
  const showResults = now > broadcastCloseMs;

  const hero = imageUrl(race.imagePath) ?? imageUrl(race.circuitRef?.imagePath ?? null);
  const subLine = [race.location, race.circuit].filter(Boolean).join(" · ");

  const entries = await prisma.raceEntry
    .findMany({
      where: { raceId: race.id, participates: true },
      orderBy: [{ driver: { name: "asc" } }],
      select: {
        driverId: true,
        driver: { select: { id: true, name: true, number: true, country: true, portraitPath: true } },
        teamId: true,
        team: { select: { id: true, name: true, color: true } }
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
          select: { driverId: true, role: true, teamRef: { select: { name: true, color: true } } },
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
      accent
    };
  });

  type ResultRow = {
    id: string;
    position: number;
    points: number;
    status: string | null;
    driver: { name: string; team: string | null; number: number | null };
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
          driver: { select: { name: true, team: true, number: true } }
        }
      })
      .catch(() => []);
  }

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

        {showResults ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="text-lg font-semibold">Rennergebnis</div>
            </div>

            {results.length === 0 ? (
              <div className="px-5 py-5 text-sm text-white/60">
                Noch keine Ergebnisse eingetragen.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[70px_1fr_90px] gap-3 px-5 py-3 text-sm"
                  >
                    <div className="text-white/70">P{r.position}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {r.driver.name}
                      </div>
                      <div className="truncate text-xs text-white/60">
                        {r.driver.team ?? ""}
                        {r.status ? ` · ${r.status}` : ""}
                      </div>
                    </div>
                    <div className="text-right font-semibold">
                      {r.points.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {showBroadcast && race.twitchChannel ? (
              <TwitchEmbed channel={race.twitchChannel} startsAtMs={startMs} />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                Noch kein Live-Stream hinterlegt.
              </div>
            )}
          </div>
        )}
      </Container>
    </>
  );
}
