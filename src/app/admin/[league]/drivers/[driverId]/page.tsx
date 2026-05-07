import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/db";
import { ensureReserveTeam } from "@/lib/reserveTeam";
import { DriverRole, League, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function publicSlugForLeague(league: League): Promise<string | null> {
  const row = await prisma.leagueConfig
    .findUnique({ where: { league }, select: { publicSlug: true } })
    .catch(() => null);
  if (row?.publicSlug) return row.publicSlug;
  if (league === League.ONE) return "mrl-one";
  if (league === League.TWO) return "mrl-two";
  if (league === League.ROOKIE) return "mrl-rookie";
  return null;
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

function asInt(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

async function updateBasics(adminLeague: string, league: League, driverId: string, formData: FormData) {
  "use server";
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const gamertag = String(formData.get("gamertag") ?? "").trim();
  const numberRaw = String(formData.get("number") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const portrait = asUploadFile(formData.get("portrait"));

  if (!name) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=invalid`);

  const number = numberRaw ? Number(numberRaw) : null;

  const current = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: { id: true, portraitPath: true }
    })
    .catch(() => null);
  if (!current) notFound();

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

  const pub = await publicSlugForLeague(league);
  revalidatePath(`/admin/${adminLeague}/drivers`);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  if (pub) {
    revalidatePath(`/${pub}/drivers`);
    revalidatePath(`/${pub}/drivers/${driverId}`);
  }

  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

async function updateTotals(adminLeague: string, league: League, driverId: string, formData: FormData) {
  "use server";
  await requireAdmin();

  const current = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: { id: true }
    })
    .catch(() => null);
  if (!current) notFound();

  const starts = asInt(String(formData.get("starts") ?? "0"), 0);
  const wins = asInt(String(formData.get("wins") ?? "0"), 0);
  const podiums = asInt(String(formData.get("podiums") ?? "0"), 0);
  const driverOfDay = asInt(String(formData.get("driverOfDay") ?? "0"), 0);
  const driverTitles = asInt(String(formData.get("driverTitles") ?? "0"), 0);
  const constructorTitles = asInt(String(formData.get("constructorTitles") ?? "0"), 0);

  await prisma.driver
    .update({
      where: { id: driverId },
      data: { starts, wins, podiums, driverOfDay, driverTitles, constructorTitles }
    })
    .catch(() => null);

  const pub = await publicSlugForLeague(league);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  if (pub) revalidatePath(`/${pub}/drivers/${driverId}`);
  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

async function activateSeason(adminLeague: string, league: League, driverId: string, formData: FormData) {
  "use server";
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  if (!seasonId) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=season`);

  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, league: true } }).catch(() => null);
  if (!season || season.league !== league) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=season`);

  const roleRaw = String(formData.get("role") ?? "").trim();
  const role = roleRaw === "RESERVE" ? DriverRole.RESERVE : DriverRole.MAIN;
  const teamIdRaw = String(formData.get("teamId") ?? "").trim();
  const teamId = teamIdRaw ? teamIdRaw : null;
  const t =
    role === DriverRole.RESERVE
      ? await ensureReserveTeam(league).catch(() => null)
      : teamId
        ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }).catch(() => null)
        : null;

  if (t?.id) {
    await prisma.teamLeague
      .upsert({
        where: { teamId_league: { teamId: t.id, league } },
        create: { teamId: t.id, league },
        update: {}
      })
      .catch(() => null);
  }

  await prisma.driverSeason
    .upsert({
      where: { driverId_seasonId: { driverId, seasonId } },
      create: { driverId, seasonId, role, teamId: t?.id ?? null },
      update: { role, teamId: t?.id ?? null }
    })
    .catch(() => null);

  const pub = await publicSlugForLeague(league);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  if (pub) {
    revalidatePath(`/${pub}/drivers`);
    revalidatePath(`/${pub}/drivers/${driverId}`);
  }
  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

async function deactivateSeason(adminLeague: string, league: League, driverId: string, formData: FormData) {
  "use server";
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  if (!seasonId) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=season`);

  await prisma.driverSeason.deleteMany({ where: { driverId, seasonId } }).catch(() => null);

  const pub = await publicSlugForLeague(league);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  if (pub) {
    revalidatePath(`/${pub}/drivers`);
    revalidatePath(`/${pub}/drivers/${driverId}`);
  }
  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

