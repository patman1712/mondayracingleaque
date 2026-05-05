import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveLeagueByPublicSlug } from "@/lib/league";

function formatDateRange(d: Date) {
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Berlin"
  });
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("league") ?? "";
  const cfg = await resolveLeagueByPublicSlug(slug);
  if (!cfg) return new Response("Bad league", { status: 400 });
  if (!cfg.isActive) return new Response("Inactive league", { status: 404 });
  const league = cfg.league;

  const now = new Date();

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
        where: { ...where, league, seasonIsTest: false },
        orderBy,
        select
      })
      .catch((): RaceCard | null => null);
    if (normal) return normal;
    return prisma.race
      .findFirst({
        where: { ...where, league },
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
    league: cfg.league,
    leagueLabel: cfg.name,
    accent: cfg.accentColor,
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
