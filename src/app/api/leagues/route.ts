import { listPublicLeagues } from "@/lib/league";

export const dynamic = "force-dynamic";

export async function GET() {
  const leagues = await listPublicLeagues();
  return Response.json(
    {
      leagues: leagues.map((l) => ({
        slug: l.publicSlug,
        label: l.name,
        accent: l.accentColor
      }))
    },
    { headers: { "cache-control": "no-store" } }
  );
}

