"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type League = {
  slug: string;
  label: string;
  accent: string;
};

type TvOnAir = {
  hasOnAir: boolean;
  items: Array<{
    leagueSlug: string;
    leagueLabel: string;
    accent: string;
    race: { id: string; title: string; round: number; startsAtMs: number };
  }>;
};

function onAirSet(tv: TvOnAir | null) {
  const set = new Set<string>();
  for (const it of tv?.items ?? []) {
    if (it?.leagueSlug) set.add(it.leagueSlug);
  }
  return set;
}

export function NavTv() {
  const [open, setOpen] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [tv, setTv] = useState<TvOnAir | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: { leagues?: League[] }) => {
        const next = Array.isArray(data?.leagues) ? data.leagues : null;
        if (next) setLeagues(next);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    async function poll() {
      try {
        const r = await fetch("/api/tv/onair", { cache: "no-store" });
        const j = (await r.json()) as TvOnAir;
        if (cancelled) return;
        setTv(j);
      } catch {
        if (cancelled) return;
        setTv({ hasOnAir: false, items: [] });
      } finally {
        if (cancelled) return;
        timer = window.setTimeout(poll, 15_000);
      }
    }
    poll();
    function onVisibility() {
      if (document.visibilityState === "visible") poll();
    }
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const live = useMemo(() => onAirSet(tv), [tv]);

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }

  function cancelClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={scheduleClose}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 text-white/80 hover:text-white"
      >
        MRL TV
        <span className="text-white/40">▾</span>
      </button>

      {open ? (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B0D10] shadow-[0_12px_50px_rgba(0,0,0,0.55)]"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">MRL TV</div>
            <div className="mt-1 text-sm text-white/60">Ligen auswählen</div>
          </div>
          <div className="p-2">
            <Link
              href="/tv"
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <span>Übersicht</span>
              <span className="text-white/50">→</span>
            </Link>
            <div className="mt-2 grid gap-2">
              {leagues.map((l) => {
                const isOnAir = live.has(l.slug);
                return (
                  <Link
                    key={l.slug}
                    href={`/${l.slug}/tv`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white/90 hover:bg-white/10"
                    onClick={() => setOpen(false)}
                  >
                    <span className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.accent }} />
                      <span className="truncate">{l.label}</span>
                    </span>
                    {isOnAir ? (
                      <span className="rounded-full bg-mrl-red/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                        On Air
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/80">
                        Off Air
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MobileNavTv({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [tv, setTv] = useState<TvOnAir | null>(null);

  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: { leagues?: League[] }) => {
        const next = Array.isArray(data?.leagues) ? data.leagues : null;
        if (next) setLeagues(next);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    async function poll() {
      try {
        const r = await fetch("/api/tv/onair", { cache: "no-store" });
        const j = (await r.json()) as TvOnAir;
        if (cancelled) return;
        setTv(j);
      } catch {
        if (cancelled) return;
        setTv({ hasOnAir: false, items: [] });
      } finally {
        if (cancelled) return;
        timer = window.setTimeout(poll, 15_000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const live = useMemo(() => onAirSet(tv), [tv]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-extrabold uppercase tracking-wider text-white"
        onClick={() => setOpen((v) => !v)}
      >
        <span>MRL TV</span>
        <span className="text-white/50">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-white/10 p-3">
          <Link
            href="/tv"
            onClick={onNavigate}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-semibold text-white/90"
          >
            <span>Übersicht</span>
            <span className="text-white/50">→</span>
          </Link>
          {leagues.map((l) => {
            const isOnAir = live.has(l.slug);
            return (
              <Link
                key={l.slug}
                href={`/${l.slug}/tv`}
                onClick={onNavigate}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-semibold text-white/90"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.accent }} />
                  <span className="min-w-0 truncate">{l.label}</span>
                </span>
                {isOnAir ? (
                  <span className="rounded-full bg-mrl-red/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                    On Air
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white/80">
                    Off Air
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

