export const dynamic = "force-dynamic";

const LEAGUES = [
  { key: "liga-one", label: "Liga One", accent: "#E10600" },
  { key: "liga-two", label: "Liga Two", accent: "#22C55E" },
  { key: "rookie", label: "Rookie", accent: "#38BDF8" },
  { key: "one-mini-wm", label: "MRL One Mini WM", accent: "#A855F7" },
  { key: "two-mini-wm", label: "MRL Two Mini WM", accent: "#F97316" }
] as const;

export async function GET() {
  return Response.json({ leagues: LEAGUES }, { headers: { "cache-control": "no-store" } });
}

