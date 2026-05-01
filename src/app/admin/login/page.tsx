import { Container } from "@/components/Container";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createAdminSession, setAdminCookie } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return;

  const user = await prisma.adminUser
    .findUnique({ where: { email }, select: { id: true, passwordHash: true } })
    .catch(() => null);

  if (!user) return;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return;

  const token = await createAdminSession(user.id);
  await setAdminCookie(token);
  redirect("/admin");
}

export default async function AdminLoginPage() {
  return (
    <Container>
      <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-lg font-semibold">Admin Login</div>
        <div className="mt-1 text-sm text-white/70">
          Bitte einloggen, um Inhalte zu verwalten.
        </div>
        <div className="mt-6">
          <form action={login} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Email
              </label>
              <input
                name="email"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                placeholder="admin@mrl.de"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Passwort
              </label>
              <input
                name="password"
                type="password"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <button className="w-full rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Einloggen
            </button>
            <div className="text-xs text-white/60">
              Falls der Login nicht klappt, prüfe zuerst /admin/setup.
            </div>
          </form>
        </div>
      </div>
    </Container>
  );
}
