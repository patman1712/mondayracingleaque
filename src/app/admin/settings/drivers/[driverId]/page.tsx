import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { DriverStatus, League } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeagueMeta = {
  league: League;
  adminSlug: string;
  publicSlug: string;
};

const fallbackLeagues: LeagueMeta[] = [
  { league: League.ONE, adminSlug: "one", publicSlug: "mrl-one" },
  { league: League.TWO, adminSlug: "two", publicSlug: "mrl-two" },
  { league: League.ROOKIE, adminSlug: "rookie", publicSlug: "mrl-rookie" }
];

async function listLeagueMeta(): Promise<LeagueMeta[]> {
  const rows = await prisma.leagueConfig
    .findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { league: true, adminSlug: true, publicSlug: true }
    })
    .catch(() => []);
  return rows.length ? rows : fallbackLeagues;
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

export default async function AdminSettingsDriverEditPage({
  params
}: {
  params: Promise<{ driverId: string }>;
}) {
  await requireAdmin();
  const { driverId } = await params;

  const driver = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: {
        id: true,
        name: true,
        gamertag: true,
        status: true,
        number: true,
        country: true,
        twitchChannel: true,
        portraitPath: true,
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true
      }
    })
    .catch(() => null);

  if (!driver) notFound();

  async function updateDriver(formData: FormData) {
    "use server";
    await requireAdmin();

    const nameRaw = String(formData.get("name") ?? "").trim();
    const gamertagRaw = String(formData.get("gamertag") ?? "").trim();
    const statusRaw = String(formData.get("status") ?? "").trim();
    const numberRaw = String(formData.get("number") ?? "").trim();
    const countryRaw = String(formData.get("country") ?? "").trim();
    const twitchChannelRaw = String(formData.get("twitchChannel") ?? "").trim();
    const portrait = asUploadFile(formData.get("portrait"));
    const startsRaw = String(formData.get("starts") ?? "").trim();
    const winsRaw = String(formData.get("wins") ?? "").trim();
    const podiumsRaw = String(formData.get("podiums") ?? "").trim();
    const driverOfDayRaw = String(formData.get("driverOfDay") ?? "").trim();
    const driverTitlesRaw = String(formData.get("driverTitles") ?? "").trim();
    const constructorTitlesRaw = String(formData.get("constructorTitles") ?? "").trim();

    const gamertag = gamertagRaw || null;
    const name = nameRaw || gamertagRaw;
    if (!name) redirect(`/admin/settings/drivers/${driverId}?error=missing`);

    const status = statusRaw === "RETIRED" ? DriverStatus.RETIRED : DriverStatus.ACTIVE;
    const number = numberRaw ? Number(numberRaw) : null;
    const starts = startsRaw ? Number(startsRaw) : 0;
    const wins = winsRaw ? Number(winsRaw) : 0;
    const podiums = podiumsRaw ? Number(podiumsRaw) : 0;
    const driverOfDay = driverOfDayRaw ? Number(driverOfDayRaw) : 0;
    const driverTitles = driverTitlesRaw ? Number(driverTitlesRaw) : 0;
    const constructorTitles = constructorTitlesRaw ? Number(constructorTitlesRaw) : 0;

    await prisma.driver
      .update({
        where: { id: driverId },
        data: {
          name,
          gamertag,
          status,
          number: Number.isFinite(number) ? (number as number) : null,
          country: countryRaw || null,
          twitchChannel: twitchChannelRaw || null,
          starts: Number.isFinite(starts) ? (starts as number) : 0,
          wins: Number.isFinite(wins) ? (wins as number) : 0,
          podiums: Number.isFinite(podiums) ? (podiums as number) : 0,
          driverOfDay: Number.isFinite(driverOfDay) ? (driverOfDay as number) : 0,
          driverTitles: Number.isFinite(driverTitles) ? (driverTitles as number) : 0,
          constructorTitles: Number.isFinite(constructorTitles) ? (constructorTitles as number) : 0
        }
      })
      .catch(() => null);

    if (portrait && portrait.size > 0) {
      if (portrait.size > 8_000_000) redirect(`/admin/settings/drivers/${driverId}?error=file`);
      const ext = extFromMime(portrait.type);
      if (!ext) redirect(`/admin/settings/drivers/${driverId}?error=file`);
      const fileName = `driver-portrait-${driverId}-${Date.now()}.${ext}`;
      await writeUpload(fileName, portrait);
      await prisma.driver.update({ where: { id: driverId }, data: { portraitPath: fileName } }).catch(() => null);
    }

    revalidatePath("/admin/settings/drivers");
    revalidatePath(`/admin/settings/drivers/${driverId}`);
    const leagues = await listLeagueMeta();
    for (const l of leagues) {
      revalidatePath(`/admin/${l.adminSlug}/drivers`);
      revalidatePath(`/admin/${l.adminSlug}/drivers/${driverId}`);
      revalidatePath(`/${l.publicSlug}/drivers`);
      revalidatePath(`/${l.publicSlug}/drivers/${driverId}`);
    }
    redirect(`/admin/settings/drivers/${driverId}?ok=1`);
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Fahrer bearbeiten</div>
          <div className="mt-1 text-sm text-white/60">
            Gamertag reicht. Name ist optional (wenn leer, wird Gamertag als Name gespeichert).
          </div>

          <form action={updateDriver} encType="multipart/form-data" className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Gamertag
              </label>
              <input
                name="gamertag"
                defaultValue={driver.gamertag ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Name (optional)
              </label>
              <input
                name="name"
                defaultValue={driver.name ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Status
              </label>
              <select
                name="status"
                defaultValue={driver.status}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="ACTIVE">Aktiv</option>
                <option value="RETIRED">In Rente</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Fahrernummer (optional)
              </label>
              <input
                name="number"
                defaultValue={driver.number ?? ""}
                inputMode="numeric"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Nationalität (optional)
              </label>
              <input
                name="country"
                defaultValue={driver.country ?? ""}
                placeholder="DE, AT, CH ..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Twitch (optional)
              </label>
              <input
                name="twitchChannel"
                defaultValue={driver.twitchChannel ?? ""}
                placeholder="channel oder https://twitch.tv/channel"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
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
                  defaultValue={String(driver.starts ?? 0)}
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
                  defaultValue={String(driver.wins ?? 0)}
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
                  defaultValue={String(driver.podiums ?? 0)}
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
                  defaultValue={String(driver.driverOfDay ?? 0)}
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
                  defaultValue={String(driver.driverTitles ?? 0)}
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
                  defaultValue={String(driver.constructorTitles ?? 0)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Speichern
              </button>
              <Link
                href="/admin/settings/drivers"
                className="w-fit rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Zurück
              </Link>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
