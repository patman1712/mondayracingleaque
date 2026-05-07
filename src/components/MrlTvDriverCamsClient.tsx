"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Cam = {
  driverId: string;
  name: string;
  twitchChannel: string;
  portraitUrl: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  accent: string;
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
  startsAtMs,
  maxVisible
}: {
  cams: Cam[];
  startsAtMs: number;
  maxVisible?: number;
}) {
  const limit = typeof maxVisible === "number" && Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : 18;
  const limited = useMemo(() => cams.slice(0, limit), [cams, limit]);
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {liveCams.map((c) => (
        <div key={c.driverId} className="overflow-hidden rounded-3xl border border-white/10 bg-black/35">
          <div
            className="relative border-b border-white/10 px-5 py-4"
            style={{ backgroundImage: teamBgSolid(c.accent) }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-25" style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }} />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/70" />
            <div className="pointer-events-none absolute left-0 top-0 h-[6px] w-full" style={{ backgroundColor: c.accent }} />

            <div className="relative flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-mrl-red" />
                {c.portraitUrl ? (
                  <Image
                    src={c.portraitUrl}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="h-14 w-14 object-contain drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                  />
                ) : (
                  <div className="h-14 w-14" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-base font-extrabold uppercase leading-snug tracking-wide text-white line-clamp-2">
                  {c.name}
                </div>
                {c.teamName ? (
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-white/80 line-clamp-2">
                    {c.teamName}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                {c.teamLogoUrl ? (
                  <Image
                    src={c.teamLogoUrl}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="h-12 w-12 object-contain drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                  />
                ) : (
                  <div className="h-12 w-12" />
                )}
                <div className="rounded-full bg-mrl-red/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                  Live
                </div>
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
