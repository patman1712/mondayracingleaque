"use client";

import { useMemo, useState } from "react";

type TeamOption = { id: string; name: string; color: string | null };

function asHexColor(input: string | null | undefined, fallback: string) {
  const raw = (input ?? "").trim();
  if (!raw) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toUpperCase()}`;
  return fallback;
}

export function TeamSeasonAddForm({
  leagueSlug,
  seasonId,
  availableTeams,
  action
}: {
  leagueSlug: string;
  seasonId: string;
  availableTeams: TeamOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const colorByTeamId = useMemo(() => {
    return new Map(availableTeams.map((t) => [t.id, t.color] as const));
  }, [availableTeams]);

  const [teamId, setTeamId] = useState("");
  const [color, setColor] = useState("#E10600");
  const [colorTouched, setColorTouched] = useState(false);

  return (
    <form action={action} encType="multipart/form-data" className="mt-4 grid gap-4 md:grid-cols-3">
      <input type="hidden" name="league" value={leagueSlug} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold text-white/70">
          Team
        </label>
        <select
          name="teamId"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          value={teamId}
          onChange={(e) => {
            const nextId = e.target.value;
            setTeamId(nextId);
            if (!colorTouched) {
              const nextColor = colorByTeamId.get(nextId) ?? null;
              setColor(asHexColor(nextColor, "#E10600"));
            }
          }}
        >
          <option value="">Bitte wählen</option>
          {availableTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-white/70">
          Farbe (optional)
        </label>
        <input
          name="color"
          type="color"
          value={color}
          onChange={(e) => {
            setColor(e.target.value);
            setColorTouched(true);
          }}
          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1"
        />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold text-white/70">
          Auto-Design Upload (PNG/JPG/WEBP)
        </label>
        <input
          name="car"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
        />
      </div>
      <div className="md:col-span-3">
        <label className="mb-1 block text-xs font-semibold text-white/70">
          Hero Background Upload (PNG/JPG/WEBP)
        </label>
        <input
          name="heroBackground"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
        />
      </div>
      <div className="flex items-end">
        <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
          Hinzufügen
        </button>
      </div>
    </form>
  );
}

