import { League } from "@prisma/client";
import { prisma } from "@/lib/db";

async function leagueName(league: League) {
  const row = await prisma.leagueConfig
    .findUnique({ where: { league }, select: { name: true } })
    .catch(() => null);
  if (row?.name) return row.name;
  if (league === League.ONE) return "MRL One";
  if (league === League.TWO) return "MRL Two";
  if (league === League.ROOKIE) return "MRL Rookie";
  return String(league);
}

export async function ensureReserveTeam(league: League) {
  const name = `Ersatzfahrer · ${await leagueName(league)}`;
  const team = await prisma.team.upsert({
    where: { name },
    create: { name, color: null, logoPath: null },
    update: {},
    select: { id: true, name: true }
  });
  await prisma.teamLeague
    .upsert({
      where: { teamId_league: { teamId: team.id, league } },
      create: { teamId: team.id, league },
      update: {}
    })
    .catch(() => null);
  return team;
}
