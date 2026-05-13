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

function deleteUpload(fileName: string | null | undefined) {
  if (!fileName) return;
  try {
    fs.unlinkSync(path.join(dataRootDir(), "uploads", fileName));
  } catch {}
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
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

async function seasonTotalsForDriver(driverId: string) {
  const rows = await prisma.driverSeason
    .findMany({
      where: { driverId },
      select: {
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true
      },
      take: 5000
    })
    .catch(() => []);

  return rows.reduce(
    (acc, r) => {
      acc.starts += r.starts;
      acc.wins += r.wins;
      acc.podiums += r.podiums;
      acc.driverOfDay += r.driverOfDay;
      acc.driverTitles += r.driverTitles;
      acc.constructorTitles += r.constructorTitles;
      return acc;
    },
    { starts: 0, wins: 0, podiums: 0, driverOfDay: 0, driverTitles: 0, constructorTitles: 0 }
  );
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
  const portraitUrl = imageUrl(driver.portraitPath);
  const seasonTotals = await seasonTotalsForDriver(driverId);
  const totalComputed = {
    starts: Math.max(0, seasonTotals.starts + (driver.starts ?? 0)),
    wins: Math.max(0, seasonTotals.wins + (driver.wins ?? 0)),
    podiums: Math.max(0, seasonTotals.podiums + (driver.podiums ?? 0)),
    driverOfDay: Math.max(0, seasonTotals.driverOfDay + (driver.driverOfDay ?? 0)),
    driverTitles: Math.max(0, seasonTotals.driverTitles + (driver.driverTitles ?? 0)),
    constructorTitles: Math.max(0, seasonTotals.constructorTitles + (driver.constructorTitles ?? 0))
  };

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

    const seasonTotals = await seasonTotalsForDriver(driverId);
    const manualStarts = Math.trunc((Number.isFinite(starts) ? starts : 0) - seasonTotals.starts);
    const manualWins = Math.trunc((Number.isFinite(wins) ? wins : 0) - seasonTotals.wins);
    const manualPodiums = Math.trunc((Number.isFinite(podiums) ? podiums : 0) - seasonTotals.podiums);
    const manualDriverOfDay = Math.trunc((Number.isFinite(driverOfDay) ? driverOfDay : 0) - seasonTotals.driverOfDay);
    const manualDriverTitles = Math.trunc((Number.isFinite(driverTitles) ? driverTitles : 0) - seasonTotals.driverTitles);
    const manualConstructorTitles = Math.trunc(
      (Number.isFinite(constructorTitles) ? constructorTitles : 0) - seasonTotals.constructorTitles
    );

    const currentPortrait = await prisma.driver
      .findUnique({ where: { id: driverId }, select: { portraitPath: true } })
      .then((r) => r?.portraitPath ?? null)
      .catch(() => null);

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
          starts: manualStarts,
          wins: manualWins,
          podiums: manualPodiums,
          driverOfDay: manualDriverOfDay,
          driverTitles: manualDriverTitles,
          constructorTitles: manualConstructorTitles
        }
      })
      .catch(() => null);

    if (portrait && portrait.size > 0) {
      if (portrait.size > 8_000_000) redirect(`/admin/settings/drivers/${driverId}?error=file`);
      const ext = extFromMime(portrait.type);
      if (!ext) redirect(`/admin/settings/drivers/${driverId}?error=file`);
      const fileName = `driver-portrait-${driverId}-${Date.now()}.${ext}`;
      await writeUpload(fileName, portrait);
      const saved = await prisma.driver.update({ where: { id: driverId }, data: { portraitPath: fileName } }).catch(() => null);
      if (!saved) {
        deleteUpload(fileName);
      } else {
        if (currentPortrait) deleteUpload(currentPortrait);
      }
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

  async function removePortrait() {
    "use server";
    await requireAdmin();

    const current = await prisma.driver
      .findUnique({ where: { id: driverId }, select: { portraitPath: true } })
      .catch(() => null);
    if (!current) notFound();

    await prisma.driver.update({ where: { id: driverId }, data: { portraitPath: null } }).catch(() => null);
    if (current.portraitPath) deleteUpload(current.portraitPath);

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
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-3">
                  {portraitUrl ? (
                    <img src={portraitUrl} alt="" className="h-16 w-16 rounded-xl bg-black/20 object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-black/20" />
                  )}
                  <div className="text-xs text-white/60">
                    {driver.portraitPath ?? "Kein Bild gesetzt"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {driver.portraitPath ? (
                    <button
                      formAction={removePortrait}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Bild entfernen
                    </button>
                  ) : null}
                  <input
                    name="portrait"
                    type="file"
                    accept="image/png"
                    className="w-full max-w-[340px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-white/85">Gesamtstatistik</div>
              <div className="mt-1 text-xs text-white/60">
                Gesamtwerte (Saison + Manuell).
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Rennstarts
                </label>
                <input
                  name="starts"
                  inputMode="numeric"
                  defaultValue={String(totalComputed.starts)}
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
                  defaultValue={String(totalComputed.wins)}
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
                  defaultValue={String(totalComputed.podiums)}
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
                  defaultValue={String(totalComputed.driverOfDay)}
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
                  defaultValue={String(totalComputed.driverTitles)}
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
                  defaultValue={String(totalComputed.constructorTitles)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
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
