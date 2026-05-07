"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function TrackMapPage() {
  const [data, setData] = useState<TrackMapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ entry: TrackMapEntry; x: number; y: number } | null>(null);

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
      } catch {
        if (cancelled) return;
        setError("Track Map nicht erreichbar");
      } finally {
        if (cancelled) return;
        setLoading(false);
        t = window.setTimeout(poll, 1000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, []);

  const entries = useMemo(() => {
    const raw = data?.entries ?? [];
    return raw.slice().sort((a, b) => a.position - b.position);
  }, [data?.entries]);

  const hasCoords = entries.some((e) => typeof e.x === "number" && typeof e.y === "number");
  const title = (data?.trackMap?.circuit ?? "").trim() || "Track Map";

  return (
    <div className="min-h-screen bg-transparent text-white">
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
              {error ? error : loading ? "Lädt…" : `Session: ${data?.sessionId ?? "—"}`}
            </div>
          </div>
          <div className="text-xs font-semibold text-white/55">{hasCoords ? "LIVE" : "WAITING FOR POSITION DATA"}</div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/30">
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/30 to-black/70" />

          <div className="relative aspect-video w-full">
            <svg
              viewBox="0 0 100 100"
              className="h-full w-full"
              onMouseLeave={() => setHover(null)}
            >
              <path
                d="M 20 55 C 18 30, 38 18, 55 22 C 78 27, 82 45, 72 56 C 64 65, 62 78, 48 80 C 30 82, 22 71, 20 55 Z"
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1.5"
              />

              {entries.map((e) => {
                const x = typeof e.x === "number" ? e.x : null;
                const y = typeof e.y === "number" ? e.y : null;
                if (x === null || y === null) return null;
                const rot = typeof e.angle === "number" ? e.angle : 0;
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
                  >
                    <title>
                      {e.driver} · P{e.position}
                    </title>
                    <circle r="2.9" fill={e.accent || "#E10600"} stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
                    <path d="M 0 -5 L 2 0 L -2 0 Z" fill="rgba(255,255,255,0.55)" />
                    <text
                      x="0"
                      y="0.8"
                      textAnchor="middle"
                      fontSize="3.2"
                      fontWeight="800"
                      fill="rgba(0,0,0,0.85)"
                    >
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
                <div className="mt-1 max-w-[240px] truncate text-[11px] font-semibold text-white/70">{hover.entry.driver}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
