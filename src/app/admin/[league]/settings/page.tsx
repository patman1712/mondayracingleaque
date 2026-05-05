import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { leagueFromAdminSlug } from "@/lib/league";
import { League } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const publicSlug: Record<League, string> = {
  [League.ONE]: "mrl-one",
  [League.TWO]: "mrl-two",
  [League.ROOKIE]: "mrl-rookie"
};

function activeKey(league: League) {
  return `activeSeasonId:${league}`;
}

async function setActiveSeason(formData: FormData) {
  "use server";
  const leagueRaw = String(formData.get("league") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const league = leagueRaw === "ONE" ? League.ONE : leagueRaw === "TWO" ? League.TWO : leagueRaw === "ROOKIE" ? League.ROOKIE : null;
  if (!league) redirect("/admin?error=invalid");

  if (!seasonId) {
    await prisma.appConfig.delete({ where: { key: activeKey(league) } }).catch(() => null);
    revalidatePath(`/${publicSlug[league]}/calendar`);
    revalidatePath(`/${publicSlug[league]}/archive`);
    revalidatePath(`/${publicSlug[league]}/teams`);
    revalidatePath(`/${publicSlug[league]}/drivers`);
    redirect(`/admin/${league === League.ONE ? "one" : league === League.TWO ? "two" : "rookie"}/settings?ok=1`);
  }

  const season = await prisma.season
    .findUnique({
      where: { id: seasonId },
      select: { id: true, league: true, placement: true }
    })
    .catch(() => null);
  if (!season || season.league !== league) redirect(`/admin/${league === League.ONE ? "one" : league === League.TWO ? "two" : "rookie"}/settings?error=invalid`);
  if (season.placement !== "CALENDAR") redirect(`/admin/${league === League.ONE ? "one" : league === League.TWO ? "two" : "rookie"}/settings?error=not_calendar`);

  await prisma.appConfig.upsert({
    where: { key: activeKey(league) },
    create: { key: activeKey(league), value: season.id },
    update: { value: season.id }
  });

  revalidatePath(`/${publicSlug[league]}/calendar`);
  revalidatePath(`/${publicSlug[league]}/archive`);
  revalidatePath(`/${publicSlug[league]}/teams`);
  revalidatePath(`/${publicSlug[league]}/drivers`);
  redirect(`/admin/${league === League.ONE ? "one" : league === League.TWO ? "two" : "rookie"}/settings?ok=1`);
}

export default async function AdminLeagueSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { league } = await params;
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const l = leagueFromAdminSlug(league);
  if (!l) notFound();

  const seasons = await prisma.season
    .findMany({
      where: { league: l },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      take: 200,
      select: { id: true, year: true, seasonNo: true, isTest: true, placement: true, label: true }
    })
    .catch(() => []);

  const active = await prisma.appConfig
    .findUnique({ where: { key: activeKey(l) }, select: { value: true } })
    .catch(() => null);
  const activeId = active?.value ?? "";

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Einstellungen · Aktuelle Saison</div>
          <div className="mt-1 text-sm text-white/60">
            Diese Auswahl bestimmt die „aktuelle Saison“ für öffentliche Seiten und das Hover-Menü.
          </div>

          {ok ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Gespeichert.
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error === "not_calendar"
                ? "Als aktuelle Saison kann nur eine Saison im Liga-Kalender gesetzt werden."
                : "Speichern fehlgeschlagen."}
            </div>
          ) : null}

          <form action={setActiveSeason} className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <input type="hidden" name="league" value={l} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Aktuelle Saison</label>
              <select
                name="seasonId"
                defaultValue={activeId}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="">(Auto · neueste Kalender-Saison)</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.placement === "ARCHIVE" ? "ARCHIV · " : ""}
                    {s.isTest ? "TEST · " : ""}
                    {s.year} · Season {s.seasonNo}
                    {s.label ? ` · ${s.label}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Speichern
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}

