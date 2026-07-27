"use client";

import { useMemo, useState } from "react";

export type OrgChartNode = {
  id: string;
  title: string;
  people: string[];
  children: OrgChartNode[];
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function nodeBg(level: number) {
  if (level <= 0) return "bg-white/8";
  if (level === 1) return "bg-black/25";
  if (level === 2) return "bg-black/20";
  return "bg-black/15";
}

function NodeEditor({
  node,
  level,
  isRoot,
  onChange,
  onDelete
}: {
  node: OrgChartNode;
  level: number;
  isRoot: boolean;
  onChange: (next: OrgChartNode) => void;
  onDelete?: () => void;
}) {
  const peopleText = useMemo(() => node.people.join("\n"), [node.people]);

  return (
    <div className="relative">
      {!isRoot ? (
        <div className="absolute -left-4 top-0 bottom-0 w-px bg-white/10" />
      ) : null}
      <div className={`rounded-2xl border border-white/10 ${nodeBg(level)} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Kachel
            </div>
            <input
              value={node.title}
              onChange={(e) => onChange({ ...node, title: e.target.value })}
              placeholder="Titel (z.B. MRL Ligaleitung)"
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-white/25"
            />
            <textarea
              value={peopleText}
              onChange={(e) =>
                onChange({
                  ...node,
                  people: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean)
                })
              }
              placeholder="Personen (eine pro Zeile)"
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85 outline-none focus:border-white/25"
              rows={Math.max(2, Math.min(8, (node.people.length || 2) + 1))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...node,
                  children: [...node.children, { id: uid(), title: "Neu", people: [], children: [] }]
                })
              }
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Unter-Kachel +
            </button>
            {!isRoot ? (
              <button
                type="button"
                onClick={() => onDelete?.()}
                className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15"
              >
                Löschen
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {node.children.length ? (
        <div className="mt-3 grid gap-3 pl-6">
          {node.children.map((c, idx) => (
            <NodeEditor
              key={c.id}
              node={c}
              level={level + 1}
              isRoot={false}
              onChange={(next) =>
                onChange({
                  ...node,
                  children: node.children.map((x, i) => (i === idx ? next : x))
                })
              }
              onDelete={() =>
                onChange({
                  ...node,
                  children: node.children.filter((_, i) => i !== idx)
                })
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminOrgChartBuilderClient({
  initial,
  saveAction
}: {
  initial: OrgChartNode;
  saveAction: (formData: FormData) => void;
}) {
  const [state, setState] = useState<OrgChartNode>(() => deepClone(initial));
  const json = useMemo(() => JSON.stringify(state), [state]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-base font-semibold">MRL-Struktur</div>
            <div className="mt-1 text-sm text-white/60">
              Kacheln bearbeiten, Unter-Kacheln hinzufügen und danach speichern.
            </div>
          </div>
          <form action={saveAction} className="flex items-center gap-2">
            <input type="hidden" name="orgChartJson" value={json} />
            <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Speichern
            </button>
          </form>
        </div>
      </div>

      <NodeEditor
        node={state}
        level={0}
        isRoot
        onChange={(next) => setState(next)}
      />
    </div>
  );
}
