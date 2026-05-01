import { Container } from "@/components/Container";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function createAdmin(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return;

  const count = await prisma.adminUser.count().catch(() => 0);
  if (count > 0) redirect("/admin/login");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser
    .create({ data: { email, passwordHash } })
    .catch(() => null);

  redirect("/admin/login");
}

export default async function AdminSetupPage() {
  const count = await prisma.adminUser.count().catch(() => 0);
  if (count > 0) redirect("/admin/login");

  return (
    <Container>
      <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-lg font-semibold">Admin einrichten</div>
        <div className="mt-2 text-sm text-white/70">
          Lege den ersten Admin-Account an. Danach kannst du dich unter{" "}
          <span className="font-semibold">/admin/login</span> einloggen.
        </div>

        <form action={createAdmin} className="mt-6 grid gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Admin Email
            </label>
            <input
              name="email"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              placeholder="admin@mrl.de"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white/70">
              Admin Passwort
            </label>
            <input
              name="password"
              type="password"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </div>
          <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
            Admin anlegen
          </button>
          <div className="text-xs text-white/60">
            Hinweis: Für persistente Inhalte auf Railway sollte ein Volume für
            <span className="font-semibold"> data/</span> gemountet werden.
          </div>
        </form>
      </div>
    </Container>
  );
}
