import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { resolveLeagueByPublicSlug } from "@/lib/league";
import { TwitchEmbed } from "@/components/TwitchEmbed";
import { LiveTimingMiniClient } from "@/components/LiveTimingMiniClient";
import { MrlTvDriverCamsClient } from "@/components/MrlTvDriverCamsClient";
import { Prisma } from "@prisma/client";

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

export default async function LeagueTvPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg) notFound();
  if (!cfg.isActive) notFound();
  const leagueEnum = cfg.league;
  const leagueAccent = cfg.accentColor;
  const leagueLabel = cfg.name;

  const now = new Date();
  const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

  const select = {
    id: true,
    name: true,
    round: true,
    season: true,
    seasonNo: true,
    startsAt: true,
    twitchChannel: true,
    seasonIsTest: true
  } satisfies Prisma.RaceSelect;

  type RaceCard = Prisma.RaceGetPayload<{ select: typeof select }>;

  async function findPreferred(where: Prisma.RaceWhereInput, orderBy: Prisma.RaceOrderByWithRelationInput) {
    const normal = await prisma.race
      .findFirst({
        where: { ...where, league: leagueEnum, seasonIsTest: false },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
    if (normal) return normal;
    return prisma.race
      .findFirst({
        where: { ...where, league: leagueEnum },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
  }

  const race = await findPreferred({ startsAt: { gte: windowStart, lte: windowEnd } }, { startsAt: "desc" });

  if (!race) {
    return (
      <Container>
        <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
            MRL TV
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            Kein Rennen im Livefenster
          </div>
          <div className="mt-3 text-sm text-white/70">
            {leagueLabel}: MRL TV ist nur sichtbar 30 Minuten vor Rennstart bis 3 Stunden nach Start.
          </div>
          <div className="mt-6">
            <Link
              href={`/${league}/calendar`}
              className="inline-flex rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              Zum Rennkalender →
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const startsAtMs = new Date(race.startsAt).getTime();

  const seasonRow = await prisma.season
    .findFirst({
      where: {
        league: leagueEnum,
        year: race.season,
        seasonNo: race.seasonNo,
        isTest: race.seasonIsTest
      },
      select: { id: true }
    })
    .catch((): { id: string } | null => null);

  const entries = await prisma.raceEntry.findMany({
    where: { raceId: race.id, participates: true },
    orderBy: { createdAt: "asc" },
    select: {
      teamId: true,
      team: { select: { id: true, name: true, color: true, logoPath: true } },
      driver: {
        select: {
          id: true,
          name: true,
          gamertag: true,
          twitchChannel: true,
          portraitPath: true
        }
      }
    }
  });

  const teamIds = Array.from(
    new Set(entries.map((e) => e.teamId).filter((v): v is string => Boolean(v)))
  );
  const teamSeasonColors = seasonRow?.id
    ? await prisma.teamSeason
        .findMany({
          where: { seasonId: seasonRow.id, teamId: { in: teamIds } },
          select: { teamId: true, color: true }
        })
        .then((rows) => new Map(rows.map((r) => [r.teamId, r.color ?? null] as const)))
        .catch(() => new Map<string, string | null>())
    : new Map<string, string | null>();

  const cams = entries
    .map((e) => ({ e, d: e.driver }))
    .filter(({ d }) => Boolean(d.twitchChannel && d.twitchChannel.trim()))
    .map(({ e, d }) => {
      const teamId = e.teamId;
      const team = e.team;
      const accent = (teamId ? teamSeasonColors.get(teamId) : null) ?? team?.color ?? leagueAccent;
      return {
        driverId: d.id,
        name: d.gamertag ?? d.name,
        twitchChannel: d.twitchChannel!,
        portraitUrl: imageUrl(d.portraitPath),
        teamName: team?.name ?? null,
        teamLogoUrl: imageUrl(team?.logoPath),
        accent
      };
    });

  return (
    <>
      <Container>
        <div
          className="relative mt-8 overflow-hidden rounded-3xl border border-white/10 p-6"
          style={{ backgroundImage: heroBg(leagueAccent) }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/75" />
          <div className="pointer-events-none absolute left-0 top-0 h-[6px] w-full" style={{ backgroundColor: leagueAccent }} />

          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                MRL TV · ROUND {race.round}
              </div>
              <div className="mt-2 text-3xl font-extrabold text-white">
                {race.name}
              </div>
              <div className="mt-2 text-sm text-white/70">
                Livefenster: 30 Min vor Start bis 3 Std nach Start
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/${league}/races/${race.id}`}
                className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Zur Rennseite →
              </Link>
            </div>
          </div>
        </div>
      </Container>

      <div className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen">
        <div className="mx-auto w-full px-4 pb-14 md:px-8">
          <div className="grid gap-6 xl:grid-cols-[640px_minmax(0,1fr)] xl:items-start">
            <div className="xl:sticky xl:top-24">
              <LiveTimingMiniClient
                startsAtMs={startsAtMs}
                title="Live Timing"
                maxRows={22}
                columns={2}
                splitAt={11}
                hideWhenNoLiveData={false}
                className="max-w-none"
              />
            </div>

            <div className="min-w-0">
              {race.twitchChannel ? (
                <TwitchEmbed channel={race.twitchChannel} startsAtMs={startsAtMs} />
              ) : (
                <div className="rounded-3xl border border-white/10 bg-black/30 p-8 text-white/70">
                  Für dieses Rennen ist kein Twitch-Broadcast hinterlegt.
                </div>
              )}

              <div className="mt-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                      Fahrer Cams
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      Es werden nur Fahrer aus dem Starterfeld angezeigt, die Twitch hinterlegt haben und live sind.
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  {cams.length ? (
                    <MrlTvDriverCamsClient cams={cams} startsAtMs={startsAtMs} />
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                      Im Starterfeld hat niemand Twitch hinterlegt.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
