import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { League } from "@prisma/client";

export const dynamic = "force-dynamic";

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9-]+$/);
const nameSchema = z.string().trim().min(1);
const hexSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toUpperCase());
const sortSchema = z.coerce.number().int().min(0).max(10_000);

function isLeagueValue(input: string): input is League {
  return (Object.values(League) as string[]).includes(input);
}

async function createLeague(formData: FormData) {
  "use server";
  await requireAdmin();

  const leagueRaw = String(formData.get("league") ?? "");
  const adminSlug = slugSchema.safeParse(String(formData.get("adminSlug") ?? ""));
  const publicSlug = slugSchema.safeParse(String(formData.get("publicSlug") ?? ""));
  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  const accentColor = hexSchema.safeParse(String(formData.get("accentColor") ?? ""));
  const sortOrder = sortSchema.safeParse(formData.get("sortOrder"));
  const isActive = String(formData.get("isActive") ?? "") === "on";

  if (!isLeagueValue(leagueRaw)) redirect("/admin/settings/leagues?error=invalid");
  if (!adminSlug.success || !publicSlug.success || !name.success || !accentColor.success || !sortOrder.success) {
    redirect("/admin/settings/leagues?error=invalid");
  }

  await prisma.leagueConfig
    .create({
      data: {
        league: leagueRaw,
        adminSlug: adminSlug.data,
        publicSlug: publicSlug.data,
        name: name.data,
        accentColor: accentColor.data,
        isActive,
        sortOrder: sortOrder.data
      }
    })
    .catch(() => redirect("/admin/settings/leagues?error=duplicate"));

  revalidatePath("/admin/settings/leagues");
  redirect("/admin/settings/leagues?saved=1");
}

async function updateLeague(formData: FormData) {
  "use server";
  await requireAdmin();

  const leagueRaw = String(formData.get("league") ?? "");
  if (!isLeagueValue(leagueRaw)) redirect("/admin/settings/leagues?error=invalid");

  const adminSlug = slugSchema.safeParse(String(formData.get("adminSlug") ?? ""));
  const publicSlug = slugSchema.safeParse(String(formData.get("publicSlug") ?? ""));
  const name = nameSchema.safeParse(String(formData.get("name") ?? ""));
  const accentColor = hexSchema.safeParse(String(formData.get("accentColor") ?? ""));
  const sortOrder = sortSchema.safeParse(formData.get("sortOrder"));
  const isActive = String(formData.get("isActive") ?? "") === "on";

  if (!adminSlug.success || !publicSlug.success || !name.success || !accentColor.success || !sortOrder.success) {
    redirect("/admin/settings/leagues?error=invalid");
  }

  const existing = await prisma.leagueConfig
    .findUnique({ where: { league: leagueRaw }, select: { adminSlug: true, publicSlug: true } })
    .catch(() => null);
  if (!existing) notFound();

  await prisma.leagueConfig
    .update({
      where: { league: leagueRaw },
      data: {
        adminSlug: adminSlug.data,
        publicSlug: publicSlug.data,
        name: name.data,
        accentColor: accentColor.data,
        isActive,
        sortOrder: sortOrder.data
      }
    })
    .catch(() => redirect("/admin/settings/leagues?error=duplicate"));

  revalidatePath("/admin/settings/leagues");
  revalidatePath(`/admin/${existing.adminSlug}`);
  revalidatePath(`/${existing.publicSlug}`);
  redirect("/admin/settings/leagues?saved=1");
}

