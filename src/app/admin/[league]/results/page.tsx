import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export default async function AdminResultsPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  await requireAdmin();

  const { league } = await params;
  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;

  type RaceItem = {
    id: string;
    season: number;
    seasonNo: number;
    seasonIsTest: boolean;
    round: number;
    isSprint: boolean;
    name: string;
    startsAt: Date;
    resultsPublishedAt: Date | null;
    resultsImagePath: string | null;
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
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        isSprint: true,
        name: true,
        startsAt: true,
        resultsPublishedAt: true,
        resultsImagePath: true,
        _count: { select: { results: true } }
      }
    });
  } catch {}

  const groups = new Map<string, { label: string; races: RaceItem[] }>();
  for (const r of races) {
    const key = `${r.season}-${r.seasonNo}-${r.seasonIsTest ? "1" : "0"}`;
    const label = `${r.seasonIsTest ? "TEST · " : ""}Saison ${r.season} · Season ${r.seasonNo}`;
    const g = groups.get(key) ?? { label, races: [] as RaceItem[] };
    g.races.push(r);
    groups.set(key, g);
  }
  const orderedGroups = Array.from(groups.values());

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Ergebnisse · {cfg.name}</div>
        <div className="mt-2 text-sm text-white/70">
          Saison auswählen, dann Rennen anklicken und Ergebnis eintragen/auslesen + Stewards.
        </div>

        <div className="mt-4 space-y-5">
          {orderedGroups.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Rennen.</div>
          ) : (
            orderedGroups.map((g) => (
              <div key={g.label} className="rounded-2xl border border-white/10 bg-black/20">
                <div className="border-b border-white/10 px-5 py-4">
                  <div className="text-sm font-semibold text-white">
                    {g.label}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {g.races.length} Rennen
                  </div>
                </div>
                <div className="divide-y divide-white/10">
                  {g.races.map((r) => {
                    const posterUrl = imageUrl(r.resultsImagePath);
                    return (
                      <Link
                        key={r.id}
                        href={`/admin/${league}/results/${r.id}`}
                        className="grid gap-3 px-5 py-4 hover:bg-white/5 md:grid-cols-[140px_1fr_120px]"
                      >
                        <div className="hidden md:block">
                          {posterUrl ? (
                            <img
                              src={posterUrl}
                              alt=""
                              className="h-[78px] w-[140px] rounded-xl border border-white/10 object-cover"
                            />
                          ) : (
                            <div className="h-[78px] w-[140px] rounded-xl border border-white/10 bg-black/30" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white">
                            Runde {r.round} · {r.isSprint ? "SPRINT · " : ""}{r.name}
                            {r.resultsPublishedAt ? (
                              <span className="ml-2 text-xs font-semibold text-white/60">
                                (veröffentlicht)
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-sm text-white/60">
                            {new Date(r.startsAt).toLocaleString("de-DE")}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-white/70 md:text-right">
                          {r._count.results} Einträge
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
