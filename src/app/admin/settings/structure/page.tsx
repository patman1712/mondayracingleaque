import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminOrgChartBuilderClient, type OrgChartNode } from "@/components/AdminOrgChartBuilderClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORG_KEY = "mrl:orgChartJson";

function defaultChart(): OrgChartNode {
  return {
    id: "root",
    title: "MRL",
    people: [],
    children: [
      { id: "owner", title: "MRL Owner", people: [], children: [] },
      { id: "lead", title: "MRL Ligaleitung", people: [], children: [] }
    ]
  };
}

function parseChart(raw: string | null | undefined): OrgChartNode {
  const v = (raw ?? "").trim();
  if (!v) return defaultChart();
  try {
    const parsed = JSON.parse(v) as unknown;
    if (!parsed || typeof parsed !== "object") return defaultChart();
    return parsed as OrgChartNode;
  } catch {
    return defaultChart();
  }
}

async function saveOrgChart(formData: FormData) {
  "use server";
  await requireAdmin();

  const raw = String(formData.get("orgChartJson") ?? "").trim();
  if (!raw) redirect("/admin/settings/structure?error=invalid");

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
  } catch {
    redirect("/admin/settings/structure?error=invalid");
  }

  await prisma.appConfig.upsert({
    where: { key: ORG_KEY },
    create: { key: ORG_KEY, value: raw },
    update: { value: raw }
  });

  revalidatePath("/structure");
  revalidatePath("/admin/settings/structure");
  redirect("/admin/settings/structure?ok=1");
}

export default async function AdminStructurePage({
  searchParams
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const row = await prisma.appConfig.findUnique({ where: { key: ORG_KEY }, select: { value: true } }).catch(() => null);
  const initial = parseChart(row?.value ? String(row.value) : null);

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

        <AdminOrgChartBuilderClient initial={initial} saveAction={saveOrgChart} />
      </div>
    </AdminShell>
  );
}

