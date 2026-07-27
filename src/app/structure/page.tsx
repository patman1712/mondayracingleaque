import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrgChartNode = {
  id: string;
  title: string;
  people: string[];
  children: OrgChartNode[];
};

const ORG_KEY = "mrl:orgChartJson";

function defaultChart(): OrgChartNode {
  return {
    id: "root",
    title: "MRL",
    people: [],
    children: []
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

function NodeView({ node, level }: { node: OrgChartNode; level: number }) {
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm font-extrabold uppercase tracking-wide text-white">
          {node.title}
        </div>
        {node.people.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {node.people.map((p, idx) => (
              <div
                key={`${node.id}-${idx}`}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/80"
              >
                {p}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {node.children.length ? (
        <div className={level === 0 ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "grid gap-3 pl-6"}>
          {node.children.map((c) => (
            <NodeView key={c.id} node={c} level={level + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function StructurePage() {
  const row = await prisma.appConfig.findUnique({ where: { key: ORG_KEY }, select: { value: true } }).catch(() => null);
  const chart = parseChart(row?.value ? String(row.value) : null);

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold text-white">MRL-Struktur</div>
        <div className="mt-2 text-sm text-white/70">Organigramm der Monday Racing League</div>
      </div>

      <div className="mt-6">
        <NodeView node={chart} level={0} />
      </div>
    </Container>
  );
}

