import Link from "next/link";
import { Container } from "@/components/Container";
import { LeagueCountdowns } from "@/components/LeagueCountdowns";
import { prisma } from "@/lib/db";
import { listPublicLeagues } from "@/lib/league";
import { League } from "@prisma/client";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export default async function HomePage() {
  const now = new Date();

  type NewsItem = {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    imagePath: string | null;
  };

  type RaceItem = {
    id: string;
    name: string;
    season: number;
    round: number;
    circuit: string | null;
    startsAt: Date;
  };

  let news: NewsItem[] = [];
  let races: RaceItem[] = [];
  const activeLeagues = await listPublicLeagues().catch(() => []);
  const nextByLeague = new Map<
    League,
    {
      name: string;
      startsAt: Date;
      circuit: string | null;
      location: string | null;
      season: number;
      seasonNo: number;
      round: number;
      seasonIsTest: boolean;
    } | null
  >();

  try {
    news = await prisma.newsPost.findMany({
      where: { publishedAt: { not: null, lte: now } },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: { id: true, slug: true, title: true, excerpt: true, imagePath: true }
    });
  } catch {}

  try {
    races = await prisma.race.findMany({
      where: { startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 6,
      select: {
        id: true,
        name: true,
        season: true,
        round: true,
        circuit: true,
        startsAt: true
      }
    });
  } catch {}

  try {
    async function nextRace(league: League) {
      const normal = await prisma.race
        .findFirst({
          where: { league, seasonIsTest: false, startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          select: {
            name: true,
            startsAt: true,
            circuit: true,
            location: true,
            season: true,
            seasonNo: true,
            round: true,
            seasonIsTest: true
          }
        })
        .catch(() => null);
      if (normal) return normal;
      return prisma.race
        .findFirst({
          where: { league, startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          select: {
            name: true,
            startsAt: true,
            circuit: true,
            location: true,
            season: true,
            seasonNo: true,
            round: true,
            seasonIsTest: true
          }
        })
        .catch(() => null);
    }

    const uniqueLeagues = Array.from(new Set(activeLeagues.map((l) => l.league)));
    const nextRows = await Promise.all(uniqueLeagues.map((l) => nextRace(l)));
    for (let i = 0; i < uniqueLeagues.length; i++) nextByLeague.set(uniqueLeagues[i], nextRows[i] ?? null);
  } catch {}

  return (
    <div>
      <section className="relative min-h-dvh border-b border-white/10">
        <img
          src="/hero-1.svg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-mrl-black" />

        <Container>
          <div className="relative grid min-h-dvh items-center gap-10 pb-10 pt-24 md:grid-cols-[1fr_420px] md:pb-12 md:pt-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-white/70">
                Season 2026
              </div>
              <h1 className="mt-4 max-w-3xl text-5xl font-extrabold tracking-tight md:text-7xl">
                WE RACE
                <span className="text-mrl-red"> AS ONE</span>.
              </h1>
              <div className="mt-4 max-w-xl text-sm text-white/70 md:text-base">
                Monday Racing League · F1 26 Simracing Liga
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/news"
                  className="rounded-md bg-mrl-red px-6 py-3 text-sm font-semibold text-white"
                >
                  News
                </Link>
                <Link
                  href="/calendar"
                  className="rounded-md border border-white/15 bg-black/20 px-6 py-3 text-sm font-semibold text-white hover:bg-black/30"
                >
                  Rennkalender
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/50 p-6 backdrop-blur">
              <div className="flex items-center gap-4">
                <div className="h-10 w-[3px] bg-mrl-red" />
                <div>
                  <div className="text-lg font-extrabold tracking-tight">
                    UPCOMING EVENTS
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    Nächster Start je Liga
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <LeagueCountdowns
                  leagues={activeLeagues.map((l) => {
                    const next = nextByLeague.get(l.league) ?? null;
                    return {
                      key: l.publicSlug,
                      label: l.name,
                      href: `/${l.publicSlug}`,
                      nextRace: next
                        ? {
                            name: next.name,
                            startsAt: next.startsAt.toISOString(),
                            circuit: next.circuit,
                            location: next.location,
                            season: next.season,
                            seasonNo: next.seasonNo,
                            round: next.round,
                            seasonIsTest: next.seasonIsTest
                          }
                        : null
                    };
                  })}
                />
              </div>

              <div className="mt-6">
                <Link
                  href="/calendar"
                  className="inline-flex w-full items-center justify-center rounded-md border border-white/15 bg-black/20 px-4 py-3 text-sm font-semibold text-white hover:bg-black/30"
                >
                  View archive
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Neueste News</div>
            <Link
              href="/news"
              className="text-sm font-semibold text-white/70 hover:text-white"
            >
              Alle
            </Link>
          </div>

          {news.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Noch keine veröffentlichten News.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {news.map((n) => (
                <Link
                  key={n.id}
                  href={`/news/${n.slug}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10"
                >
                  <div className="aspect-[16/9] w-full bg-black/20">
                    {n.imagePath ? (
                      <img
                        src={imageUrl(n.imagePath) ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="p-6">
                    <div className="font-semibold">{n.title}</div>
                    {n.excerpt ? (
                      <div className="mt-2 line-clamp-3 text-sm text-white/70">
                        {n.excerpt}
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold">Nächste Rennen</div>
            <Link
              href="/calendar"
              className="text-sm font-semibold text-white/70 hover:text-white"
            >
              Alle
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {races.length === 0 ? (
              <div className="text-sm text-white/60">
                Noch keine kommenden Rennen.
              </div>
            ) : (
              races.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-sm text-white/60">
                      {new Date(r.startsAt).toLocaleString("de-DE", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    Saison {r.season} · Runde {r.round}
                    {r.circuit ? ` · ${r.circuit}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
