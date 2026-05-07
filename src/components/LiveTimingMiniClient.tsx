"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Entry = {
  position: number;
  driver: string;
  team: string;
  lap: number;
  gap: string;
  lastLap: string;
  bestLap?: string | null;
  currentLap?: string | null;
  sector1?: string | null;
  sector2?: string | null;
  sector3?: string | null;
  sector1Color?: string | null;
  sector2Color?: string | null;
  sector3Color?: string | null;
  drs?: boolean | null;
  tyre?: string | null;
  penalties?: string;
  accent?: string | null;
  portraitUrl?: string | null;
};

type LiveTimingAlert = {
  id: string;
  type: "fastest_lap" | "fastest_sector" | "safety_car" | "vsc" | "red_flag" | "green_flag";
  title: string;
  message: string;
  driver?: string;
  sector?: number;
  createdAt: number;
};

type State = {
  ok: boolean;
  sessionId: string;
  sessionName?: string | null;
  sessionTimeLeft?: string | null;
  totalLaps?: number | null;
  currentLap?: number | null;
  lapsRemaining?: number | null;
  trackStatus?: string | null;
  updatedAtMs: number;
  alerts?: LiveTimingAlert[];
  entries: Entry[];
};

function tyreStyle(tyre: string | null | undefined) {
  const t = (tyre ?? "").trim().toLowerCase();
  if (t === "soft") return { label: "S", cls: "border-red-400/60 bg-red-500/15 text-red-100" };
  if (t === "medium") return { label: "M", cls: "border-amber-300/60 bg-amber-500/15 text-amber-100" };
  if (t === "hard") return { label: "H", cls: "border-white/25 bg-white/5 text-white/90" };
  if (t === "inter" || t === "intermediate") return { label: "I", cls: "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" };
  if (t === "wet") return { label: "W", cls: "border-sky-400/60 bg-sky-500/15 text-sky-100" };
  const raw = (tyre ?? "").trim();
  return { label: raw ? raw.slice(0, 3).toUpperCase() : "—", cls: "border-white/10 bg-black/25 text-white/80" };
}

function sectorClass(color: string | null | undefined) {
  const c = (color ?? "").trim().toLowerCase();
  if (c === "purple") return "border-violet-400/60 bg-violet-500/20 text-violet-100";
  if (c === "green") return "border-emerald-400/60 bg-emerald-500/20 text-emerald-100";
  if (c === "yellow") return "border-amber-400/60 bg-amber-500/20 text-amber-100";
  return "border-white/10 bg-black/25 text-white/85";
}

function sessionModeByName(sessionName: string) {
  const n = sessionName.trim().toLowerCase();
  const isRaceByName = n.includes(" race") || n.startsWith("race") || n.includes("grand prix") || n.includes("sprint");
  if (isRaceByName) return "race" as const;
  const isPracticeOrQualiByName =
    n.includes("practice") ||
    n.includes("qualifying") ||
    n.includes("q1") ||
    n.includes("q2") ||
    n.includes("q3") ||
    n.includes("time trial");
  if (isPracticeOrQualiByName) return "practice" as const;
  return "race" as const;
}

