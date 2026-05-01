import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";

export const dynamic = "force-dynamic";

const leagueEnum: Record<string, League> = {
  one: League.ONE,
  two: League.TWO,
  rookie: League.ROOKIE
};

async function upsertResult(
  adminLeague: string,
  raceId: string,
  formData: FormData
) {
  "use server";

  const driverId = String(formData.get("driverId") ?? "");
  const position = Number(formData.get("position") ?? "");
  const points = Number(formData.get("points") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  const fastestLap = formData.get("fastestLap") === "on";

  if (!driverId || !Number.isFinite(position) || !Number.isFinite(points)) return;

  await prisma.raceResult.upsert({
    where: { raceId_driverId: { raceId, driverId } },
    create: {
      raceId,
      driverId,
      position,
      points,
      status: status || null,
      fastestLap
    },
    update: {
      position,
      points,
      status: status || null,
      fastestLap
    }
  });

  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);
  revalidatePath("/admin");
  revalidatePath("/mrl-one/results");
  revalidatePath("/mrl-two/results");
  revalidatePath("/mrl-rookie/results");
  revalidatePath("/mrl-one/standings");
  revalidatePath("/mrl-two/standings");
  revalidatePath("/mrl-rookie/standings");
}

async function deleteResult(
  adminLeague: string,
  raceId: string,
  formData: FormData
) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.raceResult.delete({ where: { id } });
  revalidatePath(`/admin/${adminLeague}/results/${raceId}`);
  revalidatePath(`/admin/${adminLeague}/results`);
  revalidatePath(`/admin/${adminLeague}/standings`);
  revalidatePath("/mrl-one/results");
  revalidatePath("/mrl-two/results");
  revalidatePath("/mrl-rookie/results");
  revalidatePath("/mrl-one/standings");
  revalidatePath("/mrl-two/standings");
  revalidatePath("/mrl-rookie/standings");
}

export default async function AdminRaceResultsPage({
  params
}: {
  params: Promise<{ league: string; raceId: string }>;
}) {
  const { league, raceId } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  const race = await prisma.race
    .findUnique({
      where: { id: raceId },
      select: { id: true, season: true, round: true, name: true, startsAt: true }
    })
    .catch(() => null);

  if (!race) notFound();

  type DriverItem = { id: string; name: string };
  type ResultItem = {
    id: string;
    position: number;
    points: number;
    status: string | null;
    fastestLap: boolean;
    driver: { name: string };
  };

  let drivers: DriverItem[] = [];
  let results: ResultItem[] = [];

  try {
    drivers = await prisma.driver.findMany({
      where: { league: l },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true }
    });
  } catch {}

  try {
    results = await prisma.raceResult.findMany({
      where: { raceId },
      orderBy: [{ position: "asc" }],
      select: {
        id: true,
        position: true,
        points: true,
        status: true,
        fastestLap: true,
        driver: { select: { name: true } }
      }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-base font-semibold">Ergebnisse eintragen</div>
          <Link
            href={`/admin/${league}/results`}
            className="text-sm font-semibold text-white/70 hover:text-white"
          >
            Zurück
          </Link>
        </div>
        <div className="mt-2 text-sm text-white/70">
          Saison {race.season} · Runde {race.round} · {race.name} ·{" "}
          {new Date(race.startsAt).toLocaleString("de-DE")}
        </div>

        <form
          action={upsertResult.bind(null, league, raceId)}
          className="mt-6 grid gap-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Fahrer
            </label>
            <select className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25" name="driverId">
              <option value="">Bitte wählen</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Position
            </label>
            <input
              name="position"
              inputMode="numeric"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Punkte
            </label>
            <input
              name="points"
              inputMode="decimal"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="25"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Status (optional)
            </label>
            <input
              name="status"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="DNF, DSQ, ..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="fastestLap" className="h-4 w-4" />{" "}
            Schnellste Runde
          </label>
          <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
            Speichern
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Aktuelle Einträge</div>
        <div className="mt-4 space-y-2">
          {results.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Ergebnisse.</div>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    P{r.position} · {r.driver.name} · {r.points.toFixed(0)} P
                    {r.fastestLap ? " · FL" : ""}
                  </div>
                  {r.status ? (
                    <div className="mt-1 text-sm text-white/60">{r.status}</div>
                  ) : null}
                </div>
                <form action={deleteResult.bind(null, league, raceId)}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                    Löschen
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </AdminShell>
  );
}
