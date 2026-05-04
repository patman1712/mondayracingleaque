import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { League } from "@prisma/client";
import { revalidatePath } from "next/cache";
import fs from "node:fs";
import path from "node:path";

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

async function writeUpload(fileName: string, file: File) {
  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
};

async function createTeam(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const logo = formData.get("logo");

  if (!name) redirect("/admin/settings/teams?error=invalid");

  const created = await prisma.team
    .create({
      data: {
        name,
        color: color || null,
        logoPath: null
      },
      select: { id: true }
    })
    .catch(() => null);

  if (!created) redirect("/admin/settings/teams?error=duplicate");

  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 5_000_000) redirect("/admin/settings/teams?error=image");
    const ext = extFromMime(logo.type);
    if (!ext) redirect("/admin/settings/teams?error=image");
    const fileName = `team-logo-${created.id}-${Date.now()}.${ext}`;
    await writeUpload(fileName, logo);
    await prisma.team.update({ where: { id: created.id }, data: { logoPath: fileName } }).catch(() => null);
  }

  revalidatePath("/admin/settings/teams");
  redirect("/admin/settings/teams?ok=1");
}

async function deleteTeam(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const t = await prisma.team.findUnique({ where: { id }, select: { logoPath: true } }).catch(() => null);
  await prisma.team.delete({ where: { id } }).catch(() => null);

  if (t?.logoPath) {
    const abs = path.join(dataRootDir(), "uploads", t.logoPath);
    try {
      fs.unlinkSync(abs);
    } catch {}
  }

  revalidatePath("/admin/settings/teams");
  revalidatePath("/admin/one/drivers");
  revalidatePath("/admin/two/drivers");
  revalidatePath("/admin/rookie/drivers");
  redirect("/admin/settings/teams?ok=1");
}

