import { prisma } from "@/lib/db";
import { getLeagueColors, leagueLabel, type LeagueKey } from "@/lib/leagueColors";

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

  const now = new Date();

  const [colors, previous, upcoming, currentWindow] = await Promise.all([
    getLeagueColors(),
    prisma.race
      .findFirst({
        where: { league, seasonIsTest: false, startsAt: { lt: now } },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          name: true,
          startsAt: true,
          round: true,
          imagePath: true,
          circuitRef: { select: { imagePath: true } }
        }
      })
      .catch(() => null),
    prisma.race
      .findFirst({
        where: { league, seasonIsTest: false, startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          name: true,
          startsAt: true,
          round: true,
          imagePath: true,
          circuitRef: { select: { imagePath: true } }
        }
      })
      .catch(() => null),
    prisma.race
      .findFirst({
        where: { league, seasonIsTest: false, startsAt: { lte: now } },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          name: true,
          startsAt: true,
          round: true,
          imagePath: true,
          circuitRef: { select: { imagePath: true } }
        }
      })
      .catch(() => null)
  ]);

  const current =
    currentWindow && now.getTime() - new Date(currentWindow.startsAt).getTime() <= 6 * 60 * 60 * 1000
      ? currentWindow
      : null;

  const payload = {
    league,
    leagueLabel: leagueLabel(league),
    accent: colors[league],
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
