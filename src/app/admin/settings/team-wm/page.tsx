import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { League } from "@prisma/client";
import { listAdminLeagues } from "@/lib/league";
import {
  getTeamWmSeasonId,
  setTeamWmSeasonId,
  getTeamWmEnabledLeagues,
  setTeamWmEnabledLeagues
} from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

function seasonLabel(s: {
  id: string;
  year: number;
  seasonNo: number;
  placement: string;
  isTest: boolean;
  label: string | null;
}) {
  const name = s.label ? s.label : `Saison ${s.year} · Season ${s.seasonNo}`;
  const tags: string[] = [];
  if (s.isTest) tags.push("TEST");
  if (s.placement === "ARCHIVE") tags.push("Archiv");
  return tags.length ? `${name} · ${tags.join(" / ")}` : name;
}

async function saveTeamWmConfig(formData: FormData) {
  "use server";
  await requireAdmin();

  const leaguesMeta = await listAdminLeagues();

  const enabledLeagues: League[] = [];
  for (const lm of leaguesMeta) {
    const enabled = String(formData.get(`enabled_${lm.league}`) ?? "0") === "1";
    if (enabled) enabledLeagues.push(lm.league);
  }
  if (enabledLeagues.length === 0) {
    redirect("/admin/settings/team-wm?error=no_leagues");
  }
  await setTeamWmEnabledLeagues(enabledLeagues);

  for (const lm of leaguesMeta) {
    const field = `season_${lm.league}`;
    const raw = String(formData.get(field) ?? "").trim();
    const seasonId = raw === "__auto__" || raw === "" ? null : raw;

    if (seasonId) {
      const valid = await prisma.season
        .findUnique({ where: { id: seasonId }, select: { id: true, league: true } })
        .catch(() => null);
      if (!valid || valid.league !== lm.league) {
        redirect(`/admin/settings/team-wm?error=invalid_${lm.league}`);
      }
    }
    await setTeamWmSeasonId(lm.league, seasonId);
  }

  revalidatePath("/team-wm");
  revalidatePath("/admin/settings/team-wm");
  for (const l of leaguesMeta) {
    revalidatePath(`/admin/${l.adminSlug}/settings`);
  }
  redirect("/admin/settings/team-wm?ok=1");
}

async function resetTeamWmConfig() {
  "use server";
  await requireAdmin();

  const leaguesMeta = await listAdminLeagues();
  for (const lm of leaguesMeta) {
    await setTeamWmSeasonId(lm.league, null);
  }
  await setTeamWmEnabledLeagues([League.ONE, League.TWO, League.THREE]);
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
  const ok =
    sp.ok === "1"
      ? "Gespeichert."
      : sp.ok === "reset"
        ? "Zurückgesetzt auf Standard (MRL One · MRL Two · MRL Three, Auto-Modus)."
        : null;
  const error = sp.error
    ? sp.error === "no_leagues"
      ? "Bitte mindestens eine Liga aktivieren."
      : `Fehlerhafte Saison-Auswahl (${sp.error.toUpperCase().replace("_", " ")}).`
    : null;

  const leaguesMeta = await listAdminLeagues();
  const enabled = await getTeamWmEnabledLeagues();
  const enabledSet = new Set(enabled);

  const seasonsByLeague = new Map<
    League,
    Array<{
      id: string;
      year: number;
      seasonNo: number;
      placement: string;
      isTest: boolean;
      label: string | null;
    }>
  >();
  for (const lm of leaguesMeta) {
    const rows = await prisma.season
      .findMany({
        where: { league: lm.league },
        orderBy: [
          { placement: "asc" },
          { year: "desc" },
          { seasonNo: "desc" },
          { isTest: "asc" }
        ],
        select: {
          id: true,
          year: true,
          seasonNo: true,
          placement: true,
          isTest: true,
          label: true
        },
        take: 120
      })
      .catch(() => []);
    seasonsByLeague.set(lm.league, rows);
  }

  const currentByLeague = new Map<League, string | null>();
  for (const lm of leaguesMeta) {
    currentByLeague.set(lm.league, await getTeamWmSeasonId(lm.league));
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">MRL Team WM · Konfiguration</div>
          <div className="mt-1 text-sm text-white/60">
            Aktiviere die Ligen, die in die übergeordnete MRL Team WM einfließen sollen, und
            wähle pro Liga die Saison (ohne Auswahl = automatisch die aktive Saison der Liga).
          </div>

          {ok ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {ok}
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <form action={saveTeamWmConfig} className="mt-5 space-y-5">
            {leaguesMeta.map((lm) => {
              const seasons = seasonsByLeague.get(lm.league) ?? [];
              const current = currentByLeague.get(lm.league) ?? null;
              const isEnabled = enabledSet.has(lm.league);

              return (
                <div
                  key={lm.league}
                  className={`rounded-xl border p-4 ${
                    isEnabled
                      ? "border-white/15 bg-black/10"
                      : "border-white/5 bg-black/5 opacity-75"
                  }`}
                >
                  <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
                    <div className="space-y-3">
                      <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          name={`enabled_${lm.league}`}
                          value="1"
                          defaultChecked={isEnabled}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          <div className="font-semibold text-white/85">{lm.name}</div>
                          <div className="text-[11px] text-white/50">
                            {lm.publicSlug} · {lm.league}
                          </div>
                        </span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs text-white/50">Team-WM Saison auswählen</div>
                      <select
                        name={`season_${lm.league}`}
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
                          · Auto-Modus: Verwendet die aktive Saison von /{lm.publicSlug}
                          /standings
                        </div>
                      )}
                    </div>
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
                formAction={resetTeamWmConfig}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 outline-none hover:bg-white/10"
              >
                Auf Standard zurücksetzen
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
