export type LiveTimingSessionMode = "race" | "practice" | "unknown";

function isSprintQualifying(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (n.includes("sprint qualifying")) return true;
  if (n.includes("sprint shootout")) return true;
  if (n.includes("sq1") || n.includes("sq2") || n.includes("sq3")) return true;
  return false;
}

function isSprintRace(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return n.includes("sprint race");
}

function isRaceByName(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (isSprintQualifying(n)) return false;
  if (isSprintRace(n)) return true;
  if (n.includes(" race") || n.startsWith("race") || n.includes("grand prix")) return true;
  return false;
}

export function getSessionDisplay(data: {
  sessionName?: string | null;
  sessionTimeLeft?: string | null;
  currentLap?: number | null;
  totalLaps?: number | null;
  sessionMode?: LiveTimingSessionMode | null;
}) {
  const sessionName = (data.sessionName ?? "").toString().trim();
  const isRace = data.sessionMode === "race" || isRaceByName(sessionName);
  const sprintRace = isSprintRace(sessionName);

  if (isRace) {
    const base = sprintRace ? "SPRINT RACE" : "RACE";
    const currentLap = typeof data.currentLap === "number" ? data.currentLap : null;
    const totalLaps = typeof data.totalLaps === "number" ? data.totalLaps : null;
    if (currentLap !== null && totalLaps !== null && totalLaps > 0) {
      return `${base} • LAP ${currentLap} / ${totalLaps}`;
    }
    return base;
  }

  const label = sessionName ? sessionName.toUpperCase() : "";
  const left = (data.sessionTimeLeft ?? "").toString().trim();
  if (label && left) return `${label} • LEFT ${left}`;
  return label || (left ? `LEFT ${left}` : "");
}

