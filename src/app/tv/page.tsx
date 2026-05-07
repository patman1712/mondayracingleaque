import { Container } from "@/components/Container";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { listPublicLeagues } from "@/lib/league";
import { League, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

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

export default async function TvIndexPage() {
  const leagues = await listPublicLeagues();
  const activeLeagues = leagues.map((l) => l.league);
  const meta = new Map(
    leagues.map((l) => [
      l.league,
      { publicSlug: l.publicSlug, name: l.name, accentColor: l.accentColor }
    ])
  );

  const now = new Date();
  const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

  const select = {
    id: true,
    league: true,
    name: true,
    round: true,
    startsAt: true,
    seasonIsTest: true
  } satisfies Prisma.RaceSelect;

  type RaceCard = Prisma.RaceGetPayload<{ select: typeof select }>;

  const races = await prisma.race
    .findMany({
      where: { league: { in: activeLeagues }, startsAt: { gte: windowStart, lte: windowEnd } },
      orderBy: [{ startsAt: "desc" }],
      take: 80,
      select
    })
    .catch((): RaceCard[] => []);

  const byLeague = new Map<League, RaceCard[]>();
  for (const r of races) {
    const list = byLeague.get(r.league) ?? [];
    list.push(r);
    byLeague.set(r.league, list);
  }

  const items = Array.from(byLeague.entries())
    .map(([league, list]) => {
      const preferred = list.find((r) => !r.seasonIsTest) ?? list[0] ?? null;
      if (!preferred) return null;
      const m = meta.get(league);
      if (!m) return null;
      return {
        leagueSlug: m.publicSlug,
        leagueLabel: m.name,
        accent: m.accentColor,
        race: {
          id: preferred.id,
          title: preferred.name,
          round: preferred.round,
          startsAtMs: new Date(preferred.startsAt).getTime()
        }
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .sort((a, b) => b.race.startsAtMs - a.race.startsAtMs);

  if (items.length === 1) {
    return (
      <Container>
        <div className="mt-10 rounded-3xl border border-white/10 bg-black/30 p-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
            MRL TV
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            Weiterleitung…
          </div>
          <div className="mt-4">
            <Link
              href={`/${items[0].leagueSlug}/tv`}
              className="inline-flex rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              Öffnen →
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold text-white">MRL TV</div>
            <div className="mt-2 text-sm text-white/70">
              Livefenster: 30 Minuten vor Start bis 3 Stunden nach Start
            </div>
          </div>
          <div className="rounded-full bg-mrl-red/20 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-white">
            On Air
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-8 text-white/70">
          Aktuell ist kein Rennen im Livefenster.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {items.map((it) => (
            <Link
              key={it.leagueSlug}
              href={`/${it.leagueSlug}/tv`}
              className="group relative overflow-hidden rounded-3xl border border-white/10 p-6"
              style={{ backgroundImage: heroBg(it.accent) }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-25" style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/75" />
              <div className="pointer-events-none absolute left-0 top-0 h-[6px] w-full" style={{ backgroundColor: it.accent }} />

              <div className="relative">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  {it.leagueLabel} · ROUND {it.race.round}
                </div>
                <div className="mt-2 text-2xl font-extrabold text-white group-hover:underline">
                  {it.race.title}
                </div>
                <div className="mt-3 text-sm text-white/70">
                  {new Date(it.race.startsAtMs).toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}

