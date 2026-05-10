import { ReactNode } from "react";

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
  const a = c ? hexToRgba(c, 0.32) : "rgba(255,255,255,0.08)";
  const b = c ? hexToRgba(c, 0.06) : "rgba(255,255,255,0.03)";
  const d = c ? hexToRgba(c, 0.22) : "rgba(255,255,255,0.06)";
  return `radial-gradient(900px circle at 20% 18%, ${d}, transparent 62%), linear-gradient(145deg, ${a}, ${b})`;
}

function f1Dots() {
  return {
    backgroundImage:
      "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
    backgroundSize: "8px 8px, 18px 18px",
    backgroundPosition: "0 0, 2px 2px"
  } as const;
}

export function HeroTile({
  accent,
  flagUrl,
  children,
  className
}: {
  accent: string;
  flagUrl?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["relative overflow-hidden rounded-3xl border border-white/10 p-6", className].filter(Boolean).join(" ")}
      style={{
        backgroundImage: flagUrl ? `url(${flagUrl}), ${heroBg(accent)}` : heroBg(accent),
        backgroundSize: flagUrl ? "cover, auto" : undefined,
        backgroundPosition: flagUrl ? "center, center" : undefined
      }}
    >
      {flagUrl ? <div className="pointer-events-none absolute inset-0 bg-black/55" /> : null}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{ ...f1Dots(), clipPath: "polygon(0 0, 86% 0, 62% 100%, 0 100%)" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/75" />
      <div className="pointer-events-none absolute left-0 top-0 h-[6px] w-full" style={{ backgroundColor: accent }} />
      {children}
    </div>
  );
}

