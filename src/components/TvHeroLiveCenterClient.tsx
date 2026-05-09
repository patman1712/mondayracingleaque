"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LiveTimingAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  driver?: string;
  sector?: number | null;
  time?: string;
  createdAt: number;
};

type LiveTimingState = {
  ok: boolean;
  sessionName?: string | null;
  sessionType?: number | null;
  sessionTimeLeft?: string | null;
  totalLaps?: number | null;
  currentLap?: number | null;
  lapsRemaining?: number | null;
  trackStatus?: string | null;
  raceStatus?: string | null;
  racePhase?: string | null;
  weather?: string | null;
  airTemp?: number | null;
  trackTemp?: number | null;
  rainIntensity?: number | null;
  trackGrip?: number | null;
  updatedAtMs?: number | null;
  alerts?: LiveTimingAlert[];
  entries?: unknown[];
};

function normalizeType(input: string) {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function formatAlertTimeBerlin(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function weatherLabel(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return "—";
  if (v.includes("storm")) return "STORM";
  if (v.includes("heavy") && v.includes("rain")) return "HEAVY RAIN";
  if (v.includes("light") && v.includes("rain")) return "LIGHT RAIN";
  if (v.includes("overcast")) return "OVERCAST";
  if (v.includes("cloud")) return "LIGHT CLOUD";
  if (v.includes("clear")) return "CLEAR";
  return raw.toUpperCase();
}

function isSprintQualifyingBySessionName(sessionName: string) {
  const n = sessionName.trim().toLowerCase();
  if (!n) return false;
  if (n.includes("sprint qualifying")) return true;
  if (n.includes("sprint shootout")) return true;
  if (n.includes("sq1") || n.includes("sq2") || n.includes("sq3")) return true;
  return false;
}

function sessionLabelForHero(sessionName: string) {
  const n = sessionName.trim();
  const low = n.toLowerCase();
  if (!n) return "";
  if (low.includes("sq1")) return "SQ1";
  if (low.includes("sq2")) return "SQ2";
  if (low.includes("sq3")) return "SQ3";
  if (low.includes("sprint shootout")) return "SPRINT SHOOTOUT";
  if (low.includes("sprint qualifying")) return "SPRINT QUALIFYING";
  return n.toUpperCase();
}

function isRaceBySessionName(sessionName: string) {
  const n = sessionName.trim().toLowerCase();
  if (!n) return false;
  if (isSprintQualifyingBySessionName(n)) return false;
  if (n.includes(" race") || n.startsWith("race") || n.includes("grand prix")) return true;
  if (n.includes("sprint")) return true;
  return false;
}

function WeatherIcon({ weather }: { weather: string }) {
  const w = weather.trim().toLowerCase();
  if (w.includes("rain")) {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path
          d="M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 19 12.5 3.5 3.5 0 0 1 17.5 19H7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M9 21l-1 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M13 21l-1 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 21l-1 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (w.includes("cloud") || w.includes("overcast")) {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path
          d="M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 19 12.5 3.5 3.5 0 0 1 17.5 19H7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path d="M12 4V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 22v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 12h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.2 6.2 4.8 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19.2 19.2 17.8 17.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17.8 6.2 19.2 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.8 19.2 6.2 17.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function flagFromText(texts: Array<string | null | undefined>) {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t) return { label: "GREEN FLAG", cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.25)]" };
  if (t.includes("red")) return { label: "RED FLAG", cls: "border-red-400/70 bg-red-500/15 text-red-100 shadow-[0_0_26px_rgba(239,68,68,0.25)]" };
  if (t.includes("safety") && t.includes("car")) return { label: "SAFETY CAR", cls: "border-amber-300/70 bg-amber-500/15 text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.22)]" };
  if (t.includes("virtual") || t.includes("vsc")) return { label: "VSC", cls: "border-orange-300/70 bg-orange-500/15 text-orange-100 shadow-[0_0_22px_rgba(249,115,22,0.20)]" };
  if (t.includes("yellow")) return { label: "YELLOW FLAG", cls: "border-amber-300/70 bg-amber-500/15 text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.22)]" };
  return { label: "GREEN FLAG", cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.25)]" };
}

function alertTheme(a: LiveTimingAlert) {
  const t = normalizeType(a.type);
  if (t === "fastest_lap") return { bar: "bg-violet-400", wrap: "border-violet-400/55 bg-violet-500/14 shadow-[0_0_24px_rgba(139,92,246,0.25)]" };
  if (t === "fastest_sector") {
    return { bar: "bg-violet-400", wrap: "border-violet-400/50 bg-violet-500/12 shadow-[0_0_20px_rgba(139,92,246,0.20)]" };
  }
  if (t === "yellow_flag") return { bar: "bg-amber-300", wrap: "border-amber-300/50 bg-amber-500/12" };
  if (t === "track_limits") return { bar: "bg-orange-300", wrap: "border-orange-300/55 bg-orange-500/12" };
  if (t === "penalty") return { bar: "bg-red-400", wrap: "border-red-400/55 bg-orange-500/10" };
  if (t === "safety_car") return { bar: "bg-amber-300", wrap: "border-amber-300/60 bg-amber-500/14 shadow-[0_0_18px_rgba(251,191,36,0.18)]" };
  if (t === "virtual_safety_car" || t === "vsc") return { bar: "bg-orange-300", wrap: "border-orange-300/55 bg-orange-500/12" };
  if (t === "red_flag") return { bar: "bg-red-400", wrap: "border-red-400/55 bg-red-500/12" };
  if (t === "drs_enabled") return { bar: "bg-emerald-400", wrap: "border-emerald-400/55 bg-emerald-500/12" };
  if (t === "drs_disabled") return { bar: "bg-white/30", wrap: "border-white/15 bg-white/5" };
  return { bar: "bg-white/30", wrap: "border-white/15 bg-white/5" };
}

function AlertIcon({ type }: { type: string }) {
  const t = normalizeType(type);
  if (t === "fastest_lap" || t === "fastest_sector") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/85" fill="none">
        <path d="M13 2 3 14h7l-1 8 12-14h-7l-1-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (t === "safety_car" || t === "virtual_safety_car" || t === "vsc") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/85" fill="none">
        <path d="M5 15 7 9h10l2 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M7 15h10v3H7v-3Z" stroke="currentColor" strokeWidth="2" />
        <path d="M7.5 20.5h0m9 0h0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (t === "red_flag" || t === "yellow_flag") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/85" fill="none">
        <path d="M6 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 4h12l-2 4 2 4H6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (t === "drs_enabled" || t === "drs_disabled") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/85" fill="none">
        <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/85" fill="none">
      <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17h0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function alertPriority(type: string) {
  const t = normalizeType(type);
  if (t === "red_flag") return 1;
  if (t === "safety_car") return 2;
  if (t === "virtual_safety_car" || t === "vsc") return 3;
  if (t === "penalty") return 4;
  if (t === "track_limits") return 5;
  if (t === "fastest_lap") return 6;
  if (t === "fastest_sector") return 7;
  return 99;
}

export function TvHeroLiveCenterClient() {
  const [data, setData] = useState<LiveTimingState | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [alerts, setAlerts] = useState<Array<{ a: LiveTimingAlert; visible: boolean }>>([]);
  const seenAlertIds = useRef<Set<string>>(new Set());
  const alertTimers = useRef<number[]>([]);

  const clearAlertTimers = useCallback(() => {
    for (const id of alertTimers.current) window.clearTimeout(id);
    alertTimers.current = [];
  }, []);

  const pushAlert = useCallback(
    (a: LiveTimingAlert) => {
    clearAlertTimers();
    setAlerts([{ a, visible: false }]);
    alertTimers.current.push(window.setTimeout(() => setAlerts((prev) => prev.map((x) => ({ ...x, visible: true }))), 0));
    alertTimers.current.push(window.setTimeout(() => setAlerts((prev) => prev.map((x) => ({ ...x, visible: false }))), 4700));
    alertTimers.current.push(window.setTimeout(() => setAlerts([]), 5200));
    },
    [clearAlertTimers]
  );

  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;
    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as LiveTimingState;
        if (cancelled) return;
        const updated = typeof j?.updatedAtMs === "number" ? (j.updatedAtMs as number) : 0;
        if (updated && updated === lastSeenUpdatedAt) return;
        lastSeenUpdatedAt = updated;
        setData(j);
        setRequestFailed(false);
      } catch {
        if (cancelled) return;
        setRequestFailed(true);
        setData(null);
        setAlerts([]);
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

  const now = Date.now();
  const updatedAt = typeof data?.updatedAtMs === "number" ? (data!.updatedAtMs as number) : 0;
  const entriesLen = Array.isArray(data?.entries) ? (data!.entries as unknown[]).length : 0;
  const isLive = Boolean(!requestFailed && updatedAt && now - updatedAt < 10_000 && entriesLen > 0);

  useEffect(() => {
    if (!isLive) {
      setAlerts([]);
      clearAlertTimers();
      seenAlertIds.current = new Set();
      return;
    }
    const sessionNameRaw = (data?.sessionName ?? "").toString().trim();
    const isRace = isRaceBySessionName(sessionNameRaw);
    const nextAlerts = Array.isArray(data?.alerts) ? (data.alerts as LiveTimingAlert[]) : [];
    const accepted = new Set([
      "fastest_lap",
      "fastest_sector",
      "yellow_flag",
      "safety_car",
      "virtual_safety_car",
      "red_flag",
      "drs_enabled",
      "drs_disabled",
      "vsc",
      "track_limits",
      "penalty"
    ]);
    const freshApi = nextAlerts
      .slice()
      .filter((a) => a?.id && !seenAlertIds.current.has(a.id))
      .filter((a) => accepted.has(normalizeType(a.type)))
      .filter((a) => (isRace ? normalizeType(a.type) !== "fastest_sector" : true))
      .sort((a, b) => {
        const pa = alertPriority(a.type);
        const pb = alertPriority(b.type);
        if (pa !== pb) return pa - pb;
        return b.createdAt - a.createdAt;
      });
    if (freshApi.length) {
      const a = freshApi[0];
      seenAlertIds.current.add(a.id);
      pushAlert(a);
      return;
    }
  }, [clearAlertTimers, data, isLive, pushAlert]);

  useEffect(() => {
    return () => {
      clearAlertTimers();
    };
  }, [clearAlertTimers]);

  const sessionNameRaw = (data?.sessionName ?? "").toString().trim();
  const sessionLabel = sessionLabelForHero(sessionNameRaw);
  const showLap = isRaceBySessionName(sessionNameRaw);
  const left = (data?.sessionTimeLeft ?? "").toString().trim();
  const trackStatus = (data?.trackStatus ?? "").toString().trim();
  const raceStatus = (data?.raceStatus ?? "").toString().trim();
  const racePhase = (data?.racePhase ?? "").toString().trim();
  const flag = useMemo(() => flagFromText([trackStatus, raceStatus, racePhase]), [trackStatus, raceStatus, racePhase]);
  const lapInfo =
    showLap && typeof data?.currentLap === "number" && typeof data?.totalLaps === "number" && data.totalLaps
      ? `LAP ${data.currentLap} / ${data.totalLaps}`
      : "";

  const weather = weatherLabel((data?.weather ?? "").toString());
  const airTemp = typeof data?.airTemp === "number" ? Math.round(data.airTemp) : null;
  const trackTemp = typeof data?.trackTemp === "number" ? Math.round(data.trackTemp) : null;
  const rain = typeof data?.rainIntensity === "number" ? Math.round(data.rainIntensity) : null;
  const grip = typeof data?.trackGrip === "number" ? Math.round(data.trackGrip) : null;
  const hasWeather = Boolean((data?.weather ?? "").toString().trim() || airTemp !== null || trackTemp !== null);

  return (
    <div className="relative mt-6 grid gap-6 lg:grid-cols-3 lg:items-start">
      <div className="relative">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/70">
          Session Control
        </div>
        <div className="mt-2 text-2xl font-extrabold text-white">
          {isLive ? (sessionLabel || "LIVE SESSION") : "OFF AIR"}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className={["rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider", flag.cls].join(" ")}>
            {flag.label}
          </div>
          {left ? (
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              LEFT {left}
            </div>
          ) : null}
          {lapInfo ? (
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              {lapInfo}
            </div>
          ) : null}
          {trackStatus ? (
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              TRACK {trackStatus}
            </div>
          ) : null}
          {racePhase ? (
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              {racePhase}
            </div>
          ) : null}
          {raceStatus ? (
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85">
              {raceStatus}
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-sm font-semibold text-white/70">
          {!isLive ? "Livefenster: 30 Min vor Start bis 3 Std nach Start" : null}
        </div>
      </div>

      <div className="relative">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/70">
          Live Meldungen
        </div>
        <div className="mt-3 h-[118px] overflow-hidden rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
          {isLive && alerts.length ? (
            alerts.slice(0, 1).map(({ a, visible }) => {
              const theme = alertTheme(a);
              const meta = [a.driver ? a.driver : null, typeof a.sector === "number" ? `S${a.sector}` : null]
                .filter(Boolean)
                .join(" · ");
              const main = (a.time ?? "").trim() ? (a.time as string) : a.message;
              const ts = a.createdAt ? formatAlertTimeBerlin(a.createdAt) : "";
              return (
                <div
                  key={a.id}
                  className={[
                    "h-full overflow-hidden rounded-xl border backdrop-blur transition-all duration-300",
                    theme.wrap,
                    visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                  ].join(" ")}
                >
                  <div className={"h-1 " + theme.bar} />
                  <div className="flex h-[calc(100%-4px)] items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-black/25">
                      <AlertIcon type={a.type} />
                    </div>
                    <div className="min-w-0 flex-1">
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
                        </div>
                        {ts ? (
                          <div className="shrink-0 text-[11px] font-semibold text-white/60">
                            {ts}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1 line-clamp-2 text-base font-extrabold leading-snug text-white">
                        {main}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : null}
        </div>
      </div>

      <div className="relative">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/70">
          Weather
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black/25 text-white/85">
                <WeatherIcon weather={(data?.weather ?? "").toString()} />
              </div>
              <div>
                {hasWeather ? (
                  <>
                    <div className="text-xs font-extrabold uppercase tracking-wider text-white/70">
                      {weather}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white/85">
                      {airTemp !== null ? `AIR ${airTemp}°C` : "AIR —"}
                      {" · "}
                      {trackTemp !== null ? `TRACK ${trackTemp}°C` : "TRACK —"}
                    </div>
                  </>
                ) : (
                  <div className="text-sm font-semibold text-white/70">
                    Wetterdaten werden geladen
                  </div>
                )}
              </div>
            </div>
            <div className="text-right text-xs font-semibold text-white/60">
              {rain !== null ? `RAIN ${rain}%` : null}
              {rain !== null && grip !== null ? <span> · </span> : null}
              {grip !== null ? `GRIP ${grip}%` : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
