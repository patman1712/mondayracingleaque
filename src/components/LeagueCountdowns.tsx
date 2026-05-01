"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CountdownRace = {
  name: string;
  startsAt: string;
};

type CountdownLeague = {
  key: "ONE" | "TWO" | "ROOKIE";
  label: string;
  href: string;
  nextRace: CountdownRace | null;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "Live / Gestartet";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = pad2(hours);
  const mm = pad2(minutes);
  const ss = pad2(seconds);
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function LeagueCountdowns({ leagues }: { leagues: CountdownLeague[] }) {
  const raceStartMs = useMemo(() => {
    return leagues.map((l) => (l.nextRace ? Date.parse(l.nextRace.startsAt) : null));
  }, [leagues]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid gap-4">
      {leagues.map((l, idx) => {
        const start = raceStartMs[idx];
        const remaining = start ? start - now : null;
        const startsAt = l.nextRace ? new Date(l.nextRace.startsAt) : null;

        return (
          <Link
            key={l.key}
            href={l.href}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur hover:bg-black/45"
          >
            <div className="absolute inset-y-0 left-0 w-[3px] bg-mrl-red/70" />
            <div className="pl-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                {l.label}
              </div>

              {l.nextRace ? (
                <div className="mt-3">
                  <div className="truncate text-base font-semibold text-white">
                    {l.nextRace.name}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {startsAt
                      ? startsAt.toLocaleString("de-DE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : ""}
                  </div>
                  <div className="mt-3 font-mono text-2xl font-semibold text-white">
                    {remaining == null ? "--:--:--" : formatRemaining(remaining)}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/70">
                  Kein Rennen geplant.
                </div>
              )}

              <div className="mt-4 text-sm font-semibold text-white/70 group-hover:text-white">
                Details →
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
