import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/db";
import { League, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
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

async function updateDriver(adminLeague: string, league: League, driverId: string, formData: FormData) {
  "use server";
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const gamertag = String(formData.get("gamertag") ?? "").trim();
  const numberRaw = String(formData.get("number") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const startsRaw = String(formData.get("starts") ?? "").trim();
  const winsRaw = String(formData.get("wins") ?? "").trim();
  const podiumsRaw = String(formData.get("podiums") ?? "").trim();
  const driverOfDayRaw = String(formData.get("driverOfDay") ?? "").trim();
  const driverTitlesRaw = String(formData.get("driverTitles") ?? "").trim();
  const constructorTitlesRaw = String(formData.get("constructorTitles") ?? "").trim();
  const portrait = asUploadFile(formData.get("portrait"));
  const seasonIds = formData.getAll("seasonIds").map((v) => String(v));

  if (!name) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=invalid`);

  const number = numberRaw ? Number(numberRaw) : null;
  const starts = startsRaw ? Number(startsRaw) : 0;
  const wins = winsRaw ? Number(winsRaw) : 0;
  const podiums = podiumsRaw ? Number(podiumsRaw) : 0;
  const driverOfDay = driverOfDayRaw ? Number(driverOfDayRaw) : 0;
  const driverTitles = driverTitlesRaw ? Number(driverTitlesRaw) : 0;
  const constructorTitles = constructorTitlesRaw ? Number(constructorTitlesRaw) : 0;

  const current = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: { id: true, league: true, portraitPath: true }
    })
    .catch(() => null);
  if (!current || current.league !== league) notFound();

  const t = teamId
    ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } }).catch(() => null)
    : null;

  const allowedSeasons = await prisma.season
    .findMany({
      where: { league },
      select: { id: true },
      take: 500
    })
    .catch(() => []);
  const allowed = new Set(allowedSeasons.map((s) => s.id));
  const filteredSeasonIds = Array.from(new Set(seasonIds.filter((id) => allowed.has(id))));

  let portraitPath: string | null | undefined = undefined;
  let newPortraitPath: string | null = null;
  if (portrait && portrait.size > 0) {
    if (portrait.size > 8_000_000) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=image`);
    const ext = extFromMime(portrait.type);
    if (!ext) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=image`);
    const fileName = `driver-portrait-${driverId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, portrait);
    portraitPath = fileName;
    newPortraitPath = fileName;
  }

  try {
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        name,
        gamertag: gamertag || null,
        number: Number.isFinite(number) ? (number as number) : null,
        country: country || null,
        teamId: t?.id ?? null,
        team: t?.name ?? null,
        starts: Number.isFinite(starts) ? (starts as number) : 0,
        wins: Number.isFinite(wins) ? (wins as number) : 0,
        podiums: Number.isFinite(podiums) ? (podiums as number) : 0,
        driverOfDay: Number.isFinite(driverOfDay) ? (driverOfDay as number) : 0,
        driverTitles: Number.isFinite(driverTitles) ? (driverTitles as number) : 0,
        constructorTitles: Number.isFinite(constructorTitles) ? (constructorTitles as number) : 0,
        ...(portraitPath !== undefined ? { portraitPath } : {})
      }
    });
  } catch (e) {
    deleteUpload(newPortraitPath);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
      redirect(`/admin/${adminLeague}/drivers/${driverId}?error=db`);
    }
    redirect(`/admin/${adminLeague}/drivers/${driverId}?error=save`);
  }

  if (newPortraitPath && current.portraitPath) deleteUpload(current.portraitPath);

  const existing = await prisma.driverSeason
    .findMany({
      where: { driverId },
      select: { id: true, seasonId: true }
    })
    .catch(() => []);
  const existingIds = new Set(existing.map((r) => r.seasonId));

  const toAdd = filteredSeasonIds.filter((id) => !existingIds.has(id));
  const toRemove = existing.filter((r) => !filteredSeasonIds.includes(r.seasonId)).map((r) => r.id);

  if (toRemove.length) {
    await prisma.driverSeason.deleteMany({ where: { id: { in: toRemove } } }).catch(() => null);
  }
  for (const sid of toAdd) {
    await prisma.driverSeason.create({ data: { driverId, seasonId: sid } }).catch(() => null);
  }

  const pub = publicSlug[league];
  revalidatePath(`/admin/${adminLeague}/drivers`);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  revalidatePath(`/${pub}/drivers`);
  revalidatePath(`/${pub}/drivers/${driverId}`);

  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

