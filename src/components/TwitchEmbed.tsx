"use client";

import { useEffect, useMemo, useState } from "react";

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
  startsAtMs
}: {
  channel: string;
  startsAtMs: number;
}) {
  const [showChat, setShowChat] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const normalized = useMemo(() => normalizeTwitchChannel(channel), [channel]);

  const timing = useMemo(() => {
    const startMs = startsAtMs;
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

  const now = Date.now();
  const inWindow = now >= timing.openMs && now <= timing.closeMs;
  const isOnAir = Boolean(inWindow && live);

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
            On Air Fenster: {formatTimeBerlin(timing.openMs)}–{formatTimeBerlin(timing.closeMs)} (Start {formatTimeBerlin(timing.startMs)})
            {checkedAt ? ` · Status: ${live ? "online" : "offline"} · Check ${formatDateTimeBerlin(checkedAt)}` : ""}
          </div>
        </div>

        {isOnAir ? (
          <div className={showChat ? "grid md:grid-cols-[1fr_360px]" : ""}>
            <div className="aspect-video w-full">
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
                {now < timing.openMs
                  ? `Der Stream geht frühestens ab ${formatTimeBerlin(timing.openMs)} Uhr on air.`
                  : now > timing.closeMs
                    ? "Der Broadcast ist beendet."
                    : "Der Stream ist aktuell offline."}
              </div>
              <div className="mt-2 text-sm text-white/70">
                Startzeit: {formatDateTimeBerlin(timing.startMs)} · On Air: {formatTimeBerlin(timing.openMs)}–{formatTimeBerlin(timing.closeMs)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
