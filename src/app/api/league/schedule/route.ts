import { prisma } from "@/lib/db";
import { getLeagueColors, leagueLabel, type LeagueKey } from "@/lib/leagueColors";
import { Prisma } from "@prisma/client";

function leagueFromSlug(slug: string): LeagueKey | null {
  if (slug === "mrl-one") return "ONE";
  if (slug === "mrl-two") return "TWO";
  if (slug === "mrl-rookie") return "ROOKIE";
  return null;
}

function formatDateRange(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("league") ?? "";
  const league = leagueFromSlug(slug);
  if (!league) return new Response("Bad league", { status: 400 });
  const leagueKey = league;

  const now = new Date();

  const colors = await getLeagueColors();

  const select = {
    id: true,
    name: true,
    startsAt: true,
    round: true,
    imagePath: true,
    seasonIsTest: true,
    circuitRef: { select: { imagePath: true } }
  } satisfies Prisma.RaceSelect;

  type RaceCard = Prisma.RaceGetPayload<{ select: typeof select }>;

  async function findPreferred(where: Prisma.RaceWhereInput, orderBy: Prisma.RaceOrderByWithRelationInput) {
    const normal = await prisma.race
      .findFirst({
        where: { ...where, league: leagueKey, seasonIsTest: false },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
    if (normal) return normal;
    return prisma.race
      .findFirst({
        where: { ...where, league: leagueKey },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
  }

  const [previous, upcoming, currentWindow] = await Promise.all([
    findPreferred({ startsAt: { lt: now } }, { startsAt: "desc" }),
    findPreferred({ startsAt: { gt: now } }, { startsAt: "asc" }),
    findPreferred({ startsAt: { lte: now } }, { startsAt: "desc" })
  ]);

  const current =
    currentWindow && now.getTime() - new Date(currentWindow.startsAt).getTime() <= 6 * 60 * 60 * 1000
      ? currentWindow
      : null;

  const payload = {
    league: leagueKey,
    leagueLabel: leagueLabel(leagueKey),
    accent: colors[leagueKey],
    previous: previous
      ? {
          id: previous.id,
          title: previous.name,
          round: previous.round,
          date: formatDateRange(new Date(previous.startsAt)),
          imageUrl: imageUrl(previous.imagePath || previous.circuitRef?.imagePath)
        }
      : null,
    current: current
      ? {
          id: current.id,
          title: current.name,
          round: current.round,
          date: formatDateRange(new Date(current.startsAt)),
          live: true,
          imageUrl: imageUrl(current.imagePath || current.circuitRef?.imagePath)
        }
      : null,
    upcoming: upcoming
      ? {
          id: upcoming.id,
          title: upcoming.name,
          round: upcoming.round,
          date: formatDateRange(new Date(upcoming.startsAt)),
          imageUrl: imageUrl(upcoming.imagePath || upcoming.circuitRef?.imagePath)
        }
      : null
  };

  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
