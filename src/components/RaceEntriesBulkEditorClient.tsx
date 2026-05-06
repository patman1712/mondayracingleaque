"use client";

import { useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/FormSubmitButton";

type Team = { id: string; name: string };

type DriverRow = {
  driverId: string;
  name: string;
  role: "MAIN" | "RESERVE";
  teamName: string | null;
  participates: boolean;
  teamId: string | null;
};

type RowState = {
  participates: boolean;
  teamId: string;
};

export function RaceEntriesBulkEditorClient({
  drivers,
  teams,
  action,
  resultsPageHref
}: {
  drivers: DriverRow[];
  teams: Team[];
  action: (formData: FormData) => void | Promise<void>;
  resultsPageHref?: string;
}) {
  const initial = useMemo(() => {
    const m = new Map<string, RowState>();
    for (const d of drivers) {
      m.set(d.driverId, { participates: Boolean(d.participates), teamId: d.teamId ?? "" });
    }
    return m;
  }, [drivers]);

  const [state, setState] = useState<Map<string, RowState>>(initial);

  const payload = useMemo(() => {
    const out = drivers.map((d) => {
      const s = state.get(d.driverId) ?? { participates: false, teamId: "" };
      const participates = Boolean(s.participates);
      const teamId = d.role === "RESERVE" && participates ? (s.teamId.trim() || null) : null;
      return { driverId: d.driverId, participates, teamId };
    });
    return JSON.stringify(out);
  }, [drivers, state]);

  function toggle(driverId: string) {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(driverId) ?? { participates: false, teamId: "" };
      const participates = !cur.participates;
      next.set(driverId, { ...cur, participates, teamId: participates ? cur.teamId : "" });
      return next;
    });
  }

  function setTeam(driverId: string, teamId: string) {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(driverId) ?? { participates: false, teamId: "" };
      next.set(driverId, { ...cur, teamId });
      return next;
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-semibold text-white">Fahrerfeld</div>
      <div className="mt-1 text-xs text-white/60">
        Mehrere Fahrer anklicken, dann unten einmal speichern. Bei Ersatzfahrern kannst du Team nur für dieses Rennen setzen.
      </div>

      <form action={action} className="mt-4 space-y-3">
        <textarea name="entriesJson" className="hidden" readOnly value={payload} />

        <div className="grid gap-2">
          {drivers.map((d) => {
            const s = state.get(d.driverId) ?? { participates: false, teamId: "" };
            const participates = Boolean(s.participates);
            const reserve = d.role === "RESERVE";
            const resultHref = resultsPageHref
              ? participates
                ? `${resultsPageHref}#result-${d.driverId}`
                : `${resultsPageHref}#manual-results`
              : participates
                ? `#result-${d.driverId}`
                : "#manual-results";
            return (
              <div
                key={d.driverId}
                className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">
                    <a href={resultHref} className="hover:underline">
                      {d.name}
                    </a>
                    <span className="text-white/60"> · {reserve ? "Ersatzfahrer" : "Stammfahrer"}</span>
                    {d.teamName ? <span className="text-white/60"> · {d.teamName}</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(d.driverId)}
                    className={
                      "rounded-lg px-3 py-2 text-xs font-semibold " +
                      (participates ? "bg-mrl-red text-white" : "bg-white/10 text-white hover:bg-white/15")
                    }
                  >
                    {participates ? "Nimmt teil" : "Nimmt nicht teil"}
                  </button>

                  {reserve ? (
                    <select
                      value={s.teamId}
                      onChange={(e) => setTeam(d.driverId, e.target.value)}
                      disabled={!participates}
                      className="w-[220px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/90 outline-none focus:border-white/25 disabled:opacity-50"
                    >
                      <option value="">(kein Team)</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end">
          <FormSubmitButton className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white" pendingText="Speichern…">
            Fahrerfeld speichern
          </FormSubmitButton>
        </div>
      </form>
    </div>
  );
}
