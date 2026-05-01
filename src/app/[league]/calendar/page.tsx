import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { League } from "@prisma/client";

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
    round: number;
    name: string;
    circuit: string | null;
    location: string | null;
    startsAt: Date;
  };

  let races: RaceItem[] = [];
  try {
    races = await prisma.race.findMany({
      where: { league: l },
      orderBy: [{ startsAt: "asc" }],
      take: 200,
      select: {
        id: true,
        season: true,
        round: true,
        name: true,
        circuit: true,
        location: true,
        startsAt: true
      }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          Rennkalender · {leagueLabel[l]}
        </div>
        <div className="mt-2 text-sm text-white/70">Alle Rennen der Liga</div>
      </div>

      <div className="mt-6 space-y-3">
        {races.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Noch keine Rennen eingetragen.
          </div>
        ) : (
          races.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-lg font-semibold">{r.name}</div>
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
              <div className="mt-1 text-sm text-white/70">
                Saison {r.season} · Runde {r.round}
                {r.circuit ? ` · ${r.circuit}` : ""}
                {r.location ? ` · ${r.location}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}
