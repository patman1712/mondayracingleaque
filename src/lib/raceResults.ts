import type { PrismaClient } from "@prisma/client";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

export function parseRaceTimeMs(s: string | null | undefined) {
  const raw = (s ?? "").trim();
  const h = raw.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (h) {
    const hours = Number(h[1]);
    const min = Number(h[2]);
    const sec = Number(h[3]);
    const ms = Number(h[4]);
    if (!Number.isFinite(hours) || !Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return ((hours * 3600 + min * 60 + sec) * 1000) + ms;
  }
  const m = raw.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

export function parseGapMs(s: string | null | undefined) {
  const raw = (s ?? "").trim();
  if (!raw.startsWith("+")) return null;
  const t = raw.slice(1);
  const m1 = t.match(/^(\d+)\.(\d{3})$/);
  if (m1) {
    const sec = Number(m1[1]);
    const ms = Number(m1[2]);
    if (!Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return sec * 1000 + ms;
  }
  const h = t.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (h) {
    const hours = Number(h[1]);
    const min = Number(h[2]);
    const sec = Number(h[3]);
    const ms = Number(h[4]);
    if (!Number.isFinite(hours) || !Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return ((hours * 3600 + min * 60 + sec) * 1000) + ms;
  }
  const m2 = t.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!m2) return null;
  const min = Number(m2[1]);
  const sec = Number(m2[2]);
  const ms = Number(m2[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

export function formatRaceTimeMs(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  return `${minutes}:${pad2(seconds)}.${pad3(milli)}`;
}

export function formatGapMs(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  if (minutes > 0) return `+${minutes}:${pad2(seconds)}.${pad3(milli)}`;
  return `+${seconds}.${pad3(milli)}`;
}

export async function recalcRaceResults(prisma: PrismaClient, raceId: string) {
  const rows = await prisma.raceResult.findMany({
    where: { raceId },
    select: {
      driverId: true,
      position: true,
      timeText: true,
      status: true,
      finishTimeMs: true,
      penaltySeconds: true
    },
    take: 5000
  });

  const statusSet = new Set(["DNF", "DSQ", "DNS", "RET"]);

  const finishMsByDriverId = new Map<string, number | null>();
  for (const r of rows) {
    const status = (r.status ?? "").trim().toUpperCase();
    if (status && statusSet.has(status)) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (typeof r.finishTimeMs === "number" && Number.isFinite(r.finishTimeMs)) {
      finishMsByDriverId.set(r.driverId, Math.max(0, Math.floor(r.finishTimeMs)));
      continue;
    }
    const tt = (r.timeText ?? "").trim().toUpperCase();
    if (tt && statusSet.has(tt)) {
      finishMsByDriverId.set(r.driverId, null);
      continue;
    }
    if (tt && !tt.startsWith("+")) {
      const ms = parseRaceTimeMs(tt);
      finishMsByDriverId.set(r.driverId, typeof ms === "number" ? ms : null);
      continue;
    }
    finishMsByDriverId.set(r.driverId, null);
  }

  const base = Array.from(finishMsByDriverId.values())
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b)[0];

  if (typeof base === "number") {
    for (const r of rows) {
      const cur = finishMsByDriverId.get(r.driverId) ?? null;
      if (typeof cur === "number") continue;
      const tt = (r.timeText ?? "").trim();
      const gap = parseGapMs(tt);
      if (typeof gap === "number") finishMsByDriverId.set(r.driverId, base + gap);
    }
  }

  const finishers: Array<{ driverId: string; ms: number; penaltySeconds: number; prevPos: number }> = [];
  const nonFinishers: Array<{ driverId: string; prevPos: number }> = [];
  const penaltyByDriverId = new Map<string, number>();

  for (const r of rows) {
    const ms = finishMsByDriverId.get(r.driverId) ?? null;
    const pen = Number.isFinite(r.penaltySeconds) ? Math.max(0, Math.floor(r.penaltySeconds)) : 0;
    penaltyByDriverId.set(r.driverId, pen);
    if (typeof ms === "number") finishers.push({ driverId: r.driverId, ms, penaltySeconds: pen, prevPos: r.position });
    else nonFinishers.push({ driverId: r.driverId, prevPos: r.position });
  }

  finishers.sort((a, b) => (a.ms + a.penaltySeconds * 1000) - (b.ms + b.penaltySeconds * 1000) || a.prevPos - b.prevPos);
  nonFinishers.sort((a, b) => a.prevPos - b.prevPos);

  const ordered = [...finishers.map((x) => x.driverId), ...nonFinishers.map((x) => x.driverId)];
  if (ordered.length === 0) return;

  const winnerAdjusted =
    finishers.length > 0 ? finishers[0]!.ms + finishers[0]!.penaltySeconds * 1000 : null;

  const tempBase = 1000 + (Date.now() % 100000);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      const driverId = ordered[i]!;
      await tx.raceResult
        .update({
          where: { raceId_driverId: { raceId, driverId } },
          data: { position: tempBase + i }
        })
        .catch(() => null);
    }

    for (let i = 0; i < ordered.length; i++) {
      const driverId = ordered[i]!;
      const pos = i + 1;
      const rawFinish = finishMsByDriverId.get(driverId) ?? null;
      const pen = penaltyByDriverId.get(driverId) ?? 0;
      const adjusted = typeof rawFinish === "number" ? rawFinish + pen * 1000 : null;
      const timeText =
        typeof adjusted === "number" && typeof winnerAdjusted === "number"
          ? adjusted === winnerAdjusted
            ? formatRaceTimeMs(adjusted)
            : formatGapMs(adjusted - winnerAdjusted)
          : null;

      await tx.raceResult
        .update({
          where: { raceId_driverId: { raceId, driverId } },
          data: {
            position: pos,
            finishTimeMs: typeof rawFinish === "number" ? Math.max(0, Math.floor(rawFinish)) : null,
            ...(timeText ? { timeText } : {})
          }
        })
        .catch(() => null);
    }
  });
}
