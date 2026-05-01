import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";

export const dynamic = "force-dynamic";

const leagueLabel: Record<string, string> = {
  "mrl-one": "MRL One",
  "mrl-two": "MRL Two",
  "mrl-rookie": "MRL Rookie"
};

export default async function LeagueHomePage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const label = leagueLabel[league];
  if (!label) notFound();

  const tiles = [
    { href: `/${league}/drivers`, label: "Fahrer" },
    { href: `/${league}/results`, label: "Ergebnisse" },
    { href: `/${league}/standings`, label: "WM Stand" },
    { href: `/${league}/calendar`, label: "Rennkalender" }
  ];

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">{label}</div>
        <div className="mt-2 text-sm text-white/70">
          Alle Infos zur Liga in einer Übersicht
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10"
          >
            <div className="text-lg font-semibold">{t.label}</div>
            <div className="mt-2 text-sm text-white/70">{label}</div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
