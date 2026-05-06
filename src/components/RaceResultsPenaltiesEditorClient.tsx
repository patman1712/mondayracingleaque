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
        {results.map((r) => (
          <div
            key={r.driverId}
            className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          >
            <div className="min-w-0 truncate text-sm font-semibold text-white">
              {r.driverName}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={values.get(r.driverId) ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setValues((m) => {
                    const next = new Map(m);
                    next.set(r.driverId, Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
                    return next;
                  });
                }}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
              />
              <div className="text-xs font-semibold text-white/60">s</div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 w-fit rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
      >
        {isPending ? "Anwenden…" : "Strafen anwenden"}
      </button>
    </form>
  );
}
