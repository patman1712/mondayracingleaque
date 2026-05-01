import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";

export const dynamic = "force-dynamic";

const leagueEnum: Record<string, League> = {
  one: League.ONE,
  two: League.TWO,
  rookie: League.ROOKIE
};

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
};

export default async function AdminResultsPage({
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
    startsAt: Date;
    _count: { results: number };
  };

  let races: RaceItem[] = [];
  try {
    races = await prisma.race.findMany({
      where: { league: l },
      orderBy: [{ season: "desc" }, { round: "asc" }],
      take: 120,
      select: {
        id: true,
        season: true,
        round: true,
        name: true,
        startsAt: true,
        _count: { select: { results: true } }
      }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">
          Ergebnisse · {leagueLabel[l]}
        </div>
        <div className="mt-2 text-sm text-white/70">
          Rennen auswählen und Resultate eintragen
        </div>

        <div className="mt-4 space-y-2">
          {races.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Rennen.</div>
          ) : (
            races.map((r) => (
              <Link
                key={r.id}
                href={`/admin/${league}/results/${r.id}`}
                className="flex flex-col justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    Saison {r.season} · Runde {r.round} · {r.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {new Date(r.startsAt).toLocaleString("de-DE")}
                  </div>
                </div>
                <div className="text-sm font-semibold text-white/70">
                  {r._count.results} Einträge
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
