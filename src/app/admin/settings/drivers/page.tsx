import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { ensureReserveTeam } from "@/lib/reserveTeam";
import { DriverRole, DriverStatus, League } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeagueMeta = {
  league: League;
  adminSlug: string;
  publicSlug: string;
  name: string;
};

const fallbackLeagues: LeagueMeta[] = [
  { league: League.ONE, adminSlug: "one", publicSlug: "mrl-one", name: "MRL One" },
  { league: League.TWO, adminSlug: "two", publicSlug: "mrl-two", name: "MRL Two" },
  { league: League.ROOKIE, adminSlug: "rookie", publicSlug: "mrl-rookie", name: "MRL Rookie" }
];

async function listLeagueMeta(): Promise<LeagueMeta[]> {
  const rows = await prisma.leagueConfig
    .findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { league: true, adminSlug: true, publicSlug: true, name: true }
    })
    .catch(() => []);
  return rows.length ? rows : fallbackLeagues;
}

async function metaForLeague(league: League): Promise<LeagueMeta | null> {
  const row = await prisma.leagueConfig
    .findUnique({
      where: { league },
      select: { league: true, adminSlug: true, publicSlug: true, name: true }
    })
    .catch(() => null);
  if (row) return row;
  return fallbackLeagues.find((l) => l.league === league) ?? null;
}

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function dataRootDir() {
  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return railwayMount;
  return path.join(process.cwd(), "data");
}

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  return null;
}

function asUploadFile(v: unknown): File | null {
  if (!v || typeof v !== "object") return null;
  const f = v as { arrayBuffer?: unknown; size?: unknown; type?: unknown };
  if (typeof f.arrayBuffer !== "function") return null;
  if (typeof f.size !== "number") return null;
  if (typeof f.type !== "string") return null;
  return v as File;
}

async function writeUpload(fileName: string, file: File) {
  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
}

