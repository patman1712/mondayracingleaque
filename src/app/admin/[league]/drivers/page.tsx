import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const leagueEnum: Record<string, League> = {
  one: League.ONE,
  two: League.TWO,
  rookie: League.ROOKIE
};

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
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

async function createDriver(
  adminLeague: string,
  league: League,
  formData: FormData
) {
  "use server";
  await requireAdmin();
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
    await prisma.driverSeason
      .create({ data: { driverId: created.id, seasonId: season.id } })
      .catch(() => null);
  }

  const publicSlug =
    league === League.ONE
      ? "mrl-one"
      : league === League.TWO
        ? "mrl-two"
        : "mrl-rookie";

  revalidatePath(`/admin/${adminLeague}/drivers`);
  revalidatePath(`/admin/${adminLeague}/drivers/${created.id}`);
  revalidatePath(`/${publicSlug}/drivers`);
  revalidatePath(`/${publicSlug}/drivers/${created.id}`);
}

async function deleteDriver(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.driver.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/admin/one/drivers");
  revalidatePath("/admin/two/drivers");
  revalidatePath("/admin/rookie/drivers");
  revalidatePath("/mrl-one/drivers");
  revalidatePath("/mrl-two/drivers");
  revalidatePath("/mrl-rookie/drivers");
}

export default async function AdminDriversPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  await requireAdmin();

  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  type DriverItem = {
    id: string;
    name: string;
    gamertag: string | null;
    number: number | null;
    team: string | null;
    teamId: string | null;
    country: string | null;
    portraitPath: string | null;
    starts: number;
    wins: number;
    podiums: number;
    driverOfDay: number;
    driverTitles: number;
    constructorTitles: number;
  };

  let drivers: DriverItem[] = [];
  let seasons: { id: string; year: number; seasonNo: number; isTest: boolean; placement: string }[] = [];
  let currentSeasonId: string | null = null;
  try {
    drivers = await prisma.driver.findMany({
      where: { league: l },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        gamertag: true,
        number: true,
        team: true,
        teamId: true,
        country: true,
        portraitPath: true,
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true
      }
    });
  } catch {}
  try {
    seasons = await prisma.season
      .findMany({
        where: { league: l },
        orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
        take: 200,
        select: { id: true, year: true, seasonNo: true, isTest: true, placement: true }
      })
      .catch(() => []);
    const current = seasons.find((s) => s.placement === "CALENDAR") ?? seasons[0] ?? null;
    currentSeasonId = current?.id ?? null;
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Fahrer · {leagueLabel[l]}</div>
        <form
          action={createDriver.bind(null, league, l)}
          encType="multipart/form-data"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Name
            </label>
            <input
              name="name"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Gamertag
            </label>
            <input
              name="gamertag"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="z.B. MRL_Patman"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Nummer
            </label>
            <input
              name="number"
              inputMode="numeric"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Nationalität
            </label>
            <input
              name="country"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="DE, AT, CH ..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Aktiv in Saison
            </label>
            <select
              name="seasonId"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              defaultValue={currentSeasonId ?? ""}
            >
              <option value="">(keine)</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  Saison {s.year} · Season {s.seasonNo}
                  {s.isTest ? " · TEST" : ""}
                  {s.placement === "ARCHIVE" ? " · ARCHIV" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Fahrerbild (PNG)
            </label>
            <input
              name="portrait"
              type="file"
              accept="image/png"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>

          <div className="md:col-span-2 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Rennstarts
              </label>
              <input
                name="starts"
                inputMode="numeric"
                defaultValue="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Siege
              </label>
              <input
                name="wins"
                inputMode="numeric"
                defaultValue="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Podien
              </label>
              <input
                name="podiums"
                inputMode="numeric"
                defaultValue="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Fahrer des Tages
              </label>
              <input
                name="driverOfDay"
                inputMode="numeric"
                defaultValue="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Fahrer WM Titel
              </label>
              <input
                name="driverTitles"
                inputMode="numeric"
                defaultValue="0"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Konstrukteurs WM Titel
              </label>
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
              Hinzufügen
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Liste</div>
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
                    {d.number ? `#${d.number} ` : ""}
                    {d.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {d.team ?? "-"} {d.country ? `· ${d.country}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/${league}/drivers/${d.id}`}
                    className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Details
                  </Link>
                  <form action={deleteDriver}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                      Löschen
                    </button>
                  </form>
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
