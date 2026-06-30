import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { getActiveSeason } from "@/lib/currentSeason";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { recalcSeasonStats } from "@/lib/seasonStats";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

const DISPLAY_TZ = "Europe/Berlin";

function getTimeZoneOffsetMs(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = dtf.formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value] as const));
  const y = Number(map.get("year"));
  const m = Number(map.get("month"));
  const d = Number(map.get("day"));
  const hh = Number(map.get("hour"));
  const mm = Number(map.get("minute"));
  const ss = Number(map.get("second"));
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return asUtc - date.getTime();
}

function zonedTimeToUtc(timeZone: string, y: number, m: number, d: number, hh: number, mm: number) {
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let offset = getTimeZoneOffsetMs(timeZone, new Date(utc));
  utc = utc - offset;
  offset = getTimeZoneOffsetMs(timeZone, new Date(utc));
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) - offset);
}

type ParsedStartsAt = { date: Date; localIso: string };

function parseStartsAt(raw: string): ParsedStartsAt | null {
  const v = raw.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd, hh, min] = iso;
    const y = Number(yyyy);
    const m = Number(mm);
    const d = Number(dd);
    const h = Number(hh);
    const mi = Number(min);
    const date = zonedTimeToUtc(DISPLAY_TZ, y, m, d, h, mi);
    if (Number.isNaN(date.getTime())) return null;
    return { date, localIso: `${yyyy}-${mm}-${dd}T${hh}:${min}` };
  }

  const isoComma = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:,\s*|\s+)(\d{2}):(\d{2})$/);
  if (isoComma) {
    const [, yyyy, mm, dd, hh, min] = isoComma;
    const y = Number(yyyy);
    const m = Number(mm);
    const d = Number(dd);
    const h = Number(hh);
    const mi = Number(min);
    const date = zonedTimeToUtc(DISPLAY_TZ, y, m, d, h, mi);
    if (Number.isNaN(date.getTime())) return null;
    return { date, localIso: `${yyyy}-${mm}-${dd}T${hh}:${min}` };
  }

  const m = v.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:,\s*|\s+)(\d{2}):(\d{2})$/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  const y = Number(yyyy);
  const mo = Number(mm);
  const da = Number(dd);
  const h = Number(hh);
  const mi = Number(min);
  const date = zonedTimeToUtc(DISPLAY_TZ, y, mo, da, h, mi);
  if (Number.isNaN(date.getTime())) return null;
  return { date, localIso: `${yyyy}-${mm}-${dd}T${hh}:${min}` };
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

function buildRaceName(input: {
  season: number;
  seasonNo: number;
  seasonIsTest: boolean;
  round: number;
  isSprint: boolean;
  circuit: string | null;
  location: string | null;
}) {
  const base = input.circuit ? input.circuit : `Runde ${input.round}`;
  const withSprint = input.isSprint ? `SPRINT · ${base}` : base;
  return input.seasonIsTest ? `TEST · ${withSprint}` : withSprint;
}

function weekendKey(input: {
  season: number;
  seasonNo: number;
  seasonIsTest: boolean;
  round: number;
}) {
  return `${input.season}-${input.seasonNo}-${input.seasonIsTest ? "1" : "0"}-${input.round}`;
}