async function removePortrait(adminLeague: string, league: League, driverId: string) {
  "use server";
  await requireAdmin();
  const current = await prisma.driver
    .findUnique({ where: { id: driverId }, select: { league: true, portraitPath: true } })
    .catch(() => null);
  if (!current || current.league !== league) notFound();
  await prisma.driver.update({ where: { id: driverId }, data: { portraitPath: null } }).catch(() => null);
  if (current.portraitPath) deleteUpload(current.portraitPath);
  const pub = publicSlug[league];
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  revalidatePath(`/${pub}/drivers/${driverId}`);
  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

export default async function AdminDriverDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string; driverId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();

  const { league: adminLeague, driverId } = await params;
  const l = leagueEnum[adminLeague];
  if (!l) notFound();

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const driver = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: {
        id: true,
        league: true,
        name: true,
        gamertag: true,
        number: true,
        country: true,
        teamId: true,
        team: true,
        portraitPath: true,
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true,
        seasons: { select: { seasonId: true } }
      }
    })
    .catch(() => null);

  if (!driver || driver.league !== l) notFound();

  const teams = await prisma.team
    .findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
      take: 500
    })
    .catch(() => []);

  const seasons = await prisma.season
    .findMany({
      where: { league: l },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      take: 200,
      select: { id: true, year: true, seasonNo: true, isTest: true, placement: true }
    })
    .catch(() => []);

  const activeSeasonIds = new Set(driver.seasons.map((s) => s.seasonId));
  const portraitUrl = imageUrl(driver.portraitPath);

  return (
    <AdminShell>
      <div className="space-y-6">
        {ok ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            Gespeichert.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            Fehler: {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold">Fahrer bearbeiten</div>
              <div className="mt-1 text-sm text-white/60">
                {driver.number ? `#${driver.number} ` : ""}
                {driver.name}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/${adminLeague}/drivers`}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                Zurück
              </Link>
            </div>
          </div>

          <form
            action={updateDriver.bind(null, adminLeague, l, driver.id)}
            encType="multipart/form-data"
            className="mt-5 grid gap-4 md:grid-cols-3"
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Name
              </label>
              <input
                name="name"
                defaultValue={driver.name}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Gamertag
              </label>
              <input
                name="gamertag"
                defaultValue={driver.gamertag ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Nummer
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
                Nationalität
              </label>
              <input
                name="country"
                defaultValue={driver.country ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Team (optional)
              </label>
              <select
                name="teamId"
                defaultValue={driver.teamId ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="">(keins)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Aktiv in Saisons
              </label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {seasons.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="seasonIds"
                      value={s.id}
                      defaultChecked={activeSeasonIds.has(s.id)}
                      className="h-4 w-4"
                    />
                    <div className="text-white/80">
                      Saison {s.year} · Season {s.seasonNo}
                      {s.isTest ? " · TEST" : ""}
                      {s.placement === "ARCHIVE" ? " · ARCHIV" : ""}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Rennstarts
                </label>
                <input
                  name="starts"
                  defaultValue={driver.starts}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Siege
                </label>
                <input
                  name="wins"
                  defaultValue={driver.wins}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Podien
                </label>
                <input
                  name="podiums"
                  defaultValue={driver.podiums}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Fahrer des Tages
                </label>
                <input
                  name="driverOfDay"
                  defaultValue={driver.driverOfDay}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Fahrer WM Titel
                </label>
                <input
                  name="driverTitles"
                  defaultValue={driver.driverTitles}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Konstrukteurs WM Titel
                </label>
                <input
                  name="constructorTitles"
                  defaultValue={driver.constructorTitles}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Fahrerbild ersetzen (PNG)
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-3">
                  {portraitUrl ? (
                    <img
                      src={portraitUrl}
                      alt=""
                      className="h-16 w-16 rounded-xl bg-black/20 object-cover"
                    />
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
                      formAction={removePortrait.bind(null, adminLeague, l, driver.id)}
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
                  <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
