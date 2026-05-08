"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  sessionTimeLeft?: string | null;
  totalLaps?: number | null;
  currentLap?: number | null;
  trackStatus?: string | null;
  updatedAtMs: number;
  alerts?: LiveTimingAlert[];
};

function formatAlertTimeBerlin(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function normalizeAlertType(input: string) {
  return (input ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function alertTheme(a: LiveTimingAlert) {
  const t = normalizeAlertType(a.type);
  if (t === "fastest_lap") return { bar: "bg-violet-400", wrap: "border-violet-400/50 bg-violet-500/15", glow: "shadow-[0_0_22px_rgba(139,92,246,0.35)]" };
  if (t === "fastest_sector") {
    const msg = `${a.title} ${a.message}`.toLowerCase();
    const purple = msg.includes("purple") || msg.includes("session");
    return purple
      ? { bar: "bg-violet-400", wrap: "border-violet-400/45 bg-violet-500/12", glow: "shadow-[0_0_18px_rgba(139,92,246,0.28)]" }
      : { bar: "bg-emerald-400", wrap: "border-emerald-400/45 bg-emerald-500/12", glow: "shadow-[0_0_18px_rgba(52,211,153,0.22)]" };
  }
  if (t === "safety_car") return { bar: "bg-amber-300", wrap: "border-amber-300/45 bg-amber-500/12", glow: "" };
  if (t === "virtual_safety_car" || t === "vsc") return { bar: "bg-orange-300", wrap: "border-orange-300/45 bg-orange-500/12", glow: "" };
  if (t === "red_flag") return { bar: "bg-red-400", wrap: "border-red-400/45 bg-red-500/12", glow: "" };
  if (t === "yellow_flag") return { bar: "bg-amber-300", wrap: "border-amber-300/45 bg-amber-500/12", glow: "" };
  if (t === "drs_enabled") return { bar: "bg-emerald-400", wrap: "border-emerald-400/45 bg-emerald-500/12", glow: "" };
  if (t === "drs_disabled") return { bar: "bg-white/30", wrap: "border-white/15 bg-white/5", glow: "" };
  return { bar: "bg-white/30", wrap: "border-white/15 bg-white/5", glow: "" };
}

function AlertIcon({ type }: { type: string }) {
  const t = normalizeAlertType(type);
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

function normalizeTwitchChannel(input: string) {
  const v = input.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.hostname.endsWith("twitch.tv")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const channel = parts[0] ?? "";
      return channel ? channel.toLowerCase() : null;
    }
  } catch {}
  return v.toLowerCase();
}

function formatTimeBerlin(ms: number) {
  return new Date(ms).toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTimeBerlin(ms: number) {
  return new Date(ms).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function TwitchEmbed({
  channel,
  startsAtMs,
  compact,
  withLiveTimingAlerts
}: {
  channel: string;
  startsAtMs: number | null;
  compact?: boolean;
  withLiveTimingAlerts?: boolean;
}) {
  const [showChat, setShowChat] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [liveTiming, setLiveTiming] = useState<LiveTimingState | null>(null);
  const [alerts, setAlerts] = useState<Array<{ a: LiveTimingAlert; visible: boolean }>>([]);
  const seenAlertIds = useRef<Set<string>>(new Set());

  const normalized = useMemo(() => normalizeTwitchChannel(channel), [channel]);

  const timing = useMemo(() => {
    const startMs = startsAtMs;
    if (!startMs) return null;
    const openMs = startMs - 30 * 60 * 1000;
    const closeMs = startMs + 3 * 60 * 60 * 1000;
    return { startMs, openMs, closeMs };
  }, [startsAtMs]);

  const src = useMemo(() => {
    const c = normalized;
    if (!c) return null;
    const parent = window.location.hostname;
    const u = new URL("https://player.twitch.tv/");
    u.searchParams.set("channel", c);
    u.searchParams.set("parent", parent);
    u.searchParams.set("muted", "true");
    return u.toString();
  }, [normalized]);

  const chatSrc = useMemo(() => {
    const c = normalized;
    if (!c) return null;
    const parent = window.location.hostname;
    const u = new URL(`https://www.twitch.tv/embed/${encodeURIComponent(c)}/chat`);
    u.searchParams.set("parent", parent);
    return u.toString();
  }, [normalized]);

  const videoAspect = compact ? "aspect-[21/9]" : "aspect-video";

  const now = Date.now();
  const inWindow = Boolean(timing && now >= timing.openMs && now <= timing.closeMs);
  const isOnAir = Boolean(inWindow && live);
  const liveLabel = live === null ? "unbekannt" : live ? "online" : "offline";

  useEffect(() => {
    const c = normalized;
    if (!c) return;
    const channel = c;
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const r = await fetch(`/api/twitch/status?channel=${encodeURIComponent(channel)}`, {
          cache: "no-store"
        });
        const j = (await r.json()) as { live?: boolean };
        if (cancelled) return;
        setLive(Boolean(j?.live));
        setCheckedAt(Date.now());
      } catch {
        if (cancelled) return;
        setLive(false);
        setCheckedAt(Date.now());
      } finally {
        if (cancelled) return;
        timer = window.setTimeout(poll, 60_000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [normalized]);

  useEffect(() => {
    if (!withLiveTimingAlerts) return;
    if (!timing) return;
    const now = Date.now();
    if (now < timing.openMs || now > timing.closeMs) return;
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as LiveTimingState;
        if (cancelled) return;
        const updated = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        if (updated && updated === lastSeenUpdatedAt) return;
        lastSeenUpdatedAt = updated;
        setLiveTiming(j);

        const nextAlerts = Array.isArray(j?.alerts) ? (j.alerts as LiveTimingAlert[]) : [];
        const fresh = nextAlerts
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .filter((a) => a?.id && !seenAlertIds.current.has(a.id))
          .filter((a) =>
            [
              "fastest_lap",
              "fastest_sector",
              "safety_car",
              "virtual_safety_car",
              "red_flag",
              "yellow_flag",
              "drs_enabled",
              "drs_disabled",
              "vsc"
            ].includes(normalizeAlertType(a.type))
          );

        if (fresh.length) {
          for (const a of fresh) seenAlertIds.current.add(a.id);
          setAlerts((prev) => {
            const merged = [...fresh.map((a) => ({ a, visible: false })), ...prev];
            return merged.slice(0, 3);
          });
          window.setTimeout(() => {
            setAlerts((prev) => prev.map((x) => (fresh.some((f) => f.id === x.a.id) ? { ...x, visible: true } : x)));
          }, 0);
          for (const a of fresh) {
            window.setTimeout(() => {
              setAlerts((prev) => prev.map((x) => (x.a.id === a.id ? { ...x, visible: false } : x)));
            }, 4700);
            window.setTimeout(() => {
              setAlerts((prev) => prev.filter((x) => x.a.id !== a.id));
            }, 5200);
          }
        }
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
  }, [withLiveTimingAlerts, timing]);

  const ltName = (liveTiming?.sessionName ?? "").toString().trim();
  const ltLeft = (liveTiming?.sessionTimeLeft ?? "").toString().trim();
  const ltTrack = (liveTiming?.trackStatus ?? "").toString().trim();
  const ltLap =
    typeof liveTiming?.currentLap === "number" && typeof liveTiming?.totalLaps === "number" && liveTiming.totalLaps
      ? `LAP ${liveTiming.currentLap}/${liveTiming.totalLaps}`
      : typeof liveTiming?.currentLap === "number"
        ? `LAP ${liveTiming.currentLap}`
        : "";

  if (!src) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black/35 p-2">
      <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/12" />
      <div className="pointer-events-none absolute left-2 right-2 top-2 h-[3px] rounded-full bg-gradient-to-r from-mrl-red via-mrl-red to-transparent" />
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 h-[1px] bg-white/10" />

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="border-b border-white/10 bg-black/50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={isOnAir ? "h-2 w-2 animate-pulse rounded-full bg-mrl-red" : "h-2 w-2 rounded-full bg-white/25"} />
              <div
                className={
                  isOnAir
                    ? "rounded-md bg-mrl-red/20 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white"
                    : "rounded-md bg-white/10 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/85"
                }
              >
                {isOnAir ? "On Air" : "Off Air"}
              </div>
              <div className="text-sm font-semibold text-white/85">
                {isOnAir ? "Live Broadcast" : "Broadcast"}
              </div>
            </div>
            {isOnAir && chatSrc ? (
              <button
                type="button"
                onClick={() => setShowChat((v) => !v)}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                {showChat ? "Chat schließen" : "Chat öffnen"}
              </button>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-white/70">
            {ltName ? ltName.toUpperCase() : null}
            {ltLeft ? ` • LEFT ${ltLeft}` : ltLap ? ` • ${ltLap}` : null}
            {ltTrack ? ` • TRACK ${ltTrack}` : null}
            {ltName || ltLeft || ltLap || ltTrack ? " · " : ""}
            {timing
              ? `On Air Fenster: ${formatTimeBerlin(timing.openMs)}–${formatTimeBerlin(timing.closeMs)} (Start ${formatTimeBerlin(timing.startMs)})`
              : "On Air Fenster: 30 Min vor Rennstart bis 3 Std nach Start"}
            {checkedAt ? ` · Status: ${liveLabel} · Check ${formatDateTimeBerlin(checkedAt)}` : ` · Status: ${liveLabel}`}
          </div>

          {withLiveTimingAlerts && alerts.length ? (
            <div className="mt-3 flex justify-center">
              <div className="grid w-full max-w-[820px] gap-2">
                {alerts.map(({ a, visible }) => {
                  const theme = alertTheme(a);
                  const t = normalizeAlertType(a.type);
                  const meta = [
                    a.driver ? a.driver : null,
                    typeof a.sector === "number" ? `S${a.sector}` : null
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const main = (a.time ?? "").trim() ? a.time!.trim() : a.message;
                  const ts = a.createdAt ? formatAlertTimeBerlin(a.createdAt) : "";
                  return (
                    <div
                      key={a.id}
                      className={[
                        "overflow-hidden rounded-xl border backdrop-blur transition-all duration-300",
                        theme.wrap,
                        theme.glow,
                        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                      ].join(" ")}
                    >
                      <div className={"h-1 " + theme.bar} />
                      <div className="flex items-start gap-3 px-4 py-3">
                        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/25">
                          <AlertIcon type={t} />
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
                          <div className="mt-1 text-sm font-extrabold leading-snug text-white">
                            {main}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {isOnAir ? (
          <div className={showChat ? "grid md:grid-cols-[1fr_360px]" : ""}>
            <div className={videoAspect + " w-full"}>
              <iframe
                src={src}
                allow="autoplay; fullscreen"
                allowFullScreen
                className="h-full w-full"
                title="Twitch Stream"
              />
            </div>

            {showChat && chatSrc ? (
              <div className="border-t border-white/10 md:border-l md:border-t-0">
                <div className="h-[420px] w-full md:h-full md:min-h-[480px]">
                  <iframe
                    src={chatSrc}
                    className="h-full w-full"
                    title="Twitch Chat"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-6">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <div className="text-sm font-semibold text-white/85">
                {!timing
                  ? "Kein Rennen geplant. Live wird nur im Rennfenster angezeigt."
                  : now < timing.openMs
                    ? `Der Stream geht frühestens ab ${formatTimeBerlin(timing.openMs)} Uhr on air.`
                    : now > timing.closeMs
                      ? "Der Broadcast ist beendet."
                      : live === null
                        ? "Stream-Status wird geprüft…"
                        : "Der Stream ist aktuell offline."}
              </div>
              {timing ? (
                <div className="mt-2 text-sm text-white/70">
                  Startzeit: {formatDateTimeBerlin(timing.startMs)} · On Air: {formatTimeBerlin(timing.openMs)}–{formatTimeBerlin(timing.closeMs)}
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/70">
                  Twitch-Stream ist sichtbar, aber das Livebild wird nur im Rennfenster freigeschaltet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
