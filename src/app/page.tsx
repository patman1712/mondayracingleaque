import Link from "next/link";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();

  type NewsItem = {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
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

  try {
    news = await prisma.newsPost.findMany({
      where: { publishedAt: { not: null, lte: now } },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: { id: true, slug: true, title: true, excerpt: true }
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

  return (
    <div>
      <div className="border-b border-white/10 bg-gradient-to-b from-mrl-gray to-mrl-black">
        <Container>
          <div className="py-12">
            <div className="text-sm font-semibold text-white/70">F1 26</div>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">
              Monday Racing League
            </h1>
            <p className="mt-4 max-w-2xl text-white/70">
              News, Kalender, Fahrer, Ergebnisse und WM-Stand für MRL One, MRL
              Two und MRL Rookie.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/news"
                className="rounded-full bg-mrl-red px-5 py-3 text-sm font-semibold text-white"
              >
                Zu den News
              </Link>
              <Link
                href="/calendar"
                className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Kalender
              </Link>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Neueste News</div>
              <Link
                href="/news"
                className="text-sm font-semibold text-white/70 hover:text-white"
              >
                Alle
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {news.length === 0 ? (
                <div className="text-sm text-white/60">
                  Noch keine veröffentlichten News.
                </div>
              ) : (
                news.map((n) => (
                  <Link
                    key={n.id}
                    href={`/news/${n.slug}`}
                    className="block rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
                  >
                    <div className="font-semibold">{n.title}</div>
                    {n.excerpt ? (
                      <div className="mt-1 line-clamp-2 text-sm text-white/70">
                        {n.excerpt}
                      </div>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
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
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { href: "/mrl-one", label: "MRL One" },
            { href: "/mrl-two", label: "MRL Two" },
            { href: "/mrl-rookie", label: "MRL Rookie" }
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10"
            >
              <div className="text-lg font-semibold">{l.label}</div>
              <div className="mt-2 text-sm text-white/70">
                Fahrer · Ergebnisse · WM-Stand · Rennkalender
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </div>
  );
}
