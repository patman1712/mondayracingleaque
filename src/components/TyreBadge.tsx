export function TyreBadge({
  tyre,
  size = 34,
  className
}: {
  tyre: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const t = (tyre ?? "").trim().toLowerCase();
  const spec = (() => {
    if (t === "soft" || t === "s") return { label: "S", bg: "#ff2b2b", fg: "#fff" };
    if (t === "medium" || t === "m") return { label: "M", bg: "#ffd23f", fg: "#111" };
    if (t === "hard" || t === "h") return { label: "H", bg: "#f5f5f5", fg: "#111" };
    if (t === "inter" || t === "intermediate" || t === "i") return { label: "I", bg: "#2dd36f", fg: "#06150d" };
    if (t === "wet" || t === "w") return { label: "W", bg: "#2b7cff", fg: "#041224" };
    if (!t || t === "—") return { label: "?", bg: "#5b5b5b", fg: "#fff" };
    const u = t.toUpperCase();
    return { label: u.length ? u.slice(0, 1) : "?", bg: "#5b5b5b", fg: "#fff" };
  })();

  const ring = Math.max(2, Math.round(size * 0.09));

  return (
    <div
      className={["inline-flex items-center justify-center font-extrabold", className].filter(Boolean).join(" ")}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: `${ring}px solid #111`,
        background: spec.bg,
        color: spec.fg,
        boxShadow: "0 0 10px rgba(255,255,255,.12), 0 10px 24px rgba(0,0,0,.35)",
        textShadow: "0 1px 0 rgba(0,0,0,.35)",
        fontSize: Math.max(10, Math.round(size * 0.42)),
        lineHeight: 1
      }}
    >
      {spec.label}
    </div>
  );
}

