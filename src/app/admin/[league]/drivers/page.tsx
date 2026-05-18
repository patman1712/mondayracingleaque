import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { getActiveSeason } from "@/lib/currentSeason";
import { requireAdmin } from "@/lib/requireAdmin";
import Link from "next/link";
import { resolveLeagueByAdminSlug } from "@/lib/league";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

async function deleteDriver(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.driver.delete({ where: { id } });
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
    revalidatePath(`/admin/${l.adminSlug}/drivers`);
    revalidatePath(`/${l.publicSlug}/drivers`);
  }
}

export default async function AdminDriversPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  await requireAdmin();

  const { league } = await params;
  const cfg = await resolveLeagueByAdminSlug(league);
  if (!cfg) notFound();
  const l = cfg.league;

  type DriverItem = {
    id: string;
    name: string;
    gamertag: string | null;
    number: number | null;
    country: string | null;
    twitchChannel: string | null;
    portraitPath: string | null;
    role: "MAIN" | "RESERVE" | null;
    teamName: string | null;
  };

  let drivers: DriverItem[] = [];
  try {
    const select = {
      role: true,
      portraitPath: true,
      teamRef: { select: { name: true } },
      driver: {
        select: {
          id: true,
          name: true,
          gamertag: true,
          number: true,
          country: true,
          twitchChannel: true,
          portraitPath: true
        }
      }
    } as const;
    type Row = Prisma.DriverSeasonGetPayload<{ select: typeof select }>;

    const activeSeason = await getActiveSeason({
      league: l,
      select: { id: true }
    }).catch(() => null);

    const rows: Row[] = activeSeason
      ? await prisma.driverSeason
          .findMany({
            where: { seasonId: activeSeason.id },
            distinct: ["driverId"],
            orderBy: [{ role: "asc" }, { driver: { name: "asc" } }],
            select,
            take: 2000
          })
          .catch((): Row[] => [])
      : await prisma.driverSeason
          .findMany({
            where: { season: { league: l } },
            distinct: ["driverId"],
            orderBy: [{ driver: { name: "asc" } }],
            select,
            take: 2000
          })
          .catch((): Row[] => []);

    drivers = rows.map((r) => ({
      id: r.driver.id,
      name: r.driver.name,
      gamertag: r.driver.gamertag ?? null,
      number: r.driver.number ?? null,
      country: r.driver.country ?? null,
      twitchChannel: r.driver.twitchChannel ?? null,
      portraitPath: r.portraitPath ?? null,
      role: r.role ?? null,
      teamName: r.teamRef?.name ?? null
    }));
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Fahrer · {cfg.name}</div>
        <div className="mt-4 space-y-2">
          {drivers.length === 0 ? (
            <div className="text-sm text-white/60">Noch keine Fahrer.</div>
          ) : (
            drivers.map((d) => (
              <div
                key={d.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {d.number ? `#${d.number} ` : ""}
                    {d.name}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {(d.role === "RESERVE" ? "Ersatzfahrer" : "Stammfahrer")}{d.teamName ? ` · ${d.teamName}` : ""}{" "}
                    {d.country ? `· ${d.country}` : ""}
                    {d.twitchChannel ? ` · Twitch: ${d.twitchChannel}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/${league}/drivers/${d.id}`}
                    className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Details
                  </Link>
                  <form action={deleteDriver}>
                    <input type="hidden" name="id" value={d.id} />
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
