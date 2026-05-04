"use client";

import { useMemo } from "react";

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

export function TwitchEmbed({ channel }: { channel: string }) {
  const src = useMemo(() => {
    const c = normalizeTwitchChannel(channel);
    if (!c) return null;
    const parent = window.location.hostname;
    const u = new URL("https://player.twitch.tv/");
    u.searchParams.set("channel", c);
    u.searchParams.set("parent", parent);
    u.searchParams.set("muted", "true");
    return u.toString();
  }, [channel]);

  if (!src) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <div className="aspect-video w-full">
        <iframe
          src={src}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="h-full w-full"
          title="Twitch Stream"
        />
      </div>
    </div>
  );
}

