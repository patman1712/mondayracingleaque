import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { League } from "@prisma/client";

export const dynamic = "force-dynamic";

async function createSeason(formData: FormData) {
  "use server";
  const yearRaw = String(formData.get("year") ?? "").trim();
  const seasonNoRaw = String(formData.get("seasonNo") ?? "").trim();
  const leagueRaw = String(formData.get("league") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const year = Number.parseInt(yearRaw, 10);
  const seasonNo = Number.parseInt(seasonNoRaw, 10);
  const league =
    leagueRaw === "ONE" ? League.ONE : leagueRaw === "TWO" ? League.TWO : leagueRaw === "ROOKIE" ? League.ROOKIE : null;
  if (!Number.isFinite(year) || !Number.isFinite(seasonNo) || !league) {
    redirect("/admin/settings/seasons?error=invalid");
  }

  try {
    await prisma.season.create({
      data: { league, year, seasonNo, label: label || null }
    });
  } catch {
    redirect("/admin/settings/seasons?error=duplicate");
  }

  redirect("/admin/settings/seasons?ok=1");
}

async function deleteSeason(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.season.delete({ where: { id } }).catch(() => null);
  redirect("/admin/settings/seasons?ok=1");
}

export default async function AdminSeasonsPage({
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
      take: 200
    })
    .catch(() => []);

  const leagueLabel: Record<League, string> = {
    [League.ONE]: "MRL One",
    [League.TWO]: "MRL Two",
    [League.ROOKIE]: "MRL Rookie"
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Saisons</div>
          <div className="mt-1 text-sm text-white/60">
            Lege Saisons an, damit du sie beim Event-Erstellen auswählen kannst.
          </div>

          {ok ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Gespeichert.
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error === "duplicate"
                ? "Diese Saison (Liga/Jahr/Season) existiert bereits."
                : "Bitte Liga, Jahr und Season korrekt eingeben."}
            </div>
          ) : null}

          <form action={createSeason} className="mt-4 grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Liga
              </label>
              <select
                name="league"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                defaultValue={League.ONE}
              >
                <option value={League.ONE}>MRL One</option>
                <option value={League.TWO}>MRL Two</option>
                <option value={League.ROOKIE}>MRL Rookie</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Jahr
              </label>
              <input
                name="year"
                type="number"
                inputMode="numeric"
                step={1}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="2026"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Season
              </label>
              <input
                name="seasonNo"
                type="number"
                inputMode="numeric"
                step={1}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="1"
                defaultValue={1}
              />
            </div>
            <div className="md:col-span-4">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Label (optional)
              </label>
              <input
                name="label"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="F1 26"
              />
            </div>
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Saison anlegen
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Vorhandene Saisons</div>
          <div className="mt-4 space-y-2">
            {seasons.length === 0 ? (
              <div className="text-sm text-white/60">Noch keine Saisons.</div>
            ) : (
              seasons.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {s.year} · Season {s.seasonNo} · {leagueLabel[s.league]}
                    </div>
                    {s.label ? (
                      <div className="mt-1 text-sm text-white/60">{s.label}</div>
                    ) : null}
                  </div>
                  <form action={deleteSeason}>
                    <input type="hidden" name="id" value={s.id} />
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
