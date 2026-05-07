"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type LiveTimingEntry = {
  position: number;
  driver: string;
  team: string | null;
  lap: number | null;
  gap: string | null;
  lastLap: string | null;
  accent: string | null;
  portraitUrl: string | null;
  teamLogoUrl: string | null;
};

type LiveTimingState = {
  ok: boolean;
  sessionId: string;
  updatedAtMs: number;
  entries: LiveTimingEntry[];
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

function teamBgSolid(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.62) : "rgba(255,255,255,0.14)";
  const b = c ? hexToRgba(c, 0.16) : "rgba(255,255,255,0.06)";
  const d = c ? hexToRgba(c, 0.42) : "rgba(255,255,255,0.12)";
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

function formatUpdated(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export default function LiveTimingPage() {
  const [data, setData] = useState<LiveTimingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as LiveTimingState;
        if (cancelled) return;
        setData(j);
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Live Timing nicht erreichbar");
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

  const now = Date.now();
  const last = data?.updatedAtMs ?? 0;
  const isLive = Boolean(last && now - last <= 2000);

  const rows = useMemo(() => {
    return (data?.entries ?? []).slice().sort((a, b) => a.position - b.position);
  }, [data]);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#07080A] text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-14 pt-10 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
              F1 25 Live Timing
            </div>
            <div className="mt-2 text-3xl font-extrabold text-white">
              Live Timing
            </div>
            <div className="mt-2 text-sm text-white/70">
              Auto-Refresh: 1s · Letztes Update: {formatUpdated(last)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={[
                "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-extrabold uppercase tracking-wider",
                isLive ? "border-mrl-red/40 bg-mrl-red/15 text-white" : "border-white/10 bg-white/5 text-white/80"
              ].join(" ")}
            >
              <span className={isLive ? "h-2 w-2 animate-pulse rounded-full bg-mrl-red" : "h-2 w-2 rounded-full bg-white/30"} />
              {isLive ? "Live" : loading ? "Lädt…" : "Offline"}
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold text-white/90">
              Timing Tabelle
            </div>
            <div className="text-xs font-semibold text-white/60">
              Session: {data?.sessionId ?? "—"}
            </div>
          </div>

          {error ? (
            <div className="p-5 text-sm text-white/70">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5 text-sm text-white/70">
              Noch keine Daten. Sende per POST an <span className="font-semibold text-white">/api/live-timing</span>.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              <div className="hidden grid-cols-[64px_1.2fr_1fr_90px_120px_130px] gap-3 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60 md:grid">
                <div>Pos</div>
                <div>Fahrer</div>
                <div>Team</div>
                <div className="text-right">Runde</div>
                <div className="text-right">Gap</div>
                <div className="text-right">Letzte Runde</div>
              </div>

              {rows.map((r) => {
                const accent = r.accent ?? "#E10600";
                return (
                  <div
                    key={`${r.position}-${r.driver}`}
                    className="relative px-4 py-4 md:px-5"
                    style={{ backgroundImage: teamBgSolid(accent) }}
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-20" style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
                    <div className="pointer-events-none absolute left-0 top-0 h-[5px] w-full" style={{ backgroundColor: accent }} />

                    <div className="relative grid gap-3 md:grid-cols-[64px_1.2fr_1fr_90px_120px_130px] md:items-center">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/35 text-lg font-extrabold text-white">
                          {r.position}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          {r.portraitUrl ? (
                            <Image
                              src={r.portraitUrl}
                              alt=""
                              width={52}
                              height={52}
                              unoptimized
                              className="h-11 w-11 object-contain drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-xl bg-black/25" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-base font-extrabold uppercase tracking-wide text-white">
                              {r.driver}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-white/75 md:hidden">
                              {r.team ?? "—"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 hidden items-center gap-3 md:flex">
                        {r.teamLogoUrl ? (
                          <Image
                            src={r.teamLogoUrl}
                            alt=""
                            width={44}
                            height={44}
                            unoptimized
                            className="h-9 w-9 object-contain drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                          />
                        ) : (
                          <div className="h-9 w-9" />
                        )}
                        <div className="truncate text-sm font-semibold text-white/90">
                          {r.team ?? "—"}
                        </div>
                      </div>

                      <div className="text-right text-sm font-extrabold text-white md:text-base">
                        {r.lap ?? "—"}
                      </div>
                      <div className="text-right text-sm font-semibold text-white/90 md:text-base">
                        {r.gap ?? "—"}
                      </div>
                      <div className="text-right text-sm font-semibold text-white/85 md:text-base">
                        {r.lastLap ?? "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

