"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Container } from "./Container";
import { MobileNavLeagues, NavLeagues } from "./NavLeagues";

type TvOnAir = {
  hasOnAir: boolean;
  items: Array<{
    leagueSlug: string;
    leagueLabel: string;
    accent: string;
    race: { id: string; title: string; round: number; startsAtMs: number };
  }>;
};

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tv, setTv] = useState<TvOnAir | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
        timer = window.setTimeout(poll, 60_000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <header
      className={
        isHome
          ? "absolute inset-x-0 top-0 z-50 bg-black/35 backdrop-blur"
          : "relative z-50 border-b border-white/10 bg-black/30 backdrop-blur"
      }
    >
      <Container>
        <div className="flex items-center justify-between gap-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="MRL"
              className="h-10 w-10 rounded-full ring-1 ring-white/10"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">MRL</div>
              <div className="text-xs text-white/70">Monday Racing League</div>
            </div>
          </Link>

          <div className="hidden flex-1 items-center justify-between gap-6 md:flex">
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/news" className="text-white/80 hover:text-white">
                News
              </Link>
              <Link href="/calendar" className="text-white/80 hover:text-white">
                Kalender
              </Link>
            </nav>

            {tv?.hasOnAir ? (
              <Link
                href="/tv"
                className="group relative inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-extrabold uppercase tracking-wider text-white hover:bg-white/10"
              >
                <span className="text-white">MRL TV</span>
                <span className="rounded-full bg-mrl-red/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                  On Air
                </span>
              </Link>
            ) : (
              <div className="w-[130px]" />
            )}

            <div className="shrink-0">
              <NavLeagues />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15 md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              Menü
            </button>
            <Link
              href="/admin"
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Admin
            </Link>
          </div>
        </div>
      </Container>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(420px,100vw)] overflow-y-auto border-l border-white/10 bg-[#0B0D10] p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Menü</div>
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                onClick={() => setMobileOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {tv?.hasOnAir ? (
                <Link
                  href="/tv"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-extrabold uppercase tracking-wider text-white hover:bg-white/10"
                >
                  <span>MRL TV</span>
                  <span className="rounded-full bg-mrl-red/25 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
                    On Air
                  </span>
                </Link>
              ) : null}
              <Link
                href="/news"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
              >
                News
              </Link>
              <Link
                href="/calendar"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
              >
                Kalender
              </Link>
            </div>

            <div className="mt-6">
              <MobileNavLeagues onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
