"use client";

import { useMemo, useState, useTransition } from "react";

export function RaceResultsPenaltiesEditorClient({
  results,
  action
}: {
  results: Array<{ driverId: string; driverName: string; penaltySeconds: number }>;
  action: (formData: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(() =>
    new Map(results.map((r) => [r.driverId, r.penaltySeconds] as const))
  );

  const payload = useMemo(() => {
    return results.map((r) => ({
      driverId: r.driverId,
      penaltySeconds: values.get(r.driverId) ?? 0
    }));
  }, [results, values]);

  const hasAnyPenalty = useMemo(() => {
    for (const r of results) {
      if ((values.get(r.driverId) ?? 0) > 0) return true;
    }
    return false;
  }, [results, values]);

  return (
    <form
      action={() => {
        const next = new FormData();
        next.set("penaltiesJson", JSON.stringify(payload));
        startTransition(() => action(next));
      }}
      className="mt-4"
    >
      <div className="grid gap-2">
        {results.map((r) => {
          const v = values.get(r.driverId) ?? 0;
          const hasPenalty = v > 0;

          return (
            <div
              key={r.driverId}
              className="grid grid-cols-[1fr_168px_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
            <div className="min-w-0 truncate text-sm font-semibold text-white">
              {r.driverName}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={v}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setValues((m) => {
                    const next = new Map(m);
                    next.set(r.driverId, Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
                    return next;
                  });
                }}
                className={
                  "w-full rounded-lg border bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25 " +
                  (hasPenalty ? "border-red-500/35" : "border-white/10")
                }
              />
              <div className="text-xs font-semibold text-white/60">s</div>
            </div>
            <button
              type="button"
              disabled={isPending || !hasPenalty}
              onClick={() => {
                setValues((m) => {
                  const next = new Map(m);
                  next.set(r.driverId, 0);
                  return next;
                });
              }}
              className="w-fit rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white disabled:opacity-40"
            >
              Löschen
            </button>
          </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
        >
          {isPending ? "Anwenden…" : "Strafen anwenden"}
        </button>
        <button
          type="button"
          disabled={isPending || !hasAnyPenalty}
          onClick={() => {
            const cleared = results.map((r) => ({ driverId: r.driverId, penaltySeconds: 0 }));
            setValues(new Map(results.map((r) => [r.driverId, 0] as const)));
            const next = new FormData();
            next.set("penaltiesJson", JSON.stringify(cleared));
            startTransition(() => action(next));
          }}
          className="w-fit rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-50"
        >
          Alle löschen
        </button>
      </div>
    </form>
  );
}