async function createRace(
  adminLeague: string,
  league: League,
  formData: FormData
) {
  "use server";

  await requireAdmin();
  const basePath = `/admin/${adminLeague}/races`;
  const seasonKey = String(formData.get("seasonKey") ?? "").trim();
  const seasonRaw = String(formData.get("season") ?? "").trim();
  const seasonNoRaw = String(formData.get("seasonNo") ?? "").trim();
  const roundRaw = String(formData.get("round") ?? "").trim();
  const isSprint = formData.get("isSprint") === "on";
  const name = String(formData.get("name") ?? "").trim();
  const circuitId = String(formData.get("circuitId") ?? "").trim();
  const circuit = String(formData.get("circuit") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();

  const returnQuery = new URLSearchParams();
  if (seasonKey) returnQuery.set("seasonKey", seasonKey);
  if (seasonRaw) returnQuery.set("season", seasonRaw);
  if (seasonNoRaw) returnQuery.set("seasonNo", seasonNoRaw);
  if (roundRaw) returnQuery.set("round", roundRaw);
  if (name) returnQuery.set("name", name);
  if (circuitId) returnQuery.set("circuitId", circuitId);
  if (circuit) returnQuery.set("circuit", circuit);
  if (location) returnQuery.set("location", location);
  if (startsAtRaw) returnQuery.set("startsAt", startsAtRaw);
  if (isSprint) returnQuery.set("isSprint", "1");

  const seasonFromKey = seasonKey.match(/^(\d{4})-(\d{1,2})-(0|1)$/);
  const season = Number.parseInt(seasonFromKey?.[1] ?? seasonRaw, 10);
  const seasonNoFallback = seasonNoRaw || "1";
  const seasonNo = Number.parseInt(seasonFromKey?.[2] ?? seasonNoFallback, 10);
  const seasonIsTest = seasonFromKey?.[3] === "1";
  const round = Number.parseInt(roundRaw, 10);

  if (!Number.isFinite(season) || !Number.isFinite(seasonNo) || !Number.isFinite(round)) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }
  if (!circuitId && !circuit) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }
  if (!startsAtRaw) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }

  const parsedStartsAt = parseStartsAt(startsAtRaw);
  if (!parsedStartsAt) {
    returnQuery.set("error", "invalid");
    redirect(`${basePath}?${returnQuery.toString()}`);
  }
  returnQuery.set("startsAt", parsedStartsAt.localIso);

  try {
    let circuitNameToSave = circuit || null;
    let locationToSave = location || null;
    let circuitImagePath: string | null = null;
    if (circuitId) {
      const c = await prisma.circuit
        .findUnique({
          where: { id: circuitId },
          select: { name: true, location: true, imagePath: true }
        })
        .catch(() => null);
      if (!c) {
        returnQuery.set("error", "invalid");
        redirect(`${basePath}?${returnQuery.toString()}`);
      }
      circuitNameToSave = c.name;
      locationToSave = c.location ?? null;
      circuitImagePath = c.imagePath ?? null;
    }

    const nameToSave =
      name ||
      buildRaceName({
        season,
        seasonNo,
        seasonIsTest,
        round,
        isSprint,
        circuit: circuitNameToSave,
        location: locationToSave
      });
    if (!nameToSave.trim()) {
      returnQuery.set("error", "invalid");
      redirect(`${basePath}?${returnQuery.toString()}`);
    }

    const created = await prisma.race.create({
      data: {
        league,
        season,
        seasonNo,
        seasonIsTest,
        round,
        isSprint,
        name: nameToSave,
        circuitId: circuitId || null,
        circuit: circuitNameToSave,
        location: locationToSave,
        startsAt: parsedStartsAt.date
      }
    });

    if (isSprint) {
      const mainRaceName = buildRaceName({
        season,
        seasonNo,
        seasonIsTest,
        round,
        isSprint: false,
        circuit: circuitNameToSave,
        location: locationToSave
      });

      await prisma.race.upsert({
        where: {
          league_season_seasonNo_seasonIsTest_round_isSprint: {
            league,
            season,
            seasonNo,
            seasonIsTest,
            round,
            isSprint: false
          }
        },
        create: {
          league,
          season,
          seasonNo,
          seasonIsTest,
          round,
          isSprint: false,
          name: mainRaceName,
          circuitId: circuitId || null,
          circuit: circuitNameToSave,
          location: locationToSave,
          startsAt: parsedStartsAt.date
        },
        update: {
          circuitId: circuitId || null,
          circuit: circuitNameToSave,
          location: locationToSave,
          startsAt: parsedStartsAt.date
        }
      });
    }

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
    } else if (circuitImagePath) {
      try {
        const root = dataRootDir();
        const uploads = path.join(root, "uploads");
        const src = path.join(uploads, circuitImagePath);
        if (fs.existsSync(src)) {
          const ext = path.extname(circuitImagePath);
          const destName = `${created.id}${ext}`;
          const dest = path.join(uploads, destName);
          ensureDir(uploads);
          fs.copyFileSync(src, dest);
          await prisma.race.update({
            where: { id: created.id },
            data: { imagePath: destName }
          });
        }
      } catch {}
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

  const slugRow = await prisma.leagueConfig
    .findUnique({ where: { league }, select: { publicSlug: true } })
    .catch(() => null);
  const publicSlug =
    slugRow?.publicSlug ??
    (league === League.ONE ? "mrl-one" : league === League.TWO ? "mrl-two" : "mrl-rookie");

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
    .findUnique({
      where: { id },
      select: { imagePath: true, league: true, season: true, seasonNo: true, seasonIsTest: true }
    })
    .catch(() => null);

  const seasonRow = existing
    ? await prisma.season
        .findUnique({
          where: {
            league_year_seasonNo_isTest: {
              league: existing.league,
              year: existing.season,
              seasonNo: existing.seasonNo,
              isTest: existing.seasonIsTest
            }
          },
          select: { id: true }
        })
        .catch(() => null)
    : null;

  await prisma.race.delete({ where: { id } });
  if (existing?.imagePath && !existing.imagePath.startsWith("circuit-")) {
    try {
      const abs = path.join(dataRootDir(), "uploads", existing.imagePath);
      fs.unlinkSync(abs);
    } catch {}
  }

  if (seasonRow?.id) {
    await recalcSeasonStats(prisma, seasonRow.id);
  }

  revalidatePath("/admin");
  const slugs =
    (await prisma.leagueConfig
      .findMany({ select: { adminSlug: true, publicSlug: true } })
      .catch(() => [])) ?? [];
  const list =
    slugs.length > 0
      ? slugs
      : [
          { adminSlug: "one", publicSlug: "mrl-one" },
          { adminSlug: "two", publicSlug: "mrl-two" },
          { adminSlug: "rookie", publicSlug: "mrl-rookie" }
        ];
  for (const l of list) {
    revalidatePath(`/admin/${l.adminSlug}/races`);
    revalidatePath(`/admin/${l.adminSlug}/results`);
    revalidatePath(`/${l.publicSlug}/calendar`);
    revalidatePath(`/${l.publicSlug}/standings`);
  }
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
    seasonNo?: string;
    seasonKey?: string;
    round?: string;
    isSprint?: string;
    name?: string;
    circuitId?: string;
    circuit?: string;
    location?: string;
    startsAt?: string;
  }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;
  const defaults = {
    season: sp.season ?? "",
    seasonNo: sp.seasonNo ?? "",
    seasonKey: sp.seasonKey ?? "",
    round: sp.round ?? "",
    isSprint: sp.isSprint ?? "",
    name: sp.name ?? "",
    circuitId: sp.circuitId ?? "",
    circuit: sp.circuit ?? "",
    location: sp.location ?? "",
    startsAt: sp.startsAt ?? ""
  };

  const { league } = await params;
  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;

  type SeasonItem = {
    year: number;
    seasonNo: number;
    label: string | null;
    isTest: boolean;
    placement: "CALENDAR" | "ARCHIVE";
  };
  type CircuitItem = { id: string; name: string; location: string | null };

  const [seasons, circuits] = await Promise.all([
    prisma.season
      .findMany({
        where: { league: l },
        orderBy: [{ year: "desc" }, { seasonNo: "desc" }],
        take: 50,
        select: { year: true, seasonNo: true, label: true, isTest: true, placement: true }
      })
      .catch((): SeasonItem[] => []),
    prisma.circuit
      .findMany({
        orderBy: [{ name: "asc" }, { location: "asc" }],
        take: 300,
        select: { id: true, name: true, location: true }
      })
      .catch((): CircuitItem[] => [])
  ]);

  const activeSeason = await getActiveSeason({
    league: l,
    select: { year: true, seasonNo: true, isTest: true }
  }).catch(() => null);

  const defaultSeason =
    (activeSeason
      ? seasons.find(
          (s) => s.year === activeSeason.year && s.seasonNo === activeSeason.seasonNo && s.isTest === activeSeason.isTest
        )
      : null) ??
    seasons.find((s) => s.placement === "CALENDAR" && !s.isTest) ??
    seasons.find((s) => s.placement === "CALENDAR") ??
    seasons.find((s) => !s.isTest) ??
    seasons[0] ??
    null;

  type RaceItem = {
    id: string;
    season: number;
    seasonNo: number;
    seasonIsTest: boolean;
    round: number;
    isSprint: boolean;
    name: string;
    startsAt: Date;
    circuit: string | null;
  };

  let races: RaceItem[] = [];
  try {
    races = await prisma.race.findMany({
      where: { league: l },
      orderBy: [{ season: "desc" }, { seasonNo: "desc" }, { seasonIsTest: "asc" }, { round: "asc" }],
      take: 120,
      select: {
        id: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        isSprint: true,
        name: true,
        startsAt: true,
        circuit: true
      }
    });
  } catch {}

  const visibleRaces = Array.from(
    races.reduce((acc, r) => {
      const key = weekendKey(r);
      const current = acc.get(key) ?? null;
      if (!current || (!current.isSprint && r.isSprint)) acc.set(key, r);
      return acc;
    }, new Map<string, RaceItem>())
  )
    .map(([, r]) => r)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Rennkalender · {cfg.name}</div>
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
            {seasons.length > 0 ? (
              <select
                name="seasonKey"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                defaultValue={
                  defaults.seasonKey ||
                  `${defaultSeason?.year ?? new Date().getFullYear()}-${defaultSeason?.seasonNo ?? 1}-${defaultSeason?.isTest ? 1 : 0}`
                }
              >
                {seasons.map((s) => (
                  <option
                    key={`${s.year}-${s.seasonNo}-${s.isTest ? 1 : 0}`}
                    value={`${s.year}-${s.seasonNo}-${s.isTest ? 1 : 0}`}
                  >
                    {s.placement === "ARCHIVE" ? "ARCHIV · " : ""}
                    {s.isTest ? "TEST · " : ""}
                    {s.year} · Season {s.seasonNo}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="season"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  placeholder="Jahr (z.B. 2026)"
                  defaultValue={defaults.season}
                />
                <input
                  name="seasonNo"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  placeholder="Season (z.B. 1)"
                  defaultValue={defaults.seasonNo || "1"}
                />
              </div>
            )}
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
          <label className="flex w-fit items-center gap-2 text-sm text-white/80 md:col-span-2">
            <input
              name="isSprint"
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-white/5"
              defaultChecked={defaults.isSprint === "1"}
            />
            Sprint-Rennen
          </label>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Rennen (optional)
            </label>
            <input
              name="name"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="Wird automatisch aus Saison/Runde/Strecke erstellt"
              defaultValue={defaults.name}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Rennstrecke
            </label>
            {circuits.length > 0 ? (
              <select
                name="circuitId"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                defaultValue={defaults.circuitId || ""}
              >
                <option value="">Manuell eingeben…</option>
                {circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.location ? ` · ${c.location}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-white/60">
                Keine Rennstrecken angelegt. Lege sie unter Admin → Rennstrecken an.
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Strecke (manuell)
            </label>
            <input
              name="circuit"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              defaultValue={defaults.circuit}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Ort (manuell)
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
          {visibleRaces.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Rennen.</div>
          ) : (
            visibleRaces.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {r.seasonIsTest ? "TEST · " : ""}{r.isSprint ? "SPRINT · " : ""}Saison {r.season} · Season {r.seasonNo} · Runde {r.round} · {r.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {new Date(r.startsAt).toLocaleString("de-DE", { timeZone: DISPLAY_TZ })}
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
                    href={`/admin/${league}/races/${r.id}`}
                    className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Fahrerfeld
                  </Link>
                  <Link
                    href={`/admin/${league}/results/${r.id}`}
                    className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Ergebnis
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
