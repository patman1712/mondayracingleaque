export type LiveTimingSessionMode = "race" | "practice" | "unknown";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sessionLabelFromName(sessionName: string) {
  const n = normName(sessionName);
  if (!n) return "";

  if (n.includes("sprint qualifying") || n.includes("sprint shootout") || n.includes("sq1") || n.includes("sq2") || n.includes("sq3")) {
    return "SPRINT QUALIFYING";
  }
  if (n.includes("sprint race")) return "SPRINT RACE";

  if (n.includes("short practice")) return "PRACTICE";
  if (n.includes("practice 1") || n === "p1" || n.includes(" p1")) return "PRACTICE 1";
  if (n.includes("practice 2") || n === "p2" || n.includes(" p2")) return "PRACTICE 2";
  if (n.includes("practice 3") || n === "p3" || n.includes(" p3")) return "PRACTICE 3";
  if (n.includes("practice")) return "PRACTICE";

  if (n.includes("short qualifying")) return "QUALIFYING";
  if (n.includes("qualifying 1") || n === "q1" || n.includes(" q1")) return "QUALIFYING 1";
  if (n.includes("qualifying 2") || n === "q2" || n.includes(" q2")) return "QUALIFYING 2";
  if (n.includes("qualifying 3") || n === "q3" || n.includes(" q3")) return "QUALIFYING 3";
  if (n.includes("qualifying")) return "QUALIFYING";

  if (n.includes("grand prix")) return "RACE";
  if (n === "race" || n.startsWith("race ") || n.includes(" race")) return "RACE";

  return sessionName.trim().toUpperCase();
}

export function sessionModeFromName(sessionName: string | null | undefined): LiveTimingSessionMode {
  const label = sessionLabelFromName((sessionName ?? "").toString());
  if (!label) return "unknown";
  if (label === "RACE" || label === "SPRINT RACE") return "race";
  return "practice";
}

export function getSessionDisplay(data: {
  sessionName?: string | null;
  sessionTimeLeft?: string | null;
  currentLap?: number | null;
  totalLaps?: number | null;
  sessionMode?: LiveTimingSessionMode | null;
}) {
  const sessionName = (data.sessionName ?? "").toString().trim();
  const label = sessionLabelFromName(sessionName);
  const mode = data.sessionMode ?? sessionModeFromName(sessionName);
  const isRace = mode === "race";
  const sprintRace = label === "SPRINT RACE";

  if (isRace) {
    const base = sprintRace ? "SPRINT RACE" : "RACE";
    const currentLap = typeof data.currentLap === "number" ? data.currentLap : null;
    const totalLaps = typeof data.totalLaps === "number" ? data.totalLaps : null;
    if (currentLap !== null && totalLaps !== null && totalLaps > 0) {
      return `${base} • LAP ${currentLap} / ${totalLaps}`;
    }
    return base;
  }

  const left = (data.sessionTimeLeft ?? "").toString().trim();
  if (label && left) return `${label} • LEFT ${left}`;
  return label || (left ? `LEFT ${left}` : "");
}
