"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CountdownRace = {
  name: string;
  startsAt: string;
  circuit: string | null;
  location: string | null;
  season: number;
  seasonNo: number;
  round: number;
  seasonIsTest: boolean;
};

type CountdownLeague = {
  key: string;
  label: string;
  href: string;
  nextRace: CountdownRace | null;
};

function flagCodeForText(text: string) {
  const n = text.trim().toLowerCase();
  if (!n) return null;
  if (n.includes("australien") || n.includes("australia")) return "au";
  if (n.includes("japan")) return "jp";
  if (n.includes("italien") || n.includes("italy")) return "it";
  if (n.includes("usa") || n.includes("united states") || n.includes("vereinigte staaten")) return "us";
  if (n.includes("mexiko") || n.includes("mexico")) return "mx";
  if (n.includes("kanada") || n.includes("canada")) return "ca";
  if (n.includes("brasil") || n.includes("brazil")) return "br";
  if (n.includes("china")) return "cn";
  if (n.includes("bahrain")) return "bh";
  if (n.includes("saudi")) return "sa";
  if (n.includes("abu dhabi") || n.includes("vereinigte arabische emirate") || n.includes("uae")) return "ae";
  if (n.includes("katar") || n.includes("qatar")) return "qa";
  if (n.includes("singapur") || n.includes("singapore")) return "sg";
  if (n.includes("spanien") || n.includes("spain")) return "es";
  if (n.includes("frankreich") || n.includes("france")) return "fr";
  if (n.includes("monaco")) return "mc";
  if (n.includes("großbritannien") || n.includes("grossbritannien") || n.includes("britain") || n.includes("uk"))
    return "gb";
  if (n.includes("niederlande") || n.includes("netherlands") || n.includes("holland")) return "nl";
  if (n.includes("belgien") || n.includes("belgium")) return "be";
  if (n.includes("ungarn") || n.includes("hungary")) return "hu";
  if (n.includes("österreich") || n.includes("osterreich") || n.includes("austria")) return "at";
  if (n.includes("schweiz") || n.includes("switzerland")) return "ch";
  if (n.includes("schweden") || n.includes("sweden")) return "se";
  if (n.includes("finnland") || n.includes("finland")) return "fi";
  if (n.includes("norwegen") || n.includes("norway")) return "no";
  if (n.includes("dänemark") || n.includes("daenemark") || n.includes("denmark")) return "dk";
  if (n.includes("polen") || n.includes("poland")) return "pl";
  if (n.includes("tschechien") || n.includes("czech")) return "cz";
  if (n.includes("rumänien") || n.includes("rumanien") || n.includes("romania")) return "ro";
  if (n.includes("griechenland") || n.includes("greece")) return "gr";
  if (n.includes("portugal")) return "pt";
  if (n.includes("kroatien") || n.includes("croatia")) return "hr";
  if (n.includes("serbien") || n.includes("serbia")) return "rs";
  if (n.includes("irland") || n.includes("ireland")) return "ie";
  if (n.includes("island") || n.includes("iceland")) return "is";
  return null;
}

function flagCodeForRace(nextRace: CountdownRace | null) {
  const candidates = [nextRace?.location, nextRace?.circuit, nextRace?.name].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  for (const c of candidates) {
    const code = flagCodeForText(c);
    if (code) return code;
  }
  return null;
}

function flagBackgroundUrl(code: string | null) {
  if (!code) return null;
  return `https://flagcdn.com/${code}.svg`;
}

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
        const flagUrl = flagBackgroundUrl(flagCodeForRace(l.nextRace));
        let title = "";
        let place = "";
        if (l.nextRace) {
          title = `${l.nextRace.seasonIsTest ? "TEST · " : ""}Saison ${l.nextRace.season} · Season ${l.nextRace.seasonNo} · Runde ${l.nextRace.round}`;
          const rawCircuit = (l.nextRace.circuit ?? "").trim();
          const rawLocation = (l.nextRace.location ?? "").trim();
          const circuit = rawCircuit.replace(/\s*[-–—]\s*$/, "").trim();
          const location = rawLocation.replace(/\s*[-–—]\s*$/, "").trim();
          place = [circuit, location].filter(Boolean).join(" · ");
        }

        return (
          <Link
            key={l.key}
            href={l.href}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur hover:bg-black/45"
          >
            {flagUrl ? (
              <img
                src={flagUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/50 to-black/70" />
            <div className="absolute inset-y-0 left-0 w-[3px] bg-mrl-red/70" />
            <div className="relative pl-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                {l.label}
              </div>

              {l.nextRace ? (
                <div className="mt-3">
                  <div className="truncate text-base font-semibold text-white">
                    {title}
                  </div>
                  {place ? (
                    <div className="mt-1 truncate text-sm text-white/70">
                      {place}
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm text-white/70">
                    {startsAt
                      ? startsAt.toLocaleString("de-DE", {
                          timeZone: "Europe/Berlin",
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
