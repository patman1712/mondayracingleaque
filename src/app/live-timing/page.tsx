"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { HeroTile } from "@/components/HeroTile";
import { TvHeroLiveCenterClient } from "@/components/TvHeroLiveCenterClient";
import { TyreBadge } from "@/components/TyreBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { flagBackgroundUrl, flagCodeForText } from "@/lib/flags";
import { sessionModeFromName } from "@/lib/liveTimingDisplay";
import { defaultLiveTimingLeagueKeyForPublicSlug, isLiveTimingLeagueKey } from "@/lib/liveTimingLeagueKey";

type LiveTimingEntry = {
  position: number;
  participantIndex?: number;
  driver: string;
  team?: string | null;
  teamLogoUrl?: string | null;
  lap?: number | null;
  gap?: string | null;
  lastLap?: string | null;
  bestLap?: string | null;
  currentLap?: string | null;
  sector1?: string | null;
  sector2?: string | null;
  sector3?: string | null;
  sector1Color?: string | null;
  sector2Color?: string | null;
  sector3Color?: string | null;
  drs?: boolean | null;
  ers?: number | null;
  tyre?: string | null;
  x?: number | null;
  y?: number | null;
  z?: number | null;
  angle?: number | null;
  status?: "IN GARAGE" | "OUT LAP" | "FLYING LAP" | "PIT" | "RETIRED";
  penalties?: string | null;
  stops?: number | null;
  accent?: string | null;
  portraitUrl: string | null;
};

type LiveTimingState = {
  ok: boolean;
  sessionId: string;
  sessionName?: string | null;
  sessionType?: number | null;
  sessionTimeLeft?: string | null;
  sessionDuration?: string | null;
  totalLaps?: number | null;
  currentLap?: number | null;
  lapsRemaining?: number | null;
  trackStatus?: string | null;
  raceStatus?: string | null;
  trackMap?: { circuit?: string; length?: number } | null;
  updatedAtMs: number;
  entries: LiveTimingEntry[];
};

const TRAINING_QUALI_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 13]);

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

