"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DriverRole, League } from "@prisma/client";

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

type LeagueMeta = {
  league: League;
  adminSlug: string;
  publicSlug: string;
  name: string;
};

type SeasonRow = {
  id: string;
  league: League;
  year: number;
  seasonNo: number;
  isTest: boolean;
  placement: string;
};

type TeamLeagueRow = {
  league: League;
  team: { id: string; name: string };
};

type DriverRow = {
  id: string;
  name: string;
  gamertag: string | null;
  status: "ACTIVE" | "RETIRED";
  number: number | null;
  country: string | null;
  team: string | null;
  twitchChannel: string | null;
  seasons: Array<{
    seasonId: string;
    role: DriverRole;
    teamId: string | null;
    teamRef: { name: string } | null;
  }>;
};

export function AdminSettingsDriversListClient(props: {
  initialQuery?: string;
  leagueMeta: LeagueMeta[];
  seasons: SeasonRow[];
  teamLeagues: TeamLeagueRow[];
  drivers: DriverRow[];
  activateDriver: (formData: FormData) => void;
  deactivateDriver: (formData: FormData) => void;
}) {
  const [q, setQ] = useState(props.initialQuery ?? "");
  const searchNeedle = normalizeSearch(q);

  const labelByLeague = useMemo(
    () => new Map(props.leagueMeta.map((l) => [l.league, l.name] as const)),
    [props.leagueMeta]
  );
  const adminSlugByLeague = useMemo(
    () => new Map(props.leagueMeta.map((l) => [l.league, l.adminSlug] as const)),
    [props.leagueMeta]
  );

  const seasonById = useMemo(() => new Map(props.seasons.map((s) => [s.id, s] as const)), [props.seasons]);
  const seasonsByLeague = useMemo(() => {
    const out = new Map<League, SeasonRow[]>();
    for (const s of props.seasons) {
      const list = out.get(s.league) ?? [];
      list.push(s);
      out.set(s.league, list);
    }
    return out;
  }, [props.seasons]);

  const teamsByLeague = useMemo(() => {
    const out = new Map<League, { id: string; name: string }[]>();
    for (const r of props.teamLeagues) {
      const list = out.get(r.league) ?? [];
      list.push(r.team);
      out.set(r.league, list);
    }
    return out;
  }, [props.teamLeagues]);

  const filteredDrivers = useMemo(() => {
    if (!searchNeedle) return props.drivers;
    return props.drivers.filter((d) => {
      const haystack = normalizeSearch(
        [
          d.name,
          d.gamertag,
          d.team,
          d.country,
          d.twitchChannel,
          d.number != null ? `#${d.number}` : null
        ]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(searchNeedle);
    });
  }, [props.drivers, searchNeedle]);

  const activeDrivers = useMemo(
    () => filteredDrivers.filter((d) => d.status === "ACTIVE"),
    [filteredDrivers]
  );
  const retiredDrivers = useMemo(
    () => filteredDrivers.filter((d) => d.status === "RETIRED"),
    [filteredDrivers]
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="text-base font-semibold">Fahrer</div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label className="mb-1 block text-xs font-semibold text-white/70">Suche</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, Gamertag, Team, Land ..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />
        </div>
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            className="rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-black/30 hover:text-white"
          >
            Zurücksetzen
          </button>
        ) : null}
      </div>

      {q ? (
        <div className="mt-3 text-sm text-white/60">
          Suche nach: <span className="font-semibold text-white">{q}</span> · {filteredDrivers.length} Treffer
        </div>
      ) : null}

      {props.drivers.length === 0 ? (
        <div className="mt-4 text-sm text-white/60">Noch keine Fahrer.</div>
      ) : filteredDrivers.length === 0 ? (
        <div className="mt-4 text-sm text-white/60">Keine Fahrer zur Suchanfrage gefunden.</div>
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Aktiv ({activeDrivers.length})
            </div>
            <div className="mt-2 space-y-2">
              {activeDrivers.map((d) =>
                (() => {
                  const activeLeagues = Array.from(
                    new Set(
                      d.seasons
                        .map((s) => seasonById.get(s.seasonId)?.league ?? null)
                        .filter((x): x is League => Boolean(x))
                    )
                  );
                  return (
                    <div
                      key={d.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {d.number ? `#${d.number} ` : ""}
                          {d.name}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          {d.gamertag ? `${d.gamertag} · ` : ""}
                          {d.team ?? "-"} {d.country ? `· ${d.country}` : ""}
                          {d.twitchChannel ? ` · Twitch: ${d.twitchChannel}` : ""}
                          {activeLeagues.length
                            ? ` · Ligen: ${activeLeagues.map((l) => labelByLeague.get(l) ?? String(l)).join(", ")}`
                            : ""}
                        </div>

                        <details className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-white/70">
                            Ligen / Saisons
                          </summary>

                          <div className="mt-3 grid gap-4 md:grid-cols-3">
                            {props.leagueMeta.map((lm) => {
                              const lg = lm.league;
                              const seasonOptions = seasonsByLeague.get(lg) ?? [];
                              const teams = teamsByLeague.get(lg) ?? [];
                              const activeSeasons = d.seasons
                                .map((s) => ({ row: s, season: seasonById.get(s.seasonId) ?? null }))
                                .filter((x) => x.season?.league === lg);

                              return (
                                <div key={lg} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                                    {labelByLeague.get(lg) ?? String(lg)}
                                  </div>

                                  <form action={props.activateDriver} className="mt-2 grid gap-2">
                                    <input type="hidden" name="driverId" value={d.id} />
                                    <input type="hidden" name="role" value="MAIN" />
                                    <select
                                      name="seasonId"
                                      defaultValue=""
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
                                    >
                                      <option value="">Saison wählen…</option>
                                      {seasonOptions.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.placement === "ARCHIVE" ? "ARCHIV · " : ""}
                                          {s.isTest ? "TEST · " : ""}
                                          {s.year} · Season {s.seasonNo}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      name="teamId"
                                      defaultValue=""
                                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-white/25"
                                    >
                                      <option value="">Team (optional)</option>
                                      {teams.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                                      Aktivieren
                                    </button>
                                  </form>

                                  <div className="mt-3 space-y-2">
                                    {activeSeasons.length === 0 ? (
                                      <div className="text-xs text-white/60">Noch keine Saison aktiv.</div>
                                    ) : (
                                      activeSeasons
                                        .slice()
                                        .sort((a, b) => {
                                          const av = a.season;
                                          const bv = b.season;
                                          if (!av || !bv) return 0;
                                          if (av.year !== bv.year) return bv.year - av.year;
                                          if (av.seasonNo !== bv.seasonNo) return bv.seasonNo - av.seasonNo;
                                          return Number(av.isTest) - Number(bv.isTest);
                                        })
                                        .map((x) => {
                                          const s = x.season;
                                          if (!s) return null;
                                          return (
                                            <div key={x.row.seasonId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                                              <div className="text-xs font-semibold text-white/80">
                                                {s.placement === "ARCHIVE" ? "ARCHIV · " : ""}
                                                {s.isTest ? "TEST · " : ""}
                                                {s.year} · Season {s.seasonNo}
                                              </div>
                                              <div className="mt-1 text-xs text-white/60">
                                                {x.row.role === "RESERVE" ? "Ersatzfahrer" : "Stammfahrer"}
                                                {x.row.teamRef?.name ? ` · ${x.row.teamRef.name}` : ""}
                                              </div>
                                              <form action={props.deactivateDriver} className="mt-2">
                                                <input type="hidden" name="driverId" value={d.id} />
                                                <input type="hidden" name="seasonId" value={x.row.seasonId} />
                                                <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white">
                                                  Entfernen
                                                </button>
                                              </form>
                                            </div>
                                          );
                                        })
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
                        <Link
                          href={`/admin/settings/drivers/${d.id}`}
                          className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white"
                        >
                          Bearbeiten
                        </Link>

                        {activeLeagues.length ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {activeLeagues
                              .slice()
                              .sort((a, b) => String(a).localeCompare(String(b)))
                              .map((lg) => {
                                const slug = adminSlugByLeague.get(lg) ?? null;
                                if (!slug) return null;
                                return (
                                  <Link
                                    key={lg}
                                    href={`/admin/${slug}/drivers/${d.id}`}
                                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                                  >
                                    {labelByLeague.get(lg) ?? String(lg)}
                                  </Link>
                                );
                              })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
              In Rente ({retiredDrivers.length})
            </div>
            <div className="mt-2 space-y-2">
              {retiredDrivers.map((d) =>
                (() => {
                  const activeLeagues = Array.from(
                    new Set(
                      d.seasons
                        .map((s) => seasonById.get(s.seasonId)?.league ?? null)
                        .filter((x): x is League => Boolean(x))
                    )
                  );
                  return (
                    <div
                      key={d.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {d.number ? `#${d.number} ` : ""}
                          {d.name}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          {d.gamertag ? `${d.gamertag} · ` : ""}
                          {d.team ?? "-"} {d.country ? `· ${d.country}` : ""}
                          {d.twitchChannel ? ` · Twitch: ${d.twitchChannel}` : ""}
                          {activeLeagues.length
                            ? ` · Ligen: ${activeLeagues.map((l) => labelByLeague.get(l) ?? String(l)).join(", ")}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
                        <Link
                          href={`/admin/settings/drivers/${d.id}`}
                          className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white"
                        >
                          Bearbeiten
                        </Link>
                        {activeLeagues.length ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {activeLeagues
                              .slice()
                              .sort((a, b) => String(a).localeCompare(String(b)))
                              .map((lg) => {
                                const slug = adminSlugByLeague.get(lg) ?? null;
                                if (!slug) return null;
                                return (
                                  <Link
                                    key={lg}
                                    href={`/admin/${slug}/drivers/${d.id}`}
                                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                                  >
                                    {labelByLeague.get(lg) ?? String(lg)}
                                  </Link>
                                );
                              })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

