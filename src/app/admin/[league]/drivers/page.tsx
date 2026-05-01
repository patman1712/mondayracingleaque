import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
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

async function createDriver(
  adminLeague: string,
  league: League,
  formData: FormData
) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const numberRaw = String(formData.get("number") ?? "").trim();
  const team = String(formData.get("team") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  if (!name) return;

  const number = numberRaw ? Number(numberRaw) : null;

  await prisma.driver.create({
    data: {
      league,
      name,
      number: Number.isFinite(number) ? (number as number) : null,
      team: team || null,
      country: country || null
    }
  });

  const publicSlug =
    league === League.ONE
      ? "mrl-one"
      : league === League.TWO
        ? "mrl-two"
        : "mrl-rookie";

  revalidatePath(`/admin/${adminLeague}/drivers`);
  revalidatePath(`/${publicSlug}/drivers`);
}

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
    number: number | null;
    team: string | null;
    country: string | null;
  };

  let drivers: DriverItem[] = [];
  try {
    drivers = await prisma.driver.findMany({
      where: { league: l },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, number: true, team: true, country: true }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Fahrer · {leagueLabel[l]}</div>
        <form
          action={createDriver.bind(null, league, l)}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Name
            </label>
            <input
              name="name"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Nummer
            </label>
            <input
              name="number"
              inputMode="numeric"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Team
            </label>
            <input
              name="team"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Land
            </label>
            <input
              name="country"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="DE, AT, CH ..."
            />
          </div>
          <div className="flex items-end">
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Hinzufügen
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Liste</div>
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
                <form action={deleteDriver}>
                  <input type="hidden" name="id" value={d.id} />
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
