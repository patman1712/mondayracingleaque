"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { TyreBadge } from "@/components/TyreBadge";
import { sessionModeFromName } from "@/lib/liveTimingDisplay";
import { TeamLogo } from "@/components/TeamLogo";

type Entry = {
  position: number;
  participantIndex?: number;
  driver: string;
  team: string;
  teamLogoUrl?: string | null;
  lap: number;
  gap: string;
  lastLap: string;
  bestLap?: string | null;
  currentLap?: string | null;
  sector1?: string | null;
  sector2?: string | null;
  sector3?: string | null;
  sector1Color?: string | null;
  sector2Color?: string | null;
  sector3Color?: string | null;
  drs?: boolean | null;
  tyre?: string | null;
  status?:
    | "IN GARAGE"
    | "OUT LAP"
    | "FLYING LAP"
    | "IN LAP"
    | "ON TRACK"
    | "INVALID"
    | "DNF"
    | "DSQ"
    | "RETIRED"
    | "WAITING"
    | "PIT";
  penalties?: string;
  warnings?: number;
  stops?: number;
  accent?: string | null;
  portraitUrl?: string | null;
};

type LiveTimingAlert = {
  id: string;
  type: "fastest_lap" | "fastest_sector" | "safety_car" | "vsc" | "red_flag" | "green_flag";
  title: string;
  message: string;
  driver?: string;
  sector?: number;
  createdAt: number;
};

type State = {
  ok: boolean;
  sessionId: string;
  sessionName?: string | null;
  sessionTimeLeft?: string | null;
  totalLaps?: number | null;
  currentLap?: number | null;
  lapsRemaining?: number | null;
  trackStatus?: string | null;
  updatedAtMs: number;
  alerts?: LiveTimingAlert[];
  entries: Entry[];
};

function parseLapTimeMs(raw: string | undefined | null) {
  const s = (raw ?? "").trim();
  if (!s || s === "—") return null;
  const m = /^(\d+):(\d{1,2})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3].padEnd(3, "0"));
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return min * 60000 + sec * 1000 + ms;
}

function hexToRgba(hex: string, a: number) {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function teamBgSolid(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.58) : "rgba(255,255,255,0.12)";
  const b = c ? hexToRgba(c, 0.14) : "rgba(255,255,255,0.05)";
  const d = c ? hexToRgba(c, 0.42) : "rgba(255,255,255,0.10)";
  return `radial-gradient(900px circle at 22% 18%, ${d}, transparent 62%), linear-gradient(145deg, ${a}, ${b})`;
}

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
}

function sectorClass(color: string | null | undefined) {
  const c = (color ?? "").trim().toLowerCase();
  if (c === "purple") return "border-violet-400/60 bg-violet-500/20 text-violet-100";
  if (c === "green") return "border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
  if (c === "yellow") return "border-amber-400/60 bg-amber-500/20 text-amber-100";
  return "border-white/10 bg-black/25 text-white/85";
}

