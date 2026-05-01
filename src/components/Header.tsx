"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "./Container";
import { NavLeagues } from "./NavLeagues";

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header
      className={
        isHome
          ? "absolute inset-x-0 top-0 z-50 bg-black/35 backdrop-blur"
          : "border-b border-white/10 bg-black/30 backdrop-blur"
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

          <nav className="hidden flex-1 items-center gap-5 text-sm md:flex">
            <Link href="/news" className="text-white/80 hover:text-white">
              News
            </Link>
            <Link href="/calendar" className="text-white/80 hover:text-white">
              Kalender
            </Link>
          </nav>
          <div className="hidden md:block">
            <NavLeagues />
          </div>

          <Link
            href="/admin"
            className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            Admin
          </Link>
        </div>
      </Container>
    </header>
  );
}
