import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { League } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
};

const adminSlug: Record<League, string> = {
  [League.ONE]: "one",
  [League.TWO]: "two",
  [League.ROOKIE]: "rookie"
};

const publicSlug: Record<League, string> = {
  [League.ONE]: "mrl-one",
  [League.TWO]: "mrl-two",
  [League.ROOKIE]: "mrl-rookie"
};

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

  const leagueRaw = String(formData.get("league") ?? "").trim();
  const league =
    leagueRaw === "ONE" ? League.ONE : leagueRaw === "TWO" ? League.TWO : leagueRaw === "ROOKIE" ? League.ROOKIE : null;
  if (!league) return;

  const name = String(formData.get("name") ?? "").trim();
  const gamertag = String(formData.get("gamertag") ?? "").trim();
  const numberRaw = String(formData.get("number") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const portrait = asUploadFile(formData.get("portrait"));
  const startsRaw = String(formData.get("starts") ?? "").trim();
  const winsRaw = String(formData.get("wins") ?? "").trim();
  const podiumsRaw = String(formData.get("podiums") ?? "").trim();
  const driverOfDayRaw = String(formData.get("driverOfDay") ?? "").trim();
  const driverTitlesRaw = String(formData.get("driverTitles") ?? "").trim();
  const constructorTitlesRaw = String(formData.get("constructorTitles") ?? "").trim();

  if (!name) return;

  const number = numberRaw ? Number(numberRaw) : null;
  const starts = startsRaw ? Number(startsRaw) : 0;
  const wins = winsRaw ? Number(winsRaw) : 0;
  const podiums = podiumsRaw ? Number(podiumsRaw) : 0;
  const driverOfDay = driverOfDayRaw ? Number(driverOfDayRaw) : 0;
  const driverTitles = driverTitlesRaw ? Number(driverTitlesRaw) : 0;
  const constructorTitles = constructorTitlesRaw ? Number(constructorTitlesRaw) : 0;

  const season = seasonId
    ? await prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, league: true } }).catch(() => null)
    : null;

  const created = await prisma.driver.create({
    data: {
      league,
      name,
      gamertag: gamertag || null,
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

  if (season && season.league === league) {
    await prisma.driverSeason.create({ data: { driverId: created.id, seasonId: season.id } }).catch(() => null);
  }

  revalidatePath("/admin/settings/drivers");
  revalidatePath(`/admin/${adminSlug[league]}/drivers`);
  revalidatePath(`/admin/${adminSlug[league]}/drivers/${created.id}`);
  revalidatePath(`/${publicSlug[league]}/drivers`);
  revalidatePath(`/${publicSlug[league]}/drivers/${created.id}`);
}

export default async function AdminSettingsDriversPage() {
  await requireAdmin();

  const seasons = await prisma.season
    .findMany({
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }, { league: "asc" }],
      take: 500,
      select: { id: true, league: true, year: true, seasonNo: true, isTest: true, placement: true }
    })
    .catch(() => []);

  const activeConfig = await prisma.appConfig
    .findMany({
      where: { key: { in: ["activeSeasonId:ONE", "activeSeasonId:TWO", "activeSeasonId:ROOKIE"] } },
      select: { key: true, value: true }
    })
    .catch(() => []);

  const activeByLeague: Partial<Record<League, string>> = {};
  for (const row of activeConfig) {
    if (row.key === "activeSeasonId:ONE") activeByLeague[League.ONE] = row.value;
    if (row.key === "activeSeasonId:TWO") activeByLeague[League.TWO] = row.value;
    if (row.key === "activeSeasonId:ROOKIE") activeByLeague[League.ROOKIE] = row.value;
  }

  const drivers = await prisma.driver
    .findMany({
      orderBy: [{ league: "asc" }, { name: "asc" }],
      take: 2000,
      select: {
        id: true,
        league: true,
        name: true,
        gamertag: true,
        number: true,
        country: true,
        team: true,
        seasons: { select: { seasonId: true } }
      }
    })
    .catch(() => []);

  const seasonsByLeague: Record<League, typeof seasons> = {
    [League.ONE]: seasons.filter((s) => s.league === League.ONE),
    [League.TWO]: seasons.filter((s) => s.league === League.TWO),
    [League.ROOKIE]: seasons.filter((s) => s.league === League.ROOKIE)
  };

  const defaultSeasonId: Partial<Record<League, string>> = {
    [League.ONE]:
      (activeByLeague[League.ONE] &&
      seasonsByLeague[League.ONE].some((s) => s.id === activeByLeague[League.ONE] && s.placement === "CALENDAR")
        ? activeByLeague[League.ONE]
        : null) ??
      seasonsByLeague[League.ONE].find((s) => s.placement === "CALENDAR")?.id ?? seasonsByLeague[League.ONE][0]?.id,
    [League.TWO]:
      (activeByLeague[League.TWO] &&
      seasonsByLeague[League.TWO].some((s) => s.id === activeByLeague[League.TWO] && s.placement === "CALENDAR")
        ? activeByLeague[League.TWO]
        : null) ??
      seasonsByLeague[League.TWO].find((s) => s.placement === "CALENDAR")?.id ?? seasonsByLeague[League.TWO][0]?.id,
    [League.ROOKIE]:
      (activeByLeague[League.ROOKIE] &&
      seasonsByLeague[League.ROOKIE].some((s) => s.id === activeByLeague[League.ROOKIE] && s.placement === "CALENDAR")
        ? activeByLeague[League.ROOKIE]
        : null) ??
      seasonsByLeague[League.ROOKIE].find((s) => s.placement === "CALENDAR")?.id ?? seasonsByLeague[League.ROOKIE][0]?.id
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Fahrer anlegen</div>
          <form action={createDriver} encType="multipart/form-data" className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Liga</label>
              <select
                name="league"
                defaultValue="ROOKIE"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="ONE">MRL One</option>
                <option value="TWO">MRL Two</option>
                <option value="ROOKIE">MRL Rookie</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Aktiv in Saison</label>
              <select
                name="seasonId"
                defaultValue={defaultSeasonId[League.ROOKIE] ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="">(keine)</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {leagueLabel[s.league]} · Saison {s.year} · Season {s.seasonNo}
                    {s.isTest ? " · TEST" : ""}
                    {s.placement === "ARCHIVE" ? " · ARCHIV" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Name</label>
              <input
                name="name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Gamertag</label>
              <input
                name="gamertag"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
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
                <div
                  key={d.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {leagueLabel[d.league]} · {d.number ? `#${d.number} ` : ""}
                      {d.name}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                      {d.gamertag ? `${d.gamertag} · ` : ""}
                      {d.team ?? "-"} {d.country ? `· ${d.country}` : ""}
                      {d.seasons.length ? ` · ${d.seasons.length} Saison(en)` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/${adminSlug[d.league]}/drivers/${d.id}`}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
