import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { League } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { applyRaceScoring, getLeagueScoring, setLeagueScoring } from "@/lib/scoring";

export const dynamic = "force-dynamic";

function activeKey(league: League) {
  return `activeSeasonId:${league}`;
}

function liveTimingLeagueKeyKey(publicSlug: string) {
  return `liveTimingLeagueKeyForPublicSlug:${publicSlug}`;
}

function isLeagueValue(input: string): input is League {
  return (Object.values(League) as string[]).includes(input);
}

function fallbackSlugsFor(league: League) {
  if (league === League.ONE) return { adminSlug: "one", publicSlug: "mrl-one" };
  if (league === League.TWO) return { adminSlug: "two", publicSlug: "mrl-two" };
  return { adminSlug: "rookie", publicSlug: "mrl-rookie" };
}

async function saveSprintScoring(formData: FormData) {
  "use server";
  const leagueRaw = String(formData.get("league") ?? "");
  const adminSlug = String(formData.get("adminSlug") ?? "").trim();
  const publicSlug = String(formData.get("publicSlug") ?? "").trim();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const enabled = formData.get("sprintEnabled") === "on";
  if (!isLeagueValue(leagueRaw) || !adminSlug || !publicSlug || !seasonId) {
    redirect(`/admin/${adminSlug || "one"}/settings?error=invalid`);
  }
  const league = leagueRaw;

  const season = await prisma.season
    .findUnique({ where: { id: seasonId }, select: { id: true, league: true, year: true, seasonNo: true, isTest: true } })
    .catch(() => null);
  if (!season || season.league !== league) redirect(`/admin/${adminSlug}/settings?error=invalid`);

  const leagueScoring = await getLeagueScoring(prisma, league).catch(() => null);
  const size = leagueScoring?.fieldSize ?? 20;
  const points: number[] = [];
  for (let i = 1; i <= size; i++) {
    const raw = String(formData.get(`sp${i}`) ?? "").trim();
    const v = raw === "" ? 0 : Number(raw);
    points.push(Number.isFinite(v) ? Math.max(0, Number(v)) : 0);
  }

  await prisma.season
    .update({
      where: { id: season.id },
      data: { sprintPointsByPositionJson: enabled ? JSON.stringify(points) : null }
    })
    .catch(() => null);

  const sprintRaces = await prisma.race
    .findMany({
      where: { league, season: season.year, seasonNo: season.seasonNo, seasonIsTest: season.isTest, isSprint: true },
      select: { id: true },
      take: 5000
    })
    .catch(() => []);

  for (const r of sprintRaces) {
    await applyRaceScoring(prisma, r.id).catch(() => null);
  }

  revalidatePath(`/admin/${adminSlug}/settings`);
  revalidatePath(`/admin/${adminSlug}/results`);
  revalidatePath(`/admin/${adminSlug}/standings`);
  revalidatePath(`/${publicSlug}/standings`);
  revalidatePath(`/${publicSlug}/results`);
  redirect(`/admin/${adminSlug}/settings?ok=1`);
}

async function setActiveSeason(formData: FormData) {
  "use server";
  const leagueRaw = String(formData.get("league") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!isLeagueValue(leagueRaw)) redirect("/admin?error=invalid");
  const league = leagueRaw;

  const slugs =
    (await prisma.leagueConfig
      .findUnique({ where: { league }, select: { adminSlug: true, publicSlug: true } })
      .catch(() => null)) ?? fallbackSlugsFor(league);

  if (!seasonId) {
    await prisma.appConfig.delete({ where: { key: activeKey(league) } }).catch(() => null);
    revalidatePath(`/${slugs.publicSlug}/calendar`);
    revalidatePath(`/${slugs.publicSlug}/archive`);
    revalidatePath(`/${slugs.publicSlug}/teams`);
    revalidatePath(`/${slugs.publicSlug}/drivers`);
    redirect(`/admin/${slugs.adminSlug}/settings?ok=1`);
  }

  const season = await prisma.season
    .findUnique({
      where: { id: seasonId },
      select: { id: true, league: true, placement: true }
    })
    .catch(() => null);
  if (!season || season.league !== league) redirect(`/admin/${slugs.adminSlug}/settings?error=invalid`);
  if (season.placement !== "CALENDAR") redirect(`/admin/${slugs.adminSlug}/settings?error=not_calendar`);

  await prisma.appConfig.upsert({
    where: { key: activeKey(league) },
    create: { key: activeKey(league), value: season.id },
    update: { value: season.id }
  });

  revalidatePath(`/${slugs.publicSlug}/calendar`);
  revalidatePath(`/${slugs.publicSlug}/archive`);
  revalidatePath(`/${slugs.publicSlug}/teams`);
  revalidatePath(`/${slugs.publicSlug}/drivers`);
  redirect(`/admin/${slugs.adminSlug}/settings?ok=1`);
}

