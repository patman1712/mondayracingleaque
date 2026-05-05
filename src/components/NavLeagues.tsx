"use client";

import Image from "next/image";
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

type DriverCard = {
  id: string;
  name: string;
  gamertag: string | null;
  number: number | null;
  country: string | null;
  portraitUrl: string | null;
  accent: string | null;
  role: "MAIN" | "RESERVE";
};

type LeagueDrivers = {
  drivers: DriverCard[];
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
  const a = c ? hexToRgba(c, 0.32) : "rgba(255,255,255,0.08)";
  const b = c ? hexToRgba(c, 0.06) : "rgba(255,255,255,0.03)";
  const d = c ? hexToRgba(c, 0.22) : "rgba(255,255,255,0.06)";
  return `radial-gradient(900px circle at 20% 18%, ${d}, transparent 62%), linear-gradient(145deg, ${a}, ${b})`;
}

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
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
  const [driversByLeague, setDriversByLeague] = useState<
    Partial<Record<League["slug"], LeagueDrivers>>
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

  useEffect(() => {
    const league = open as League["slug"] | null;
    if (!league) return;
    if (active !== "drivers") return;
    if (driversByLeague[league]) return;
    if (loadingLeague === league) return;

    setLoadingLeague(league);
    fetch(`/api/league/drivers?league=${encodeURIComponent(league)}`, {
      cache: "no-store"
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: LeagueDrivers) => {
        setDriversByLeague((prev) => ({ ...prev, [league]: data }));
      })
      .catch(() => {})
      .finally(() => setLoadingLeague(null));
  }, [open, active, driversByLeague, loadingLeague]);

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 240);
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
        const wide = isOpen;
        const teams = teamsByLeague[l.slug]?.teams ?? [];
        const drivers = driversByLeague[l.slug]?.drivers ?? [];

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
                "absolute left-1/2 top-full mt-2 -translate-x-1/2 transition",
                "z-[60]",
                isOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0"
              ].join(" ")}
              style={{ width: "min(980px, calc(100vw - 32px))" }}
              onMouseEnter={() => cancelClose()}
              onMouseLeave={() => scheduleClose()}
            >
              <div
                className="max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0B0D10] p-3 shadow-2xl"
                style={{ scrollbarGutter: "stable" }}
              >
                <div className="flex items-center justify-between px-2 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    {l.label}
                  </div>
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                </div>

                <div className="grid gap-3 p-2 md:grid-cols-[240px_1fr]">
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
                                    <Image
                                      src={src}
                                      alt=""
                                      fill
                                      sizes="(max-width: 640px) 92vw, (max-width: 1024px) 640px, 720px"
                                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                                      quality={80}
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
                      ) : active === "teams" ? (
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

                          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {teams.length === 0 ? (
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60 sm:col-span-2 lg:col-span-3">
                                {loadingLeague === l.slug ? "Lädt..." : "Noch keine Teams"}
                              </div>
                            ) : (
                              teams.slice(0, 8).map((t) => (
                                <Link
                                  key={t.id}
                                  href={`/${l.slug}/teams/${t.id}`}
                                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                                  style={{ backgroundImage: teamBg(t.color) }}
                                >
                                  <div
                                    className="absolute inset-0 opacity-25"
                                    style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/10 to-black/70" />
                                  <div
                                    className="absolute left-0 top-0 h-[6px] w-full"
                                    style={{ backgroundColor: t.color ?? "#ffffff" }}
                                  />

                                  <div className="relative p-4">
                                    <div className="flex items-start justify-end">
                                      {t.logoUrl ? (
                                        <Image
                                          src={t.logoUrl}
                                          alt=""
                                          width={44}
                                          height={44}
                                          unoptimized
                                          className="h-10 w-10 bg-black/20 object-contain"
                                        />
                                      ) : (
                                        <div className="h-10 w-10 bg-black/20" />
                                      )}
                                    </div>

                                    <div className="mt-2 relative h-[92px] overflow-hidden">
                                      {t.carUrl ? (
                                        <div className="absolute inset-x-0 bottom-0 mx-auto h-[104px] w-full">
                                          <Image
                                            src={t.carUrl}
                                            alt=""
                                            fill
                                            sizes="(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 200px"
                                            className="object-contain transition duration-300 group-hover:scale-[1.03]"
                                            quality={80}
                                          />
                                        </div>
                                      ) : (
                                        <div className="flex h-[92px] w-full items-center justify-center text-[11px] font-semibold text-white/35">
                                          CAR
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-3 px-1 text-center text-sm font-extrabold uppercase leading-tight tracking-wide text-white/90 group-hover:text-white">
                                      {t.name}
                                    </div>
                                  </div>
                                </Link>
                              ))
                            )}
                          </div>
                        </>
                      ) : active === "drivers" ? (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                              Fahrer
                            </div>
                            <Link
                              href={`/${l.slug}/drivers`}
                              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                            >
                              Alle Fahrer
                            </Link>
                          </div>

                          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {drivers.length === 0 ? (
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60 sm:col-span-2 lg:col-span-3">
                                {loadingLeague === l.slug ? "Lädt..." : "Noch keine Fahrer"}
                              </div>
                            ) : (
                              drivers.slice(0, 8).map((d) => (
                                <Link
                                  key={d.id}
                                  href={`/${l.slug}/drivers/${d.id}`}
                                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                                  style={{ backgroundImage: teamBg(d.accent) }}
                                >
                                  <div
                                    className="absolute inset-0 opacity-25"
                                    style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/10 to-black/70" />
                                  <div
                                    className="absolute left-0 top-0 h-[6px] w-full"
                                    style={{ backgroundColor: d.accent ?? "#ffffff" }}
                                  />

                                  {d.number !== null ? (
                                    <div className="pointer-events-none absolute right-3 top-2 text-[52px] font-extrabold leading-none text-white/12">
                                      {d.number}
                                    </div>
                                  ) : null}

                                  <div className="relative p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-extrabold uppercase tracking-wide text-white/90 group-hover:text-white">
                                          {d.gamertag ?? d.name}
                                        </div>
                                        <div className="mt-1 text-xs font-semibold text-white/55">
                                          {d.role === "RESERVE" ? "Ersatzfahrer" : "Stammfahrer"}
                                        </div>
                                      </div>
                                      <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-black/20">
                                        {d.portraitUrl ? (
                                          <Image
                                            src={d.portraitUrl}
                                            alt=""
                                            fill
                                            sizes="56px"
                                            className="object-cover"
                                            quality={80}
                                          />
                                        ) : null}
                                      </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                      <div className="text-xs text-white/55">
                                        {d.country ?? ""}
                                      </div>
                                      <div className="text-xs font-semibold text-white/65">→</div>
                                    </div>
                                  </div>
                                </Link>
                              ))
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex h-[220px] items-center justify-center text-sm text-white/60">
                          Abschnitt öffnen: {sub.find((s) => s.key === active)?.label ?? ""}
                        </div>
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

export function MobileNavLeagues({
  onNavigate
}: {
  onNavigate?: () => void;
}) {
  const [league, setLeague] = useState<League["slug"] | null>(null);
  const [active, setActive] = useState<SubKey>("drivers");
  const [scheduleByLeague, setScheduleByLeague] = useState<
    Partial<Record<League["slug"], LeagueSchedule>>
  >({});
  const [teamsByLeague, setTeamsByLeague] = useState<
    Partial<Record<League["slug"], LeagueTeams>>
  >({});
  const [driversByLeague, setDriversByLeague] = useState<
    Partial<Record<League["slug"], LeagueDrivers>>
  >({});
  const [loadingLeague, setLoadingLeague] = useState<League["slug"] | null>(null);

  useEffect(() => {
    if (!league) return;
    if (active !== "calendar") return;
    if (scheduleByLeague[league]) return;
    if (loadingLeague === league) return;

    setLoadingLeague(league);
    fetch(`/api/league/schedule?league=${encodeURIComponent(league)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: LeagueSchedule) => {
        setScheduleByLeague((prev) => ({ ...prev, [league]: data }));
      })
      .catch(() => {})
      .finally(() => setLoadingLeague(null));
  }, [league, active, scheduleByLeague, loadingLeague]);

  useEffect(() => {
    if (!league) return;
    if (active !== "teams") return;
    if (teamsByLeague[league]) return;
    if (loadingLeague === league) return;

    setLoadingLeague(league);
    fetch(`/api/league/teams?league=${encodeURIComponent(league)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: LeagueTeams) => {
        setTeamsByLeague((prev) => ({ ...prev, [league]: data }));
      })
      .catch(() => {})
      .finally(() => setLoadingLeague(null));
  }, [league, active, teamsByLeague, loadingLeague]);

  useEffect(() => {
    if (!league) return;
    if (active !== "drivers") return;
    if (driversByLeague[league]) return;
    if (loadingLeague === league) return;

    setLoadingLeague(league);
    fetch(`/api/league/drivers?league=${encodeURIComponent(league)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((data: LeagueDrivers) => {
        setDriversByLeague((prev) => ({ ...prev, [league]: data }));
      })
      .catch(() => {})
      .finally(() => setLoadingLeague(null));
  }, [league, active, driversByLeague, loadingLeague]);

  const selected = leagues.find((l) => l.slug === league) ?? null;
  const accent = selected ? (scheduleByLeague[selected.slug]?.accent ?? selected.accent) : "rgba(225,6,0,1)";

  if (!selected) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
          Ligen
        </div>
        <div className="grid gap-2">
          {leagues.map((l) => (
            <button
              key={l.slug}
              type="button"
              onClick={() => {
                setLeague(l.slug);
                setActive("drivers");
              }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white/85 hover:bg-white/10"
            >
              <span>{l.label}</span>
              <span className="text-white/50">→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
          onClick={() => setLeague(null)}
        >
          ← Zurück
        </button>
        <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
          {selected.label}
        </div>
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
      </div>

      <div className="grid gap-2">
        {sub.map((s) => (
          <Link
            key={s.key}
            href={`/${selected.slug}/${s.key}`}
            onClick={() => onNavigate?.()}
            className={[
              "group rounded-xl border border-white/10 px-4 py-3 transition",
              active === s.key ? "bg-white/10" : "bg-white/5 hover:bg-white/10"
            ].join(" ")}
            style={{ ["--accent" as unknown as string]: accent }}
            onMouseEnter={() => setActive(s.key)}
            onFocus={() => setActive(s.key)}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-white/85 transition group-hover:text-white">
                {s.label}
              </div>
              <div className="text-white/50 transition group-hover:text-white" style={{ color: "var(--accent)" }}>
                →
              </div>
            </div>
            <div
              className="mt-2 h-[2px] w-full rounded-full bg-white/10"
              style={{
                background: "linear-gradient(90deg, var(--accent), rgba(255,255,255,0.06))"
              }}
            />
          </Link>
        ))}
      </div>

      {active === "teams" ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Teams
            </div>
            <Link
              href={`/${selected.slug}/teams`}
              onClick={() => onNavigate?.()}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Alle Teams
            </Link>
          </div>
          <div className="mt-3 text-sm text-white/70">
            {loadingLeague === selected.slug && !teamsByLeague[selected.slug] ? "Lädt..." : `${teamsByLeague[selected.slug]?.teams.length ?? 0} Teams`}
          </div>
        </div>
      ) : active === "drivers" ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Fahrer
            </div>
            <Link
              href={`/${selected.slug}/drivers`}
              onClick={() => onNavigate?.()}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Öffnen
            </Link>
          </div>
          <div className="mt-3 text-sm text-white/70">
            {loadingLeague === selected.slug && !driversByLeague[selected.slug]
              ? "Lädt..."
              : `${driversByLeague[selected.slug]?.drivers.length ?? 0} Fahrer`}
          </div>
        </div>
      ) : active === "calendar" ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Rennkalender
            </div>
            <Link
              href={`/${selected.slug}/calendar`}
              onClick={() => onNavigate?.()}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Öffnen
            </Link>
          </div>
          <div className="mt-3 text-sm text-white/70">
            {loadingLeague === selected.slug && !scheduleByLeague[selected.slug] ? "Lädt..." : "Übersicht öffnen"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
