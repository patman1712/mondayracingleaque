"use client";

import { useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type DriverRef = { id: string; name: string; gamertag: string | null };

type CsvRow = {
  position: number;
  driverName: string;
  driverId: string;
  grid: string;
  stops: string;
  bestTime: string;
  timeText: string;
  status: string;
  points: string;
  fastestLap: boolean;
  matchLabel: string;
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array(bl + 1);
  const v1 = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) v0[j] = j;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

function parseLine(line: string, delim: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(line: string) {
  const commas = (line.match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function headerKey(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
    .replace(/[\s_]+/g, "");
}

function isTruthy(s: string) {
  const v = s.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y" || v === "x";
}

function parseLapMs(s: string) {
  const t = s.trim();
  const m = t.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  const ms = Number(m[3]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || !Number.isFinite(ms)) return null;
  return (min * 60 + sec) * 1000 + ms;
}

function buildDriverIndex(drivers: DriverRef[]) {
  const exact = new Map<string, string>();
  for (const d of drivers) {
    exact.set(normalize(d.name), d.id);
    if (d.gamertag) exact.set(normalize(d.gamertag), d.id);
  }
  return exact;
}

function bestMatchId(name: string, drivers: DriverRef[]) {
  const n = normalize(name);
  if (!n) return { id: "", label: "" };

  let best: { id: string; dist: number; label: string } | null = null;
  for (const d of drivers) {
    const a = normalize(d.name);
    const da = levenshtein(n, a);
    if (!best || da < best.dist) best = { id: d.id, dist: da, label: d.name };
    if (d.gamertag) {
      const g = normalize(d.gamertag);
      const dg = levenshtein(n, g);
      if (!best || dg < best.dist) best = { id: d.id, dist: dg, label: d.gamertag };
    }
  }
  if (!best) return { id: "", label: "" };
  const limit = Math.max(2, Math.floor(n.length * 0.2));
  if (best.dist <= limit) return { id: best.id, label: `Fuzzy (${best.label})` };
  return { id: "", label: "" };
}

function parseCsv(text: string) {
  const lines = text
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [] as Array<Record<string, string>>, headers: [] as string[] };

  const delim = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delim);
  const keys = headers.map(headerKey);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], delim);
    const obj: Record<string, string> = {};
    for (let j = 0; j < keys.length; j++) obj[keys[j]] = (cols[j] ?? "").trim();
    rows.push(obj);
  }
  return { rows, headers: keys };
}

function mapRow(obj: Record<string, string>) {
  const get = (...names: string[]) => {
    for (const n of names) {
      if (obj[n] != null && obj[n].trim() !== "") return obj[n].trim();
    }
    return "";
  };

  const posRaw = get("pos", "position", "p", "rank", "place");
  const position = Number(posRaw.replace(/[^\d]+/g, ""));

  return {
    position: Number.isFinite(position) ? Math.floor(position) : NaN,
    driverName: get("driver", "name", "gamertag", "player", "user"),
    grid: get("grid", "start", "startpos", "gridposition"),
    stops: get("stops", "pitstops", "pits"),
    bestTime: get("best", "bestlap", "besttime", "bestlaptime"),
    timeText: get("time", "totaltime", "racetime", "result", "gap"),
    status: get("status", "resultstatus"),
    points: get("pts", "points"),
    fastest: get("fl", "fastestlap", "fastest")
  };
}

