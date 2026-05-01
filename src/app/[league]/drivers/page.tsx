import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import { League } from "@prisma/client";

export const dynamic = "force-dynamic";

const leagueEnum: Record<string, League> = {
  "mrl-one": League.ONE,
  "mrl-two": League.TWO,
  "mrl-rookie": League.ROOKIE
};

const leagueLabel: Record<League, string> = {
  [League.ONE]: "MRL One",
  [League.TWO]: "MRL Two",
  [League.ROOKIE]: "MRL Rookie"
};

export default async function LeagueDriversPage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const l = leagueEnum[league];
  if (!l) notFound();

  type DriverItem = {
    id: string;
    name: string;
    number: number | null;
    team: string | null;
    country: string | null;
  };

  let drivers: DriverItem[] = [];
  try {
    drivers = await prisma.driver.findMany({
      where: { league: l },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, number: true, team: true, country: true }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">
          Fahrer · {leagueLabel[l]}
        </div>
        <div className="mt-2 text-sm text-white/70">Fahrerübersicht</div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
        <div className="grid grid-cols-[90px_1fr_1fr] gap-4 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          <div>Nr.</div>
          <div>Name</div>
          <div>Team</div>
        </div>
        {drivers.length === 0 ? (
          <div className="px-5 py-6 text-sm text-white/60">
            Noch keine Fahrer eingetragen.
          </div>
        ) : (
          drivers.map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-[90px_1fr_1fr] gap-4 border-b border-white/10 px-5 py-4 last:border-b-0"
            >
              <div className="text-white/80">{d.number ?? "-"}</div>
              <div className="font-semibold">{d.name}</div>
              <div className="text-white/75">{d.team ?? "-"}</div>
            </div>
          ))
        )}
      </div>
    </Container>
  );
}
