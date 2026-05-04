import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const leagueEnum: Record<string, League> = {
  one: League.ONE,
  two: League.TWO,
  rookie: League.ROOKIE
};

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function parseStartsAt(raw: string) {
  const v = raw.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd, hh, min] = iso;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      0,
      0
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = v.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:,\s*|\s+)(\d{2}):(\d{2})$/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    0,
    0
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTimeLocal(d: Date) {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
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

async function writeRaceImage(fileName: string, file: File) {
  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
}

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
};

async function createRace(
  adminLeague: string,
  league: League,
  formData: FormData
) {
  "use server";

  await requireAdmin();
  const basePath = `/admin/${adminLeague}/races`;
  const seasonRaw = String(formData.get("season") ?? "").trim();
  const roundRaw = String(formData.get("round") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const circuit = String(formData.get("circuit") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();

  const returnQuery = new URLSearchParams();
  if (seasonRaw) returnQuery.set("season", seasonRaw);
  if (roundRaw) returnQuery.set("round", roundRaw);
  if (name) returnQuery.set("name", name);
  if (circuit) returnQuery.set("circuit", circuit);
  if (location) returnQuery.set("location", location);
  if (startsAtRaw) returnQuery.set("startsAt", startsAtRaw);

  const season = Number.parseInt(seasonRaw, 10);
  const round = Number.parseInt(roundRaw, 10);

  if (!Number.isFinite(season) || !Number.isFinite(round) || !name) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }
  if (!startsAtRaw) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }

  const startsAt = parseStartsAt(startsAtRaw);
  if (!startsAt) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }
  returnQuery.set("startsAt", formatDateTimeLocal(startsAt));

  try {
    const created = await prisma.race.create({
      data: {
        league,
        season,
        round,
        name,
        circuit: circuit || null,
        location: location || null,
        startsAt
      }
    });

    const image = formData.get("image");
    if (image instanceof File && image.size > 0) {
      if (image.size > 5_000_000) {
        returnQuery.set("error", "image");
        redirect(`${basePath}?${returnQuery.toString()}`);
      }
      const ext = extFromMime(image.type);
      if (!ext) {
        returnQuery.set("error", "image");
        redirect(`${basePath}?${returnQuery.toString()}`);
      }
      const fileName = `${created.id}.${ext}`;
      await writeRaceImage(fileName, image);
      await prisma.race.update({
        where: { id: created.id },
        data: { imagePath: fileName }
      });
    }
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code?: string }).code
        : undefined;
    if (code === "P2002") {
      returnQuery.set("error", "duplicate");
      redirect(`${basePath}?${returnQuery.toString()}`);
    }
    returnQuery.set("error", "save");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }

  const publicSlug =
    league === League.ONE
      ? "mrl-one"
      : league === League.TWO
        ? "mrl-two"
        : "mrl-rookie";

  revalidatePath(`/admin/${adminLeague}/races`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/${publicSlug}/calendar`);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`${basePath}?ok=1`);
}

async function updateRaceImage(adminLeague: string, formData: FormData) {
  "use server";
  await requireAdmin();

  const basePath = `/admin/${adminLeague}/races`;
  const raceId = String(formData.get("raceId") ?? "");
  const image = formData.get("image");
  if (!raceId) redirect(`${basePath}?error=image`);
  if (!(image instanceof File) || image.size === 0) redirect(`${basePath}?error=image`);
  if (image.size > 5_000_000) redirect(`${basePath}?error=image`);
  const ext = extFromMime(image.type);
  if (!ext) redirect(`${basePath}?error=image`);
  const fileName = `${raceId}.${ext}`;

  await writeRaceImage(fileName, image);
  await prisma.race.update({
    where: { id: raceId },
    data: { imagePath: fileName }
  });

  revalidatePath(`/admin/${adminLeague}/races`);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`${basePath}?ok=1`);
}

async function deleteRace(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await prisma.race
    .findUnique({ where: { id }, select: { imagePath: true } })
    .catch(() => null);
  await prisma.race.delete({ where: { id } });
  if (existing?.imagePath) {
    try {
      const abs = path.join(dataRootDir(), "uploads", existing.imagePath);
      fs.unlinkSync(abs);
    } catch {}
  }

  revalidatePath("/admin");
  revalidatePath("/admin/one/races");
  revalidatePath("/admin/two/races");
  revalidatePath("/admin/rookie/races");
  revalidatePath("/admin/one/results");
  revalidatePath("/admin/two/results");
  revalidatePath("/admin/rookie/results");
  revalidatePath("/mrl-one/calendar");
  revalidatePath("/mrl-two/calendar");
  revalidatePath("/mrl-rookie/calendar");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export default async function AdminRacesPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{
    ok?: string;
    error?: string;
    season?: string;
    round?: string;
    name?: string;
    circuit?: string;
    location?: string;
    startsAt?: string;
  }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;
  const startsAtDefault = sp.startsAt ? parseStartsAt(sp.startsAt) : null;
  const defaults = {
    season: sp.season ?? "",
    round: sp.round ?? "",
    name: sp.name ?? "",
    circuit: sp.circuit ?? "",
    location: sp.location ?? "",
    startsAt: startsAtDefault ? formatDateTimeLocal(startsAtDefault) : ""
  };

  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  type RaceItem = {
    id: string;
    season: number;
    round: number;
    name: string;
    startsAt: Date;
    circuit: string | null;
  };

  let races: RaceItem[] = [];
  try {
    races = await prisma.race.findMany({
      where: { league: l },
      orderBy: [{ season: "desc" }, { round: "asc" }],
      take: 120,
      select: { id: true, season: true, round: true, name: true, startsAt: true, circuit: true }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">
          Rennkalender · {leagueLabel[l]}
        </div>
        {ok ? (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            Gespeichert.
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error === "duplicate"
              ? "Diese Saison/Runde existiert bereits."
              : error === "invalid"
                ? "Bitte alle Pflichtfelder korrekt ausfüllen."
                : error === "image"
                  ? "Bild-Upload fehlgeschlagen (nur JPG/PNG/WEBP, max. 5MB)."
                : "Speichern fehlgeschlagen. Bitte erneut versuchen."}
          </div>
        ) : null}
        <form
          action={createRace.bind(null, league, l)}
          encType="multipart/form-data"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Saison
            </label>
            <input
              name="season"
              type="number"
              inputMode="numeric"
              step={1}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="2026"
              defaultValue={defaults.season}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Runde
            </label>
            <input
              name="round"
              type="number"
              inputMode="numeric"
              step={1}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="1"
              defaultValue={defaults.round}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Rennen
            </label>
            <input
              name="name"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="Bahrain GP"
              defaultValue={defaults.name}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Strecke
            </label>
            <input
              name="circuit"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              defaultValue={defaults.circuit}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Ort
            </label>
            <input
              name="location"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              defaultValue={defaults.location}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Start (Datum & Uhrzeit)
            </label>
            <input
              name="startsAt"
              type="datetime-local"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              defaultValue={defaults.startsAt}
            />
            <div className="mt-1 text-xs text-white/60">
              Datum & Uhrzeit bitte über den Picker auswählen.
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Bild (optional)
            </label>
            <input
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
            Speichern
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Rennen</div>
          <Link
            href={`/admin/${league}/results`}
            className="text-sm font-semibold text-white/70 hover:text-white"
          >
            Zu den Ergebnissen
          </Link>
        </div>
        <div className="mt-4 space-y-2">
          {races.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Rennen.</div>
          ) : (
            races.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    Saison {r.season} · Runde {r.round} · {r.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {new Date(r.startsAt).toLocaleString("de-DE")}
                    {r.circuit ? ` · ${r.circuit}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <form
                    action={updateRaceImage.bind(null, league)}
                    encType="multipart/form-data"
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="raceId" value={r.id} />
                    <input
                      name="image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="w-[190px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
                    />
                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                      Bild
                    </button>
                  </form>
                  <Link
                    href={`/admin/${league}/results/${r.id}`}
                    className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Ergebnisse
                  </Link>
                  <form action={deleteRace}>
                    <input type="hidden" name="id" value={r.id} />
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
