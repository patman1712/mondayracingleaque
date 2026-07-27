"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Container } from "./Container";
import { MobileNavLeagues, NavLeagues } from "./NavLeagues";
import { MobileNavTv, NavTv } from "./NavTv";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 199" className={className ?? "h-4 w-4"} aria-hidden="true">
      <path
        fill="currentColor"
        d="M216.86 16.52A208.5 208.5 0 0 0 164.08 0a1.9 1.9 0 0 0-2 1 145.1 145.1 0 0 0-6.2 12.8 197.3 197.3 0 0 0-59.8 0A136 136 0 0 0 89.86 1a2 2 0 0 0-2-1A207 207 0 0 0 35.1 16.53a1.95 1.95 0 0 0-.9.7C-.2 67.3-8.3 116.3 1.8 164.7a2 2 0 0 0 .8 1.2 209 209 0 0 0 63.3 32.3 2 2 0 0 0 2.2-.7 150 150 0 0 0 12.9-21 2 2 0 0 0-1.1-2.8 136 136 0 0 1-19.8-9.5 2 2 0 0 1-.2-3.3c1.3-1 2.6-2 3.9-3a2 2 0 0 1 2.1-.3c41.6 19 86.7 19 127.9 0a2 2 0 0 1 2.1.2c1.3 1 2.6 2 4 3a2 2 0 0 1-.2 3.3 129 129 0 0 1-19.8 9.5 2 2 0 0 0-1.1 2.8 169 169 0 0 0 12.8 21 2 2 0 0 0 2.2.7 208.2 208.2 0 0 0 63.4-32.3 2 2 0 0 0 .8-1.1c12.2-56.3-20.3-105-32.6-147.5a2 2 0 0 0-.9-.8ZM85.5 135.3c-12.6 0-23-11.6-23-25.8s10.2-25.8 23-25.8c12.9 0 23.2 11.7 23 25.8 0 14.2-10.2 25.8-23 25.8Zm85 0c-12.6 0-23-11.6-23-25.8s10.2-25.8 23-25.8c12.9 0 23.2 11.7 23 25.8 0 14.2-10.2 25.8-23 25.8Z"
      />
    </svg>
  );
}

export function Header({
  logoSrc,
  discordUrl
}: {
  logoSrc?: string | null;
  discordUrl?: string | null;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={
          isHome
            ? "absolute inset-x-0 top-0 z-[200] bg-black/35 backdrop-blur"
            : "relative z-[200] border-b border-white/10 bg-black/30 backdrop-blur"
        }
      >
        <Container>
          <div className="flex items-center justify-between gap-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <img
                src={logoSrc ?? "/logo.svg"}
                alt="MRL"
                className="h-10 w-auto max-w-[160px] object-contain"
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
                <NavTv />
                {discordUrl ? (
                  <a
                    href={discordUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-white/80 hover:text-white"
                  >
                    <DiscordIcon className="h-4 w-4" />
                    <span>Discord</span>
                  </a>
                ) : null}
              </nav>

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
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[5000] md:hidden">
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
              <MobileNavTv onNavigate={() => setMobileOpen(false)} />
              {discordUrl ? (
                <a
                  href={discordUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
                >
                  <DiscordIcon className="h-4 w-4 text-white/85" />
                  <span>Discord</span>
                </a>
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
    </>
  );
}
