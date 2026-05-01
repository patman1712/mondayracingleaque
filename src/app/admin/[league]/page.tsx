import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";

export const dynamic = "force-dynamic";

const leagueLabel: Record<string, string> = {
  one: "MRL One",
  two: "MRL Two",
  rookie: "MRL Rookie"
};

export default async function AdminLeagueHomePage({
  params
}: {
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const label = leagueLabel[league];
  if (!label) notFound();

  const items = [
    { href: `/admin/${league}/drivers`, label: "Fahrer" },
    { href: `/admin/${league}/races`, label: "Rennkalender" },
    { href: `/admin/${league}/results`, label: "Ergebnisse" },
    { href: `/admin/${league}/standings`, label: "WM Stand" }
  ];

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">{label}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
            >
              <div className="font-semibold">{i.label}</div>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
