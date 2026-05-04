"use client";

import { useMemo, useState } from "react";

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
  const [showChat, setShowChat] = useState(false);

  const normalized = useMemo(() => normalizeTwitchChannel(channel), [channel]);

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
              <div className="h-2 w-2 animate-pulse rounded-full bg-mrl-red" />
              <div className="rounded-md bg-mrl-red/20 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                On Air
              </div>
              <div className="text-sm font-semibold text-white/85">
                Live Broadcast
              </div>
            </div>
            {chatSrc ? (
              <button
                type="button"
                onClick={() => setShowChat((v) => !v)}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                {showChat ? "Chat schließen" : "Chat öffnen"}
              </button>
            ) : null}
          </div>
        </div>

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
      </div>
    </div>
  );
}
