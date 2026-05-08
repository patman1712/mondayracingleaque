"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type Entry = {
  position: number;
  participantIndex?: number;
  driver: string;
  team: string;
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

function tyreStyle(tyre: string | null | undefined) {
  const t = (tyre ?? "").trim().toLowerCase();
  if (t === "soft") return { label: "S", cls: "border-red-400/60 bg-red-500/15 text-red-100" };
  if (t === "medium") return { label: "M", cls: "border-amber-300/60 bg-amber-500/15 text-amber-100" };
  if (t === "hard") return { label: "H", cls: "border-white/25 bg-white/5 text-white/90" };
  if (t === "inter" || t === "intermediate") return { label: "I", cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" };
  if (t === "wet") return { label: "W", cls: "border-sky-400/60 bg-sky-500/15 text-sky-100" };
  const raw = (tyre ?? "").trim();
  return { label: raw ? raw.slice(0, 3).toUpperCase() : "—", cls: "border-white/10 bg-black/25 text-white/80" };
}

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

function alertStyle(type: LiveTimingAlert["type"]) {
  if (type === "fastest_lap") return { bar: "bg-violet-400", wrap: "border-violet-400/40 bg-violet-500/15" };
  return { bar: "bg-emerald-400", wrap: "border-emerald-400/40 bg-emerald-500/15" };
}

function sessionModeByName(sessionName: string) {
  const n = sessionName.trim().toLowerCase();
  const isRaceByName = n.includes(" race") || n.startsWith("race") || n.includes("grand prix") || n.includes("sprint");
  if (isRaceByName) return "race" as const;
  const isPracticeOrQualiByName =
    n.includes("practice") ||
    n.includes("qualifying") ||
    n.includes("q1") ||
    n.includes("q2") ||
    n.includes("q3") ||
    n.includes("time trial");
  if (isPracticeOrQualiByName) return "practice" as const;
  return "race" as const;
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
  rowsPerColumn
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
}) {
  const [data, setData] = useState<State | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupSize, setPopupSize] = useState<{ w: number; h: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [toasts, setToasts] = useState<LiveTimingAlert[]>([]);
  const seenAlertIds = useRef<Set<string>>(new Set());

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
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as State;
        if (cancelled) return;
        const nextUpdatedAt = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        if (nextUpdatedAt && nextUpdatedAt === lastSeenUpdatedAt) return;
        lastSeenUpdatedAt = nextUpdatedAt;
        setData(j);
      } catch {
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
  }, [enabled]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mrl_live_timing_popup_size");
      if (!raw) return;
      const v = JSON.parse(raw) as { w?: unknown; h?: unknown };
      const w = typeof v?.w === "number" ? v.w : null;
      const h = typeof v?.h === "number" ? v.h : null;
      if (w && h) setPopupSize({ w, h });
    } catch {}
  }, []);

  useEffect(() => {
    const alerts = Array.isArray(data?.alerts) ? (data?.alerts as LiveTimingAlert[]) : [];
    if (alerts.length === 0) return;
    const next = alerts
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((a) => a?.id && !seenAlertIds.current.has(a.id))
      .filter((a) => a.type === "fastest_lap" || a.type === "fastest_sector");
    if (next.length === 0) return;

    for (const a of next) seenAlertIds.current.add(a.id);
    setToasts((prev) => {
      const merged = [...next, ...prev];
      return merged.slice(0, 4);
    });

    for (const a of next) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== a.id));
      }, 4500);
    }
  }, [data?.alerts]);

  const now = Date.now();
  const last = data?.updatedAtMs ?? 0;
  const isFresh = Boolean(last && now - last <= 2000);
  if (!enabled) return null;

  const sessionName = (data?.sessionName ?? "").toString().trim();
  const mode = sessionModeByName(sessionName);
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

  const left = typeof data?.sessionTimeLeft === "string" ? data.sessionTimeLeft.trim() : "";
  const track = typeof data?.trackStatus === "string" ? data.trackStatus.trim() : "";
  const lapInfo =
    typeof data?.currentLap === "number" && typeof data?.totalLaps === "number" && data.totalLaps
      ? `LAP ${data.currentLap}/${data.totalLaps}`
      : typeof data?.currentLap === "number"
        ? `LAP ${data.currentLap}`
        : "";

  const rowsCount = Math.max(1, rowsPerColumn ?? splitAt);
  const limited = columns === 2 ? rows.slice(0, rowsCount * 2) : rows;
  const leftRows = columns === 2 ? limited.filter((_, idx) => idx % 2 === 0) : limited;
  const rightRows = columns === 2 ? limited.filter((_, idx) => idx % 2 === 1) : [];

  const renderRow = (r: Entry) => {
    const tyre = tyreStyle(r.tyre);
    const accent = (r.accent ?? "").toString().trim() || "#E10600";
    const penalty = (r.penalties ?? "").trim();
    const isDrs = Boolean(r.drs);
    const bestLap = (r.bestLap ?? "").toString().trim() || "—";
    const lastLap = (r.lastLap ?? "").toString().trim() || "—";
    const currentLap = (r.currentLap ?? "").toString().trim() || "—";
    const sector1 = r.sector1?.trim() ? r.sector1 : "—";
    const sector2 = r.sector2?.trim() ? r.sector2 : "—";
    const sector3 = r.sector3?.trim() ? r.sector3 : "—";
    const status = statusStyle(r.status);
    const noTime = mode === "practice" && parseLapTimeMs(bestLap) === null;
    const gap = noTime ? "No time" : (r.gap ?? "").toString().trim() || "—";
    const warnings = typeof r.warnings === "number" && Number.isFinite(r.warnings) && r.warnings > 0 ? r.warnings : null;
    const stops = typeof r.stops === "number" && Number.isFinite(r.stops) && r.stops > 0 ? r.stops : null;
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
              <div className="mt-1 text-[12px] font-semibold leading-snug text-white/70 line-clamp-2">
                {r.team}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", status.cls].join(" ")}>
                  {status.label}
                </div>
                {penalty ? (
                  <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/85">
                    PEN {penalty}
                  </div>
                ) : null}
                {warnings !== null ? (
                  <div className="rounded-full border border-orange-300/50 bg-orange-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-orange-100">
                    WARN {warnings}
                  </div>
                ) : null}
                {stops !== null ? (
                  <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/85">
                    PIT {stops}
                  </div>
                ) : null}
                {isDrs ? (
                  <div className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">
                    DRS
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", tyre.cls].join(" ")}>
                {tyre.label || "—"}
              </div>
              <div className="text-xs font-extrabold text-white/90">{gap}</div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              BEST {bestLap}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              LAST {lastLap}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/85">
              CUR {currentLap}
            </div>
            <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector1Color)].join(" ")}>
              {sector1}
            </div>
            <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector2Color)].join(" ")}>
              {sector2}
            </div>
            <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector3Color)].join(" ")}>
              {sector3}
            </div>
          </div>
        </div>
      </div>
    );
  };

  function ToastItem({ a }: { a: LiveTimingAlert }) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
      const t = window.setTimeout(() => setShown(true), 0);
      return () => window.clearTimeout(t);
    }, []);
    const st = alertStyle(a.type);
    const meta = [
      a.driver ? a.driver : null,
      typeof a.sector === "number" ? `S${a.sector}` : null
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div
        className={[
          "pointer-events-none w-[min(360px,92vw)] overflow-hidden rounded-xl border backdrop-blur transition-all duration-300",
          st.wrap,
          shown ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0"
        ].join(" ")}
      >
        <div className={"h-1 " + st.bar} />
        <div className="px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-extrabold uppercase tracking-wider text-white/90">
                {a.title}
              </div>
              {meta ? (
                <div className="mt-0.5 truncate text-[11px] font-semibold text-white/70">
                  {meta}
                </div>
              ) : null}
              <div className="mt-1 text-sm font-extrabold leading-snug text-white">
                {a.message}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur flex flex-col",
        className ?? ""
      ].join(" ")}
    >
      {toasts.length ? (
        <div className="absolute right-3 top-14 z-20 grid gap-2">
          {toasts.map((a) => (
            <ToastItem key={a.id} a={a} />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold uppercase tracking-wider text-white/85">
            {sessionName ? sessionName : title}
            {left ? ` • LEFT ${left}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/60">
            {lapInfo ? <span>{lapInfo}</span> : null}
            {track ? <span>TRACK {track}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPopupOpen(true)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85 hover:bg-white/10"
          >
            Popup
          </button>
          <div
            className={[
              "flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider",
              isFresh ? "border-mrl-red/35 bg-mrl-red/15 text-white" : "border-white/10 bg-white/5 text-white/80"
            ].join(" ")}
          >
            <span className={isFresh ? "h-2 w-2 animate-pulse rounded-full bg-mrl-red" : "h-2 w-2 rounded-full bg-white/30"} />
            {isFresh ? "LIVE" : "OFFLINE"}
          </div>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="p-4 text-sm font-semibold text-white/70">
          Warte auf Live-Daten…
        </div>
      ) : null}

      {popupOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setPopupOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              ref={popupRef}
              className="w-[min(92vw,720px)] h-[min(82vh,760px)] overflow-auto rounded-2xl border border-white/10 bg-black/60 backdrop-blur"
              style={{
                resize: "both",
                ...(popupSize ? { width: popupSize.w, height: popupSize.h } : null)
              }}
              onMouseUp={() => {
                const el = popupRef.current;
                if (!el) return;
                const r = el.getBoundingClientRect();
                const next = { w: Math.round(r.width), h: Math.round(r.height) };
                setPopupSize(next);
                try {
                  localStorage.setItem("mrl_live_timing_popup_size", JSON.stringify(next));
                } catch {}
              }}
              onTouchEnd={() => {
                const el = popupRef.current;
                if (!el) return;
                const r = el.getBoundingClientRect();
                const next = { w: Math.round(r.width), h: Math.round(r.height) };
                setPopupSize(next);
                try {
                  localStorage.setItem("mrl_live_timing_popup_size", JSON.stringify(next));
                } catch {}
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 truncate text-xs font-extrabold uppercase tracking-wider text-white/85">
                  {title}
                  {sessionName ? ` · ${sessionName}` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => setPopupOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              {!hasAnyData ? (
                <div className="p-4 text-sm font-semibold text-white/70">
                  Warte auf Live-Daten…
                </div>
              ) : columns === 2 ? (
                <div className="grid grid-cols-2 gap-3 p-3">
                  <div className="grid gap-3" style={{ gridTemplateRows: `repeat(${rowsCount}, minmax(0, 1fr))` }}>
                    {leftRows.map(renderRow)}
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateRows: `repeat(${rowsCount}, minmax(0, 1fr))` }}>
                    {rightRows.map(renderRow)}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 p-3">{leftRows.map(renderRow)}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