async function saveScoring(formData: FormData) {
  "use server";
  const leagueRaw = String(formData.get("league") ?? "");
  if (!isLeagueValue(leagueRaw)) redirect("/admin?error=invalid");
  const league = leagueRaw;

  const slugs =
    (await prisma.leagueConfig
      .findUnique({ where: { league }, select: { adminSlug: true, publicSlug: true } })
      .catch(() => null)) ?? fallbackSlugsFor(league);

  const fieldRaw = String(formData.get("fieldSize") ?? "").trim();
  const fieldSize = Number(fieldRaw);
  if (!Number.isFinite(fieldSize)) redirect(`/admin/${slugs.adminSlug}/settings?error=invalid`);

  const size = Math.max(1, Math.min(60, Math.floor(fieldSize)));
  const points: number[] = [];
  for (let i = 1; i <= size; i++) {
    const raw = String(formData.get(`p${i}`) ?? "").trim();
    const v = raw === "" ? 0 : Number(raw);
    points.push(Number.isFinite(v) ? Math.max(0, Number(v)) : 0);
  }

  await setLeagueScoring(prisma, league, { fieldSize: size, pointsByPosition: points }).catch(() => null);
  const races = await prisma.race.findMany({ where: { league }, select: { id: true }, take: 5000 }).catch(() => []);
  for (const r of races) {
    await applyRaceScoring(prisma, r.id).catch(() => null);
  }

  revalidatePath(`/admin/${slugs.adminSlug}/settings`);
  revalidatePath(`/admin/${slugs.adminSlug}/results`);
  revalidatePath(`/admin/${slugs.adminSlug}/standings`);
  revalidatePath(`/${slugs.publicSlug}/standings`);
  revalidatePath(`/${slugs.publicSlug}/results`);
  redirect(`/admin/${slugs.adminSlug}/settings?ok=1`);
}