export function RaceResultsCsvImportClient({
  drivers,
  existingDraftJson,
  action
}: {
  drivers: DriverRef[];
  existingDraftJson: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<CsvRow[]>(() => {
    if (!existingDraftJson) return [];
    try {
      const v = JSON.parse(existingDraftJson) as unknown;
      if (!Array.isArray(v)) return [];
      const out: CsvRow[] = v
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const o = r as Record<string, unknown>;
          const position = Number(o.position ?? "");
          const driverName = String(o.driverName ?? "").trim();
          return {
            position: Number.isFinite(position) ? Math.floor(position) : NaN,
            driverName,
            driverId: String(o.driverId ?? "").trim(),
            grid: String(o.grid ?? "").trim(),
            stops: String(o.stops ?? "").trim(),
            bestTime: String(o.bestTime ?? "").trim(),
            timeText: String(o.timeText ?? "").trim(),
            status: String(o.status ?? "").trim(),
            points: String(o.points ?? "").trim(),
            fastestLap: Boolean(o.fastestLap),
            matchLabel: driverName && String(o.driverId ?? "").trim() ? "Zuordnung gespeichert" : ""
          };
        })
        .filter((x): x is CsvRow => Boolean(x));
      return out;
    } catch {
      return [];
    }
  });
  const [parseError, setParseError] = useState<string | null>(null);

  const payload = useMemo(() => {
    const out = rows
      .filter((r) => Number.isFinite(r.position) && r.position >= 1 && r.position <= 60)
      .map((r) => ({
        position: r.position,
        driverName: r.driverName.trim(),
        driverId: r.driverId.trim() || null,
        grid: r.grid.trim() || null,
        stops: r.stops.trim() || null,
        bestTime: r.bestTime.trim() || null,
        timeText: r.timeText.trim() || null,
        status: r.status.trim() || null,
        points: r.points.trim() || null,
        fastestLap: Boolean(r.fastestLap)
      }));
    return JSON.stringify(out);
  }, [rows]);

  const matchedCount = useMemo(() => rows.filter((r) => Boolean(r.driverId)).length, [rows]);
  const unmatchedCount = useMemo(() => rows.filter((r) => !r.driverId).length, [rows]);

  const driverIndex = useMemo(() => buildDriverIndex(drivers), [drivers]);

  function updateRow(position: number, patch: Partial<CsvRow>) {
    setRows((prev) => prev.map((r) => (r.position === position ? { ...r, ...patch } : r)));
  }

  async function onFile(file: File) {
    setParseError(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    const mapped = parsed.rows.map(mapRow).filter((r) => Number.isFinite(r.position) && r.position >= 1 && r.position <= 60);
    if (mapped.length === 0) {
      setRows([]);
      setParseError("CSV konnte nicht gelesen werden (keine Zeilen). Prüfe Header-Spalten: POS/DRIVER/TIME/BEST …");
      return;
    }

    const out: CsvRow[] = mapped
      .map((r) => {
        const exact = driverIndex.get(normalize(r.driverName)) ?? "";
        const fuzzy = !exact ? bestMatchId(r.driverName, drivers) : { id: "", label: "" };
        const driverId = exact || fuzzy.id || "";
        const matchLabel = exact ? "Gefunden" : fuzzy.id ? fuzzy.label : "Nicht gefunden";
        return {
          position: r.position,
          driverName: r.driverName,
          driverId,
          grid: r.grid,
          stops: r.stops,
          bestTime: r.bestTime,
          timeText: r.timeText,
          status: r.status,
          points: r.points,
          fastestLap: isTruthy(r.fastest) ? true : false,
          matchLabel
        };
      })
      .sort((a, b) => a.position - b.position);

    const anyFlag = out.some((r) => r.fastestLap);
    if (!anyFlag) {
      const best = out
        .map((r) => ({ pos: r.position, ms: parseLapMs(r.bestTime) }))
        .filter((x): x is { pos: number; ms: number } => typeof x.ms === "number")
        .sort((a, b) => a.ms - b.ms)[0];
      if (best) {
        for (const r of out) r.fastestLap = r.position === best.pos;
      }
    } else {
      let seen = false;
      for (const r of out) {
        if (r.fastestLap && !seen) {
          seen = true;
        } else {
          r.fastestLap = false;
        }
      }
    }

    setRows(out);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-semibold text-white">CSV importieren</div>
      <div className="mt-1 text-xs text-white/60">
        CSV einlesen, automatisch matchen, dann importieren. Nicht gefundene Fahrer bleiben als Entwurf und können später zugeordnet werden.
      </div>

      {drivers.length === 0 ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/80">
          Bitte zuerst im Fahrerfeld Fahrer auf „Nimmt teil“ setzen, damit CSV-Zuordnung möglich ist.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) void onFile(f);
            }}
            disabled={drivers.length === 0}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />
        </div>
      </div>

      {parseError ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white/80">
          {parseError}
        </div>
      ) : null}

      {rows.length ? (
        <form action={action} className="mt-4 space-y-3">
          <textarea name="csvJson" className="hidden" readOnly value={payload} />
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" name="replace" className="h-4 w-4" /> Vorhandene Ergebnisse ersetzen
          </label>

          <div className="text-xs text-white/70">
            Matches: <span className="font-semibold text-white">{matchedCount}</span> · Nicht gefunden:{" "}
            <span className="font-semibold text-white">{unmatchedCount}</span>
          </div>

          <div className="grid gap-2">
            {rows.map((r) => (
              <div
                key={r.position}
                className="grid grid-cols-[56px_1fr_240px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="text-xs font-semibold text-white/70">P{r.position}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{r.driverName}</div>
                  <div className="truncate text-xs text-white/60">
                    {r.matchLabel === "Nicht gefunden" ? (
                      <span className="text-red-200">Nicht gefunden</span>
                    ) : (
                      <span className="text-emerald-200">{r.matchLabel}</span>
                    )}
                  </div>
                </div>
                <select
                  value={r.driverId}
                  onChange={(e) =>
                    updateRow(r.position, {
                      driverId: e.target.value,
                      matchLabel: e.target.value ? "Manuell zugeordnet" : "Nicht gefunden"
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/90 outline-none focus:border-white/25"
                >
                  <option value="">(Fahrer zuordnen)</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.gamertag ? ` · ${d.gamertag}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <FormSubmitButton
              className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white"
              pendingText="Importiere…"
            >
              Importieren & speichern
            </FormSubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
