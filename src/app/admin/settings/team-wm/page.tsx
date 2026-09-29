import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { League } from "@prisma/client";
import { listAdminLeagues } from "@/lib/league";
import { getTeamWmSeasonId, setTeamWmSeasonId } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

const TARGET_LEAGUES: League[] = [League.ONE, League.TWO, League.THREE];

function seasonLabel(s: { id: string; year: number; seasonNo: number; placement: string; isTest: boolean; label: string | null }) {
  const name = s.label ? s.label : `Saison ${s.year} · Season ${s.seasonNo}`;
  const tags: string[] = [];
  if (s.isTest) tags.push("TEST");
  if (s.placement === "ARCHIVE") tags.push("Archiv");
  return tags.length ? `${name} · ${tags.join(" / ")}` : name;
}

async function saveTeamWmSeasons(formData: FormData) {
  "use server";
  await requireAdmin();

  const leaguesMeta = await listAdminLeagues();
  const slugByLeague = new Map(leaguesMeta.map((l) => [l.league, l.adminSlug]));

  for (const league of TARGET_LEAGUES) {
    const field = `season_${league}`;
    const raw = String(formData.get(field) ?? "").trim();
    const seasonId = raw === "__auto__" || raw === "" ? null : raw;

    if (seasonId) {
      const valid = await prisma.season
        .findUnique({ where: { id: seasonId }, select: { id: true, league: true } })
        .catch(() => null);
      if (!valid || valid.league !== league) {
        redirect(`/admin/settings/team-wm?error=invalid_${league}`);
      }
    }
    await setTeamWmSeasonId(league, seasonId);
  }

  revalidatePath("/team-wm");
  revalidatePath("/admin/settings/team-wm");
  for (const l of TARGET_LEAGUES) {
    const slug = slugByLeague.get(l);
    if (slug) {
      revalidatePath(`/admin/${slug}/settings`);
    }
  }
  redirect("/admin/settings/team-wm?ok=1");
}

async function resetTeamWmSeasons() {
  "use server";
  await requireAdmin();

  for (const league of TARGET_LEAGUES) {
    await setTeamWmSeasonId(league, null);
  }
  revalidatePath("/team-wm");
  revalidatePath("/admin/settings/team-wm");
  redirect("/admin/settings/team-wm?ok=reset");
}

export default async function AdminTeamWmSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const ok = sp.ok === "1" ? "Gespeichert." : sp.ok === "reset" ? "Auf Auto-Modus zurückgesetzt." : null;
  const error = sp.error ?? null;

  const leaguesMeta = await listAdminLeagues();
  const nameByLeague = new Map(leaguesMeta.map((l) => [l.league, l.name] as const));

  const seasonsByLeague = new Map<League, Array<{ id: string; year: number; seasonNo: number; placement: string; isTest: boolean; label: string | null }>>();
  for (const league of TARGET_LEAGUES) {
    const rows = await prisma.season
      .findMany({
        where: { league },
        orderBy: [{ placement: "asc" }, { year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
        select: { id: true, year: true, seasonNo: true, placement: true, isTest: true, label: true },
        take: 100
      })
      .catch(() => []);
    seasonsByLeague.set(league, rows);
  }

  const currentByLeague = new Map<League, string | null>();
  for (const league of TARGET_LEAGUES) {
    currentByLeague.set(league, await getTeamWmSeasonId(league));
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">MRL Team WM · Saison-Auswahl</div>
          <div className="mt-1 text-sm text-white/60">
            Wähle pro Liga manuell, welche Saison in die übergeordnete MRL Team WM einfließt.
            Ohne Auswahl wird automatisch die aktive Saison der Liga verwendet.
          </div>

          {ok ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {ok}
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              Fehlerhafte Saison-Auswahl ({error.toUpperCase().replace("_", " ")}).
            </div>
          ) : null}

          <form action={saveTeamWmSeasons} className="mt-5 space-y-5">
            {TARGET_LEAGUES.map((league) => {
              const leagueName = nameByLeague.get(league) ?? `MRL ${league}`;
              const seasons = seasonsByLeague.get(league) ?? [];
              const current = currentByLeague.get(league) ?? null;

              return (
                <div
                  key={league}
                  className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center"
                >
                  <div>
                    <div className="text-sm font-semibold text-white/85">{leagueName}</div>
                    <div className="text-xs text-white/50">Team-WM Saison auswählen</div>
                  </div>
                  <div className="space-y-2">
                    <select
                      name={`season_${league}`}
                      defaultValue={current ?? "__auto__"}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    >
                      <option value="__auto__">
                        ⟶ Automatisch (aktive Saison der Liga)
                      </option>
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {seasonLabel(s)}
                        </option>
                      ))}
                      {seasons.length === 0 ? (
                        <option disabled value="">
                          Keine Saisons vorhanden
                        </option>
                      ) : null}
                    </select>
                    {current ? (
                      <div className="text-xs text-white/50">
                        · Manuell festgelegt
                      </div>
                    ) : (
                      <div className="text-xs text-white/50">
                        · Auto-Modus: Verwendet die aktive Saison von /{leagueName.toLowerCase().replace(/\s+/g, "-")}/standings
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black outline-none hover:bg-white/90"
              >
                Speichern
              </button>
              <button
                type="submit"
                formAction={resetTeamWmSeasons}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 outline-none hover:bg-white/10"
              >
                Auf Auto-Modus zurücksetzen
              </button>
              <a
                href="/team-wm"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white/60 underline-offset-4 hover:text-white hover:underline"
              >
                Team-WM öffnen →
              </a>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