async function setLiveTimingLeagueKey(formData: FormData) {
  "use server";
  const adminSlug = String(formData.get("adminSlug") ?? "").trim();
  const publicSlug = String(formData.get("publicSlug") ?? "").trim();
  const raw = String(formData.get("liveTimingLeagueKey") ?? "").trim().toLowerCase();
  if (!adminSlug || !publicSlug) redirect("/admin?error=invalid");

  const allowed = new Set(["liga-one", "liga-two", "rookie", "one-mini-wm", "two-mini-wm"]);
  const value = allowed.has(raw) ? raw : "";
  const key = liveTimingLeagueKeyKey(publicSlug);

  if (!value) {
    await prisma.appConfig.delete({ where: { key } }).catch(() => null);
    revalidatePath(`/${publicSlug}/tv`);
    redirect(`/admin/${adminSlug}/settings?ok=1`);
  }

  await prisma.appConfig
    .upsert({
      where: { key },
      create: { key, value },
      update: { value }
    })
    .catch(() => null);
  revalidatePath(`/${publicSlug}/tv`);
  redirect(`/admin/${adminSlug}/settings?ok=1`);
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

  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;

  const seasons = await prisma.season
    .findMany({
      where: { league: l },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      take: 200,
      select: { id: true, year: true, seasonNo: true, isTest: true, placement: true, label: true, sprintPointsByPositionJson: true }
    })
    .catch(() => []);

  const active = await prisma.appConfig
    .findUnique({ where: { key: activeKey(l) }, select: { value: true } })
    .catch(() => null);
  const activeId = active?.value ?? "";
  const selectedSeason =
    seasons.find((s) => s.id === activeId) ??
    seasons.find((s) => s.placement === "CALENDAR" && !s.isTest) ??
    seasons.find((s) => s.placement === "CALENDAR") ??
    seasons[0] ??
    null;
  const liveTimingKeyRow = await prisma.appConfig
    .findUnique({ where: { key: liveTimingLeagueKeyKey(cfg.publicSlug) }, select: { value: true } })
    .catch(() => null);
  const liveTimingLeagueKey = (liveTimingKeyRow?.value ?? "").trim();
  const scoring = await getLeagueScoring(prisma, l).catch(() => ({
    fieldSize: 20,
    pointsByPosition: Array.from({ length: 20 }).map(() => 0)
  }));
  const sprintPointsRaw = (selectedSeason?.sprintPointsByPositionJson ?? "").trim();
  let sprintEnabled = false;
  let sprintPointsByPosition: number[] = Array.from({ length: scoring.fieldSize }).map(() => 0);
  if (sprintPointsRaw) {
    try {
      const parsed = JSON.parse(sprintPointsRaw) as unknown;
      if (Array.isArray(parsed)) {
        sprintEnabled = true;
        const clean = parsed
          .map((v) => (v == null || String(v).trim() === "" ? 0 : Number(v)))
          .map((v) => (Number.isFinite(v) ? Math.max(0, Number(v)) : 0))
          .slice(0, scoring.fieldSize);
        while (clean.length < scoring.fieldSize) clean.push(0);
        sprintPointsByPosition = clean;
      }
    } catch {}
  }

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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Einstellungen · WM Punkte</div>
          <div className="mt-1 text-sm text-white/60">
            Anzahl Fahrer im Feld und Punktevergabe pro Platz. Diese Punkte werden beim Speichern von Ergebnissen automatisch vergeben.
          </div>

          <form action={saveScoring} className="mt-4 space-y-4">
            <input type="hidden" name="league" value={l} />

            <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-start">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Fahrerfeld (Anzahl)</label>
                <input
                  name="fieldSize"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  defaultValue={scoring.fieldSize}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
                <div className="mt-1 text-xs text-white/60">Nach Änderung erneut speichern, um die Punkte-Liste anzupassen.</div>
              </div>

              <div>
                <div className="mb-1 block text-xs font-semibold text-white/70">Punkte pro Platz</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: scoring.fieldSize }).map((_, idx) => {
                    const pos = idx + 1;
                    return (
                      <div key={pos} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="w-10 shrink-0 text-xs font-semibold text-white/70">P{pos}</div>
                        <input
                          name={`p${pos}`}
                          type="number"
                          min={0}
                          step={0.5}
                          defaultValue={scoring.pointsByPosition[idx] ?? 0}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">Speichern</button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Einstellungen · Sprint Punkte</div>
          <div className="mt-1 text-sm text-white/60">
            Punktevergabe für Sprint-Rennen dieser Saison (Platz 1..n). Leeres Feld bedeutet: Sprint nutzt die normale WM-Punktevergabe.
          </div>

          {selectedSeason ? (
            <form action={saveSprintScoring} className="mt-4 space-y-4">
              <input type="hidden" name="league" value={l} />
              <input type="hidden" name="adminSlug" value={cfg.adminSlug} />
              <input type="hidden" name="publicSlug" value={cfg.publicSlug} />
              <input type="hidden" name="seasonId" value={selectedSeason.id} />

              <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-start">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">
                    Saison
                  </label>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/85">
                    {selectedSeason.isTest ? "TEST · " : ""}{selectedSeason.year} · Season {selectedSeason.seasonNo}
                    {selectedSeason.label ? ` · ${selectedSeason.label}` : ""}
                  </div>

                  <label className="mt-3 flex w-fit items-center gap-2 text-sm text-white/80">
                    <input
                      name="sprintEnabled"
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-white/5"
                      defaultChecked={sprintEnabled}
                    />
                    Eigene Sprint-Punkte verwenden
                  </label>
                  <div className="mt-1 text-xs text-white/60">
                    Wenn deaktiviert, nutzt Sprint die normalen WM Punkte.
                  </div>
                </div>

                <div>
                  <div className="mb-1 block text-xs font-semibold text-white/70">Punkte pro Platz</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: scoring.fieldSize }).map((_, idx) => {
                      const pos = idx + 1;
                      return (
                        <div key={pos} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                          <div className="w-10 shrink-0 text-xs font-semibold text-white/70">P{pos}</div>
                          <input
                            name={`sp${pos}`}
                            type="number"
                            min={0}
                            step={0.5}
                            defaultValue={sprintPointsByPosition[idx] ?? 0}
                            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">Speichern</button>
            </form>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
              Keine Saison vorhanden.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Einstellungen · Live Timing</div>
          <div className="mt-1 text-sm text-white/60">
            Welche Live-Timing-Quelle auf der öffentlichen TV-Seite dieser Liga verwendet wird.
          </div>

          <form action={setLiveTimingLeagueKey} className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <input type="hidden" name="adminSlug" value={cfg.adminSlug} />
            <input type="hidden" name="publicSlug" value={cfg.publicSlug} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Live Timing Quelle</label>
              <select
                name="liveTimingLeagueKey"
                defaultValue={liveTimingLeagueKey}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="">(Auto / Default)</option>
                <option value="liga-one">Liga One</option>
                <option value="liga-two">Liga Two</option>
                <option value="rookie">Rookie</option>
                <option value="one-mini-wm">MRL One Mini WM</option>
                <option value="two-mini-wm">MRL Two Mini WM</option>
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
