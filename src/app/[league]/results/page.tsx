import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { resolveLeagueByPublicSlug } from "@/lib/league";

export const dynamic = "force-dynamic";

export default async function LeagueResultsPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const cfg = await resolveLeagueByPublicSlug(league);
  if (!cfg || !cfg.isActive) notFound();
  const l = cfg.league;

  type ResultRow = {
    id: string;
    position: number;
    points: number;
    status: string | null;
    driver: { name: string; number: number | null; team: string | null };
  };

  type RaceWithResults = {
    id: string;
    season: number;
    round: number;
    name: string;
    startsAt: Date;
    results: ResultRow[];
  };

  let races: RaceWithResults[] = [];
  try {
    races = await prisma.race.findMany({
      where: { league: l },
      orderBy: [{ season: "desc" }, { round: "asc" }],
      take: 60,
      select: {
        id: true,
        season: true,
        round: true,
        name: true,
        startsAt: true,
        results: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            points: true,
            status: true,
            driver: { select: { name: true, number: true, team: true } }
          }
        }
      }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          Ergebnisse · {cfg.name}
        </div>
        <div className="mt-2 text-sm text-white/70">
          Rennen und Resultate der Liga
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {races.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Noch keine Rennen.
          </div>
        ) : (
          races.map((race) => (
            <div
              key={race.id}
              className="rounded-2xl border border-white/10 bg-white/5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
                <div className="text-lg font-semibold">{race.name}</div>
                <div className="text-sm text-white/60">
                  Saison {race.season} · Runde {race.round} ·{" "}
                  {new Date(race.startsAt).toLocaleDateString("de-DE")}
                </div>
              </div>

              {race.results.length === 0 ? (
                <div className="px-5 py-5 text-sm text-white/60">
                  Noch keine Ergebnisse.
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {race.results.map((r) => (
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
          ))
        )}
      </div>
    </Container>
  );
}
