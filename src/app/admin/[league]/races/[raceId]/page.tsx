import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { RaceEntriesBulkEditorClient } from "@/components/RaceEntriesBulkEditorClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const driverSelect = {
  driverId: true,
  role: true,
  teamId: true,
  driver: { select: { id: true, name: true, gamertag: true } },
  teamRef: { select: { name: true, color: true } }
} as const;
type DriverRow = {
  driverId: string;
  role: "MAIN" | "RESERVE";
  teamId: string | null;
  driver: { id: string; name: string; gamertag: string | null };
  teamRef: { name: string; color: string | null } | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toBerlinDateTimeLocalValue(d: Date) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);

  const map = new Map(parts.map((p) => [p.type, p.value] as const));
  const y = Number(map.get("year") ?? "0");
  const m = Number(map.get("month") ?? "0");
  const day = Number(map.get("day") ?? "0");
  const h = Number(map.get("hour") ?? "0");
  const min = Number(map.get("minute") ?? "0");
  if (!y || !m || !day) return "";
  return `${y}-${pad2(m)}-${pad2(day)}T${pad2(h)}:${pad2(min)}`;
}

function utcDateFromBerlinDateTimeLocalValue(input: string) {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const tz = "Europe/Berlin";
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(utcGuess);
  const map = new Map(parts.map((p) => [p.type, p.value] as const));
  const y = Number(map.get("year") ?? "0");
  const mo = Number(map.get("month") ?? "0");
  const da = Number(map.get("day") ?? "0");
  const hh = Number(map.get("hour") ?? "0");
  const mi = Number(map.get("minute") ?? "0");
  const ss = Number(map.get("second") ?? "0");
  const asBerlinUtc = Date.UTC(y, mo - 1, da, hh, mi, ss);
  const offsetMs = asBerlinUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

async function findSiblingRace(race: {
  league: League;
  season: number;
  seasonNo: number;
  seasonIsTest: boolean;
  round: number;
  isSprint: boolean;
}) {
  return prisma.race
    .findFirst({
      where: {
        league: race.league,
        season: race.season,
        seasonNo: race.seasonNo,
        seasonIsTest: race.seasonIsTest,
        round: race.round,
        isSprint: !race.isSprint
      },
      select: { id: true }
    })
    .catch(() => null);
}

async function setBroadcast(
  adminLeague: string,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();
  const twitchChannel = String(formData.get("twitchChannel") ?? "").trim();
  await prisma.race
    .update({
      where: { id: raceId },
      data: { twitchChannel: twitchChannel || null }
    })
    .catch(() => null);

  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  const pub =
    cfg?.publicSlug ??
    (adminLeague === "one"
      ? "mrl-one"
      : adminLeague === "two"
        ? "mrl-two"
        : adminLeague === "rookie"
          ? "mrl-rookie"
          : null);
  if (pub) revalidatePath(`/${pub}/races/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/races/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/races`);
  redirect(`/admin/${adminLeague}/races/${raceId}?ok=1`);
}

async function setLiveTimingSource(
  adminLeague: string,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();
  const val = String(formData.get("liveTimingLeagueKey") ?? "").trim().toLowerCase();
  const key = `race:liveTimingLeagueKey:${raceId}`;
  await prisma.appConfig
    .upsert({
      where: { key },
      create: { key, value: val },
      update: { value: val }
    })
    .catch(() => null);
  revalidatePath(`/admin/${adminLeague}/races/${raceId}`);
  redirect(`/admin/${adminLeague}/races/${raceId}?ok=1`);
}

async function updateRaceDetails(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const roundRaw = String(formData.get("round") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const circuit = String(formData.get("circuit") ?? "").trim();

  const round = roundRaw ? Number(roundRaw) : null;
  const startsAt = startsAtRaw ? utcDateFromBerlinDateTimeLocalValue(startsAtRaw) : null;
  if (!name || !round || !Number.isFinite(round) || !startsAt) {
    redirect(`/admin/${adminLeague}/races/${raceId}?error=invalid`);
  }

  const current = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: {
        id: true,
        league: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        isSprint: true
      }
    })
    .catch(() => null);
  if (!current || current.league !== league) notFound();

  const sibling = await findSiblingRace(current);

  await prisma.race
    .update({
      where: { id: raceId },
      data: {
        name,
        round: Math.max(1, Math.floor(round)),
        startsAt,
        location: location || null,
        circuit: circuit || null
      }
    })
    .catch(() => null);

  if (sibling) {
    await prisma.race
      .update({
        where: { id: sibling.id },
        data: {
          round: Math.max(1, Math.floor(round)),
          startsAt,
          location: location || null,
          circuit: circuit || null
        }
      })
      .catch(() => null);
  }

  revalidatePath(`/admin/${adminLeague}/races/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/races`);
  revalidatePath(`/admin/${adminLeague}/results`);
  const cfg = await resolveLeagueByAdminSlug(adminLeague);
  const pub =
    cfg?.publicSlug ??
    (adminLeague === "one"
      ? "mrl-one"
      : adminLeague === "two"
        ? "mrl-two"
        : adminLeague === "rookie"
          ? "mrl-rookie"
          : null);
  if (pub) {
    revalidatePath(`/${pub}/races/${raceId}`);
    revalidatePath(`/${pub}/calendar`);
  }
  redirect(`/admin/${adminLeague}/races/${raceId}?ok=1`);
}

