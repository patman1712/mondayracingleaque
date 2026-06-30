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

function seasonKeyOf(r: { season: number; seasonNo: number; seasonIsTest: boolean }) {
  return `${r.season}-${r.seasonNo}-${r.seasonIsTest ? "1" : "0"}`;
}

function buildCreateHref(input: {
  adminLeague: string;
  race: {
    season: number;
    seasonNo: number;
    seasonIsTest: boolean;
    round: number;
    circuitId: string | null;
    circuit: string | null;
    location: string | null;
  };
  isSprint: boolean;
}) {
  const q = new URLSearchParams();
  q.set("seasonKey", seasonKeyOf(input.race));
  q.set("season", String(input.race.season));
  q.set("seasonNo", String(input.race.seasonNo));
  q.set("round", String(input.race.round));
  if (input.isSprint) q.set("isSprint", "1");
  if (input.race.circuitId) q.set("circuitId", input.race.circuitId);
  if (!input.race.circuitId && input.race.circuit) q.set("circuit", input.race.circuit);
  if (input.race.location) q.set("location", input.race.location);
  return `/admin/${input.adminLeague}/races?${q.toString()}`;
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
    circuitId: string | null;
    circuit: string | null;
    location: string | null;
    _count: { results: number };
  };

  let races: RaceItem[] = [];
  try {
    races = await prisma.race.findMany({
      where: { league: l },
      orderBy: [{ season: "desc" }, { round: "asc" }, { isSprint: "desc" }],
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
        circuitId: true,
        circuit: true,
        location: true,
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
                  {Array.from(
                    g.races.reduce((acc, r) => {
                      const round = r.round;
                      const current = acc.get(round) ?? { round, main: null as RaceItem | null, sprint: null as RaceItem | null };
                      if (r.isSprint) current.sprint = r;
                      else current.main = r;
                      acc.set(round, current);
                      return acc;
                    }, new Map<number, { round: number; main: RaceItem | null; sprint: RaceItem | null }>())
                  )
                    .map(([, v]) => v)
                    .sort((a, b) => a.round - b.round)
                    .map((roundGroup) => {
                    const representative = roundGroup.main ?? roundGroup.sprint;
                    if (!representative) return null;
                    const posterUrl = imageUrl((roundGroup.main ?? roundGroup.sprint)?.resultsImagePath);
                    const titleName = (roundGroup.main ?? roundGroup.sprint)?.name ?? "";
                    const startsAt = (roundGroup.main ?? roundGroup.sprint)?.startsAt ?? new Date();
                    const createMainHref = buildCreateHref({ adminLeague: league, race: representative, isSprint: false });
                    const createSprintHref = buildCreateHref({ adminLeague: league, race: representative, isSprint: true });

                    return (
                      <div
                        key={`round:${representative.season}-${representative.seasonNo}-${representative.seasonIsTest ? "1" : "0"}-${representative.round}`}
                        className="grid gap-3 px-5 py-4 hover:bg-white/5 md:grid-cols-[140px_1fr_220px]"
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
                            Runde {roundGroup.round} · {titleName}
                          </div>
                          <div className="mt-1 text-sm text-white/60">
                            {new Date(startsAt).toLocaleString("de-DE")}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                          {roundGroup.main ? (
                            <Link
                              href={`/admin/${league}/results/${roundGroup.main.id}`}
                              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/15"
                            >
                              Rennen · {roundGroup.main._count.results}
                              {roundGroup.main.resultsPublishedAt ? (
                                <span className="ml-2 text-white/60">(veröffentlicht)</span>
                              ) : null}
                            </Link>
                          ) : (
                            <Link
                              href={createMainHref}
                              className="rounded-lg bg-black/30 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-black/40"
                            >
                              Rennen anlegen
                            </Link>
                          )}

                          {roundGroup.sprint ? (
                            <Link
                              href={`/admin/${league}/results/${roundGroup.sprint.id}`}
                              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/15"
                            >
                              Sprint · {roundGroup.sprint._count.results}
                              {roundGroup.sprint.resultsPublishedAt ? (
                                <span className="ml-2 text-white/60">(veröffentlicht)</span>
                              ) : null}
                            </Link>
                          ) : (
                            <Link
                              href={createSprintHref}
                              className="rounded-lg bg-black/30 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-black/40"
                            >
                              Sprint anlegen
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })
                    .filter((x) => Boolean(x))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
