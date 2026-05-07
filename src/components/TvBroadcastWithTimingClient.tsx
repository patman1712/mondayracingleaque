"use client";

import { useEffect, useMemo, useState } from "react";
import { TwitchEmbed } from "@/components/TwitchEmbed";
import { LiveTimingMiniClient } from "@/components/LiveTimingMiniClient";

type LiveTimingStateLite = {
  updatedAtMs?: number;
  entries?: unknown[];
};

export function TvBroadcastWithTimingClient({
  channel,
  startsAtMs
}: {
  channel?: string | null;
  startsAtMs: number;
}) {
  const inWindow = useMemo(() => {
    if (!Number.isFinite(startsAtMs)) return false;
    const now = Date.now();
    const open = startsAtMs - 30 * 60 * 1000;
    const close = startsAtMs + 3 * 60 * 60 * 1000;
    return now >= open && now <= close;
  }, [startsAtMs]);

  const [showTiming, setShowTiming] = useState(false);

  useEffect(() => {
    if (!inWindow) return;
    let cancelled = false;
    let t: number | null = null;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as LiveTimingStateLite;
        if (cancelled) return;
        const last = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        const hasEntries = Array.isArray(j?.entries) && j.entries.length > 0;
        const live = Boolean(last && Date.now() - last <= 2000 && hasEntries);
        setShowTiming(live);
      } catch {
        if (cancelled) return;
        setShowTiming(false);
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
  }, [inWindow]);

  return (
    <div
      className={[
        "grid gap-4",
        showTiming ? "lg:grid-cols-[minmax(0,1fr)_520px] lg:items-start" : ""
      ].join(" ")}
    >
      <div className="min-w-0">
        {channel ? (
          <TwitchEmbed channel={channel} startsAtMs={startsAtMs} />
        ) : (
          <div className="rounded-3xl border border-white/10 bg-black/30 p-8 text-white/70">
            Für dieses Rennen ist kein Twitch-Broadcast hinterlegt.
          </div>
        )}
      </div>

      {showTiming ? (
        <div className="min-w-0">
          <LiveTimingMiniClient
            startsAtMs={startsAtMs}
            title="Live Timing"
            maxRows={22}
            columns={2}
            splitAt={11}
            className="max-w-none"
          />
        </div>
      ) : null}
    </div>
  );
}
