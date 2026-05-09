"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TrackMapEntry = {
  position: number;
  driver: string;
  team: string;
  accent: string;
  x: number | null;
  y: number | null;
  z: number | null;
  angle: number | null;
};

type TrackMapState = {
  ok: boolean;
  sessionId: string;
  updatedAtMs: number;
  trackMap?: { circuit?: string; length?: number } | null;
  entries: TrackMapEntry[];
};

function initials(name: string) {
  const p = name
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (p.length === 0) return "—";
  if (p.length === 1) return p[0].slice(0, 3).toUpperCase();
  const last = p[p.length - 1].slice(0, 3).toUpperCase();
  return last || p[0].slice(0, 3).toUpperCase();
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function LiveTrackMapPage() {
  const [data, setData] = useState<TrackMapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ entry: TrackMapEntry; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const targetsRef = useRef<Map<string, { x: number; y: number; angle: number }>>(new Map());
  const currentRef = useRef<Map<string, { x: number; y: number; angle: number }>>(new Map());
  const [renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing/track-map", { cache: "no-store" });
        const j = (await r.json()) as TrackMapState;
        if (cancelled) return;
        const nextUpdatedAt = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        if (nextUpdatedAt && nextUpdatedAt === lastSeenUpdatedAt) return;
        lastSeenUpdatedAt = nextUpdatedAt;
        setData(j);
        setError(null);

        const nextTargets = new Map<string, { x: number; y: number; angle: number }>();
        for (const e of j.entries ?? []) {
          if (!e || typeof e.driver !== "string") continue;
          if (typeof e.x !== "number" || typeof e.y !== "number") continue;
          const a = typeof e.angle === "number" ? e.angle : 0;
          nextTargets.set(e.driver, { x: e.x, y: e.y, angle: a });
        }
        targetsRef.current = nextTargets;
        if (!selected) {
          const first = (j.entries ?? []).find((e) => typeof e?.driver === "string")?.driver ?? null;
          setSelected(first);
        }
      } catch {
        if (cancelled) return;
        setError("Track Map nicht erreichbar");
        setData(null);
        targetsRef.current = new Map();
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
  }, [selected]);

  useEffect(() => {
    let raf = 0;
    function step() {
      const targets = targetsRef.current;
      const cur = currentRef.current;
      for (const [key, t] of targets) {
        const c = cur.get(key);
        if (!c) {
          cur.set(key, { x: t.x, y: t.y, angle: t.angle });
          continue;
        }
        cur.set(key, {
          x: lerp(c.x, t.x, 0.18),
          y: lerp(c.y, t.y, 0.18),
          angle: lerp(c.angle, t.angle, 0.22)
        });
      }
      for (const key of Array.from(cur.keys())) {
        if (!targets.has(key)) cur.delete(key);
      }
      setRenderTick((x) => (x + 1) % 1_000_000);
      raf = window.requestAnimationFrame(step);
    }
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const now = Date.now();
  const updatedAt = typeof data?.updatedAtMs === "number" ? data.updatedAtMs : 0;
  const isLive = Boolean(updatedAt && now - updatedAt < 10_000 && (data?.entries?.length ?? 0) > 0);

  const title = (data?.trackMap?.circuit ?? "").trim() || "LIVE TRACKMAP";
  const entries = (data?.entries ?? []).slice().sort((a, b) => a.position - b.position);

  const hasCoords = useMemo(() => {
    return entries.some((e) => typeof e.x === "number" && typeof e.y === "number");
  }, [entries]);

  return (
    <div className="min-h-screen bg-transparent text-white" data-frame={renderTick}>
      <style jsx global>{`
        header,
        footer {
          display: none !important;
        }
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1280px] px-4 py-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold uppercase tracking-wider text-white/80">{title}</div>
            <div className="mt-1 text-xs font-semibold text-white/55">
              {error ? error : isLive ? `Session: ${data?.sessionId ?? "—"}` : "No live timing currently available."}
            </div>
          </div>
          <div className="text-xs font-semibold text-white/55">{isLive ? (hasCoords ? "LIVE" : "WAITING FOR POSITION DATA") : "OFFLINE"}</div>
        </div>

        {!isLive ? (
          <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-sm font-semibold text-white/70">
            No live timing currently available.
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/30 to-black/70" />

            <div className="relative aspect-video w-full">
              <svg viewBox="0 0 100 100" className="h-full w-full" onMouseLeave={() => setHover(null)}>
                <path
                  d="M 20 55 C 18 30, 38 18, 55 22 C 78 27, 82 45, 72 56 C 64 65, 62 78, 48 80 C 30 82, 22 71, 20 55 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1.5"
                />

                {entries.map((e) => {
                  const key = e.driver;
                  const pos = currentRef.current.get(key);
                  const x = pos ? pos.x : typeof e.x === "number" ? e.x : null;
                  const y = pos ? pos.y : typeof e.y === "number" ? e.y : null;
                  if (x === null || y === null) return null;
                  const rot = pos ? pos.angle : typeof e.angle === "number" ? e.angle : 0;
                  const isSelected = selected && key === selected;
                  return (
                    <g
                      key={`${e.position}-${e.driver}`}
                      transform={`translate(${x} ${y}) rotate(${rot})`}
                      onMouseMove={(ev) => {
                        const rect = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                        setHover({ entry: e, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                      }}
                      onMouseEnter={(ev) => {
                        const rect = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                        setHover({ entry: e, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
                      }}
                      onClick={() => setSelected(key)}
                      style={{ cursor: "pointer" }}
                    >
                      <title>
                        {e.driver} · P{e.position}
                      </title>
                      <circle
                        r={isSelected ? 3.6 : 3.0}
                        fill={e.accent || "#E10600"}
                        stroke={isSelected ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)"}
                        strokeWidth={isSelected ? 1.4 : 1}
                      />
                      <path d="M 0 -5 L 2 0 L -2 0 Z" fill={isSelected ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.45)"} />
                      <text x="0" y="0.9" textAnchor="middle" fontSize="3.0" fontWeight="800" fill="rgba(0,0,0,0.85)">
                        {String(e.position)}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {hover ? (
                <div
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur"
                  style={{ left: hover.x, top: hover.y }}
                >
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/70">P{hover.entry.position}</div>
                  <div className="mt-1 whitespace-nowrap text-sm font-extrabold uppercase tracking-wide text-white">
                    {initials(hover.entry.driver)}
                  </div>
                  <div className="mt-1 max-w-[260px] truncate text-[11px] font-semibold text-white/70">{hover.entry.driver}</div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
