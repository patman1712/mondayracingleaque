import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";
import { League } from "@prisma/client";
import { requireAdmin } from "@/lib/requireAdmin";
import Link from "next/link";

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

async function deleteDriver(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.driver.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/admin/one/drivers");
  revalidatePath("/admin/two/drivers");
  revalidatePath("/admin/rookie/drivers");
  revalidatePath("/mrl-one/drivers");
  revalidatePath("/mrl-two/drivers");
  revalidatePath("/mrl-rookie/drivers");
}

export default async function AdminDriversPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  await requireAdmin();

  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  type DriverItem = {
    id: string;
    name: string;
    gamertag: string | null;
    number: number | null;
    team: string | null;
    teamId: string | null;
    country: string | null;
    portraitPath: string | null;
    starts: number;
    wins: number;
    podiums: number;
    driverOfDay: number;
    driverTitles: number;
    constructorTitles: number;
  };

  let drivers: DriverItem[] = [];
  try {
    drivers = await prisma.driver.findMany({
      where: { league: l },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        gamertag: true,
        number: true,
        team: true,
        teamId: true,
        country: true,
        portraitPath: true,
        starts: true,
        wins: true,
        podiums: true,
        driverOfDay: true,
        driverTitles: true,
        constructorTitles: true
      }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Fahrer · {leagueLabel[l]}</div>
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
                    {d.team ?? "-"} {d.country ? `· ${d.country}` : ""}
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
