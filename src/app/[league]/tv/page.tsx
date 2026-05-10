import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/Container";
import { HeroTile } from "@/components/HeroTile";
import { prisma } from "@/lib/db";
import { resolveLeagueByPublicSlug } from "@/lib/league";
import { TwitchEmbed } from "@/components/TwitchEmbed";
import { LiveTimingMiniClient } from "@/components/LiveTimingMiniClient";
import { MrlTvDriverCamsClient } from "@/components/MrlTvDriverCamsClient";
import { TvHeroLiveCenterClient } from "@/components/TvHeroLiveCenterClient";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

function flagCodeForRaceName(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (n.includes("australien") || n.includes("australia")) return "au";
  if (n.includes("japan") || n.includes("japan")) return "jp";
  if (n.includes("italien") || n.includes("italy")) return "it";
  if (n.includes("usa") || n.includes("united states") || n.includes("vereinigte staaten")) return "us";
  if (n.includes("mexiko") || n.includes("mexico")) return "mx";
  if (n.includes("kanada") || n.includes("canada")) return "ca";
  if (n.includes("brasil") || n.includes("brazil")) return "br";
  if (n.includes("china")) return "cn";
  if (n.includes("bahrain")) return "bh";
  if (n.includes("saudi")) return "sa";
  if (n.includes("abu dhabi") || n.includes("vereinigte arabische emirate") || n.includes("uae")) return "ae";
  if (n.includes("katar") || n.includes("qatar")) return "qa";
  if (n.includes("singapur") || n.includes("singapore")) return "sg";
  if (n.includes("spanien") || n.includes("spain")) return "es";
  if (n.includes("frankreich") || n.includes("france")) return "fr";
  if (n.includes("monaco")) return "mc";
  if (n.includes("großbritannien") || n.includes("grossbritannien") || n.includes("britain") || n.includes("uk")) return "gb";
  if (n.includes("niederlande") || n.includes("netherlands") || n.includes("holland")) return "nl";
  if (n.includes("belgien") || n.includes("belgium")) return "be";
  if (n.includes("ungarn") || n.includes("hungary")) return "hu";
  if (n.includes("österreich") || n.includes("osterreich") || n.includes("austria")) return "at";
  if (n.includes("schweiz") || n.includes("switzerland")) return "ch";
  if (n.includes("schweden") || n.includes("sweden")) return "se";
  if (n.includes("finnland") || n.includes("finland")) return "fi";
  if (n.includes("norwegen") || n.includes("norway")) return "no";
  if (n.includes("dänemark") || n.includes("daenemark") || n.includes("denmark")) return "dk";
  if (n.includes("polen") || n.includes("poland")) return "pl";
  if (n.includes("tschechien") || n.includes("czech")) return "cz";
  if (n.includes("rumänien") || n.includes("rumanien") || n.includes("romania")) return "ro";
  if (n.includes("griechenland") || n.includes("greece")) return "gr";
  if (n.includes("portugal")) return "pt";
  if (n.includes("kroatien") || n.includes("croatia")) return "hr";
  if (n.includes("serbien") || n.includes("serbia")) return "rs";
  if (n.includes("irland") || n.includes("ireland")) return "ie";
  if (n.includes("island") || n.includes("iceland")) return "is";
  return null;
}

function flagBackgroundUrl(code: string | null) {
  if (!code) return null;
  return `https://flagcdn.com/${code}.svg`;
}

export default async function LeagueTvPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const configuredLiveTimingRow = await prisma.appConfig
    .findUnique({ where: { key: `liveTimingLeagueKeyForPublicSlug:${league}` }, select: { value: true } })
    .catch(() => null);
  const configuredLiveTimingKeyRaw = (configuredLiveTimingRow?.value ?? "").trim().toLowerCase();
  function leagueKeyFromPublicSlug(slug: string) {
    const s = (slug ?? "").trim().toLowerCase();
    if (s === "mrl-one" || s === "one" || s === "f1-one") return "liga-one";
    if (s === "mrl-two" || s === "two" || s === "f1-two") return "liga-two";
    if (s === "mrl-rookie" || s === "rookie") return "rookie";
    if (s === "one-mini-wm") return "one-mini-wm";
    if (s === "two-mini-wm") return "two-mini-wm";
    return "liga-one";
  }
  const allowedKeys = new Set(["liga-one", "liga-two", "rookie", "one-mini-wm", "two-mini-wm"]);
  const configuredLiveTimingKey = allowedKeys.has(configuredLiveTimingKeyRaw) ? configuredLiveTimingKeyRaw : "";
  const leagueKey = configuredLiveTimingKey || leagueKeyFromPublicSlug(league);
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
  const flagCode = flagCodeForRaceName(race.name);
  const flagUrl = flagBackgroundUrl(flagCode);

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

  const driverIds = entries.map((e) => e.driver.id);
  const driverSeasonRows = seasonRow?.id && driverIds.length
    ? await prisma.driverSeason
        .findMany({
          where: { seasonId: seasonRow.id, driverId: { in: driverIds } },
          select: {
            driverId: true,
            teamRef: { select: { id: true, name: true, color: true, logoPath: true } }
          },
          take: 5000
        })
        .catch(() => [])
    : [];
  const dsByDriverId = new Map(driverSeasonRows.map((r) => [r.driverId, r] as const));

  const teamIds = Array.from(
    new Set(
      [
        ...entries.map((e) => e.teamId ?? e.team?.id ?? null),
        ...driverSeasonRows.map((r) => r.teamRef?.id ?? null)
      ].filter((v): v is string => Boolean(v))
    )
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
      const ds = dsByDriverId.get(d.id) ?? null;
      const team = e.team ?? ds?.teamRef ?? null;
      const teamId = e.teamId ?? e.team?.id ?? ds?.teamRef?.id ?? null;
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
        <HeroTile accent={leagueAccent} flagUrl={flagUrl} className="mt-8">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                MRL TV · ROUND {race.round}
              </div>
              <div className="mt-2 text-3xl font-extrabold text-white">
                {race.name}
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

          <div className="relative">
            <TvHeroLiveCenterClient leagueKey={leagueKey} leagueLabel={leagueLabel.toUpperCase()} />
          </div>
        </HeroTile>
      </Container>

      <div className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen">
        <div className="mx-auto w-full px-4 pb-14 md:px-8">
          <div className="grid gap-6 xl:grid-cols-[720px_minmax(0,1fr)] xl:items-start">
            <div className="xl:sticky xl:top-24">
              <LiveTimingMiniClient
                startsAtMs={startsAtMs}
                title={`${leagueLabel} • Live Timing`}
                maxRows={22}
                columns={2}
                splitAt={11}
                hideWhenNoLiveData={false}
                className="max-w-none h-[calc(100vh-140px)]"
                leagueKey={leagueKey}
              />
            </div>

            <div className="min-w-0">
              {race.twitchChannel ? (
                <TwitchEmbed channel={race.twitchChannel} startsAtMs={startsAtMs} compact />
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
                    <MrlTvDriverCamsClient cams={cams} startsAtMs={startsAtMs} maxVisible={3} />
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
