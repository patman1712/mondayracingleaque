import type { League, PrismaClient } from "@prisma/client";

export type LeagueScoring = {
  fieldSize: number;
  pointsByPosition: number[];
};

function fieldSizeKey(league: League) {
  return `fieldSize:${league}`;
}

function pointsKey(league: League) {
  return `pointsByPosition:${league}`;
}

function defaultPointsFor(fieldSize: number) {
  const base = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const out: number[] = [];
  for (let i = 0; i < fieldSize; i++) out.push(base[i] ?? 0);
  return out;
}

export async function getLeagueScoring(prisma: PrismaClient, league: League): Promise<LeagueScoring> {
  const [fieldRow, pointsRow] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: fieldSizeKey(league) }, select: { value: true } }).catch(() => null),
    prisma.appConfig.findUnique({ where: { key: pointsKey(league) }, select: { value: true } }).catch(() => null)
  ]);

  const fieldRaw = fieldRow?.value ? Number(fieldRow.value) : null;
  const fieldSize = Number.isFinite(fieldRaw) ? Math.max(1, Math.min(60, Math.floor(fieldRaw as number))) : 20;

  let points: number[] | null = null;
  if (pointsRow?.value) {
    try {
      const parsed = JSON.parse(pointsRow.value) as unknown;
      if (Array.isArray(parsed)) {
        const clean = parsed
          .map((v) => (v == null || String(v).trim() === "" ? 0 : Number(v)))
          .map((v) => (Number.isFinite(v) ? Math.max(0, Number(v)) : 0));
        points = clean;
      }
    } catch {}
  }

  const normalized = (points ?? defaultPointsFor(fieldSize)).slice(0, fieldSize);
  while (normalized.length < fieldSize) normalized.push(0);

  return { fieldSize, pointsByPosition: normalized };
}

export async function setLeagueScoring(
  prisma: PrismaClient,
  league: League,
  input: { fieldSize: number; pointsByPosition: number[] }
) {
  const fieldSize = Math.max(1, Math.min(60, Math.floor(input.fieldSize)));
  const points = (input.pointsByPosition ?? [])
    .slice(0, fieldSize)
    .map((v) => (Number.isFinite(v as number) ? Math.max(0, Number(v)) : 0));
  while (points.length < fieldSize) points.push(0);

  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: fieldSizeKey(league) },
      create: { key: fieldSizeKey(league), value: String(fieldSize) },
      update: { value: String(fieldSize) }
    }),
    prisma.appConfig.upsert({
      where: { key: pointsKey(league) },
      create: { key: pointsKey(league), value: JSON.stringify(points) },
      update: { value: JSON.stringify(points) }
    })
  ]);
}

export function pointsForPosition(scoring: LeagueScoring, position: number) {
  const idx = Math.floor(position) - 1;
  if (idx < 0) return 0;
  const v = scoring.pointsByPosition[idx] ?? 0;
  return Number.isFinite(v) ? v : 0;
}

export async function applyRaceScoring(prisma: PrismaClient, raceId: string) {
  const race = await prisma.race.findUnique({ where: { id: raceId }, select: { id: true, league: true } }).catch(() => null);
  if (!race) return;

  const scoring = await getLeagueScoring(prisma, race.league).catch(() => null);
  if (!scoring) return;

  const rows = await prisma.raceResult
    .findMany({
      where: { raceId },
      select: { driverId: true, position: true, status: true, timeText: true },
      take: 5000
    })
    .catch(() => []);

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const statusUp = (r.status ?? "").trim().toUpperCase();
      const dnf = statusUp && ["DNF", "DSQ", "DNS", "RET"].includes(statusUp);
      const points = !dnf && r.timeText ? pointsForPosition(scoring, r.position) : 0;
      await tx.raceResult
        .update({
          where: { raceId_driverId: { raceId, driverId: r.driverId } },
          data: { points }
        })
        .catch(() => null);
    }
  });
}
