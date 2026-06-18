"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type DriverItem = {
  driverId: string;
  name: string;
  teamName: string | null;
};

type ExistingResult = {
  driverId: string;
  position: number;
  bestTime: string | null;
  timeText: string | null;
  finishTimeMs: number | null;
  penaltySeconds: number;
  status: string | null;
  fastestLap: boolean;
};

type Row = {
  id: string;
  driverId: string;
  name: string;
  teamName: string | null;
  bestTime: string;
  endTime: string;
  status: string;
  fastestLap: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function formatRaceTimeMs(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  return `${minutes}:${pad2(seconds)}.${pad3(milli)}`;
}

function parseRaceTimeMs(s: string) {
  const raw = s.trim();
  const h = raw.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (h) {
    const hours = Number(h[1]);
    const min = Number(h[2]);
    const sec = Number(h[3]);
    const ms = Number(h[4]);
    if (!Number.isFinite(hours) || !Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return ((hours * 3600 + min * 60 + sec) * 1000) + ms;
  }
  const m = raw.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

function parseGapMs(s: string) {
  const raw = s.trim();
  if (!raw.startsWith("+")) return null;
  const t = raw.slice(1);
  const m1 = t.match(/^(\d+)\.(\d{3})$/);
  if (m1) {
    const sec = Number(m1[1]);
    const ms = Number(m1[2]);
    if (!Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return sec * 1000 + ms;
  }
  const h = t.match(/^(\d+):(\d{2}):(\d{2})\.(\d{3})$/);
  if (h) {
    const hours = Number(h[1]);
    const min = Number(h[2]);
    const sec = Number(h[3]);
    const ms = Number(h[4]);
    if (!Number.isFinite(hours) || !Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return ((hours * 3600 + min * 60 + sec) * 1000) + ms;
  }
  const m2 = t.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!m2) return null;
  const min = Number(m2[1]);
  const sec = Number(m2[2]);
  const ms = Number(m2[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

function formatGapMs(ms: number) {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  if (minutes > 0) return `+${minutes}:${pad2(seconds)}.${pad3(milli)}`;
  return `+${seconds}.${pad3(milli)}`;
}

function toInitialRows(drivers: DriverItem[], existing: ExistingResult[]) {
  const byDriverId = new Map(existing.map((r) => [r.driverId, r] as const));
  const withPos: Array<{ driver: DriverItem; pos: number }> = [];
  const withoutPos: DriverItem[] = [];

  for (const d of drivers) {
    const r = byDriverId.get(d.driverId) ?? null;
    if (r && Number.isFinite(r.position) && r.position >= 1 && r.position <= 60) {
      withPos.push({ driver: d, pos: r.position });
    } else {
      withoutPos.push(d);
    }
  }

  withPos.sort((a, b) => a.pos - b.pos);

  const ordered = [...withPos.map((x) => x.driver), ...withoutPos];

  const baseMs =
    existing
      .map((r) => {
        const pen = typeof r.penaltySeconds === "number" && r.penaltySeconds > 0 ? r.penaltySeconds : 0;
        if (typeof r.finishTimeMs === "number" && Number.isFinite(r.finishTimeMs)) return r.finishTimeMs + pen * 1000;
        const tt = (r.timeText ?? "").trim();
        if (!tt || tt.startsWith("+")) return null;
        const parsed = parseRaceTimeMs(tt);
        return typeof parsed === "number" ? parsed : null;
      })
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b)[0] ?? null;

  const rows: Row[] = ordered.map((d) => {
    const r = byDriverId.get(d.driverId) ?? null;
    const endTime = (() => {
      const status = (r?.status ?? "").trim().toUpperCase();
      if (status && ["DNF", "DSQ", "DNS", "RET"].includes(status)) return "";
      const baseText = (r?.timeText ?? "").trim();
      if (baseText && ["DNF", "DSQ", "DNS", "RET"].includes(baseText.toUpperCase())) return "";
      const pen = typeof r?.penaltySeconds === "number" && r.penaltySeconds > 0 ? r.penaltySeconds : 0;
      if (r && typeof r.finishTimeMs === "number" && Number.isFinite(r.finishTimeMs)) {
        return formatRaceTimeMs(r.finishTimeMs + pen * 1000);
      }
      if (baseText && !baseText.startsWith("+")) {
        const parsed = parseRaceTimeMs(baseText);
        return typeof parsed === "number" ? formatRaceTimeMs(parsed) : baseText;
      }
      if (baseText.startsWith("+") && typeof baseMs === "number") {
        const gap = parseGapMs(baseText);
        return typeof gap === "number" ? formatRaceTimeMs(baseMs + gap) : "";
      }
      return "";
    })();
    return {
      id: d.driverId,
      driverId: d.driverId,
      name: d.name,
      teamName: d.teamName,
      bestTime: r?.bestTime ?? "",
      endTime,
      status: r?.status ?? "",
      fastestLap: Boolean(r?.fastestLap)
    };
  });

  const anyFastest = rows.some((r) => r.fastestLap);
  if (!anyFastest && rows.length) {
    for (const r of rows) r.fastestLap = false;
  } else if (anyFastest) {
    let seen = false;
    for (const r of rows) {
      if (r.fastestLap && !seen) {
        seen = true;
        continue;
      }
      if (seen) r.fastestLap = false;
    }
  }

  return rows;
}

export function RaceResultsBulkEditorClient({
  drivers,
  existingResults,
  action,
  actionLabel
}: {
  drivers: DriverItem[];
  existingResults: ExistingResult[];
  action: (formData: FormData) => void | Promise<void>;
  actionLabel?: string;
}) {
  const initial = useMemo(() => toInitialRows(drivers, existingResults), [drivers, existingResults]);
  const [rows, setRows] = useState<Row[]>(initial);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const driverNameById = useMemo(() => new Map(drivers.map((d) => [d.driverId, d.name] as const)), [drivers]);
  const penalties = useMemo(() => {
    return existingResults
      .filter((r) => typeof r.penaltySeconds === "number" && r.penaltySeconds > 0)
      .map((r) => ({
        driverId: r.driverId,
        name: driverNameById.get(r.driverId) ?? r.driverId,
        penaltySeconds: r.penaltySeconds
      }))
      .sort((a, b) => b.penaltySeconds - a.penaltySeconds || a.name.localeCompare(b.name, "de-DE"));
  }, [existingResults, driverNameById]);

  const payload = useMemo(() => {
    const out = rows
      .map((r, idx) => ({
        driverId: r.driverId,
        position: idx + 1,
        bestTime: r.bestTime.trim() || null,
        timeText: r.endTime.trim() || null,
        status: r.status.trim() || null,
        fastestLap: Boolean(r.fastestLap)
      }))
      .filter((r) => Boolean(r.driverId));
    return JSON.stringify(out);
  }, [rows]);

  function move(from: number, to: number) {
    setRows((prev) => {
      if (from === to) return prev;
      const next = prev.slice();
      const item = next[from];
      if (!item) return prev;
      next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function onDragStart(e: DragEvent, idx: number) {
    e.dataTransfer.setData("text/plain", String(idx));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e: DragEvent, idx: number) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const from = Number(raw);
    if (!Number.isFinite(from)) return;
    const fromIdx = Math.floor(from);
    if (fromIdx < 0 || fromIdx >= rows.length) return;
    move(fromIdx, idx);
  }

  function setFastest(driverId: string) {
    setRows((prev) => prev.map((r) => ({ ...r, fastestLap: r.driverId === driverId })));
  }

  function updateRow(driverId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.driverId === driverId ? { ...r, ...patch } : r)));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-semibold text-white">Schnell-Eingabe</div>
      <div className="mt-1 text-xs text-white/60">
        Reihenfolge per Drag & Drop = Position. Endzeit + Bestzeit eintragen. Strafen nur über „Stewards (Strafen)“.
      </div>
      {penalties.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {penalties.map((p) => (
            <div
              key={p.driverId}
              className="rounded-lg border border-red-500/35 bg-red-500/15 px-2 py-1 text-xs font-extrabold text-red-300"
            >
              {p.name} +{p.penaltySeconds}s
            </div>
          ))}
        </div>
      ) : null}

      <form className="mt-4 space-y-3" action={action}>
        <textarea name="bulkJson" className="hidden" readOnly value={payload} />

        <div className="grid gap-2">
          {rows.map((r, idx) => (
            <div
              key={r.id}
              id={`result-${r.driverId}`}
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, idx)}
              className="grid grid-cols-[56px_minmax(260px,1fr)_160px_130px_160px_130px_60px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="text-xs font-semibold text-white/70">P{idx + 1}</div>

              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{r.name}</div>
                <div className="truncate text-xs text-white/60">{r.teamName ?? ""}</div>
              </div>

              <input
                value={r.endTime}
                onChange={(e) => updateRow(r.driverId, { endTime: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-white/90 outline-none focus:border-white/25"
                placeholder="Endzeit"
              />

              <input
                value={(() => {
                  const status = (r.status ?? "").trim().toUpperCase();
                  if (status && ["DNF", "DSQ", "DNS", "RET"].includes(status)) return "";
                  const winnerMs =
                    parseRaceTimeMs((rows[0]?.endTime ?? "").trim()) ??
                    rows
                      .map((x) => parseRaceTimeMs((x.endTime ?? "").trim()))
                      .filter((x): x is number => typeof x === "number")
                      .sort((a, b) => a - b)[0] ??
                    null;
                  const ms = parseRaceTimeMs((r.endTime ?? "").trim());
                  if (idx === 0) return "";
                  if (typeof ms === "number" && typeof winnerMs === "number") return formatGapMs(ms - winnerMs);
                  return "";
                })()}
                readOnly
                className="w-full rounded-lg border border-white/10 bg-black/15 px-2 py-2 text-xs text-white/70 outline-none"
                placeholder="Gap"
              />

              <input
                value={r.bestTime}
                onChange={(e) => updateRow(r.driverId, { bestTime: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-white/90 outline-none focus:border-white/25"
                placeholder="Bestzeit"
              />

              <select
                value={r.status}
                onChange={(e) => updateRow(r.driverId, { status: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-white/90 outline-none focus:border-white/25"
              >
                <option value="">(Status)</option>
                <option value="DNF">DNF</option>
                <option value="DSQ">DSQ</option>
                <option value="DNS">DNS</option>
                <option value="RET">RET</option>
              </select>

              <label className="flex items-center justify-end gap-2 text-xs text-white/80">
                <input
                  type="radio"
                  name="fastest"
                  checked={r.fastestLap}
                  onChange={() => setFastest(r.driverId)}
                  className="h-4 w-4"
                />
                FL
              </label>

              <div className="col-span-7 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => move(idx, Math.max(0, idx - 1))}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, Math.min(rows.length - 1, idx + 1))}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15"
                >
                  ↓
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" name="replace" className="h-4 w-4" /> Vorhandene Ergebnisse ersetzen
          </label>
          <FormSubmitButton
            className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white"
            pendingText="Speichern…"
          >
            {actionLabel ?? "Alle speichern"}
          </FormSubmitButton>
        </div>
      </form>
    </div>
  );
}
