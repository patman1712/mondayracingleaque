"use client";

import { useMemo, useRef, useState } from "react";
import { toJpeg } from "html-to-image";

type PosterRow = {
  position: number;
  driverId: string;
  driverName: string;
  portraitUrl: string | null;
  accent: string | null;
  points: number;
  timeText: string | null;
  status: string | null;
  bestTime: string | null;
  fastestLap: boolean;
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

function heroBg(color: string | null | undefined) {
  const c = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith("#") ? color : `#${color}`) : null;
  const a = c ? hexToRgba(c, 0.55) : "rgba(255,255,255,0.10)";
  const b = c ? hexToRgba(c, 0.10) : "rgba(255,255,255,0.02)";
  return `radial-gradient(900px circle at 30% 10%, ${a}, transparent 60%), linear-gradient(180deg, ${b}, rgba(0,0,0,0.65))`;
}

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
}

function normalizeAccent(color: string | null | undefined) {
  if (!color) return null;
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
  return null;
}

function splitIntoTwoCols<T>(items: T[]) {
  const splitAt = Math.ceil(items.length / 2);
  return [items.slice(0, splitAt), items.slice(splitAt)] as const;
}

export function RaceResultsPosterExportClient({
  raceId,
  title,
  subtitle,
  rows,
  saveEnabled
}: {
  raceId: string;
  title: string;
  subtitle: string;
  rows: PosterRow[];
  saveEnabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sorted = useMemo(() => rows.slice().sort((a, b) => a.position - b.position), [rows]);
  const [left, right] = useMemo(() => splitIntoTwoCols(sorted), [sorted]);

  async function makeJpeg() {
    if (!ref.current) return null;
    return await toJpeg(ref.current, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: "#090b10"
    });
  }

  async function download() {
    setMsg(null);
    setBusy(true);
    try {
      const dataUrl = await makeJpeg();
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `rennergebnis-${raceId}.jpg`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  async function saveToServer() {
    setMsg(null);
    setBusy(true);
    try {
      const dataUrl = await makeJpeg();
      if (!dataUrl) return;

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `rennergebnis-${raceId}.jpg`, { type: "image/jpeg" });

      const fd = new FormData();
      fd.set("raceId", raceId);
      fd.set("file", file);

      const r = await fetch("/api/admin/results-poster", { method: "POST", body: fd });
      const json = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!r.ok || !json?.ok) {
        setMsg(json?.error ? `Fehler: ${json.error}` : "Fehler: Speichern fehlgeschlagen.");
        return;
      }
      setMsg(json.url ? `Gespeichert: ${json.url}` : "Gespeichert.");
    } finally {
      setBusy(false);
    }
  }

  function RowTile(r: PosterRow) {
    const accent = normalizeAccent(r.accent);
    const endOrStatus = r.status ? r.status : r.timeText ? r.timeText : "";
    const bestClass = r.fastestLap ? "text-violet-300" : "text-white/80";

    return (
      <div className="grid grid-cols-[56px_1fr_88px] gap-2">
        <div
          className="flex items-center justify-center overflow-hidden rounded-2xl border-2 bg-black/25"
          style={{ borderColor: accent ?? "rgba(255,255,255,0.15)" }}
        >
          <div className="text-xl font-extrabold text-white">{r.position}</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10" style={{ backgroundImage: heroBg(accent) }}>
          <div className="absolute inset-0 opacity-25" style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }} />
          <div className="absolute left-0 top-0 h-[4px] w-full" style={{ backgroundColor: accent ?? "#ffffff" }} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

          {r.portraitUrl ? (
            <div className="absolute inset-y-0 right-0 w-[38%] p-2">
              <div className="relative h-full w-full">
                <img
                  src={r.portraitUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain object-right object-bottom opacity-95"
                />
              </div>
            </div>
          ) : null}

          <div className="relative p-4">
            <div className="truncate text-base font-extrabold uppercase tracking-wide text-white">
              {r.driverName}
            </div>
            <div className="mt-2 text-base font-extrabold text-white">
              {endOrStatus}
            </div>
            {r.bestTime ? (
              <div className={"mt-2 text-sm font-semibold " + bestClass}>
                Best Lap {r.bestTime}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="flex items-center justify-end overflow-hidden rounded-2xl border-2 bg-black/25 px-3 py-2 text-right"
          style={{ borderColor: accent ?? "rgba(255,255,255,0.15)" }}
        >
          <div>
            <div className="text-xl font-extrabold text-white">{r.points.toFixed(0)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">PTS</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">Ergebnis als JPG</div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={download}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            JPG herunterladen
          </button>
          {saveEnabled ? (
            <button
              disabled={busy}
              onClick={saveToServer}
              className="rounded-lg bg-mrl-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Im System speichern
            </button>
          ) : null}
        </div>
      </div>
      {msg ? <div className="mt-2 text-xs text-white/70">{msg}</div> : null}

      <details className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#090b10]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white">
          Vorschau anzeigen
          <div className="mt-1 text-xs font-normal text-white/60">1080×1080</div>
        </summary>
        <div className="border-t border-white/10">
          <div
            ref={ref}
            className="w-[1080px] bg-[#090b10] p-10 text-white"
            style={{ fontFamily: "inherit" }}
          >
            <div className="text-center">
              <div className="text-4xl font-extrabold tracking-wide">{title}</div>
              <div className="mt-2 text-sm font-semibold uppercase tracking-wider text-white/70">{subtitle}</div>
            </div>

            <div className="mt-10 grid gap-8">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="grid gap-3">{left.map((r) => <RowTile key={r.driverId} {...r} />)}</div>
                <div className="grid gap-3">{right.map((r) => <RowTile key={r.driverId} {...r} />)}</div>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
