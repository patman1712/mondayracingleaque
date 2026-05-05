import Link from "next/link";
import { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import { Container } from "@/components/Container";
import { SignOutButton } from "@/components/SignOutButton";
import { listAdminLeagues } from "@/lib/league";

const sectionLinks = [
  { key: "races", label: "Rennkalender" },
  { key: "results", label: "Ergebnisse" },
  { key: "standings", label: "WM Stand" }
];

export async function AdminShell({ children }: { children: ReactNode }) {
  await requireAdmin();
  const leagues = await listAdminLeagues();

  return (
    <Container>
      <div className="mt-8 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Admin</div>
          <div className="text-sm text-white/60">Inhalte verwalten</div>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Allgemein
          </div>
          <div className="mt-2 space-y-1 text-sm">
            <Link
              href="/admin"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Übersicht
            </Link>
            <Link
              href="/admin/news"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              News
            </Link>
            <Link
              href="/admin/settings/league-colors"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Liga Farben
            </Link>
            <Link
              href="/admin/settings/leagues"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Ligen
            </Link>
            <Link
              href="/admin/settings/seasons"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Saisons
            </Link>
            <Link
              href="/admin/settings/circuits"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Rennstrecken
            </Link>
            <Link
              href="/admin/settings/teams"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Teams
            </Link>
            <Link
              href="/admin/settings/drivers"
              className="block rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              Fahrer
            </Link>
          </div>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-white/60">
            Ligen
          </div>
          <div className="mt-2 space-y-4">
            {leagues.map((l) => (
              <div key={l.adminSlug}>
                <div className="px-3 text-sm font-semibold">
                  {l.name}
                  {!l.isActive ? (
                    <span className="ml-2 text-[11px] font-semibold text-white/45">
                      (inaktiv)
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-1">
                  <Link
                    href={`/admin/${l.adminSlug}/settings`}
                    className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    Einstellungen
                  </Link>
                  <Link
                    href={`/admin/${l.adminSlug}/drivers`}
                    className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    Fahrer
                  </Link>
                  <Link
                    href={`/admin/${l.adminSlug}/teams`}
                    className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                  >
                    Teams
                  </Link>
                  {sectionLinks.map((s) => (
                    <Link
                      key={s.key}
                      href={`/admin/${l.adminSlug}/${s.key}`}
                      className="block rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </Container>
  );
}
