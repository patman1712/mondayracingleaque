import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { defaultLeagueColors, getLeagueColors } from "@/lib/leagueColors";

export const dynamic = "force-dynamic";

const hexSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toUpperCase());

async function save(formData: FormData) {
  "use server";

  await requireAdmin();

  const one = hexSchema.safeParse(String(formData.get("ONE") ?? ""));
  const two = hexSchema.safeParse(String(formData.get("TWO") ?? ""));
  const rookie = hexSchema.safeParse(String(formData.get("ROOKIE") ?? ""));

  if (!one.success || !two.success || !rookie.success) {
    redirect("/admin/settings/league-colors?error=1");
  }

  const entries = [
    { key: "leagueColor.ONE", value: one.data },
    { key: "leagueColor.TWO", value: two.data },
    { key: "leagueColor.ROOKIE", value: rookie.data }
  ];

  await prisma.$transaction(
    entries.map((e) =>
      prisma.appConfig.upsert({
        where: { key: e.key },
        create: e,
        update: { value: e.value }
      })
    )
  );

  revalidatePath("/calendar");
  revalidatePath("/admin/settings/league-colors");
  redirect("/admin/settings/league-colors?saved=1");
}

export default async function LeagueColorsAdminPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const colors = await getLeagueColors();

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Liga Farben</div>
        <div className="mt-2 text-sm text-white/70">
          Diese Farben werden im Kalender für die Events genutzt.
        </div>

        <form action={save} className="mt-6 grid gap-4 md:grid-cols-3">
          {(
            [
              { key: "ONE", label: "MRL One" },
              { key: "TWO", label: "MRL Two" },
              { key: "ROOKIE", label: "MRL Rookie" }
            ] as const
          ).map((l) => (
            <div
              key={l.key}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="text-sm font-semibold">{l.label}</div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="color"
                  name={l.key}
                  defaultValue={colors[l.key]}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                />
                <input
                  name={l.key}
                  defaultValue={colors[l.key]}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
              </div>
              <div className="mt-3 text-xs text-white/60">
                Default: {defaultLeagueColors[l.key]}
              </div>
            </div>
          ))}

          <div className="md:col-span-3">
            <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Speichern
            </button>
          </div>

          {sp.saved === "1" ? (
            <div className="md:col-span-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              Gespeichert.
            </div>
          ) : null}

          {sp.error === "1" ? (
            <div className="md:col-span-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              Ungültige Farbe. Bitte Hex-Format wie #FF0000 verwenden.
            </div>
          ) : null}
        </form>
      </div>
    </AdminShell>
  );
}