async function updateSeason(adminLeague: string, league: League, driverId: string, formData: FormData) {
  "use server";
  await requireAdmin();

  const seasonId = String(formData.get("seasonId") ?? "").trim();
  if (!seasonId) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=season`);

  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, league: true } }).catch(() => null);
  if (!season || season.league !== league) redirect(`/admin/${adminLeague}/drivers/${driverId}?error=season`);

  const roleRaw = String(formData.get("role") ?? "").trim();
  const role = roleRaw === "RESERVE" ? DriverRole.RESERVE : DriverRole.MAIN;

  const teamIdRaw = String(formData.get("teamId") ?? "").trim();
  const teamId = teamIdRaw ? teamIdRaw : null;
  const t =
    role === DriverRole.RESERVE
      ? await ensureReserveTeam(league).catch(() => null)
      : teamId
        ? await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }).catch(() => null)
        : null;

  if (t?.id) {
    await prisma.teamLeague
      .upsert({
        where: { teamId_league: { teamId: t.id, league } },
        create: { teamId: t.id, league },
        update: {}
      })
      .catch(() => null);
  }

  const starts = asInt(String(formData.get("starts") ?? "0"), 0);
  const wins = asInt(String(formData.get("wins") ?? "0"), 0);
  const podiums = asInt(String(formData.get("podiums") ?? "0"), 0);
  const driverOfDay = asInt(String(formData.get("driverOfDay") ?? "0"), 0);
  const driverTitles = asInt(String(formData.get("driverTitles") ?? "0"), 0);
  const constructorTitles = asInt(String(formData.get("constructorTitles") ?? "0"), 0);

  await prisma.driverSeason
    .upsert({
      where: { driverId_seasonId: { driverId, seasonId } },
      create: {
        driverId,
        seasonId,
        teamId: t?.id ?? null,
        role,
        starts,
        wins,
        podiums,
        driverOfDay,
        driverTitles,
        constructorTitles
      },
      update: {
        teamId: t?.id ?? null,
        role,
        starts,
        wins,
        podiums,
        driverOfDay,
        driverTitles,
        constructorTitles
      }
    })
    .catch(() => null);

  const pub = await publicSlugForLeague(league);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  if (pub) {
    revalidatePath(`/${pub}/drivers`);
    revalidatePath(`/${pub}/drivers/${driverId}`);
  }
  redirect(`/admin/${adminLeague}/drivers/${driverId}?ok=1`);
}

async function removePortrait(adminLeague: string, league: League, driverId: string) {
  "use server";
  await requireAdmin();
  const current = await prisma.driver
    .findUnique({ where: { id: driverId }, select: { portraitPath: true } })
    .catch(() => null);
  if (!current) notFound();
  await prisma.driver.update({ where: { id: driverId }, data: { portraitPath: null } }).catch(() => null);
  if (current.portraitPath) deleteUpload(current.portraitPath);
  const pub = await publicSlugForLeague(league);
  revalidatePath(`/admin/${adminLeague}/drivers/${driverId}`);
  if (pub) revalidatePath(`/${pub}/drivers/${driverId}`);
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
  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  if (!cfg) notFound();
  const l = cfg.league;

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const driver = await prisma.driver
    .findUnique({
      where: { id: driverId },
      select: {
        id: true,
        name: true,
        gamertag: true,
        number: true,
        country: true,
        portraitPath: true,
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true,
        seasons: {
          select: {
            seasonId: true,
            teamId: true,
            role: true,
            starts: true,
            wins: true,
            podiums: true,
            driverOfDay: true,
            driverTitles: true,
            constructorTitles: true
          }
        }
      }
    })
    .catch(() => null);

  if (!driver) notFound();

  const assignedTeams = await prisma.teamLeague
    .findMany({
      where: { league: l },
      orderBy: [{ team: { name: "asc" } }],
      select: { team: { select: { id: true, name: true } } },
      take: 1000
    })
    .catch(() => []);

  const extraTeamIds = Array.from(
    new Set(driver.seasons.map((s) => s.teamId).filter((x): x is string => Boolean(x)))
  );
  const assignedTeamIds = new Set(assignedTeams.map((r) => r.team.id));
  const missingIds = extraTeamIds.filter((id) => !assignedTeamIds.has(id));

  const extraTeams = missingIds.length
    ? await prisma.team
        .findMany({
          where: { id: { in: missingIds } },
          select: { id: true, name: true },
          take: 200
        })
        .catch(() => [])
    : [];

  const teams = [...assignedTeams.map((r) => r.team), ...extraTeams].sort((a, b) => a.name.localeCompare(b.name));

  const seasons = await prisma.season
    .findMany({
      where: { league: l },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      take: 200,
      select: { id: true, year: true, seasonNo: true, isTest: true, placement: true }
    })
    .catch(() => []);

  const seasonById = new Map(seasons.map((s) => [s.id, s] as const));
  const seasonRows = driver.seasons
    .map((s) => ({ ...s, season: seasonById.get(s.seasonId) ?? null }))
    .filter((s) => s.season !== null);
  const activeSeasonIds = new Set(seasonRows.map((s) => s.seasonId));
  const portraitUrl = imageUrl(driver.portraitPath);

  const seasonTotals = seasonRows.reduce(
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

  const totalComputed = {
    starts: seasonTotals.starts,
    wins: seasonTotals.wins,
    podiums: seasonTotals.podiums,
    driverOfDay: seasonTotals.driverOfDay,
    driverTitles: seasonTotals.driverTitles,
    constructorTitles: seasonTotals.constructorTitles
  };

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

          <div className="mt-6 space-y-4">
            <details open className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-white/85">
                Basisdaten
              </summary>
              <form
                action={updateBasics.bind(null, adminLeague, l, driver.id)}
                encType="multipart/form-data"
                className="mt-4 grid gap-4 md:grid-cols-3"
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
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-semibold text-white/70">
                    Fahrerbild (PNG)
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
            </details>

            <details className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-white/85">
                Gesamt-Stats
              </summary>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                Gesamt = Summe aller Saison-Stats + Manuell
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Rennstarts</div>
                    <div className="mt-1 text-lg font-extrabold text-white/90">{totalComputed.starts}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Siege</div>
                    <div className="mt-1 text-lg font-extrabold text-white/90">{totalComputed.wins}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Podien</div>
                    <div className="mt-1 text-lg font-extrabold text-white/90">{totalComputed.podiums}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Fahrer des Tages</div>
                    <div className="mt-1 text-lg font-extrabold text-white/90">{totalComputed.driverOfDay}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Fahrer WM Titel</div>
                    <div className="mt-1 text-lg font-extrabold text-white/90">{totalComputed.driverTitles}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Konstrukteurs WM Titel</div>
                    <div className="mt-1 text-lg font-extrabold text-white/90">{totalComputed.constructorTitles}</div>
                  </div>
                </div>
              </div>
              <form
                action={updateTotals.bind(null, adminLeague, l, driver.id)}
                className="mt-4 grid gap-4 md:grid-cols-3"
              >
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">Rennstarts (Manuell)</label>
                  <input name="starts" defaultValue={driver.starts} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">Siege (Manuell)</label>
                  <input name="wins" defaultValue={driver.wins} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">Podien (Manuell)</label>
                  <input name="podiums" defaultValue={driver.podiums} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">Fahrer des Tages (Manuell)</label>
                  <input name="driverOfDay" defaultValue={driver.driverOfDay} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">Fahrer WM Titel (Manuell)</label>
                  <input name="driverTitles" defaultValue={driver.driverTitles} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-white/70">Konstrukteurs WM Titel (Manuell)</label>
                  <input name="constructorTitles" defaultValue={driver.constructorTitles} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                </div>
                <div className="md:col-span-3">
                  <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                    Speichern
                  </button>
                </div>
              </form>
            </details>

            <details className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <summary className="cursor-pointer text-sm font-semibold text-white/85">
                Saisons
              </summary>

              <div className="mt-4">
                <form action={activateSeason.bind(null, adminLeague, l, driver.id)} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[280px]">
                    <label className="mb-1 block text-xs font-semibold text-white/70">Saison aktivieren</label>
                    <select name="seasonId" defaultValue="" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25">
                      <option value="">Bitte wählen</option>
                      {seasons
                        .filter((s) => !activeSeasonIds.has(s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            Saison {s.year} · Season {s.seasonNo}
                            {s.isTest ? " · TEST" : ""}
                            {s.placement === "ARCHIVE" ? " · ARCHIV" : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  <input type="hidden" name="role" value="MAIN" />
                  <div className="min-w-[240px]">
                    <label className="mb-1 block text-xs font-semibold text-white/70">Team</label>
                    <select
                      name="teamId"
                      defaultValue=""
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
                  <button className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                    Als Stammfahrer aktivieren
                  </button>
                </form>

                <form action={activateSeason.bind(null, adminLeague, l, driver.id)} className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-[280px]">
                    <label className="mb-1 block text-xs font-semibold text-white/70">Saison aktivieren</label>
                    <select name="seasonId" defaultValue="" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25">
                      <option value="">Bitte wählen</option>
                      {seasons
                        .filter((s) => !activeSeasonIds.has(s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            Saison {s.year} · Season {s.seasonNo}
                            {s.isTest ? " · TEST" : ""}
                            {s.placement === "ARCHIVE" ? " · ARCHIV" : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  <input type="hidden" name="role" value="RESERVE" />
                  <button className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                    Als Ersatzfahrer aktivieren (Team automatisch)
                  </button>
                </form>
              </div>

              <div className="mt-5 space-y-3">
                {seasons.map((s) => {
                  const row = seasonRows.find((r) => r.seasonId === s.id) ?? null;
                  const active = Boolean(row);
                  return (
                    <details key={s.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-white/85">
                        Saison {s.year} · Season {s.seasonNo}
                        {s.isTest ? " · TEST" : ""}
                        {s.placement === "ARCHIVE" ? " · ARCHIV" : ""}
                        {active && row?.role === "RESERVE" ? " · Ersatzfahrer" : ""}
                        {!active ? " · inaktiv" : ""}
                      </summary>

                      <div className="mt-4 space-y-3">
                        {active ? (
                          <>
                            <form action={updateSeason.bind(null, adminLeague, l, driver.id)} className="grid gap-4 md:grid-cols-3">
                              <input type="hidden" name="seasonId" value={s.id} />
                              <div className="md:col-span-3">
                                <label className="mb-1 block text-xs font-semibold text-white/70">Typ</label>
                                <select
                                  name="role"
                                  defaultValue={row?.role ?? "MAIN"}
                                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                                >
                                  <option value="MAIN">Stammfahrer</option>
                                  <option value="RESERVE">Ersatzfahrer</option>
                                </select>
                              </div>
                              <div className="md:col-span-3">
                                <label className="mb-1 block text-xs font-semibold text-white/70">Team</label>
                                <select
                                  name="teamId"
                                  defaultValue={row?.teamId ?? ""}
                                  disabled={row?.role === "RESERVE"}
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

                              <div>
                                <label className="mb-1 block text-xs font-semibold text-white/70">Rennstarts</label>
                                <input name="starts" defaultValue={row?.starts ?? 0} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-white/70">Siege</label>
                                <input name="wins" defaultValue={row?.wins ?? 0} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-white/70">Podien</label>
                                <input name="podiums" defaultValue={row?.podiums ?? 0} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-white/70">Fahrer des Tages</label>
                                <input name="driverOfDay" defaultValue={row?.driverOfDay ?? 0} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-white/70">Fahrer WM Titel</label>
                                <input name="driverTitles" defaultValue={row?.driverTitles ?? 0} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-semibold text-white/70">Konstrukteurs WM Titel</label>
                                <input name="constructorTitles" defaultValue={row?.constructorTitles ?? 0} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" />
                              </div>

                              <div className="md:col-span-3 flex flex-wrap gap-2">
                                <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                                  Speichern
                                </button>
                                <button
                                  formAction={deactivateSeason.bind(null, adminLeague, l, driver.id)}
                                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                                >
                                  Deaktivieren
                                </button>
                              </div>
                            </form>
                          </>
                        ) : (
                          <form action={activateSeason.bind(null, adminLeague, l, driver.id)} className="flex items-center gap-2">
                            <input type="hidden" name="seasonId" value={s.id} />
                            <button className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                              Aktivieren
                            </button>
                          </form>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
