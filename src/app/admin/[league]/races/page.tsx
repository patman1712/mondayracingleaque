import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

const leagueEnum: Record<string, League> = {
  one: League.ONE,
  two: League.TWO,
  rookie: League.ROOKIE
};

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

  const basePath = `/admin/${adminLeague}/races`;
  const season = Number(formData.get("season") ?? "");
  const round = Number(formData.get("round") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const circuit = String(formData.get("circuit") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();

  if (!Number.isFinite(season) || !Number.isFinite(round) || !name) {
    redirect(`${basePath}?error=invalid`);
  }
  if (!startsAtRaw) redirect(`${basePath}?error=invalid`);

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) redirect(`${basePath}?error=invalid`);

  try {
    await prisma.race.create({
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
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code?: string }).code
        : undefined;
    if (code === "P2002") redirect(`${basePath}?error=duplicate`);
    redirect(`${basePath}?error=save`);
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

async function deleteRace(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.race.delete({ where: { id } });

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
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

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
                : "Speichern fehlgeschlagen. Bitte erneut versuchen."}
          </div>
        ) : null}
        <form
          action={createRace.bind(null, league, l)}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Saison
            </label>
            <input
              name="season"
              inputMode="numeric"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="2026"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Runde
            </label>
            <input
              name="round"
              inputMode="numeric"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="1"
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
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Strecke
            </label>
            <input
              name="circuit"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Ort
            </label>
            <input
              name="location"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
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
