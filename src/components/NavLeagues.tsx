"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type League = {
  slug: "mrl-one" | "mrl-two" | "mrl-rookie";
  label: string;
  accent: string;
};

const leagues: League[] = [
  { slug: "mrl-one", label: "MRL One", accent: "rgba(225,6,0,1)" },
  { slug: "mrl-two", label: "MRL Two", accent: "rgba(34,197,94,1)" },
  { slug: "mrl-rookie", label: "MRL Rookie", accent: "rgba(56,189,248,1)" }
];

const sub = [
  { key: "drivers", label: "Fahrer" },
  { key: "results", label: "Ergebnisse" },
  { key: "standings", label: "WM Stand" },
  { key: "calendar", label: "Rennkalender" }
] as const;

export function NavLeagues() {
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 120);
  }

  function cancelClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  return (
    <div className="hidden items-center gap-5 text-sm md:flex">
      {leagues.map((l) => {
        const isOpen = open === l.slug;
        return (
          <div
            key={l.slug}
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              setOpen(l.slug);
            }}
            onMouseLeave={() => scheduleClose()}
          >
            <Link
              href={`/${l.slug}`}
              className="text-white/80 hover:text-white"
              onFocus={() => setOpen(l.slug)}
              onBlur={() => scheduleClose()}
            >
              {l.label}
            </Link>

            <div
              className={[
                "absolute left-1/2 top-full mt-3 w-[340px] -translate-x-1/2 transition",
                isOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0"
              ].join(" ")}
              onMouseEnter={() => cancelClose()}
              onMouseLeave={() => scheduleClose()}
            >
              <div className="rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur">
                <div className="flex items-center justify-between px-2 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {l.label}
                  </div>
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: l.accent }}
                  />
                </div>

                <div className="grid gap-2 p-2">
                  {sub.map((s) => (
                    <Link
                      key={s.key}
                      href={`/${l.slug}/${s.key}`}
                      className="group rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10"
                      style={{ ["--accent" as unknown as string]: l.accent }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-white/85 transition group-hover:text-white">
                          {s.label}
                        </div>
                        <div
                          className="text-white/50 transition group-hover:text-white"
                          style={{ color: "var(--accent)" }}
                        >
                          →
                        </div>
                      </div>
                      <div
                        className="mt-2 h-[2px] w-full rounded-full bg-white/10"
                        style={{
                          background:
                            "linear-gradient(90deg, var(--accent), rgba(255,255,255,0.06))"
                        }}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
