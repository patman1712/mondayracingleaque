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

export default async function LeagueStandingsPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  type StandingRow = {
    driverId: string;
    points: number;
    name: string;
    number: number | null;
    team: string | null;
  };

  let standings: StandingRow[] = [];

  try {
    const rows = await prisma.raceResult.findMany({
      where: { race: { league: l } },
      select: {
        driverId: true,
        points: true,
        driver: { select: { name: true, number: true, team: true } }
      }
    });

    const byDriver = new Map<string, StandingRow>();
    for (const row of rows) {
      const current = byDriver.get(row.driverId);
      if (!current) {
        byDriver.set(row.driverId, {
          driverId: row.driverId,
          points: row.points,
          name: row.driver.name,
          number: row.driver.number,
          team: row.driver.team
        });
        continue;
      }
      current.points += row.points;
    }

    standings = Array.from(byDriver.values()).sort((a, b) => b.points - a.points);
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          WM Stand · {leagueLabel[l]}
        </div>
        <div className="mt-2 text-sm text-white/70">
          Punkte basieren auf den eingetragenen Ergebnissen
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
        <div className="grid grid-cols-[70px_1fr_120px] gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          <div>Pos.</div>
          <div>Fahrer</div>
          <div className="text-right">Punkte</div>
        </div>
        {standings.length === 0 ? (
          <div className="px-5 py-6 text-sm text-white/60">
            Noch keine Ergebnisse.
          </div>
        ) : (
          standings.map((s, idx) => (
            <div
              key={s.driverId}
              className="grid grid-cols-[70px_1fr_120px] gap-4 border-b border-white/10 px-5 py-4 last:border-b-0"
            >
              <div className="text-white/70">{idx + 1}</div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="truncate text-xs text-white/60">
                  {s.team ?? ""}
                </div>
              </div>
              <div className="text-right font-semibold">
                {s.points.toFixed(0)}
              </div>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}