async function bulkUpsertRaceEntries(
  adminLeague: string,
  league: League,
  raceId: string,
  formData: FormData
) {
  "use server";
  await requireAdmin();

  const raw = String(formData.get("entriesJson") ?? "").trim();
  let rows: Array<{ driverId?: unknown; participates?: unknown; teamId?: unknown }> = [];
  try {
    rows = raw ? JSON.parse(raw) : [];
  } catch {
    redirect(`/admin/${adminLeague}/races/${raceId}?error=invalid`);
  }

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: {
        id: true,
        league: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        isSprint: true
      }
    })
    .catch(() => null);
  if (!race || race.league !== league) return;

  const sibling = await findSiblingRace(race);

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) return;

  const eligible = await prisma.driverSeason
    .findMany({
      where: { seasonId: season.id },
      select: { driverId: true, role: true, teamId: true, teamRef: { select: { id: true } } },
      take: 5000
    })
    .catch(
      (): Array<{ driverId: string; role: "MAIN" | "RESERVE"; teamId: string | null; teamRef: { id: string } | null }> => []
    );
  const eligibleByDriverId = new Map(eligible.map((e) => [e.driverId, e] as const));

  const allowedTeams = await prisma.teamLeague
    .findMany({ where: { league }, select: { teamId: true }, take: 5000 })
    .catch((): Array<{ teamId: string }> => []);
  const allowedTeamIds = new Set(allowedTeams.map((t) => t.teamId));

  for (const r of rows) {
    const driverId = String(r?.driverId ?? "").trim();
    if (!driverId) continue;
    const d = eligibleByDriverId.get(driverId) ?? null;
    if (!d) continue;
    const role = d.role;

    const participates = String(r?.participates ?? "").trim() === "true" || String(r?.participates ?? "").trim() === "1";
    const teamIdRaw = String(r?.teamId ?? "").trim();
    const teamId =
      participates
        ? role === "RESERVE"
          ? teamIdRaw && allowedTeamIds.has(teamIdRaw)
            ? teamIdRaw
            : null
          : d.teamId ?? d.teamRef?.id ?? null
        : null;

    await prisma.raceEntry
      .upsert({
        where: { raceId_driverId: { raceId, driverId } },
        create: { raceId, driverId, participates, teamId },
        update: { participates, teamId: participates ? teamId : null }
      })
      .catch(() => null);

    if (sibling) {
      await prisma.raceEntry
        .upsert({
          where: { raceId_driverId: { raceId: sibling.id, driverId } },
          create: { raceId: sibling.id, driverId, participates, teamId },
          update: { participates, teamId: participates ? teamId : null }
        })
        .catch(() => null);
    }
  }

  revalidatePath(`/admin/${adminLeague}/races/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/races`);
  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  redirect(`/admin/${adminLeague}/races/${raceId}?ok=1#driver-field`);
}

