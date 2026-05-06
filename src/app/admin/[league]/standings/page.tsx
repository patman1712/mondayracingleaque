import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { getActiveSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export default async function AdminStandingsPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  await requireAdmin();

  const { league } = await params;
  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;
  const season = await getActiveSeason({ league: l, select: { year: true, seasonNo: true, isTest: true } }).catch(() => null);
  if (!season) notFound();

  type StandingRow = {
    driverId: string;
    points: number;
    name: string;
    team: string | null;
  };

  let standings: StandingRow[] = [];

  try {
    const rows = await prisma.raceResult.findMany({
      where: { race: { league: l, season: season.year, seasonNo: season.seasonNo, seasonIsTest: season.isTest } },
      select: { driverId: true, points: true, driver: { select: { name: true, team: true } } }
    });

    const byDriver = new Map<string, StandingRow>();
    for (const row of rows) {
      const current = byDriver.get(row.driverId);
      if (!current) {
        byDriver.set(row.driverId, {
          driverId: row.driverId,
          points: row.points,
          name: row.driver.name,
          team: row.driver.team
        });
        continue;
      }
      current.points += row.points;
    }

    standings = Array.from(byDriver.values()).sort((a, b) => b.points - a.points);
  } catch {}

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">WM Stand · {cfg.name}</div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20">
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
      </div>
    </AdminShell>
  );
}