async function createDriver(formData: FormData) {
  "use server";
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const gamertag = String(formData.get("gamertag") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const numberRaw = String(formData.get("number") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const portrait = asUploadFile(formData.get("portrait"));
  const startsRaw = String(formData.get("starts") ?? "").trim();
  const winsRaw = String(formData.get("wins") ?? "").trim();
  const podiumsRaw = String(formData.get("podiums") ?? "").trim();
  const driverOfDayRaw = String(formData.get("driverOfDay") ?? "").trim();
  const driverTitlesRaw = String(formData.get("driverTitles") ?? "").trim();
  const constructorTitlesRaw = String(formData.get("constructorTitles") ?? "").trim();

  if (!gamertag) return;
  const finalName = name || gamertag;
  const status = statusRaw === "RETIRED" ? DriverStatus.RETIRED : DriverStatus.ACTIVE;

  const number = numberRaw ? Number(numberRaw) : null;
  const starts = startsRaw ? Number(startsRaw) : 0;
  const wins = winsRaw ? Number(winsRaw) : 0;
  const podiums = podiumsRaw ? Number(podiumsRaw) : 0;
  const driverOfDay = driverOfDayRaw ? Number(driverOfDayRaw) : 0;
  const driverTitles = driverTitlesRaw ? Number(driverTitlesRaw) : 0;
  const constructorTitles = constructorTitlesRaw ? Number(constructorTitlesRaw) : 0;

  const created = await prisma.driver.create({
    data: {
      name: finalName,
      gamertag,
      status,
      number: Number.isFinite(number) ? (number as number) : null,
      country: country || null,
      starts: Number.isFinite(starts) ? (starts as number) : 0,
      wins: Number.isFinite(wins) ? (wins as number) : 0,
      podiums: Number.isFinite(podiums) ? (podiums as number) : 0,
      driverOfDay: Number.isFinite(driverOfDay) ? (driverOfDay as number) : 0,
      driverTitles: Number.isFinite(driverTitles) ? (driverTitles as number) : 0,
      constructorTitles: Number.isFinite(constructorTitles) ? (constructorTitles as number) : 0
    },
    select: { id: true }
  });

  if (portrait && portrait.size > 0) {
    if (portrait.size > 8_000_000) return;
    const ext = extFromMime(portrait.type);
    if (!ext) return;
    const fileName = `driver-portrait-${created.id}-${Date.now()}.${ext}`;
    await writeUpload(fileName, portrait);
    await prisma.driver.update({ where: { id: created.id }, data: { portraitPath: fileName } }).catch(() => null);
  }

  revalidatePath("/admin/settings/drivers");
  const leagues = await listLeagueMeta();
  for (const l of leagues) {
    revalidatePath(`/admin/${l.adminSlug}/drivers`);
    revalidatePath(`/admin/${l.adminSlug}/drivers/${created.id}`);
    revalidatePath(`/${l.publicSlug}/drivers`);
    revalidatePath(`/${l.publicSlug}/drivers/${created.id}`);
  }
}

async function activateDriver(formData: FormData) {
  "use server";
  await requireAdmin();

  const driverId = String(formData.get("driverId") ?? "").trim();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "").trim();
  const role = roleRaw === "RESERVE" ? DriverRole.RESERVE : DriverRole.MAIN;
  const teamIdRaw = String(formData.get("teamId") ?? "").trim();
  const teamId = teamIdRaw ? teamIdRaw : null;
  if (!driverId || !seasonId) redirect("/admin/settings/drivers?error=invalid");

  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, league: true } }).catch(() => null);
  if (!season) redirect("/admin/settings/drivers?error=invalid");

  const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } }).catch(() => null);
  if (!driver) redirect("/admin/settings/drivers?error=invalid");

  const t =
    role === DriverRole.RESERVE
      ? await ensureReserveTeam(season.league).catch(() => null)
      : teamId
        ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }).catch(() => null)
        : null;

  await prisma.driverSeason
    .upsert({
      where: { driverId_seasonId: { driverId, seasonId } },
      create: { driverId, seasonId, role, teamId: t?.id ?? null },
      update: { role, teamId: t?.id ?? null }
    })
    .catch(() => null);

  revalidatePath("/admin/settings/drivers");
  const m = await metaForLeague(season.league);
  if (m) {
    revalidatePath(`/admin/${m.adminSlug}/drivers`);
    revalidatePath(`/admin/${m.adminSlug}/drivers/${driverId}`);
    revalidatePath(`/${m.publicSlug}/drivers`);
    revalidatePath(`/${m.publicSlug}/drivers/${driverId}`);
  }
  redirect("/admin/settings/drivers?ok=1");
}

async function deactivateDriver(formData: FormData) {
  "use server";
  await requireAdmin();

  const driverId = String(formData.get("driverId") ?? "").trim();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  if (!driverId || !seasonId) redirect("/admin/settings/drivers?error=invalid");

  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { league: true } }).catch(() => null);
  if (!season) redirect("/admin/settings/drivers?error=invalid");

  await prisma.driverSeason.deleteMany({ where: { driverId, seasonId } }).catch(() => null);

  revalidatePath("/admin/settings/drivers");
  const m = await metaForLeague(season.league);
  if (m) {
    revalidatePath(`/admin/${m.adminSlug}/drivers`);
    revalidatePath(`/admin/${m.adminSlug}/drivers/${driverId}`);
    revalidatePath(`/${m.publicSlug}/drivers`);
    revalidatePath(`/${m.publicSlug}/drivers/${driverId}`);
  }
  redirect("/admin/settings/drivers?ok=1");
}

