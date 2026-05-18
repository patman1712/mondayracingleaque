"use client";

import { useMemo, useState } from "react";

const TEAM_LOGOS: Record<string, string> = {
  ferrari: "/teams/ferrari.png",
  mercedes: "/teams/mercedes.png",
  mclaren: "/teams/mclaren.png",
  "red bull racing": "/teams/redbull.png",
  "red bull": "/teams/redbull.png",
  rb: "/teams/rb.png",
  "aston martin": "/teams/astonmartin.png",
  alpine: "/teams/alpine.png",
  williams: "/teams/williams.png",
  haas: "/teams/haas.png",
  sauber: "/teams/sauber.png",
  "kick sauber": "/teams/sauber.png"
};

function logoFromTeamName(teamName: string) {
  const n = teamName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return null;
  if (TEAM_LOGOS[n]) return TEAM_LOGOS[n];
  for (const k of Object.keys(TEAM_LOGOS)) {
    if (n.includes(k) || k.includes(n)) return TEAM_LOGOS[k];
  }
  return null;
}

export function TeamLogo({
  teamName,
  src,
  size = 20,
  className
}: {
  teamName: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = useMemo(() => (src?.trim() ? src.trim() : logoFromTeamName(teamName)), [src, teamName]);
  if (!resolved || failed) return null;
  return (
    <img
      src={resolved}
      alt=""
      height={size}
      onError={() => setFailed(true)}
      className={["shrink-0 opacity-85 drop-shadow-[0_0_10px_rgba(255,255,255,0.18)]", className].filter(Boolean).join(" ")}
      style={{ height: size, width: "auto", maxWidth: size * 3 }}
    />
  );
}