function statusStyle(status: Entry["status"]) {
  const s = (status ?? "WAITING").toString().toUpperCase();
  if (s === "FLYING LAP") return { label: s, cls: "border-violet-400/60 bg-violet-500/15 text-violet-100" };
  if (s === "OUT LAP" || s === "ON TRACK") return { label: s, cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" };
  if (s === "IN LAP" || s === "PIT") return { label: s, cls: "border-amber-400/60 bg-amber-500/15 text-amber-100" };
  if (s === "INVALID") return { label: s, cls: "border-orange-300/60 bg-orange-500/15 text-orange-100" };
  if (s === "DNF" || s === "DSQ" || s === "RETIRED") return { label: s, cls: "border-red-400/60 bg-red-500/15 text-red-100" };
  if (s === "IN GARAGE") return { label: s, cls: "border-white/10 bg-black/25 text-white/80" };
  return { label: s, cls: "border-white/10 bg-black/25 text-white/80" };
}

export function LiveTimingMiniClient({
  startsAtMs,
  disabled,
  title = "Live Timing",
  maxRows = 6,
  className,
  columns = 1,
  splitAt = 11,
  hideWhenNoLiveData = true,
  equalHeights = false,
  rowsPerColumn,
  leagueKey
}: {
  startsAtMs: number;
  disabled?: boolean;
  title?: string;
  maxRows?: number;
  className?: string;
  columns?: 1 | 2;
  splitAt?: number;
  hideWhenNoLiveData?: boolean;
  equalHeights?: boolean;
  rowsPerColumn?: number;
  leagueKey?: string;
}) {
  const [data, setData] = useState<State | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  const enabled = useMemo(() => {
    if (disabled) return false;
    if (!Number.isFinite(startsAtMs)) return false;
    const now = Date.now();
    const open = startsAtMs - 30 * 60 * 1000;
    const close = startsAtMs + 3 * 60 * 60 * 1000;
    return now >= open && now <= close;
  }, [disabled, startsAtMs]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const qs = leagueKey ? `?leagueKey=${encodeURIComponent(leagueKey)}` : "";
        const r = await fetch(`/api/live-timing${qs}`, { cache: "no-store" });
        const j = (await r.json()) as State;
        if (cancelled) return;
        const nextUpdatedAt = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        if (nextUpdatedAt && nextUpdatedAt === lastSeenUpdatedAt) return;
        lastSeenUpdatedAt = nextUpdatedAt;
        setData(j);
        setRequestFailed(false);
      } catch {
        if (cancelled) return;
        setRequestFailed(true);
        setData(null);
      } finally {
        if (cancelled) return;
        t = window.setTimeout(poll, 1000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, [enabled, leagueKey]);

  const now = Date.now();
  const last = data?.updatedAtMs ?? 0;
  const entriesLen = Array.isArray(data?.entries) ? data!.entries.length : 0;
  const isLive = Boolean(!requestFailed && last && now - last < 10_000 && entriesLen > 0);
  useEffect(() => {
    if (!data?.updatedAtMs) return;
    if (Date.now() - data.updatedAtMs < 10_000) return;
    setData(null);
  }, [data?.updatedAtMs]);

  if (!enabled) return null;

  if (!isLive) {
    return (
      <div
        className={[
          "relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur",
          className ?? ""
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-extrabold uppercase tracking-wider text-white/85">
              {title}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/80">
            <span className="h-2 w-2 rounded-full bg-white/30" />
            OFFLINE
          </div>
        </div>
        <div className="p-4 text-sm font-semibold text-white/70">
          No live timing currently available.
        </div>
      </div>
    );
  }

  const sessionName = (data?.sessionName ?? "").toString().trim();
  const mode = sessionModeFromName(sessionName) === "race" ? "race" : "practice";
  const sorted = (data?.entries ?? [])
    .slice()
    .sort((a, b) => {
      if (mode === "practice") {
        const am = parseLapTimeMs(a.bestLap);
        const bm = parseLapTimeMs(b.bestLap);
        if (am === null && bm === null) {
          const ai = typeof a.participantIndex === "number" ? a.participantIndex : Number.MAX_SAFE_INTEGER;
          const bi = typeof b.participantIndex === "number" ? b.participantIndex : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return a.position - b.position;
        }
        if (am === null) return 1;
        if (bm === null) return -1;
        if (am !== bm) return am - bm;
        const ai = typeof a.participantIndex === "number" ? a.participantIndex : Number.MAX_SAFE_INTEGER;
        const bi = typeof b.participantIndex === "number" ? b.participantIndex : Number.MAX_SAFE_INTEGER;
        return ai - bi;
      }

      const ap = typeof a.position === "number" ? a.position : 0;
      const bp = typeof b.position === "number" ? b.position : 0;
      if (ap !== bp) return ap - bp;
      const ai = typeof a.participantIndex === "number" ? a.participantIndex : Number.MAX_SAFE_INTEGER;
      const bi = typeof b.participantIndex === "number" ? b.participantIndex : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  const rows = sorted.slice(0, Math.max(1, maxRows));
  const hasAnyData = sorted.length > 0;
  if (!hasAnyData && hideWhenNoLiveData) return null;

  const rowsCount = Math.max(1, rowsPerColumn ?? splitAt);
  const limited = columns === 2 ? rows.slice(0, rowsCount * 2) : rows;
  const leftRows = columns === 2 ? limited.filter((_, idx) => idx % 2 === 0) : limited;
  const rightRows = columns === 2 ? limited.filter((_, idx) => idx % 2 === 1) : [];

  const renderRow = (r: Entry) => {
    const accent = (r.accent ?? "").toString().trim() || "#E10600";
    const bestLap = (r.bestLap ?? "").toString().trim() || "—";
    const lastLap = (r.lastLap ?? "").toString().trim() || "—";
    const currentLap = (r.currentLap ?? "").toString().trim() || "—";
    const penalties = (r.penalties ?? "").toString().trim() || "—";
    const stops = typeof r.stops === "number" ? r.stops : null;
    const sector1 = r.sector1?.trim() ? r.sector1 : "—";
    const sector2 = r.sector2?.trim() ? r.sector2 : "—";
    const sector3 = r.sector3?.trim() ? r.sector3 : "—";
    const status = statusStyle(r.status);
    const noTime = mode === "practice" && parseLapTimeMs(bestLap) === null;
    const gap = noTime ? "No time" : (r.gap ?? "").toString().trim() || "—";
    return (
      <div
        key={`${r.position}-${r.driver}`}
        className={[
          "relative overflow-hidden rounded-xl border border-white/10",
          equalHeights ? "h-full px-3 py-2" : "min-h-[112px] px-3 py-3"
        ].join(" ")}
        style={{ backgroundImage: teamBgSolid(accent) }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ ...f1Dots(), clipPath: "polygon(0 0, 88% 0, 64% 100%, 0 100%)" }} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/75" />
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: accent }} />

        <div className="relative">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/35 text-sm font-extrabold text-white">
              {r.position}
            </div>
            {r.portraitUrl ? (
              <Image
                src={r.portraitUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 object-contain drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
              />
            ) : (
              <div className="h-8 w-8 rounded-xl bg-black/25" />
            )}

            <div className="min-w-0 flex-1">
              <div className="min-w-0 text-[13px] font-extrabold leading-snug tracking-wide text-white line-clamp-2">
                {r.driver}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold leading-snug text-white/70">
                <TeamLogo teamName={r.team} src={r.teamLogoUrl} size={20} className="h-5 w-5" />
                <div className="min-w-0 line-clamp-2">{r.team}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", status.cls].join(" ")}>
                  {status.label}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="text-xs font-extrabold text-white/90">{gap}</div>
            </div>
          </div>

          {mode === "practice" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                BEST {bestLap}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                CURRENT {currentLap}
              </div>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                LAST {lastLap}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                PEN {penalties}
              </div>
            </div>
          )}

          {mode === "race" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                STOPS {stops !== null ? stops : "—"}
              </div>
              <div className="ml-auto">
                <TyreBadge tyre={r.tyre} size={28} />
              </div>
            </div>
          ) : null}

          {mode === "practice" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector1Color)].join(" ")}>
                {sector1}
              </div>
              <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector2Color)].join(" ")}>
                {sector2}
              </div>
              <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector3Color)].join(" ")}>
                {sector3}
              </div>
              <div className="ml-auto">
                <TyreBadge tyre={r.tyre} size={28} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      className={[
        "relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur flex flex-col",
        className ?? ""
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold uppercase tracking-wider text-white/85">
            {title}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
          <span className="h-2 w-2 animate-pulse rounded-full bg-mrl-red" />
          LIVE
        </div>
      </div>

      {hasAnyData ? (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
          {columns === 2 ? (
            <div className="grid grid-cols-2 gap-3">
              <div
                className="grid gap-3 min-h-0"
                style={equalHeights ? { gridTemplateRows: `repeat(${rowsCount}, minmax(0, 1fr))` } : undefined}
              >
                {leftRows.map(renderRow)}
              </div>
              <div
                className="grid gap-3 min-h-0"
                style={equalHeights ? { gridTemplateRows: `repeat(${rowsCount}, minmax(0, 1fr))` } : undefined}
              >
                {rightRows.map(renderRow)}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 min-h-0">
              {leftRows.map(renderRow)}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
