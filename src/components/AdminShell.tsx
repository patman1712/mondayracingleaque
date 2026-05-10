import { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import { SignOutButton } from "@/components/SignOutButton";
import { listAdminLeagues } from "@/lib/league";
import { AdminSidebarClient } from "@/components/AdminSidebarClient";

export async function AdminShell({ children }: { children: ReactNode }) {
  await requireAdmin();
  const leagues = await listAdminLeagues();

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4">
      <div className="mt-8 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Admin</div>
          <div className="text-sm text-white/60">Inhalte verwalten</div>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <AdminSidebarClient leagues={leagues} />

        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
