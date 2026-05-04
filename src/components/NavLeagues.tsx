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
  { key: "calendar", label: "Rennkalender" },
  { key: "teams", label: "Teams" },
  { key: "archive", label: "Archiv" }
] as const;

type SubKey = (typeof sub)[number]["key"];

type ScheduleCard = {
  id: string;
  title: string;
  round: number;
  date: string;
  live?: boolean;
  imageUrl?: string | null;
};

type LeagueSchedule = {
  accent: string;
  previous: ScheduleCard | null;
  current: ScheduleCard | null;
  upcoming: ScheduleCard | null;
};

type TeamCard = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  carUrl: string | null;
};

type LeagueTeams = {
  teams: TeamCard[];
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

function teamBg(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.22) : "rgba(255,255,255,0.06)";
  const b = c ? hexToRgba(c, 0.04) : "rgba(255,255,255,0.02)";
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function cardMeta(card: ScheduleCard) {
  return `ROUND ${card.round} · ${card.date}`.toUpperCase();
}

function raceImgSrc(title: string, meta: string, accent: string, live: boolean) {
  const u = new URL("/api/race-image", window.location.origin);
  u.searchParams.set("title", title);
  u.searchParams.set("meta", meta);
  u.searchParams.set("accent", accent);
  if (live) u.searchParams.set("live", "1");
  return u.toString();
}

export function NavLeagues() {
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<SubKey>("drivers");
  const [scheduleByLeague, setScheduleByLeague] = useState<
    Partial<Record<League["slug"], LeagueSchedule>>
  >({});
  const [teamsByLeague, setTeamsByLeague] = useState<
    Partial<Record<League["slug"], LeagueTeams>>
  >({});
  const [loadingLeague, setLoadingLeague] = useState<League["slug"] | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    const league = open as League["slug"] | null;
    if (!league) return;
    if (active !== "calendar") return;
    if (scheduleByLeague[league]) return;
    if (loadingLeague === league) return;

    setLoadingLeague(league);
    fetch(`/api/league/schedule?league=${encodeURIComponent(league)}`, {
      cache: "no-store"
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: LeagueSchedule) => {
        setScheduleByLeague((prev) => ({ ...prev, [league]: data }));
      })
      .catch(() => {})
      .finally(() => setLoadingLeague(null));
  }, [open, active, scheduleByLeague, loadingLeague]);

  useEffect(() => {
    const league = open as League["slug"] | null;
    if (!league) return;
    if (active !== "teams") return;
    if (teamsByLeague[league]) return;
    if (loadingLeague === league) return;

    setLoadingLeague(league);
    fetch(`/api/league/teams?league=${encodeURIComponent(league)}`, {
      cache: "no-store"
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: LeagueTeams) => {
        setTeamsByLeague((prev) => ({ ...prev, [league]: data }));
      })
      .catch(() => {})
      .finally(() => setLoadingLeague(null));
  }, [open, active, teamsByLeague, loadingLeague]);

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
        const schedule = scheduleByLeague[l.slug];
        const accent = schedule?.accent ?? l.accent;
        const wide = isOpen && (active === "calendar" || active === "teams");
        const teams = teamsByLeague[l.slug]?.teams ?? [];

        return (
          <div
            key={l.slug}
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              setOpen(l.slug);
              setActive("drivers");
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
                "absolute left-1/2 top-full mt-3 -translate-x-1/2 transition",
                wide ? "w-[980px]" : "w-[360px]",
                isOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0"
              ].join(" ")}
              onMouseEnter={() => cancelClose()}
              onMouseLeave={() => scheduleClose()}
            >
              <div className="rounded-2xl border border-white/10 bg-[#0B0D10] p-3 shadow-2xl">
                <div className="flex items-center justify-between px-2 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {l.label}
                  </div>
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                </div>

                <div className={wide ? "grid gap-3 p-2 md:grid-cols-[240px_1fr]" : "grid gap-2 p-2"}>
                  <div className="grid gap-2">
                    {sub.map((s) => {
                      const isActive = active === s.key;
                      return (
                        <Link
                          key={s.key}
                          href={`/${l.slug}/${s.key}`}
                          className={[
                            "group rounded-xl border border-white/10 px-4 py-3 transition",
                            isActive ? "bg-white/10" : "bg-white/5 hover:bg-white/10"
                          ].join(" ")}
                          style={{ ["--accent" as unknown as string]: accent }}
                          onMouseEnter={() => setActive(s.key)}
                          onFocus={() => setActive(s.key)}
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
                      );
                    })}
                  </div>

                  {wide ? (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      {active === "calendar" ? (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                              Rennkalender
                            </div>
                            <Link
                              href={`/${l.slug}/calendar`}
                              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                            >
                              Full schedule
                            </Link>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-3">
                            {(
                              [
                                { k: "previous", label: "Previous" as const },
                                { k: "current", label: "Current" as const },
                                { k: "upcoming", label: "Upcoming" as const }
                              ] as const
                            ).map((slot) => {
                              const card = schedule?.[slot.k] ?? null;

                              if (!card) {
                                const isLoading = loadingLeague === l.slug && !schedule;
                                return (
                                  <div
                                    key={slot.k}
                                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                                  >
                                    <div className="px-4 pt-4 text-sm font-semibold text-white/70">
                                      {slot.label}
                                    </div>
                                    <div className="p-4 text-sm text-white/60">
                                      {isLoading ? "Lädt..." : "Kein Event"}
                                    </div>
                                  </div>
                                );
                              }

                              const img = raceImgSrc(
                                card.title,
                                cardMeta(card),
                                accent,
                                Boolean(card.live)
                              );
                              const src = card.imageUrl || img;

                              return (
                                <Link
                                  key={slot.k}
                                  href={`/${l.slug}/calendar`}
                                  className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                                >
                                  <div className="px-4 pt-4 text-sm font-semibold text-white/70">
                                    {slot.label}
                                  </div>
                                  <div className="relative mt-3 aspect-[16/10] overflow-hidden">
                                    <img
                                      src={src}
                                      alt=""
                                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                                    <div className="absolute bottom-3 left-3 right-3">
                                      <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                                        {cardMeta(card)}
                                      </div>
                                      <div className="mt-1 truncate text-lg font-extrabold text-white">
                                        {card.title}
                                      </div>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                              Teams
                            </div>
                            <Link
                              href={`/${l.slug}/teams`}
                              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                            >
                              Alle Teams
                            </Link>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {teams.length === 0 ? (
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60 sm:col-span-2 lg:col-span-4">
                                {loadingLeague === l.slug ? "Lädt..." : "Noch keine Teams"}
                              </div>
                            ) : (
                              teams.slice(0, 8).map((t) => (
                                <Link
                                  key={t.id}
                                  href={`/${l.slug}/teams`}
                                  className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                                  style={{ backgroundImage: teamBg(t.color) }}
                                >
                                  <div className="p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-white/85 group-hover:text-white">
                                          {t.name}
                                        </div>
                                      </div>
                                      {t.logoUrl ? (
                                        <img
                                          src={t.logoUrl}
                                          alt=""
                                          className="h-9 w-9 rounded-lg bg-black/20 object-contain"
                                        />
                                      ) : (
                                        <div className="h-9 w-9 rounded-lg bg-black/20" />
                                      )}
                                    </div>
                                    <div className="mt-3 h-[58px] overflow-hidden rounded-xl bg-black/20">
                                      {t.carUrl ? (
                                        <img
                                          src={t.carUrl}
                                          alt=""
                                          className="h-full w-full object-contain"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-white/35">
                                          CAR
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
