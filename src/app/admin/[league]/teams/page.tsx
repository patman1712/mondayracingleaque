import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { Prisma, SeasonPlacement } from "@prisma/client";
import { getActiveSeason } from "@/lib/currentSeason";
import { requireAdmin } from "@/lib/requireAdmin";
import fs from "node:fs";
import path from "node:path";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { TeamSeasonAddForm } from "@/components/TeamSeasonAddForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
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
  const abs = path.join(dataRootDir(), "uploads", fileName);
  try {
    fs.unlinkSync(abs);
  } catch {}
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

async function revalidatePublicTeamsForLeague(publicSlug: string, teamId?: string) {
  revalidatePath(`/${publicSlug}/teams`);
  if (teamId) revalidatePath(`/${publicSlug}/teams/${teamId}`);
}

async function addParticipation(formData: FormData) {
  "use server";
  const leagueSlug = String(formData.get("league") ?? "");
  const cfg = await resolveLeagueByAdminSlug(leagueSlug);
  if (!cfg) redirect("/admin?error=invalid");
  const league = cfg.league;

  const seasonId = String(formData.get("seasonId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const color = String(formData.get("color") ?? "").trim();
  const car = asUploadFile(formData.get("car"));
  const heroBackground = asUploadFile(formData.get("heroBackground"));

  if (!seasonId || !teamId) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  const season = await prisma.season
    .findFirst({ where: { id: seasonId, league }, select: { id: true } })
    .catch(() => null);
  if (!season) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  let carImagePath: string | null = null;
  let heroBackgroundPath: string | null = null;

  if (car && car.size > 0) {
    if (car.size > 5_000_000) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const ext = extFromMime(car.type);
    if (!ext) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const fileName = `team-car-${teamId}-${seasonId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, car);
    carImagePath = fileName;
  }

  if (heroBackground && heroBackground.size > 0) {
    if (heroBackground.size > 5_000_000) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const ext = extFromMime(heroBackground.type);
    if (!ext) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const fileName = `team-hero-bg-${teamId}-${seasonId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, heroBackground);
    heroBackgroundPath = fileName;
  }

  try {
    await prisma.teamLeague
      .upsert({
        where: { teamId_league: { teamId, league } },
        create: { teamId, league },
        update: {}
      })
      .catch(() => null);
    await prisma.teamSeason.create({
      data: {
        teamId,
        seasonId,
        color: color || null,
        carImagePath,
        heroBackgroundPath
      }
    });
  } catch (e) {
    deleteUpload(carImagePath);
    deleteUpload(heroBackgroundPath);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect(`/admin/${leagueSlug}/teams?error=duplicate`);
    }
    redirect(`/admin/${leagueSlug}/teams?error=save`);
  }

  revalidatePath(`/admin/${leagueSlug}/teams`);
  await revalidatePublicTeamsForLeague(cfg.publicSlug, teamId);
  redirect(`/admin/${leagueSlug}/teams?ok=1&seasonId=${encodeURIComponent(seasonId)}`);
}

async function updateParticipation(formData: FormData) {
  "use server";
  const leagueSlug = String(formData.get("league") ?? "");
  const cfg = await resolveLeagueByAdminSlug(leagueSlug);
  if (!cfg) redirect("/admin?error=invalid");
  const league = cfg.league;

  const id = String(formData.get("id") ?? "");
  const color = String(formData.get("color") ?? "").trim();
  const car = asUploadFile(formData.get("car"));
  const heroBackground = asUploadFile(formData.get("heroBackground"));
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!id) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  const current = await prisma.teamSeason
    .findUnique({
      where: { id },
      select: {
        id: true,
        teamId: true,
        seasonId: true,
        carImagePath: true,
        heroBackgroundPath: true,
        season: { select: { league: true } }
      }
    })
    .catch(() => null);

  if (!current || current.season.league !== league) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  let carImagePath: string | null | undefined = undefined;
  let newCarImagePath: string | null = null;
  if (car && car.size > 0) {
    if (car.size > 5_000_000) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const ext = extFromMime(car.type);
    if (!ext) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const fileName = `team-car-${current.teamId}-${current.seasonId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, car);
    carImagePath = fileName;
    newCarImagePath = fileName;
  }

  let heroBackgroundPath: string | null | undefined = undefined;
  let newHeroBackgroundPath: string | null = null;
  if (heroBackground && heroBackground.size > 0) {
    if (heroBackground.size > 5_000_000) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const ext = extFromMime(heroBackground.type);
    if (!ext) redirect(`/admin/${leagueSlug}/teams?error=image`);
    const fileName = `team-hero-bg-${current.teamId}-${current.seasonId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, heroBackground);
    heroBackgroundPath = fileName;
    newHeroBackgroundPath = fileName;
  }

  try {
    await prisma.teamSeason.update({
      where: { id },
      data: {
        color: color || null,
        ...(carImagePath !== undefined ? { carImagePath } : {}),
        ...(heroBackgroundPath !== undefined ? { heroBackgroundPath } : {})
      }
    });
  } catch {
    deleteUpload(newCarImagePath);
    deleteUpload(newHeroBackgroundPath);
    redirect(`/admin/${leagueSlug}/teams?error=save`);
  }

  if (newCarImagePath && current.carImagePath) deleteUpload(current.carImagePath);
  if (newHeroBackgroundPath && current.heroBackgroundPath) deleteUpload(current.heroBackgroundPath);

  revalidatePath(`/admin/${leagueSlug}/teams`);
  await revalidatePublicTeamsForLeague(cfg.publicSlug, current.teamId);
  redirect(`/admin/${leagueSlug}/teams?ok=1&seasonId=${encodeURIComponent(seasonId || current.seasonId)}`);
}

