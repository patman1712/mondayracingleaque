import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const leagueLabel: Record<string, string> = {
  ONE: "MRL One",
  TWO: "MRL Two",
  ROOKIE: "MRL Rookie"
};

export default async function CalendarPage() {
  type RaceItem = {
    id: string;
    league: string;
    season: number;
    round: number;
    name: string;
    circuit: string | null;
    startsAt: Date;
  };

  let races: RaceItem[] = [];
  try {
    races = await prisma.race.findMany({
      orderBy: [{ startsAt: "asc" }],
      take: 200,
      select: {
        id: true,
        league: true,
        season: true,
        round: true,
        name: true,
        circuit: true,
        startsAt: true
      }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">Kalender</div>
        <div className="mt-2 text-sm text-white/70">
          Rennen aller Ligen in einer Übersicht
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {races.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Noch keine Rennen im Kalender.
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
                {leagueLabel[r.league] ?? r.league} · Saison {r.season} · Runde{" "}
                {r.round}
                {r.circuit ? ` · ${r.circuit}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}
