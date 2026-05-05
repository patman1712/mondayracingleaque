import { League } from "@prisma/client";
import { prisma } from "@/lib/db";

const leagueLabel: Record<League, string> = {
  ONE: "MRL One",
  TWO: "MRL Two",
  ROOKIE: "MRL Rookie"
};

export async function ensureReserveTeam(league: League) {
  const name = `Ersatzfahrer · ${leagueLabel[league]}`;
  const team = await prisma.team.upsert({
    where: { name },
    create: { name, color: null, logoPath: null },
    update: {},
    select: { id: true, name: true }
  });
  return team;
}