async function deleteParticipation(formData: FormData) {
  "use server";
  const leagueSlug = String(formData.get("league") ?? "");
  const cfg = await resolveLeagueByAdminSlug(leagueSlug);
  if (!cfg) redirect("/admin?error=invalid");
  const league = cfg.league;

  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!id) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  const current = await prisma.teamSeason
    .findUnique({
      where: { id },
      select: {
        id: true,
        teamId: true,
        seasonId: true,
        carImagePath: true,
        heroBackgroundPath: true,
        season: { select: { league: true } }
      }
    })
    .catch(() => null);

  if (!current || current.season.league !== league) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  await prisma.teamSeason.delete({ where: { id } }).catch(() => null);
  deleteUpload(current.carImagePath);
  deleteUpload(current.heroBackgroundPath);

  revalidatePath(`/admin/${leagueSlug}/teams`);
  await revalidatePublicTeamsForLeague(cfg.publicSlug, current.teamId);
  redirect(`/admin/${leagueSlug}/teams?ok=1&seasonId=${encodeURIComponent(seasonId || current.seasonId)}`);
}

async function clearParticipationImage(formData: FormData) {
  "use server";
  const leagueSlug = String(formData.get("league") ?? "");
  const cfg = await resolveLeagueByAdminSlug(leagueSlug);
  if (!cfg) redirect("/admin?error=invalid");
  const league = cfg.league;

  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!id) redirect(`/admin/${leagueSlug}/teams?error=invalid`);
  if (kind !== "car" && kind !== "heroBackground") redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  const current = await prisma.teamSeason
    .findUnique({
      where: { id },
      select: {
        id: true,
        teamId: true,
        seasonId: true,
        carImagePath: true,
        heroBackgroundPath: true,
        season: { select: { league: true } }
      }
    })
    .catch(() => null);

  if (!current || current.season.league !== league) redirect(`/admin/${leagueSlug}/teams?error=invalid`);

  if (kind === "car") {
    await prisma.teamSeason.update({ where: { id }, data: { carImagePath: null } }).catch(() => null);
    deleteUpload(current.carImagePath);
  } else {
    await prisma.teamSeason.update({ where: { id }, data: { heroBackgroundPath: null } }).catch(() => null);
    deleteUpload(current.heroBackgroundPath);
  }

  revalidatePath(`/admin/${leagueSlug}/teams`);
  await revalidatePublicTeamsForLeague(cfg.publicSlug, current.teamId);
  redirect(`/admin/${leagueSlug}/teams?ok=1&seasonId=${encodeURIComponent(seasonId || current.seasonId)}`);
}