export default async function AdminRaceDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ league: string; raceId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const { league, raceId } = await params;
  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: {
        id: true,
        league: true,
        season: true,
        seasonNo: true,
        seasonIsTest: true,
        round: true,
        name: true,
        circuit: true,
        location: true,
        startsAt: true,
        twitchChannel: true
      }
    })
    .catch(() => null);
  if (!race || race.league !== l) notFound();

  const season = await prisma.season
    .findUnique({
      where: {
        league_year_seasonNo_isTest: {
          league: l,
          year: race.season,
          seasonNo: race.seasonNo,
          isTest: race.seasonIsTest
        }
      },
      select: { id: true }
    })
    .catch(() => null);
  if (!season) notFound();
  const liveTimingSourceRow = await prisma.appConfig
    .findUnique({ where: { key: `race:liveTimingLeagueKey:${raceId}` } })
    .catch(() => null);
  const liveTimingLeagueKey = (liveTimingSourceRow?.value ?? "").trim();

  const driverRows: DriverRow[] = await prisma.driverSeason
    .findMany({
      where: { seasonId: season.id },
      orderBy: [{ driver: { name: "asc" } }],
      select: driverSelect,
      take: 5000
    })
    .catch((): DriverRow[] => []);

  const entries = await prisma.raceEntry
    .findMany({
      where: { raceId },
      select: { driverId: true, participates: true, teamId: true, team: { select: { id: true, name: true } } },
      take: 5000
    })
    .catch(() => []);
  const entryByDriverId = new Map(entries.map((e) => [e.driverId, e] as const));

  const leagueTeamRows = await prisma.teamLeague
    .findMany({
      where: { league: l },
      orderBy: [{ team: { name: "asc" } }],
      select: { team: { select: { id: true, name: true } } },
      take: 2000
    })
    .catch((): Array<{ team: { id: string; name: string } }> => []);
  const leagueTeams = leagueTeamRows.map((r) => r.team);

  const drivers = driverRows.map((r) => {
    const entry = entryByDriverId.get(r.driverId) ?? null;
    const teamName = r.role === "MAIN" ? r.teamRef?.name ?? null : null;
    return {
      driverId: r.driverId,
      name: r.driver.gamertag ?? r.driver.name,
      role: r.role,
      teamName,
      participates: entry?.participates ?? false,
      teamId: entry?.teamId ?? null
    };
  });

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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-base font-semibold">Rennkalender · {cfg.name}</div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/admin/${league}/races`} className="text-sm font-semibold text-white/70 hover:text-white">
                Zurück
              </Link>
              <Link
                href={`/admin/${league}/results/${raceId}`}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                Zum Ergebnis
              </Link>
            </div>
          </div>

          <div className="mt-2 text-sm text-white/70">
            {race.seasonIsTest ? "TEST · " : ""}Saison {race.season} · Season {race.seasonNo} · Runde {race.round} · {race.name} ·{" "}
            {new Date(race.startsAt).toLocaleString("de-DE")}
          </div>

          <form action={updateRaceDetails.bind(null, league, l, raceId)} className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Name</label>
              <input
                name="name"
                defaultValue={race.name}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Runde</label>
              <input
                name="round"
                inputMode="numeric"
                defaultValue={race.round}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Startzeit (Europe/Berlin)</label>
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={toBerlinDateTimeLocalValue(new Date(race.startsAt))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Location (optional)</label>
              <input
                name="location"
                defaultValue={race.location ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">Circuit (optional)</label>
              <input
                name="circuit"
                defaultValue={race.circuit ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div className="md:col-span-2">
              <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Rennen speichern
              </button>
            </div>
          </form>

          <form action={setBroadcast.bind(null, league, raceId)} className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Twitch Channel (oder URL)</label>
              <input
                name="twitchChannel"
                defaultValue={race.twitchChannel ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="https://twitch.tv/deinchannel"
              />
              <div className="mt-2 text-xs text-white/60">
                Wird vor dem Rennen auf der Detailseite eingeblendet und nach dem Rennen ausgeblendet.
              </div>
            </div>
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Speichern
            </button>
          </form>

          <form action={setLiveTimingSource.bind(null, league, raceId)} className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">Live Timing Quelle</label>
              <select
                name="liveTimingLeagueKey"
                defaultValue={liveTimingLeagueKey || ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              >
                <option value="">deaktiviert</option>
                <option value="liga-one">Liga One</option>
                <option value="liga-two">Liga Two</option>
                <option value="rookie">Rookie</option>
                <option value="one-mini-wm">MRL One Mini WM</option>
                <option value="two-mini-wm">MRL Two Mini WM</option>
              </select>
              <div className="mt-2 text-xs text-white/60">
                Bestimmt, welches Live Timing auf der Rennseite angezeigt wird.
              </div>
            </div>
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Speichern
            </button>
          </form>
        </div>

        <details id="driver-field" className="rounded-2xl border border-white/10 bg-white/5">
          <summary className="cursor-pointer list-none px-6 py-5 text-base font-semibold text-white">
            Fahrerfeld
            <div className="mt-2 text-sm font-normal text-white/70">
              Teilnahme pro Fahrer bestätigen. Ergebnisse trägst du unter „Ergebnisse“ ein.
            </div>
          </summary>
          <div className="px-6 pb-6">
            {drivers.length === 0 ? (
              <div className="text-sm text-white/60">Keine Fahrer gefunden.</div>
            ) : (
              <RaceEntriesBulkEditorClient
                drivers={drivers}
                teams={leagueTeams}
                action={bulkUpsertRaceEntries.bind(null, league, l, raceId)}
                resultsPageHref={`/admin/${league}/results/${raceId}`}
              />
            )}
          </div>
        </details>
      </div>
    </AdminShell>
  );
}
