"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Cam = {
  driverId: string;
  name: string;
  twitchChannel: string;
  portraitUrl: string | null;
};

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

function buildPlayerSrc(channel: string) {
  const parent = window.location.hostname;
  const u = new URL("https://player.twitch.tv/");
  u.searchParams.set("channel", channel);
  u.searchParams.set("parent", parent);
  u.searchParams.set("muted", "true");
  return u.toString();
}

export function MrlTvDriverCamsClient({
  cams,
  startsAtMs
}: {
  cams: Cam[];
  startsAtMs: number;
}) {
  const limited = useMemo(() => cams.slice(0, 18), [cams]);
  const [liveByChannel, setLiveByChannel] = useState<Record<string, boolean>>({});

  const now = Date.now();
  const openMs = startsAtMs - 30 * 60 * 1000;
  const closeMs = startsAtMs + 3 * 60 * 60 * 1000;
  const inWindow = now >= openMs && now <= closeMs;

  useEffect(() => {
    if (!inWindow) return;
    const list = limited
      .map((c) => normalizeTwitchChannel(c.twitchChannel))
      .filter((v): v is string => Boolean(v));
    if (list.length === 0) return;

    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      const pairs = await Promise.all(
        list.map(async (channel) => {
          try {
            const r = await fetch(`/api/twitch/status?channel=${encodeURIComponent(channel)}`, {
              cache: "no-store"
            });
            const j = (await r.json()) as { live?: boolean };
            return [channel, Boolean(j?.live)] as const;
          } catch {
            return [channel, false] as const;
          }
        })
      );

      if (cancelled) return;
      const next: Record<string, boolean> = {};
      for (const [k, v] of pairs) next[k] = v;
      setLiveByChannel(next);

      timer = window.setTimeout(poll, 60_000);
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [limited, inWindow]);

  const liveCams = useMemo(() => {
    if (!inWindow) return [];
    return limited
      .map((c) => {
        const ch = normalizeTwitchChannel(c.twitchChannel);
        if (!ch) return null;
        if (!liveByChannel[ch]) return null;
        return { ...c, normalized: ch };
      })
      .filter((v): v is Cam & { normalized: string } => Boolean(v));
  }, [limited, liveByChannel, inWindow]);

  if (!inWindow) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
        Driver Cams werden nur im Rennfenster angezeigt (30 Min vor Start bis 3 Std nach Start).
      </div>
    );
  }

  if (liveCams.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
        Aktuell ist keine Fahrer-Cam online.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {liveCams.map((c) => (
        <div key={c.driverId} className="overflow-hidden rounded-3xl border border-white/10 bg-black/35">
          <div className="border-b border-white/10 bg-black/55 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 animate-pulse rounded-full bg-mrl-red" />
              {c.portraitUrl ? (
                <Image
                  src={c.portraitUrl}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                  className="h-9 w-9 object-contain drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                />
              ) : (
                <div className="h-9 w-9" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold uppercase tracking-wide text-white">
                  {c.name}
                </div>
              </div>
              <div className="rounded-md bg-mrl-red/20 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                Live
              </div>
            </div>
          </div>

          <div className="aspect-video w-full">
            <iframe
              src={buildPlayerSrc(c.normalized)}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="h-full w-full"
              title={`Twitch Stream ${c.name}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

