import { League } from "@prisma/client";

export const leagueMeta: Record<
  League,
  { label: string; slug: string; accent: string }
> = {
  ONE: { label: "MRL One", slug: "mrl-one", accent: "border-mrl-red/40" },
  TWO: { label: "MRL Two", slug: "mrl-two", accent: "border-white/20" },
  ROOKIE: { label: "MRL Rookie", slug: "mrl-rookie", accent: "border-white/20" }
};

export function leagueFromAdminSlug(slug: string): League | null {
  if (slug === "one") return League.ONE;
  if (slug === "two") return League.TWO;
  if (slug === "rookie") return League.ROOKIE;
  return null;
}

export function leagueFromPublicSlug(slug: string): League | null {
  if (slug === "mrl-one") return League.ONE;
  if (slug === "mrl-two") return League.TWO;
  if (slug === "mrl-rookie") return League.ROOKIE;
  return null;
}
