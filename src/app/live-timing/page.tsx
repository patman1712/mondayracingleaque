"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type LiveTimingEntry = {
  position: number;
  driver: string;
  team: string;
  lap: number;
  gap: string;
  lastLap: string;
  bestLap?: string;
  sector1?: string;
  sector2?: string;
  sector3?: string;
  sector1Color?: string;
  sector2Color?: string;
  sector3Color?: string;
  drs?: boolean;
  ers?: number;
  tyre?: string;
  x?: number;
  y?: number;
  z?: number;
  angle?: number;
  penalties?: string;
  stops?: number;
  accent: string;
  portraitUrl: string | null;
};

type LiveTimingState = {
  ok: boolean;
  sessionId: string;
  sessionName?: string | null;
  sessionType?: number | null;
  updatedAtMs: number;
  entries: LiveTimingEntry[];
};

const TRAINING_QUALI_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 13]);
const RACE_TYPES = new Set([10, 11, 12]);

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

function parseLapTimeMs(raw: string | undefined | null) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = /^(\d+):(\d{1,2})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3].padEnd(3, "0"));
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return min * 60000 + sec * 1000 + ms;
}

function formatGapFromMs(deltaMs: number) {
  const ms = Math.max(0, Math.round(deltaMs));
  if (ms < 60_000) return `+${(ms / 1000).toFixed(3)}`;
  const totalSeconds = Math.floor(ms / 1000);
  const milli = ms % 1000;
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  if (h > 0) return `+${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
  return `+${m}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

function sectorClass(color: string | undefined) {
  const c = (color ?? "").trim().toLowerCase();
  if (c === "purple") return "border-violet-400/60 bg-violet-500/20 text-violet-100";
  if (c === "green") return "border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
  if (c === "yellow") return "border-amber-400/60 bg-amber-500/20 text-amber-100";
  return "border-white/10 bg-black/25 text-white/85";
}

function tyreStyle(tyre: string | undefined) {
  const t = (tyre ?? "").trim().toLowerCase();
  if (t === "soft") return { label: "Soft", cls: "border-red-400/60 bg-red-500/15 text-red-100" };
  if (t === "medium") return { label: "Medium", cls: "border-amber-300/60 bg-amber-500/15 text-amber-100" };
  if (t === "hard") return { label: "Hard", cls: "border-white/25 bg-white/5 text-white/90" };
  if (t === "inter" || t === "intermediate") return { label: "Inter", cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" };
  if (t === "wet") return { label: "Wet", cls: "border-sky-400/60 bg-sky-500/15 text-sky-100" };
  return { label: tyre?.trim() || "—", cls: "border-white/10 bg-black/25 text-white/80" };
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
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as LiveTimingState;
        if (cancelled) return;
        const nextUpdatedAt = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        if (nextUpdatedAt && nextUpdatedAt === lastSeenUpdatedAt) {
          setError(null);
          return;
        }
        lastSeenUpdatedAt = nextUpdatedAt;
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
  const sessionType = typeof data?.sessionType === "number" ? data.sessionType : null;
  const isRace = Boolean(sessionType !== null && RACE_TYPES.has(sessionType));
  const isPracticeOrQuali = Boolean(sessionType !== null && TRAINING_QUALI_TYPES.has(sessionType));
  const headerLabel = (data?.sessionName ?? (isRace ? "Race" : "Live")).toString().trim();
  const currentLap = useMemo(() => {
    const entries = data?.entries ?? [];
    let max = 0;
    for (const e of entries) {
      const l = typeof e.lap === "number" && Number.isFinite(e.lap) ? e.lap : 0;
      if (l > max) max = l;
    }
    return max > 0 ? max : null;
  }, [data?.entries]);

  const view = useMemo(() => {
    const entries = data?.entries ?? [];
    if (!isPracticeOrQuali) {
      const rows = entries.slice().sort((a, b) => a.position - b.position);
      return { mode: "race" as const, rows };
    }

    const scored = entries
      .map((e) => {
        const bestMs = parseLapTimeMs(e.bestLap);
        const lastMs = parseLapTimeMs(e.lastLap);
        return { e, bestMs, lastMs };
      })
      .sort((a, b) => {
        const am = a.bestMs;
        const bm = b.bestMs;
        if (am === null && bm === null) return 0;
        if (am === null) return 1;
        if (bm === null) return -1;
        return am - bm;
      });

    const fastestMs = scored.find((x) => x.bestMs !== null)?.bestMs ?? null;
    const rows = scored.map((x, idx) => {
      const best = x.bestMs;
      const gap =
        best === null
          ? "NO TIME"
          : fastestMs === null
            ? "FASTEST"
            : best === fastestMs
              ? "FASTEST"
              : formatGapFromMs(best - fastestMs);
      return {
        position: best === null ? "—" : String(idx + 1),
        driver: x.e.driver,
        team: x.e.team,
        lap: x.e.lap,
        bestLap: x.e.bestLap?.trim() ? x.e.bestLap : "NO TIME",
        gap,
        sector1: x.e.sector1?.trim() ? x.e.sector1 : "—",
        sector2: x.e.sector2?.trim() ? x.e.sector2 : "—",
        sector3: x.e.sector3?.trim() ? x.e.sector3 : "—",
        sector1Color: x.e.sector1Color,
        sector2Color: x.e.sector2Color,
        sector3Color: x.e.sector3Color,
        lastLap: x.e.lastLap?.trim() ? x.e.lastLap : "—",
        tyre: x.e.tyre?.trim() ? x.e.tyre : "—",
        accent: x.e.accent,
        portraitUrl: x.e.portraitUrl
      };
    });

    return { mode: "practice" as const, rows };
  }, [data?.entries, isPracticeOrQuali]);

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
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white/90 sm:flex">
              LIVE • {headerLabel.toUpperCase()}
              {currentLap ? (
                <span className="ml-3 rounded-full bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                  LAP {currentLap}
                </span>
              ) : null}
            </div>
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

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs font-extrabold uppercase tracking-wider text-white/90 sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>LIVE • {headerLabel.toUpperCase()}</div>
            {currentLap ? (
              <div className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                LAP {currentLap}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="text-sm font-semibold text-white/90">
              {isPracticeOrQuali ? "Timing · Best Laps" : isRace ? "Timing · Race" : "Timing Tabelle"}
            </div>
            <div className="text-xs font-semibold text-white/60">
              Session: {data?.sessionId ?? "—"}
            </div>
          </div>

          {error ? (
            <div className="p-5 text-sm text-white/70">
              {error}
            </div>
          ) : view.rows.length === 0 ? (
            <div className="p-5 text-sm text-white/70">
              Noch keine Daten. Sende per POST an <span className="font-semibold text-white">/api/live-timing</span>.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {view.mode === "practice" ? (
                <>
                  <div className="sticky top-0 z-10 hidden grid-cols-[64px_1.25fr_1.05fr_120px_110px_78px_78px_78px_120px_90px] gap-3 border-b border-white/10 bg-black/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60 backdrop-blur xl:grid">
                    <div>Pos</div>
                    <div>Fahrer</div>
                    <div>Team</div>
                    <div className="text-right">Best Lap</div>
                    <div className="text-right">Gap</div>
                    <div className="text-right">S1</div>
                    <div className="text-right">S2</div>
                    <div className="text-right">S3</div>
                    <div className="text-right">Last Lap</div>
                    <div className="text-right">Tyre</div>
                  </div>

                  {view.rows.map((r) => {
                    const accent = r.accent ?? "#E10600";
                    const tyre = tyreStyle(r.tyre);
                    return (
                      <div
                        key={`${r.position}-${r.driver}`}
                        className="relative px-4 py-4 md:px-5"
                        style={{ backgroundImage: teamBgSolid(accent) }}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }} />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: accent }} />

                        <div className="relative grid gap-3 md:grid-cols-[64px_1fr_110px_110px_110px] md:items-center xl:grid-cols-[64px_1.25fr_1.05fr_120px_110px_78px_78px_78px_120px_90px]">
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
                                  {r.team}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 xl:hidden">
                                  {typeof r.lap === "number" && Number.isFinite(r.lap) ? (
                                    <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                      LAP {r.lap}
                                    </div>
                                  ) : null}
                                  <div className={["inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider", tyre.cls].join(" ")}>
                                    {tyre.label}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 hidden text-sm font-semibold text-white/90 xl:block">
                            <div className="truncate">{r.team}</div>
                          </div>

                          <div className="text-right text-sm font-extrabold text-white md:text-base">{r.bestLap}</div>
                          <div className="text-right text-sm font-semibold text-white/90 md:text-base">{r.gap}</div>

                          <div className="text-right text-sm font-semibold text-white/85 md:text-base xl:hidden">
                            {r.lastLap}
                          </div>

                          <div className="hidden justify-end xl:flex">
                            <div className={["inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold", sectorClass(r.sector1Color)].join(" ")}>
                              {r.sector1}
                            </div>
                          </div>
                          <div className="hidden justify-end xl:flex">
                            <div className={["inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold", sectorClass(r.sector2Color)].join(" ")}>
                              {r.sector2}
                            </div>
                          </div>
                          <div className="hidden justify-end xl:flex">
                            <div className={["inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold", sectorClass(r.sector3Color)].join(" ")}>
                              {r.sector3}
                            </div>
                          </div>

                          <div className="hidden text-right text-sm font-semibold text-white/85 xl:block">
                            {r.lastLap}
                          </div>
                          <div className="hidden justify-end xl:flex">
                            <div className={["inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wider", tyre.cls].join(" ")}>
                              {tyre.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="sticky top-0 z-10 hidden grid-cols-[64px_1.2fr_1fr_80px_110px_78px_78px_78px_120px_72px_140px_90px_120px_90px] gap-3 border-b border-white/10 bg-black/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60 backdrop-blur 2xl:grid">
                    <div>Pos</div>
                    <div>Fahrer</div>
                    <div>Team</div>
                    <div className="text-right">Lap</div>
                    <div className="text-right">Gap</div>
                    <div className="text-right">S1</div>
                    <div className="text-right">S2</div>
                    <div className="text-right">S3</div>
                    <div className="text-right">Last Lap</div>
                    <div className="text-right">DRS</div>
                    <div className="text-right">ERS</div>
                    <div className="text-right">Tyre</div>
                    <div className="text-right">Penalties</div>
                    <div className="text-right">Stops</div>
                  </div>

                  {view.rows.map((r) => {
                    const accent = r.accent ?? "#E10600";
                    const tyre = tyreStyle(r.tyre);
                    const ers = typeof r.ers === "number" && Number.isFinite(r.ers) ? Math.max(0, Math.min(100, Math.round(r.ers))) : null;
                    return (
                      <div
                        key={`${r.position}-${r.driver}`}
                        className="relative px-4 py-4 md:px-5"
                        style={{ backgroundImage: teamBgSolid(accent) }}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }} />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: accent }} />

                        <div className="relative grid gap-3 lg:grid-cols-[64px_1fr_110px_110px_110px] lg:items-center 2xl:grid-cols-[64px_1.2fr_1fr_80px_110px_78px_78px_78px_120px_72px_140px_90px_120px_90px]">
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
                                <div className="mt-1 text-xs font-semibold text-white/75 lg:hidden">
                                  {r.team}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 2xl:hidden">
                                  <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                    LAP {r.lap}
                                  </div>
                                  <div className={["inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider", tyre.cls].join(" ")}>
                                    {tyre.label}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 hidden text-sm font-semibold text-white/90 2xl:block">
                            <div className="truncate">{r.team}</div>
                          </div>

                          <div className="text-right text-sm font-extrabold text-white lg:text-base">{r.lap}</div>
                          <div className="text-right text-sm font-semibold text-white/90 lg:text-base">{r.gap}</div>
                          <div className="text-right text-sm font-semibold text-white/85 lg:text-base 2xl:hidden">{r.lastLap}</div>

                          <div className="hidden justify-end 2xl:flex">
                            <div className={["inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold", sectorClass(r.sector1Color)].join(" ")}>
                              {r.sector1?.trim() ? r.sector1 : "—"}
                            </div>
                          </div>
                          <div className="hidden justify-end 2xl:flex">
                            <div className={["inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold", sectorClass(r.sector2Color)].join(" ")}>
                              {r.sector2?.trim() ? r.sector2 : "—"}
                            </div>
                          </div>
                          <div className="hidden justify-end 2xl:flex">
                            <div className={["inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold", sectorClass(r.sector3Color)].join(" ")}>
                              {r.sector3?.trim() ? r.sector3 : "—"}
                            </div>
                          </div>

                          <div className="hidden text-right text-sm font-semibold text-white/85 2xl:block">{r.lastLap}</div>
                          <div className="hidden justify-end 2xl:flex">
                            {r.drs ? (
                              <div className="inline-flex items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-100">
                                DRS
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white/70">
                                —
                              </div>
                            )}
                          </div>
                          <div className="hidden justify-end 2xl:flex">
                            <div className="w-[120px] rounded-full border border-white/10 bg-black/25 p-1">
                              <div
                                className="h-2 rounded-full bg-gradient-to-r from-mrl-red via-amber-400 to-emerald-400 transition-[width] duration-300"
                                style={{ width: `${ers ?? 0}%` }}
                              />
                            </div>
                            <div className="ml-2 w-[42px] text-right text-xs font-extrabold text-white/85">
                              {ers !== null ? `${ers}%` : "—"}
                            </div>
                          </div>
                          <div className="hidden justify-end 2xl:flex">
                            <div className={["inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wider", tyre.cls].join(" ")}>
                              {tyre.label}
                            </div>
                          </div>
                          <div className="hidden text-right text-sm font-semibold text-white/85 2xl:block">{r.penalties ?? "—"}</div>
                          <div className="hidden text-right text-sm font-semibold text-white/85 2xl:block">{typeof r.stops === "number" ? r.stops : "—"}</div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
