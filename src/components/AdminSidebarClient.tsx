"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type LeagueItem = {
  adminSlug: string;
  name: string;
  isActive: boolean;
};

const sectionLinks = [
  { key: "races", label: "Rennkalender" },
  { key: "results", label: "Ergebnisse" },
  { key: "standings", label: "WM Stand" }
] as const;

export function AdminSidebarClient({ leagues }: { leagues: LeagueItem[] }) {
  const [generalOpen, setGeneralOpen] = useState(true);
  const [openByLeague, setOpenByLeague] = useState<Record<string, boolean>>({});

  const orderedLeagues = useMemo(() => {
    return [...leagues].sort((a, b) => a.name.localeCompare(b.name));
  }, [leagues]);

  return (
    <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <button
        type="button"
        onClick={() => setGeneralOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/70 hover:bg-white/10"
      >
        <span>Allgemein</span>
        <span className={`text-white/40 transition-transform ${generalOpen ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {generalOpen ? (
        <div className="mt-2 space-y-1 text-sm">
          <Link
            href="/admin"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Übersicht
          </Link>
          <Link
            href="/admin/news"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            News
          </Link>
          <Link
            href="/admin/settings/league-colors"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Liga Farben
          </Link>
          <Link
            href="/admin/settings/leagues"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Ligen
          </Link>
          <Link
            href="/admin/settings/seasons"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Saisons
          </Link>
          <Link
            href="/admin/settings/circuits"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Rennstrecken
          </Link>
          <Link
            href="/admin/settings/teams"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Teams
          </Link>
          <Link
            href="/admin/settings/drivers"
            className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
          >
            Fahrer
          </Link>
        </div>
      ) : null}

      <div className="mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-white/60">
        Ligen
      </div>
      <div className="mt-2 space-y-2">
        {orderedLeagues.map((l) => {
          const isOpen = Boolean(openByLeague[l.adminSlug]);
          return (
            <div key={l.adminSlug} className="rounded-xl border border-white/10 bg-black/10">
              <button
                type="button"
                onClick={() =>
                  setOpenByLeague((prev) => ({
                    ...prev,
                    [l.adminSlug]: !prev[l.adminSlug]
                  }))
                }
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-white/85 hover:bg-white/10"
              >
                <span className="min-w-0 truncate">
                  {l.name}
                  {!l.isActive ? (
                    <span className="ml-2 text-[11px] font-semibold text-white/45">
                      (inaktiv)
                    </span>
                  ) : null}
                </span>
                <span className={`text-white/35 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-1 px-2 pb-2">
                  <Link
                    href={`/admin/${l.adminSlug}/settings`}
                    className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    Einstellungen
                  </Link>
                  <Link
                    href={`/admin/${l.adminSlug}/drivers`}
                    className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    Fahrer
                  </Link>
                  <Link
                    href={`/admin/${l.adminSlug}/teams`}
                    className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    Teams
                  </Link>
                  {sectionLinks.map((s) => (
                    <Link
                      key={s.key}
                      href={`/admin/${l.adminSlug}/${s.key}`}
                      className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

