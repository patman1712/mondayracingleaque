"use client";

import { useMemo, useState } from "react";

type DriverOption = { id: string; name: string; active: boolean; role: "MAIN" | "RESERVE"; teamName?: string | null };

export function RaceDriverField({
  name,
  drivers,
  defaultDriverId
}: {
  name: string;
  drivers: DriverOption[];
  defaultDriverId?: string | null;
}) {
  const [driverId, setDriverId] = useState(defaultDriverId ?? "");
  const byId = useMemo(() => new Map(drivers.map((d) => [d.id, d] as const)), [drivers]);
  const current = driverId ? byId.get(driverId) ?? null : null;

  const ordered = useMemo(() => {
    const list = [...drivers];
    list.sort((a, b) => {
      const ap = a.active ? 0 : 1;
      const bp = b.active ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [drivers]);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={driverId} />

      <div className="grid gap-2 md:grid-cols-3">
        {ordered.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDriverId(d.id)}
            className={
              "rounded-lg border px-3 py-2 text-left text-sm font-semibold " +
              (driverId === d.id
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
            }
          >
            <div className="truncate">{d.name}</div>
            <div className="mt-1 truncate text-xs font-semibold text-white/55">
              {d.role === "RESERVE" ? "Ersatzfahrer" : "Stammfahrer"}
              {d.teamName ? ` · ${d.teamName}` : ""}
            </div>
          </button>
        ))}
      </div>

      <div className="text-xs text-white/60">
        Auswahl: {current ? current.name : "-"}
      </div>
    </div>
  );
}