function sectorClass(color: string | undefined | null) {
  const c = (color ?? "").trim().toLowerCase();
  if (c === "purple") return "border-violet-400/60 bg-violet-500/20 text-violet-100";
  if (c === "green") return "border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
  if (c === "yellow") return "border-amber-400/60 bg-amber-500/20 text-amber-100";
  return "border-white/10 bg-black/25 text-white/85";
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

type LeagueOption = { key: string; label: string; accent: string };

const DEFAULT_LEAGUES: LeagueOption[] = [
  { key: "liga-one", label: "Liga One", accent: "#E10600" },
  { key: "liga-two", label: "Liga Two", accent: "#22C55E" },
  { key: "rookie", label: "Rookie", accent: "#38BDF8" },
  { key: "one-mini-wm", label: "MRL One Mini WM", accent: "#A855F7" },
  { key: "two-mini-wm", label: "MRL Two Mini WM", accent: "#F97316" }
] as const;

export default function LiveTimingPage() {
  const [data, setData] = useState<LiveTimingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState<LeagueOption[]>(DEFAULT_LEAGUES);
  const [leagueKey, setLeagueKey] = useState<string>(() => {
    if (typeof window === "undefined") return "liga-one";
    try {
      return localStorage.getItem("mrl.live.leagueKey") || "liga-one";
    } catch {
      return "liga-one";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("mrl.live.leagueKey", leagueKey);
    } catch {}
  }, [leagueKey]);

  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((j: { leagues?: Array<{ slug: string; label: string; accent: string }> }) => {
        const list = Array.isArray(j?.leagues) ? j.leagues : null;
        if (!list) return;
        const mapped = new Map<string, LeagueOption>();
        for (const l of list) {
          if (!l?.slug || !l?.label) continue;
          const key = defaultLiveTimingLeagueKeyForPublicSlug(l.slug);
          if (!isLiveTimingLeagueKey(key)) continue;
          if (mapped.has(key)) continue;
          mapped.set(key, { key, label: l.label, accent: l.accent || "#E10600" });
        }
        const next = Array.from(mapped.values());
        if (next.length) setLeagues((prev) => {
          const prevKeys = new Set(prev.map((x) => x.key));
          const merged = [...prev];
          for (const x of next) {
            if (!prevKeys.has(x.key)) merged.push(x);
          }
          return merged;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const qs = `?leagueKey=${encodeURIComponent(leagueKey)}`;
        const r = await fetch(`/api/live-timing${qs}`, { cache: "no-store" });
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
        setData(null);
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
  }, [leagueKey]);

  const selectedLeague = useMemo(
    () => leagues.find((l) => l.key === leagueKey) ?? null,
    [leagueKey, leagues]
  );
  const leagueLabel = selectedLeague?.label ?? "Liga One";
  const leagueAccent = selectedLeague?.accent ?? "#E10600";

  const now = Date.now();
  const last = data?.updatedAtMs ?? 0;
  const entriesLen = Array.isArray(data?.entries) ? data!.entries.length : 0;
  const isLive = Boolean(!error && last && now - last < 10_000 && entriesLen > 0);
  const liveData = isLive ? data : null;

  const sessionType = typeof liveData?.sessionType === "number" ? liveData.sessionType : null;
  const sessionNameRaw = (liveData?.sessionName ?? "").toString();
  const modeByName = sessionNameRaw ? sessionModeFromName(sessionNameRaw) : "unknown";
  const isPracticeOrQuali = Boolean(
    modeByName !== "unknown" ? modeByName === "practice" : sessionType !== null && TRAINING_QUALI_TYPES.has(sessionType)
  );

  const circuit = ((liveData?.trackMap?.circuit ?? data?.trackMap?.circuit) ?? "").toString().trim();
  const flagCode = flagCodeForText(`${circuit} ${(liveData?.sessionName ?? data?.sessionName ?? "") as string}`) ?? null;
  const flagUrl = flagBackgroundUrl(flagCode);

  const view = useMemo(() => {
    const entries = liveData?.entries ?? [];
    if (!isPracticeOrQuali) {
      const rows = entries
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((e) => ({
          position: String(e.position),
          driver: e.driver,
          team: e.team ?? "",
          teamLogoUrl: e.teamLogoUrl ?? null,
          gap: (e.gap ?? "").trim() ? (e.gap as string) : "—",
          lastLap: (e.lastLap ?? "").trim() ? (e.lastLap as string) : "—",
          tyre: (e.tyre ?? "").trim() ? (e.tyre as string) : null,
          penalties: (e.penalties ?? "").trim() ? (e.penalties as string) : null,
          stops: typeof e.stops === "number" ? e.stops : null,
          accent: e.accent ?? "#E10600",
          portraitUrl: e.portraitUrl,
          status: e.status
        }));
      return { mode: "race" as const, rows };
    }

    const scored = entries
      .map((e) => {
        const bestMs = parseLapTimeMs(e.bestLap);
        const pi = typeof e.participantIndex === "number" && Number.isFinite(e.participantIndex) ? e.participantIndex : null;
        return { e, bestMs, pi };
      })
      .sort((a, b) => {
        const am = a.bestMs;
        const bm = b.bestMs;
        if (am === null && bm === null) {
          const ai = a.pi ?? Number.MAX_SAFE_INTEGER;
          const bi = b.pi ?? Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return 0;
        }
        if (am === null) return 1;
        if (bm === null) return -1;
        if (am !== bm) return am - bm;
        const ai = a.pi ?? Number.MAX_SAFE_INTEGER;
        const bi = b.pi ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });

    const fastestMs = scored.find((x) => x.bestMs !== null)?.bestMs ?? null;
    const rows = scored.map((x, idx) => {
      const best = x.bestMs;
      const gap =
        best === null || fastestMs === null
          ? "—"
          : best === fastestMs
            ? "FASTEST"
            : formatGapFromMs(best - fastestMs);
      return {
        position: String(idx + 1),
        driver: x.e.driver,
        team: x.e.team ?? "",
        teamLogoUrl: x.e.teamLogoUrl ?? null,
        participantIndex: x.pi,
        currentLap: x.e.currentLap?.trim() ? x.e.currentLap : "—",
        bestLap: x.e.bestLap?.trim() ? x.e.bestLap : "—",
        gap,
        sector1: x.e.sector1?.trim() ? x.e.sector1 : "—",
        sector2: x.e.sector2?.trim() ? x.e.sector2 : "—",
        sector3: x.e.sector3?.trim() ? x.e.sector3 : "—",
        sector1Color: x.e.sector1Color,
        sector2Color: x.e.sector2Color,
        sector3Color: x.e.sector3Color,
        tyre: x.e.tyre?.trim() ? x.e.tyre : null,
        accent: x.e.accent ?? "#E10600",
        portraitUrl: x.e.portraitUrl,
        status: x.e.status
      };
    });

    return { mode: "practice" as const, rows };
  }, [isPracticeOrQuali, liveData?.entries]);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[#07080A] text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-10 md:px-8">
        <HeroTile accent={leagueAccent} flagUrl={flagUrl} className="mt-8">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                {leagueLabel.toUpperCase()} • LIVE TIMING
              </div>
              <div className="mt-2 text-3xl font-extrabold text-white">
                {circuit || "Live Timing"}
              </div>
              <div className="mt-2 text-xs font-semibold text-white/60">
                Auto-Refresh: 1s · Letztes Update: {formatUpdated(last)}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={leagueKey}
                onChange={(e) => setLeagueKey(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/15"
              >
                {leagues.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
              <div
                className={[
                  "flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-extrabold uppercase tracking-wider",
                  isLive
                    ? "border-mrl-red/45 bg-mrl-red/15 text-white shadow-[0_0_22px_rgba(225,6,0,0.18)]"
                    : "border-white/10 bg-white/5 text-white/80"
                ].join(" ")}
              >
                <span className={isLive ? "h-2 w-2 animate-pulse rounded-full bg-mrl-red" : "h-2 w-2 rounded-full bg-white/30"} />
                {isLive ? "Live" : loading ? "Lädt…" : "Offline"}
              </div>
            </div>
          </div>

          <div className="relative">
            <TvHeroLiveCenterClient
              leagueKey={leagueKey}
              leagueLabel={leagueLabel.toUpperCase()}
              contextLabel="Live Timing"
              externalData={data}
              requestFailed={Boolean(error)}
              offlineHint="No live timing currently available"
            />
          </div>
        </HeroTile>
      </div>

      <div className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen">
        <div className="mx-auto w-full px-4 pb-14 md:px-8">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="text-sm font-semibold text-white/90">
                {isPracticeOrQuali ? "Timing · Practice / Quali" : "Timing · Race"}
              </div>
              <div className="text-xs font-semibold text-white/60">
                Auto-Refresh: 1s
              </div>
            </div>

            {(() => {
              if (!isLive || view.rows.length === 0) {
                return (
                  <div className="p-8 text-sm font-semibold text-white/70">
                    No live timing currently available
                  </div>
                );
              }
              return (
                <div className="divide-y divide-white/10">
                  {view.mode === "practice" ? (
                    <>
                      <div className="sticky top-0 z-10 hidden grid-cols-[64px_1.25fr_1.05fr_120px_120px_110px_78px_78px_78px_90px] gap-3 border-b border-white/10 bg-black/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60 backdrop-blur xl:grid">
                        <div>Pos</div>
                        <div>Fahrer</div>
                        <div>Team</div>
                        <div className="text-right">Current</div>
                        <div className="text-right">Best</div>
                        <div className="text-right">Gap</div>
                        <div className="text-right">S1</div>
                        <div className="text-right">S2</div>
                        <div className="text-right">S3</div>
                        <div className="text-right">Tyre</div>
                      </div>

                      {view.rows.map((r) => {
                        const accent = r.accent ?? "#E10600";
                        return (
                          <div
                            key={`${r.position}-${r.driver}`}
                            className="relative px-4 py-4 md:px-5"
                            style={{ backgroundImage: teamBgSolid(accent) }}
                          >
                            <div
                              className="pointer-events-none absolute inset-0 opacity-20"
                              style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
                            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: accent }} />

                            <div className="relative grid gap-3 md:grid-cols-[64px_1fr_120px_120px_110px] md:items-center xl:grid-cols-[64px_1.25fr_1.05fr_120px_120px_110px_78px_78px_78px_90px]">
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
                                    <div className="text-base font-extrabold uppercase leading-tight tracking-wide text-white whitespace-normal break-words">
                                      {r.driver}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-white/75 md:hidden">
                                      <TeamLogo teamName={r.team} src={r.teamLogoUrl} size={20} className="h-5 w-5" />
                                      <div className="min-w-0 whitespace-normal break-words">{r.team}</div>
                                    </div>
                                    {r.status ? (
                                      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-white/80 md:hidden">
                                        {r.status}
                                      </div>
                                    ) : null}
                                    <div className="mt-2 flex flex-wrap items-center gap-2 xl:hidden">
                                      <div className="hidden sm:inline-flex rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                        CUR {r.currentLap}
                                      </div>
                                      <TyreBadge tyre={r.tyre} size={30} />
                                      <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                        {r.gap}
                                      </div>
                                      {r.status ? (
                                        <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                          {r.status}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="min-w-0 hidden text-sm font-semibold text-white/90 xl:block">
                                <div className="flex items-center gap-2 leading-tight whitespace-normal break-words">
                                  <TeamLogo teamName={r.team} src={r.teamLogoUrl} size={20} className="h-5 w-5" />
                                  <div className="min-w-0">{r.team}</div>
                                </div>
                              </div>

                              <div className="hidden sm:block text-right text-sm font-semibold text-white/90 md:text-base">{r.currentLap}</div>
                              <div className="hidden sm:block text-right text-sm font-extrabold text-white md:text-base">{r.bestLap}</div>
                              <div className="hidden sm:block text-right text-sm font-semibold text-white/90 md:text-base">{r.gap}</div>

                              <div className="hidden justify-end xl:flex">
                                <div
                                  className={[
                                    "inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold",
                                    sectorClass(r.sector1Color)
                                  ].join(" ")}
                                >
                                  {r.sector1}
                                </div>
                              </div>
                              <div className="hidden justify-end xl:flex">
                                <div
                                  className={[
                                    "inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold",
                                    sectorClass(r.sector2Color)
                                  ].join(" ")}
                                >
                                  {r.sector2}
                                </div>
                              </div>
                              <div className="hidden justify-end xl:flex">
                                <div
                                  className={[
                                    "inline-flex min-w-[64px] justify-end rounded-lg border px-2 py-1 text-xs font-extrabold",
                                    sectorClass(r.sector3Color)
                                  ].join(" ")}
                                >
                                  {r.sector3}
                                </div>
                              </div>

                              <div className="hidden justify-end xl:flex">
                                <TyreBadge tyre={r.tyre} size={34} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <div className="sticky top-0 z-10 hidden grid-cols-[64px_1.25fr_1.05fr_110px_120px_90px_120px_80px] gap-3 border-b border-white/10 bg-black/60 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60 backdrop-blur 2xl:grid">
                        <div>Pos</div>
                        <div>Fahrer</div>
                        <div>Team</div>
                        <div className="text-right">Gap</div>
                        <div className="text-right">Last Lap</div>
                        <div className="text-right">Tyre</div>
                        <div className="text-right">Penalties</div>
                        <div className="text-right">Stops</div>
                      </div>

                      {view.rows.map((r) => {
                        const accent = r.accent ?? "#E10600";
                        return (
                          <div
                            key={`${r.position}-${r.driver}`}
                            className="relative px-4 py-4 md:px-5"
                            style={{ backgroundImage: teamBgSolid(accent) }}
                          >
                            <div
                              className="pointer-events-none absolute inset-0 opacity-20"
                              style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
                            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-[5px]" style={{ backgroundColor: accent }} />

                            <div className="relative grid gap-3 lg:grid-cols-[64px_1fr_110px_120px] lg:items-center 2xl:grid-cols-[64px_1.25fr_1.05fr_110px_120px_90px_120px_80px]">
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
                                    <div className="text-base font-extrabold uppercase leading-tight tracking-wide text-white whitespace-normal break-words">
                                      {r.driver}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-white/75 lg:hidden">
                                      <TeamLogo teamName={r.team} src={r.teamLogoUrl} size={20} className="h-5 w-5" />
                                      <div className="min-w-0 whitespace-normal break-words">{r.team}</div>
                                    </div>
                                    {r.status ? (
                                      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-white/80 lg:hidden">
                                        {r.status}
                                      </div>
                                    ) : null}
                                    <div className="mt-2 flex flex-wrap items-center gap-2 2xl:hidden">
                                      <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                        GAP {r.gap}
                                      </div>
                                      <TyreBadge tyre={r.tyre} size={30} />
                                      {r.penalties?.trim() ? (
                                        <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                          PEN {r.penalties}
                                        </div>
                                      ) : null}
                                      <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                        STOPS {typeof r.stops === "number" ? r.stops : "—"}
                                      </div>
                                      {r.status ? (
                                        <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
                                          {r.status}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="min-w-0 hidden text-sm font-semibold text-white/90 2xl:block">
                                <div className="flex items-center gap-2 leading-tight whitespace-normal break-words">
                                  <TeamLogo teamName={r.team} src={r.teamLogoUrl} size={20} className="h-5 w-5" />
                                  <div className="min-w-0">{r.team}</div>
                                </div>
                              </div>

                              <div className="text-right text-sm font-semibold text-white/90 lg:text-base">{r.gap}</div>
                              <div className="hidden sm:block text-right text-sm font-semibold text-white/85 lg:text-base 2xl:hidden">{r.lastLap}</div>

                              <div className="hidden text-right text-sm font-semibold text-white/85 2xl:block">{r.lastLap}</div>
                              <div className="hidden justify-end 2xl:flex">
                                <TyreBadge tyre={r.tyre} size={34} />
                              </div>
                              <div className="hidden text-right text-sm font-semibold text-white/85 2xl:block">{r.penalties ?? "—"}</div>
                              <div className="hidden text-right text-sm font-semibold text-white/85 2xl:block">
                                {typeof r.stops === "number" ? r.stops : "—"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
    </div>
  );
}
