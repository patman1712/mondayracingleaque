import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function createCircuit(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!name) redirect("/admin/settings/circuits?error=invalid");

  try {
    await prisma.circuit.create({
      data: { name, location: location || null }
    });
  } catch {
    redirect("/admin/settings/circuits?error=duplicate");
  }

  redirect("/admin/settings/circuits?ok=1");
}

async function deleteCircuit(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.circuit.delete({ where: { id } }).catch(() => null);
  redirect("/admin/settings/circuits?ok=1");
}

export default async function AdminCircuitsPage({
  searchParams
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const circuits = await prisma.circuit
    .findMany({ orderBy: { name: "asc" }, take: 200 })
    .catch(() => []);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Rennstrecken</div>
          <div className="mt-1 text-sm text-white/60">
            Lege Rennstrecken an, damit du sie beim Event-Erstellen auswählen kannst.
          </div>

          {ok ? (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Gespeichert.
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error === "duplicate"
                ? "Diese Rennstrecke existiert bereits."
                : "Bitte eine gültige Rennstrecke eingeben."}
            </div>
          ) : null}

          <form action={createCircuit} className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Strecke
              </label>
              <input
                name="name"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="Red Bull Ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Ort (optional)
              </label>
              <input
                name="location"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="Spielberg"
              />
            </div>
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Strecke anlegen
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Vorhandene Strecken</div>
          <div className="mt-4 space-y-2">
            {circuits.length === 0 ? (
              <div className="text-sm text-white/60">Noch keine Strecken.</div>
            ) : (
              circuits.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.name}</div>
                    {c.location ? (
                      <div className="mt-1 text-sm text-white/60">{c.location}</div>
                    ) : null}
                  </div>
                  <form action={deleteCircuit}>
                    <input type="hidden" name="id" value={c.id} />
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