export default async function AdminLeagueTeamsPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ ok?: string; error?: string; seasonId?: string }>;
}) {
  await requireAdmin();

  const { league: leagueSlug } = await params;
  const cfg = await resolveLeagueByAdminSlug(leagueSlug);
  if (!cfg) notFound();
  const l = cfg.league;

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const seasons = await prisma.season
    .findMany({
      where: { league: l, placement: SeasonPlacement.CALENDAR },
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { isTest: "asc" }],
      take: 50,
      select: { id: true, year: true, seasonNo: true, isTest: true }
    })
    .catch(() => []);

  const activeSeason =
    sp.seasonId && seasons.some((s) => s.id === sp.seasonId)
      ? seasons.find((s) => s.id === sp.seasonId) ?? null
      : await getActiveSeason({
          league: l,
          select: { id: true, year: true, seasonNo: true, isTest: true }
        }).catch(() => null);

  const seasonId = activeSeason?.id ?? seasons[0]?.id ?? null;

  const participations = seasonId
    ? await prisma.teamSeason
        .findMany({
          where: { seasonId },
          orderBy: [{ team: { name: "asc" } }],
          select: {
            id: true,
            seasonId: true,
            color: true,
            carImagePath: true,
            heroBackgroundPath: true,
            team: { select: { id: true, name: true, color: true, logoPath: true } }
          }
        })
        .catch(() => [])
    : [];

  const teams = await prisma.team
    .findMany({
      where: { leagues: { some: { league: l } } },
      orderBy: [{ name: "asc" }],
      take: 200,
      select: { id: true, name: true, color: true }
    })
    .catch(() => []);

  const usedTeamIds = new Set(participations.map((p) => p.team.id));
  const availableTeams = teams.filter((t) => !usedTeamIds.has(t.id));

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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Teams · {cfg.name}</div>
            <div className="text-sm text-white/60">
              Teams einmal unter Allgemein anlegen, dann hier pro Saison der Liga konfigurieren.
            </div>
          </div>
          <Link
            href="/admin/settings/teams"
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            Team anlegen
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Saison
              </label>
              <form className="flex gap-2">
                <select
                  name="seasonId"
                  defaultValue={seasonId ?? ""}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      Saison {s.year} · Season {s.seasonNo}
                      {s.isTest ? " · TEST" : ""}
                    </option>
                  ))}
                </select>
                <button className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
                  Anzeigen
                </button>
              </form>
            </div>
          </div>
        </div>

        {seasonId ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-base font-semibold">Team zur Saison hinzufügen</div>
            <TeamSeasonAddForm
              leagueSlug={leagueSlug}
              seasonId={seasonId}
              availableTeams={availableTeams}
              action={addParticipation}
            />
          </div>
        ) : null}

        <div className="space-y-4">
          {participations.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Keine Teams in dieser Saison.
            </div>
          ) : (
            participations.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {p.team.logoPath ? (
                        <img
                          src={imageUrl(p.team.logoPath) ?? ""}
                          alt=""
                          className="h-9 w-9 rounded-lg bg-black/20 object-contain"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-black/20" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold">
                          {p.team.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
                          <div
                            className="h-3 w-3 rounded"
                            style={{
                              backgroundColor:
                                p.color ?? p.team.color ?? "#ffffff"
                            }}
                          />
                          <div>{p.color ?? p.team.color ?? "-"}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <form action={deleteParticipation}>
                    <input type="hidden" name="league" value={leagueSlug} />
                    <input type="hidden" name="seasonId" value={seasonId ?? ""} />
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                      Entfernen
                    </button>
                  </form>
                </div>

                <form
                  action={updateParticipation}
                  encType="multipart/form-data"
                  className="mt-4 grid gap-4 md:grid-cols-3"
                >
                  <input type="hidden" name="league" value={leagueSlug} />
                  <input type="hidden" name="seasonId" value={seasonId ?? ""} />
                  <input type="hidden" name="id" value={p.id} />
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-white/70">
                      Farbe (optional)
                    </label>
                    <input
                      name="color"
                      type="color"
                      defaultValue={p.color ?? p.team.color ?? "#e10600"}
                      className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-white/70">
                      Auto-Design ersetzen (PNG/JPG/WEBP)
                    </label>
                    <input
                      name="car"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-semibold text-white/70">
                      Hero Background ersetzen (PNG/JPG/WEBP)
                    </label>
                    <input
                      name="heroBackground"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="md:col-span-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {p.carImagePath ? (
                        <img
                          src={imageUrl(p.carImagePath) ?? ""}
                          alt=""
                          className="h-12 w-24 rounded-lg bg-black/20 object-contain"
                        />
                      ) : (
                        <div className="h-12 w-24 rounded-lg bg-black/20" />
                      )}
                      <div className="text-xs text-white/60">
                        {p.carImagePath ?? "Noch kein Design hochgeladen"}
                      </div>
                      <div className="text-xs text-white/60">
                        {p.heroBackgroundPath
                          ? "Hero Background gesetzt"
                          : "Kein Hero Background"}
                      </div>
                    </div>
                    <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                      Speichern
                    </button>
                  </div>
                </form>

                {(p.carImagePath || p.heroBackgroundPath) ? (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    {p.carImagePath ? (
                      <form action={clearParticipationImage}>
                        <input type="hidden" name="league" value={leagueSlug} />
                        <input type="hidden" name="seasonId" value={seasonId ?? ""} />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="kind" value="car" />
                        <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                          Design löschen
                        </button>
                      </form>
                    ) : null}
                    {p.heroBackgroundPath ? (
                      <form action={clearParticipationImage}>
                        <input type="hidden" name="league" value={leagueSlug} />
                        <input type="hidden" name="seasonId" value={seasonId ?? ""} />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="kind" value="heroBackground" />
                        <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                          Hover löschen
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
