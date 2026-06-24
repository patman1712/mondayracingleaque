import type { PrismaClient } from "@prisma/client";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

export function parseRaceTimeMs(s: string | null | undefined) {
  const raw = (s ?? "").trim();
  const h = raw.match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/);
  if (h) {
    const hours = Number(h[1]);
    const min = Number(h[2]);
    const sec = Number(h[3]);
    const msRaw = String(h[4]);
    const ms =
      msRaw.length === 1 ? Number(msRaw) * 100 : msRaw.length === 2 ? Number(msRaw) * 10 : Number(msRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return ((hours * 3600 + min * 60 + sec) * 1000) + ms;
  }
  const m = raw.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const msRaw = String(m[3]);
  const ms =
    msRaw.length === 1 ? Number(msRaw) * 100 : msRaw.length === 2 ? Number(msRaw) * 10 : Number(msRaw);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

export function parseGapMs(s: string | null | undefined) {
  const raw = (s ?? "").trim();
  if (!raw.startsWith("+")) return null;
  const t = raw.slice(1);
  const m1 = t.match(/^(\d+)\.(\d{1,3})$/);
  if (m1) {
    const sec = Number(m1[1]);
    const msRaw = String(m1[2]);
    const ms =
      msRaw.length === 1 ? Number(msRaw) * 100 : msRaw.length === 2 ? Number(msRaw) * 10 : Number(msRaw);
    if (!Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return sec * 1000 + ms;
  }
  const h = t.match(/^(\d+):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/);
  if (h) {
    const hours = Number(h[1]);
    const min = Number(h[2]);
    const sec = Number(h[3]);
    const msRaw = String(h[4]);
    const ms =
      msRaw.length === 1 ? Number(msRaw) * 100 : msRaw.length === 2 ? Number(msRaw) * 10 : Number(msRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return ((hours * 3600 + min * 60 + sec) * 1000) + ms;
  }
  const m2 = t.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!m2) return null;
  const min = Number(m2[1]);
  const sec = Number(m2[2]);
  const msRaw = String(m2[3]);
  const ms =
    msRaw.length === 1 ? Number(msRaw) * 100 : msRaw.length === 2 ? Number(msRaw) * 10 : Number(msRaw);
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

  const statusSet = new Set(["DNF", "DSQ", "DNS", "RET", "RETIRED", "NC"]);
  const dnfSet = new Set(["DNF", "RET", "RETIRED", "NC"]);

  function normalizedResultStatus(input: string | null | undefined) {
    const value = (input ?? "").trim().toUpperCase();
    if (!value) return null;
    if (dnfSet.has(value)) return "DNF";
    if (statusSet.has(value)) return value;
    return null;
  }

  const finishInfoByDriverId = new Map<string, { ms: number | null; absolute: boolean }>();
  for (const r of rows) {
    const status = normalizedResultStatus(r.status);
    if (status) {
      finishInfoByDriverId.set(r.driverId, { ms: null, absolute: false });
      continue;
    }
    if (typeof r.finishTimeMs === "number" && Number.isFinite(r.finishTimeMs)) {
      finishInfoByDriverId.set(r.driverId, { ms: Math.max(0, Math.floor(r.finishTimeMs)), absolute: true });
      continue;
    }
    const tt = (r.timeText ?? "").trim().toUpperCase();
    if (normalizedResultStatus(tt)) {
      finishInfoByDriverId.set(r.driverId, { ms: null, absolute: false });
      continue;
    }
    if (tt && !tt.startsWith("+")) {
      const ms = parseRaceTimeMs(tt);
      if (typeof ms === "number") {
        finishInfoByDriverId.set(r.driverId, { ms, absolute: true });
        continue;
      }
    }
    finishInfoByDriverId.set(r.driverId, { ms: null, absolute: false });
  }

  const absoluteBase = Array.from(finishInfoByDriverId.values())
    .map((x) => x.ms)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b)[0];

  for (const r of rows) {
    const current = finishInfoByDriverId.get(r.driverId) ?? { ms: null, absolute: false };
    if (typeof current.ms === "number") continue;
    const displayStatus = normalizedResultStatus(r.status) ?? normalizedResultStatus(r.timeText);
    if (displayStatus) continue;
    const tt = (r.timeText ?? "").trim();
    const gap = parseGapMs(tt);
    if (typeof gap === "number") {
      finishInfoByDriverId.set(r.driverId, {
        ms: typeof absoluteBase === "number" ? absoluteBase + gap : gap,
        absolute: typeof absoluteBase === "number"
      });
      continue;
    }
    const upper = tt.toUpperCase();
    if (upper === "LEADER" || upper === "WINNER" || r.position === 1) {
      finishInfoByDriverId.set(r.driverId, {
        ms: typeof absoluteBase === "number" ? absoluteBase : 0,
        absolute: typeof absoluteBase === "number"
      });
    }
  }

  const finishers: Array<{ driverId: string; ms: number; absolute: boolean; penaltySeconds: number; prevPos: number }> = [];
  const nonFinishers: Array<{ driverId: string; prevPos: number; displayStatus: string | null }> = [];
  const penaltyByDriverId = new Map<string, number>();
  const displayStatusByDriverId = new Map<string, string | null>();

  for (const r of rows) {
    const info = finishInfoByDriverId.get(r.driverId) ?? { ms: null, absolute: false };
    const pen = Number.isFinite(r.penaltySeconds) ? Math.max(0, Math.floor(r.penaltySeconds)) : 0;
    const displayStatus = normalizedResultStatus(r.status) ?? normalizedResultStatus(r.timeText);
    penaltyByDriverId.set(r.driverId, pen);
    displayStatusByDriverId.set(r.driverId, displayStatus);
    if (typeof info.ms === "number") {
      finishers.push({ driverId: r.driverId, ms: info.ms, absolute: info.absolute, penaltySeconds: pen, prevPos: r.position });
    } else {
      nonFinishers.push({ driverId: r.driverId, prevPos: r.position, displayStatus });
    }
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
      const info = finishInfoByDriverId.get(driverId) ?? { ms: null, absolute: false };
      const rawFinish = info.ms;
      const pen = penaltyByDriverId.get(driverId) ?? 0;
      const adjusted = typeof rawFinish === "number" ? rawFinish + pen * 1000 : null;
      const displayStatus = displayStatusByDriverId.get(driverId) ?? null;
      const timeText = (() => {
        if (displayStatus) return displayStatus;
        if (typeof adjusted !== "number" || typeof winnerAdjusted !== "number") return null;
        if (i === 0) return info.absolute ? formatRaceTimeMs(adjusted) : "Leader";
        return formatGapMs(adjusted - winnerAdjusted);
      })();

      await tx.raceResult
        .update({
          where: { raceId_driverId: { raceId, driverId } },
          data: {
            position: pos,
            finishTimeMs: typeof rawFinish === "number" ? Math.max(0, Math.floor(rawFinish)) : null,
            timeText,
            status: displayStatus
          }
        })
        .catch(() => null);
    }
  });
}
