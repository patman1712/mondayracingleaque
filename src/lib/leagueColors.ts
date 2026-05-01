import { prisma } from "@/lib/db";

export type LeagueKey = "ONE" | "TWO" | "ROOKIE";

export const defaultLeagueColors: Record<LeagueKey, string> = {
  ONE: "#E10600",
  TWO: "#22C55E",
  ROOKIE: "#38BDF8"
};

const configKey: Record<LeagueKey, string> = {
  ONE: "leagueColor.ONE",
  TWO: "leagueColor.TWO",
  ROOKIE: "leagueColor.ROOKIE"
};

export async function getLeagueColors(): Promise<Record<LeagueKey, string>> {
  const keys = Object.values(configKey);
  const rows = await prisma.appConfig
    .findMany({ where: { key: { in: keys } }, select: { key: true, value: true } })
    .catch(() => []);

  const byKey = new Map(rows.map((r) => [r.key, r.value] as const));

  const out: Record<LeagueKey, string> = {
    ONE: byKey.get(configKey.ONE) ?? defaultLeagueColors.ONE,
    TWO: byKey.get(configKey.TWO) ?? defaultLeagueColors.TWO,
    ROOKIE: byKey.get(configKey.ROOKIE) ?? defaultLeagueColors.ROOKIE
  };

  return out;
}

export function leagueLabel(league: LeagueKey) {
  if (league === "ONE") return "MRL One";
  if (league === "TWO") return "MRL Two";
  return "MRL Rookie";
}

export function isLeagueKey(input: string): input is LeagueKey {
  return input === "ONE" || input === "TWO" || input === "ROOKIE";
}
