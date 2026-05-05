import { League } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LeagueConfigInfo = {
  league: League;
  adminSlug: string;
  publicSlug: string;
  name: string;
  accentColor: string;
  isActive: boolean;
  sortOrder: number;
};

const fallbackLeagues: LeagueConfigInfo[] = [
  {
    league: League.ONE,
    adminSlug: "one",
    publicSlug: "mrl-one",
    name: "MRL One",
    accentColor: "#E10600",
    isActive: true,
    sortOrder: 0
  },
  {
    league: League.TWO,
    adminSlug: "two",
    publicSlug: "mrl-two",
    name: "MRL Two",
    accentColor: "#22C55E",
    isActive: true,
    sortOrder: 1
  },
  {
    league: League.ROOKIE,
    adminSlug: "rookie",
    publicSlug: "mrl-rookie",
    name: "MRL Rookie",
    accentColor: "#38BDF8",
    isActive: true,
    sortOrder: 2
  }
];

const fallbackByPublicSlug: Record<string, LeagueConfigInfo> = Object.fromEntries(
  fallbackLeagues.map((l) => [l.publicSlug, l])
);
const fallbackByAdminSlug: Record<string, LeagueConfigInfo> = Object.fromEntries(
  fallbackLeagues.map((l) => [l.adminSlug, l])
);

export async function resolveLeagueByPublicSlug(
  publicSlug: string
): Promise<LeagueConfigInfo | null> {
  const row = await prisma.leagueConfig
    .findUnique({
      where: { publicSlug },
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
    .catch(() => null);
  return row ?? fallbackByPublicSlug[publicSlug] ?? null;
}

export async function resolveLeagueByAdminSlug(
  adminSlug: string
): Promise<LeagueConfigInfo | null> {
  const row = await prisma.leagueConfig
    .findUnique({
      where: { adminSlug },
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
    .catch(() => null);
  return row ?? fallbackByAdminSlug[adminSlug] ?? null;
}

export async function listPublicLeagues(): Promise<LeagueConfigInfo[]> {
  const rows = await prisma.leagueConfig
    .findMany({
      where: { isActive: true },
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

  return rows.length ? rows : fallbackLeagues;
}

export async function listAdminLeagues(): Promise<LeagueConfigInfo[]> {
  const rows = await prisma.leagueConfig
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

  return rows.length ? rows : fallbackLeagues;
}