export function LiveTimingMiniClient({
  startsAtMs,
  disabled,
  title = "Live Timing",
  maxRows = 6,
  className
}: {
  startsAtMs: number;
  disabled?: boolean;
  title?: string;
  maxRows?: number;
  className?: string;
}) {
  const [data, setData] = useState<State | null>(null);

  const enabled = useMemo(() => {
    if (disabled) return false;
    if (!Number.isFinite(startsAtMs)) return false;
    const now = Date.now();
    const open = startsAtMs - 30 * 60 * 1000;
    const close = startsAtMs + 3 * 60 * 60 * 1000;
    return now >= open && now <= close;
  }, [disabled, startsAtMs]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let t: number | null = null;
    let lastSeenUpdatedAt = 0;

    async function poll() {
      try {
        const r = await fetch("/api/live-timing", { cache: "no-store" });
        const j = (await r.json()) as State;
        if (cancelled) return;
        const nextUpdatedAt = typeof j?.updatedAtMs === "number" ? j.updatedAtMs : 0;
        if (nextUpdatedAt && nextUpdatedAt === lastSeenUpdatedAt) return;
        lastSeenUpdatedAt = nextUpdatedAt;
        setData(j);
      } catch {
      } finally {
        if (cancelled) return;
        t = window.setTimeout(poll, 1000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, [enabled]);

  const now = Date.now();
  const last = data?.updatedAtMs ?? 0;
  const isLive = Boolean(last && now - last <= 2000);
  const rows = (data?.entries ?? []).slice().sort((a, b) => a.position - b.position).slice(0, Math.max(1, maxRows));
  const hasLiveData = isLive && rows.length > 0;
  if (!enabled || !hasLiveData) return null;

  const sessionName = (data?.sessionName ?? "").toString().trim();
  const mode = sessionModeByName(sessionName);
  const left = typeof data?.sessionTimeLeft === "string" ? data.sessionTimeLeft.trim() : "";
  const track = typeof data?.trackStatus === "string" ? data.trackStatus.trim() : "";

  return (
    <div
      className={[
        "w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur",
        className ?? ""
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-extrabold uppercase tracking-wider text-white/85">
            {title}
            {sessionName ? ` · ${sessionName}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-white/60">
            {left ? <span>LEFT {left}</span> : null}
            {track ? <span>TRACK {track}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-mrl-red/35 bg-mrl-red/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-mrl-red" />
          LIVE
        </div>
      </div>

      <div className="divide-y divide-white/10">
        {rows.map((r) => {
          const tyre = tyreStyle(r.tyre);
          const accent = (r.accent ?? "").toString().trim() || "#E10600";
          const penalty = (r.penalties ?? "").trim();
          const isDrs = Boolean(r.drs);
          return (
            <div key={`${r.position}-${r.driver}`} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/35 text-sm font-extrabold text-white">
                  {r.position}
                </div>
                {r.portraitUrl ? (
                  <Image
                    src={r.portraitUrl}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-xl bg-black/25" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 truncate text-sm font-extrabold uppercase tracking-wide text-white">
                      {r.driver}
                    </div>
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                  </div>
                  <div className="mt-1 truncate text-[11px] font-semibold text-white/60">{r.team}</div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider", tyre.cls].join(" ")}>
                    {tyre.label}
                  </div>
                  <div className="text-xs font-extrabold text-white/90">{r.gap}</div>
                </div>
              </div>

              {mode === "practice" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                    CUR {(r.currentLap ?? r.lastLap ?? "—").toString().trim() || "—"}
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                    BEST {(r.bestLap ?? "—").toString().trim() || "—"}
                  </div>
                  <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector1Color)].join(" ")}>
                    {r.sector1?.trim() ? r.sector1 : "—"}
                  </div>
                  <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector2Color)].join(" ")}>
                    {r.sector2?.trim() ? r.sector2 : "—"}
                  </div>
                  <div className={["inline-flex min-w-[54px] justify-center rounded-full border px-2 py-0.5 text-[10px] font-extrabold", sectorClass(r.sector3Color)].join(" ")}>
                    {r.sector3?.trim() ? r.sector3 : "—"}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                    LAP {r.lap}
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                    LAST {(r.lastLap ?? "—").toString().trim() || "—"}
                  </div>
                  {penalty ? (
                    <div className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                      PEN {penalty}
                    </div>
                  ) : null}
                  {isDrs ? (
                    <div className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">
                      DRS
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data?.alerts?.length ? (
        <div className="border-t border-white/10 px-4 py-2 text-[11px] font-semibold text-white/60">
          Alerts: {data.alerts.length}
        </div>
      ) : null}
    </div>
  );
}
