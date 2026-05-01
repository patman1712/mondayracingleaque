import Link from "next/link";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [newsCount, driverCount, raceCount, resultCount] = await Promise.all([
    prisma.newsPost.count(),
    prisma.driver.count(),
    prisma.race.count(),
    prisma.raceResult.count()
  ]);

  const tiles = [
    { label: "News", value: newsCount, href: "/admin/news" },
    { label: "Fahrer", value: driverCount, href: "/admin/one/drivers" },
    { label: "Rennen", value: raceCount, href: "/admin/one/races" },
    { label: "Ergebnisse", value: resultCount, href: "/admin/one/results" }
  ];

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Übersicht</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
            >
              <div className="text-sm text-white/70">{t.label}</div>
              <div className="mt-2 text-2xl font-semibold">{t.value}</div>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
