export const allowedLiveTimingLeagueKeys = [
  "liga-one",
  "liga-two",
  "rookie",
  "one-mini-wm",
  "two-mini-wm"
] as const;

export type LiveTimingLeagueKey = (typeof allowedLiveTimingLeagueKeys)[number];

export function isLiveTimingLeagueKey(input: string): input is LiveTimingLeagueKey {
  return allowedLiveTimingLeagueKeys.includes(input as LiveTimingLeagueKey);
}

export function normalizeLiveTimingLeagueKey(input: string | null | undefined): LiveTimingLeagueKey {
  const k = (input ?? "").trim().toLowerCase();
  return isLiveTimingLeagueKey(k) ? k : "liga-one";
}

export function defaultLiveTimingLeagueKeyForPublicSlug(publicSlug: string): LiveTimingLeagueKey {
  const s = (publicSlug ?? "").trim().toLowerCase();
  if (s === "mrl-one" || s === "one" || s === "f1-one") return "liga-one";
  if (s === "mrl-two" || s === "two" || s === "f1-two") return "liga-two";
  if (s === "mrl-rookie" || s === "rookie") return "rookie";
  if (s === "one-mini-wm") return "one-mini-wm";
  if (s === "two-mini-wm") return "two-mini-wm";
  return "liga-one";
}

export function configuredOrDefaultLiveTimingLeagueKey(opts: {
  configured?: string | null | undefined;
  publicSlug: string;
}): LiveTimingLeagueKey {
  const c = (opts.configured ?? "").trim().toLowerCase();
  if (isLiveTimingLeagueKey(c)) return c;
  return defaultLiveTimingLeagueKeyForPublicSlug(opts.publicSlug);
}

