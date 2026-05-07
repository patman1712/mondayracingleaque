"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LiveEntry = {
  position: number;
  driver: string;
  team: string;
  gap: string;
  accent: string;
  x?: number;
  y?: number;
};

type LiveState = {
  updatedAtMs: number;
  entries: LiveEntry[];
};

function hexToRgba(hex: string, a: number) {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function abbrev(name: string) {
  const s = name.trim();
  if (!s) return "DRV";
  const parts = s.split(/\s+/).filter(Boolean);
  const last = (parts[parts.length - 1] ?? s).replace(/[^a-z0-9]/gi, "");
  return last.slice(0, 3).toUpperCase();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function TrackmapPage() {
  const [data, setData] = useState<LiveState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as LiveState;
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
  }, []);

  const cars = useMemo(() => {
    const entries = data?.entries ?? [];
    return entries.map((e) => {
      const x = typeof e.x === "number" && Number.isFinite(e.x) ? e.x : null;
      const y = typeof e.y === "number" && Number.isFinite(e.y) ? e.y : null;
      return {
        id: `${e.position}-${e.driver}`,
        position: e.position,
        driver: e.driver,
        gap: e.gap,
        accent: e.accent,
        tag: abbrev(e.driver),
        x,
        y
      };
    });
  }, [data?.entries]);

  const hasXY = cars.some((c) => c.x !== null && c.y !== null);

  const hoveredCar = hovered ? cars.find((c) => c.id === hovered) ?? null : null;

  return (
    <div
      ref={wrapRef}
      className="relative flex min-h-screen w-full items-center justify-center"
      style={{ background: "transparent" }}
    >
      <style jsx global>{`
        header, footer { display: none !important; }
        main { min-height: 100vh !important; }
        html, body { background: transparent !important; }
      `}</style>

      <div className="relative w-full max-w-[1280px] px-4">
        <div className="relative mx-auto w-full overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-4 backdrop-blur">
          <div className="absolute left-4 right-4 top-4 h-[3px] rounded-full bg-gradient-to-r from-mrl-red via-mrl-red to-transparent" />

          <div className="relative mx-auto aspect-video w-full">
            <svg viewBox="0 0 100 56.25" className="h-full w-full">
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <g opacity="0.55">
                <path
                  d="M12,28 C12,14 22,6 36,6 L64,6 C78,6 88,14 88,28 C88,42 78,50 64,50 L36,50 C22,50 12,42 12,28 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="2"
                />
                <path
                  d="M18,28 C18,18 26,12 36,12 L64,12 C74,12 82,18 82,28 C82,38 74,44 64,44 L36,44 C26,44 18,38 18,28 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="1.5"
                />
              </g>

              {!hasXY ? (
                <g>
                  <circle cx="50" cy="28" r="6" fill="rgba(225,6,0,0.35)" filter="url(#glow)" />
                  <text x="50" y="40" textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="3.2" fontWeight="700">
                    Waiting for car position data
                  </text>
                </g>
              ) : (
                <g>
                  {cars
                    .filter((c) => c.x !== null && c.y !== null)
                    .map((c) => {
                      const x = clamp(c.x as number, 0, 100);
                      const y = clamp(c.y as number, 0, 100);
                      const sx = (x / 100) * 100;
                      const sy = (y / 100) * 56.25;
                      const glow = hexToRgba(c.accent, 0.35);
                      return (
                        <g
                          key={c.id}
                          transform={`translate(${sx}, ${sy})`}
                          style={{ transition: "transform 320ms linear" }}
                          onMouseEnter={() => setHovered(c.id)}
                          onMouseLeave={() => setHovered((h) => (h === c.id ? null : h))}
                        >
                          <circle r="2.8" fill={glow} filter="url(#glow)" />
                          <circle r="2.2" fill={c.accent} stroke="rgba(0,0,0,0.55)" strokeWidth="0.5" />
                          <text
                            x="0"
                            y="0.9"
                            textAnchor="middle"
                            fill="white"
                            fontSize="1.7"
                            fontWeight="900"
                          >
                            {c.tag}
                          </text>
                        </g>
                      );
                    })}
                </g>
              )}
            </svg>

            {hoveredCar ? (
              <div className="pointer-events-none absolute left-4 top-4 max-w-[320px] rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white backdrop-blur">
                <div className="text-xs font-extrabold uppercase tracking-wider text-white/70">
                  P{hoveredCar.position}
                </div>
                <div className="mt-1 text-lg font-extrabold text-white">
                  {hoveredCar.driver}
                </div>
                <div className="mt-1 text-sm font-semibold text-white/80">
                  Gap: {hoveredCar.gap}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