export default async function AdminLeaguesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const count = await prisma.leagueConfig.count().catch(() => 0);
  if (count === 0) {
    await prisma.leagueConfig
      .createMany({
        data: [
          {
            league: League.ONE,
            adminSlug: "one",
            publicSlug: "mrl-one",
            name: "MRL One",
            accentColor: "#E10600",
            sortOrder: 0,
            isActive: true
          },
          {
            league: League.TWO,
            adminSlug: "two",
            publicSlug: "mrl-two",
            name: "MRL Two",
            accentColor: "#22C55E",
            sortOrder: 1,
            isActive: true
          },
          {
            league: League.ROOKIE,
            adminSlug: "rookie",
            publicSlug: "mrl-rookie",
            name: "MRL Rookie",
            accentColor: "#38BDF8",
            sortOrder: 2,
            isActive: true
          }
        ]
      })
      .catch(() => null);
  }

  const leagues = await prisma.leagueConfig
    .findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        league: true,
        adminSlug: true,
        publicSlug: true,
        name: true,
        accentColor: true,
        isActive: true,
        sortOrder: true
      }
    })
    .catch(() => []);

  const used = new Set(leagues.map((l) => l.league));
  const available = (Object.values(League) as League[]).filter((l) => !used.has(l));

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Ligen</div>
          <div className="mt-2 text-sm text-white/70">
            Hier kannst du neue Ligen anlegen, umbenennen, sortieren und temporär deaktivieren.
          </div>

          {sp.saved === "1" ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              Gespeichert.
            </div>
          ) : null}
          {sp.error ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {sp.error === "duplicate"
                ? "Slug ist bereits vergeben."
                : "Ungültige Eingabe. Bitte Slugs nur a-z, 0-9 und '-' verwenden."}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            {leagues.map((l) => (
              <form
                key={l.league}
                action={updateLeague}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <input type="hidden" name="league" value={l.league} />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{l.name}</div>
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" name="isActive" defaultChecked={l.isActive} />
                    Aktiv (öffentlich sichtbar)
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-white/70">Name</label>
                    <input
                      name="name"
                      defaultValue={l.name}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-white/70">Admin Slug</label>
                    <input
                      name="adminSlug"
                      defaultValue={l.adminSlug}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-white/70">Public Slug</label>
                    <input
                      name="publicSlug"
                      defaultValue={l.publicSlug}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-white/70">Sortierung</label>
                    <input
                      name="sortOrder"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={l.sortOrder}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-white/70">Accent</label>
                      <input
                        type="color"
                        name="accentColor"
                        defaultValue={l.accentColor}
                        className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                      />
                    </div>
                    <input
                      name="accentColor"
                      defaultValue={l.accentColor}
                      className="w-[160px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                    />
                  </div>

                  <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                    Speichern
                  </button>
                </div>
              </form>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Neue Liga anlegen</div>
          <div className="mt-2 text-sm text-white/70">
            Wähle einen freien Liga-Slot und gib Name/Slugs/Farbe an. Danach erscheint die Liga automatisch im Menü.
          </div>

          {available.length === 0 ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
              Keine freien Liga-Slots verfügbar.
            </div>
          ) : (
            <form action={createLeague} className="mt-4 grid gap-3 md:grid-cols-6 md:items-end">
              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-semibold text-white/70">Liga</label>
                <select
                  name="league"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  defaultValue={available[0]}
                >
                  {available.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-white/70">Name</label>
                <input
                  name="name"
                  placeholder="z.B. MRL Three"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-semibold text-white/70">Admin Slug</label>
                <input
                  name="adminSlug"
                  placeholder="z.B. three"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-semibold text-white/70">Public Slug</label>
                <input
                  name="publicSlug"
                  placeholder="z.B. mrl-three"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>

              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-semibold text-white/70">Sortierung</label>
                <input
                  name="sortOrder"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={leagues.length ? leagues[leagues.length - 1].sortOrder + 1 : 0}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-white/70">Accent</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    name="accentColor"
                    defaultValue="#FFFFFF"
                    className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                  />
                  <input
                    name="accentColor"
                    defaultValue="#FFFFFF"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input type="checkbox" name="isActive" defaultChecked />
                  Aktiv (öffentlich sichtbar)
                </label>
              </div>

              <div className="md:col-span-2">
                <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                  Anlegen
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