export default async function AdminSettingsDriversPage() {
  await requireAdmin();

  const leagueMeta = await listLeagueMeta();
  const labelByLeague = new Map(leagueMeta.map((l) => [l.league, l.name] as const));
  const adminSlugByLeague = new Map(leagueMeta.map((l) => [l.league, l.adminSlug] as const));

  const seasons = await prisma.season
    .findMany({
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }, { league: "asc" }],
      take: 500,
      select: { id: true, league: true, year: true, seasonNo: true, isTest: true, placement: true }
    })
    .catch(() => []);

  const teams = await prisma.team
    .findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
      take: 500
    })
    .catch(() => []);

  const drivers = await prisma.driver
    .findMany({
      orderBy: [{ name: "asc" }],
      take: 2000,
      select: {
        id: true,
        name: true,
        gamertag: true,
        status: true,
        number: true,
        country: true,
        team: true,
        seasons: { select: { seasonId: true, role: true, teamId: true, teamRef: { select: { name: true } } } }
      }
    })
    .catch(() => []);

  const seasonById = new Map(seasons.map((s) => [s.id, s] as const));
  const seasonsByLeague = new Map<League, typeof seasons>();
  for (const s of seasons) {
    const list = seasonsByLeague.get(s.league) ?? [];
    list.push(s);
    seasonsByLeague.set(s.league, list);
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Fahrer anlegen</div>
          <form action={createDriver} encType="multipart/form-data" className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 text-sm text-white/60">
              Fahrer wird nur 1x global angelegt. Gamertag reicht, alle anderen Felder sind optional. Ligen/Saisons + Stamm/Ersatz + Team stellst du danach unter dem Fahrer ein.
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Gamertag</label>
              <input
                name="gamertag"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Name (optional)</label>
              <input
                name="name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Status</label>
              <select
                name="status"
                defaultValue="ACTIVE"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="ACTIVE">Aktiv</option>
                <option value="RETIRED">In Rente</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Nationalität</label>
              <input
                name="country"
                placeholder="DE, AT, CH ..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Fahrernummer</label>
              <input
                name="number"
                inputMode="numeric"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Fahrerbild (PNG)</label>
              <input
                name="portrait"
                type="file"
                accept="image/png"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="md:col-span-2 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Rennstarts</label>
                <input
                  name="starts"
                  inputMode="numeric"
                  defaultValue="0"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Siege</label>
                <input
                  name="wins"
                  inputMode="numeric"
                  defaultValue="0"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Podien</label>
                <input
                  name="podiums"
                  inputMode="numeric"
                  defaultValue="0"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Fahrer des Tages</label>
                <input
                  name="driverOfDay"
                  inputMode="numeric"
                  defaultValue="0"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Fahrer WM Titel</label>
                <input
                  name="driverTitles"
                  inputMode="numeric"
                  defaultValue="0"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Konstrukteurs WM Titel</label>
                <input
                  name="constructorTitles"
                  inputMode="numeric"
                  defaultValue="0"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Anlegen
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Fahrer</div>
          <div className="mt-4 space-y-2">
            {drivers.length === 0 ? (
              <div className="text-sm text-white/60">Noch keine Fahrer.</div>
            ) : (
              drivers.map((d) => (
                (() => {
                  const activeLeagues = Array.from(
                    new Set(
                      d.seasons
                        .map((s) => seasonById.get(s.seasonId)?.league ?? null)
                        .filter((x): x is League => Boolean(x))
                    )
                  );
                  return (
                    <div
                      key={d.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {d.number ? `#${d.number} ` : ""}
                          {d.name}
                          {d.status === "RETIRED" ? " · (Rente)" : ""}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          {d.gamertag ? `${d.gamertag} · ` : ""}
                          {d.team ?? "-"} {d.country ? `· ${d.country}` : ""}
                          {activeLeagues.length
                            ? ` · Ligen: ${activeLeagues
                                .map((l) => labelByLeague.get(l) ?? String(l))
                                .join(", ")}`
                            : ""}
                        </div>

                        <details className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-white/70">
                            Ligen / Saisons
                          </summary>

                          <div className="mt-3 grid gap-4 md:grid-cols-3">
                            {leagueMeta.map((lm) => {
                              const lg = lm.league;
                              const seasonOptions = seasonsByLeague.get(lg) ?? [];
                              const activeSeasons = d.seasons
                                .map((s) => ({ row: s, season: seasonById.get(s.seasonId) ?? null }))
                                .filter((x) => x.season?.league === lg);

                              return (
                                <div key={lg} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                                    {labelByLeague.get(lg) ?? String(lg)}
                                  </div>

                                  <form action={activateDriver} className="mt-2 grid gap-2">
                                    <input type="hidden" name="driverId" value={d.id} />
                                    <input type="hidden" name="role" value="MAIN" />
                                    <select
                                      name="seasonId"
                                      defaultValue=""
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
                                    >
                                      <option value="">Saison wählen…</option>
                                      {seasonOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.placement === "ARCHIVE" ? "ARCHIV · " : ""}
                                          {s.isTest ? "TEST · " : ""}
                                          {s.year} · Season {s.seasonNo}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      name="teamId"
                                      defaultValue=""
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
                                    >
                                      <option value="">Team (optional)</option>
                                      {teams.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                                      Als Stammfahrer aktivieren
                                    </button>
                                  </form>

                                  <form action={activateDriver} className="mt-2 grid gap-2">
                                    <input type="hidden" name="driverId" value={d.id} />
                                    <input type="hidden" name="role" value="RESERVE" />
                                    <select
                                      name="seasonId"
                                      defaultValue=""
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
                                    >
                                      <option value="">Saison wählen…</option>
                                      {seasonOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.placement === "ARCHIVE" ? "ARCHIV · " : ""}
                                          {s.isTest ? "TEST · " : ""}
                                          {s.year} · Season {s.seasonNo}
                                        </option>
                                      ))}
                                    </select>
                                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                                      Als Ersatzfahrer aktivieren (Team automatisch)
                                    </button>
                                  </form>

                                  {activeSeasons.length ? (
                                    <div className="mt-3 space-y-2">
                                      {activeSeasons.map(({ row, season }) =>
                                        season ? (
                                          <div
                                            key={season.id}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                                          >
                                            <div className="min-w-0 text-xs text-white/80">
                                              {row.role === "RESERVE" ? "Ersatzfahrer" : "Stammfahrer"} · {season.year} S{season.seasonNo}
                                              {row.teamRef?.name ? ` · ${row.teamRef.name}` : row.role === "RESERVE" ? ` · Ersatzfahrer` : ""}
                                            </div>
                                            <form action={deactivateDriver}>
                                              <input type="hidden" name="driverId" value={d.id} />
                                              <input type="hidden" name="seasonId" value={season.id} />
                                              <button className="rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/15">
                                                Entfernen
                                              </button>
                                            </form>
                                          </div>
                                        ) : null
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-3 text-xs text-white/50">
                                      Noch nicht aktiv.
                                    </div>
                                  )}

                                  <div className="mt-3">
                                    {adminSlugByLeague.get(lg) ? (
                                      <Link
                                        href={`/admin/${adminSlugByLeague.get(lg)}/drivers/${d.id}`}
                                        className="text-xs font-semibold text-white/70 hover:text-white"
                                      >
                                        In Liga bearbeiten →
                                      </Link>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/settings/drivers/${d.id}`}
                          className="rounded-lg bg-mrl-red px-3 py-2 text-xs font-semibold text-white"
                        >
                          Bearbeiten
                        </Link>
                        {activeLeagues.length ? (
                          activeLeagues
                            .map((l) => {
                              const slug = adminSlugByLeague.get(l);
                              if (!slug) return null;
                              return (
                                <Link
                                  key={l}
                                  href={`/admin/${slug}/drivers/${d.id}`}
                                  className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                                >
                                  {labelByLeague.get(l) ?? String(l)} · Details
                                </Link>
                              );
                            })
                            .filter(Boolean)
                        ) : (
                          <div className="rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/60">
                            Nicht aktiv
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