async function addParticipation(formData: FormData) {
  "use server";
  const teamId = String(formData.get("teamId") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const color = String(formData.get("color") ?? "").trim();
  const car = formData.get("car");

  if (!teamId || !seasonId) redirect("/admin/settings/teams?error=invalid");

  let carImagePath: string | null = null;
  if (car instanceof File && car.size > 0) {
    if (car.size > 8_000_000) redirect("/admin/settings/teams?error=image");
    const ext = extFromMime(car.type);
    if (!ext) redirect("/admin/settings/teams?error=image");
    const fileName = `team-car-${teamId}-${seasonId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, car);
    carImagePath = fileName;
  }

  await prisma.teamSeason
    .create({
      data: {
        teamId,
        seasonId,
        color: color || null,
        carImagePath
      }
    })
    .catch(() => redirect("/admin/settings/teams?error=duplicate"));

  revalidatePath("/admin/settings/teams");
  redirect("/admin/settings/teams?ok=1");
}

async function updateParticipation(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const color = String(formData.get("color") ?? "").trim();
  const car = formData.get("car");
  if (!id) return;

  const current = await prisma.teamSeason.findUnique({ where: { id }, select: { teamId: true, seasonId: true, carImagePath: true } }).catch(() => null);
  if (!current) redirect("/admin/settings/teams?error=invalid");

  let carImagePath: string | null | undefined = undefined;
  if (car instanceof File && car.size > 0) {
    if (car.size > 8_000_000) redirect("/admin/settings/teams?error=image");
    const ext = extFromMime(car.type);
    if (!ext) redirect("/admin/settings/teams?error=image");
    const fileName = `team-car-${current.teamId}-${current.seasonId}-${Date.now()}.${ext}`;
    await writeUpload(fileName, car);
    carImagePath = fileName;
    if (current.carImagePath) {
      const abs = path.join(dataRootDir(), "uploads", current.carImagePath);
      try {
        fs.unlinkSync(abs);
      } catch {}
    }
  }

  await prisma.teamSeason.update({
    where: { id },
    data: {
      color: color || null,
      ...(carImagePath !== undefined ? { carImagePath } : {})
    }
  });

  revalidatePath("/admin/settings/teams");
  redirect("/admin/settings/teams?ok=1");
}

async function deleteParticipation(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const current = await prisma.teamSeason.findUnique({ where: { id }, select: { carImagePath: true } }).catch(() => null);
  await prisma.teamSeason.delete({ where: { id } }).catch(() => null);

  if (current?.carImagePath) {
    const abs = path.join(dataRootDir(), "uploads", current.carImagePath);
    try {
      fs.unlinkSync(abs);
    } catch {}
  }

  revalidatePath("/admin/settings/teams");
  redirect("/admin/settings/teams?ok=1");
}

export default async function AdminTeamsPage({
  searchParams
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const seasons = await prisma.season
    .findMany({
      orderBy: [{ year: "desc" }, { seasonNo: "desc" }, { league: "asc" }],
      take: 300
    })
    .catch(() => []);

  const teams = await prisma.team
    .findMany({
      orderBy: [{ name: "asc" }],
      take: 200,
      include: {
        participations: {
          include: { season: true },
          orderBy: [{ createdAt: "desc" }]
        }
      }
    })
    .catch(() => []);

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
          <div className="text-base font-semibold">Teams</div>
          <form
            action={createTeam}
            encType="multipart/form-data"
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Teamname
              </label>
              <input
                name="name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="Red Bull Racing"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Teamfarbe
              </label>
              <input
                name="color"
                type="color"
                defaultValue="#e10600"
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Teamlogo (optional)
              </label>
              <input
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div className="flex items-end">
              <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Team anlegen
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          {teams.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
              Noch keine Teams.
            </div>
          ) : (
            teams.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {t.logoPath ? (
                        <img
                          src={imageUrl(t.logoPath) ?? ""}
                          alt=""
                          className="h-9 w-9 rounded-lg bg-black/20 object-contain"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-black/20" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold">
                          {t.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
                          <div
                            className="h-3 w-3 rounded"
                            style={{ backgroundColor: t.color ?? "#ffffff" }}
                          />
                          <div>{t.color ?? "-"}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <form action={deleteTeam}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                      Löschen
                    </button>
                  </form>
                </div>

                <div className="mt-6">
                  <div className="text-sm font-semibold">Teilnahmen (Liga/Saison)</div>
                  <div className="mt-3 space-y-3">
                    {t.participations.length === 0 ? (
                      <div className="text-sm text-white/60">
                        Noch keine Saison-Teilnahmen.
                      </div>
                    ) : (
                      t.participations.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-xl border border-white/10 bg-black/20 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm text-white/80">
                              {leagueLabel[p.season.league]} · Saison {p.season.year} · Season {p.season.seasonNo}
                              {p.season.isTest ? " · TEST" : ""}
                            </div>
                            <form action={deleteParticipation}>
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
                            <input type="hidden" name="id" value={p.id} />
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-white/70">
                                Farbe (optional)
                              </label>
                              <input
                                name="color"
                                type="color"
                                defaultValue={p.color ?? t.color ?? "#e10600"}
                                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="mb-1 block text-xs font-semibold text-white/70">
                                Auto-Design (PNG/JPG/WEBP)
                              </label>
                              <input
                                name="car"
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
                              </div>
                              <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                                Speichern
                              </button>
                            </div>
                          </form>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold">Teilnahme hinzufügen</div>
                    <form
                      action={addParticipation}
                      encType="multipart/form-data"
                      className="mt-3 grid gap-4 md:grid-cols-3"
                    >
                      <input type="hidden" name="teamId" value={t.id} />
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-white/70">
                          Season (Liga/Jahr)
                        </label>
                        <select
                          name="seasonId"
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                          defaultValue=""
                        >
                          <option value="">Bitte wählen</option>
                          {seasons.map((s) => (
                            <option key={s.id} value={s.id}>
                              {leagueLabel[s.league]} · Saison {s.year} · Season {s.seasonNo}
                              {s.isTest ? " · TEST" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-white/70">
                          Farbe (optional)
                        </label>
                        <input
                          name="color"
                          type="color"
                          defaultValue={t.color ?? "#e10600"}
                          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-semibold text-white/70">
                          Auto-Design Upload
                        </label>
                        <input
                          name="car"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                        />
                      </div>
                      <div className="flex items-end">
                        <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                          Hinzufügen
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}

