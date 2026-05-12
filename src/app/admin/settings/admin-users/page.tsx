import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function createUser(formData: FormData) {
  "use server";

  await requireAdmin();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/admin/settings/admin-users?error=invalid");

  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } }).catch(() => null);
  if (existing) redirect("/admin/settings/admin-users?error=exists");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.create({ data: { email, passwordHash } }).catch(() => null);

  revalidatePath("/admin/settings/admin-users");
  redirect("/admin/settings/admin-users?created=1");
}

async function resetPassword(formData: FormData) {
  "use server";

  await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!userId || !password) redirect("/admin/settings/admin-users?error=invalid");

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await prisma.adminUser
    .update({ where: { id: userId }, data: { passwordHash } })
    .catch(() => null);
  if (!updated) redirect("/admin/settings/admin-users?error=notfound");

  revalidatePath("/admin/settings/admin-users");
  redirect("/admin/settings/admin-users?reset=1");
}

async function deleteUser(formData: FormData) {
  "use server";

  const session = await requireAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) redirect("/admin/settings/admin-users?error=invalid");

  if (userId === session.userId) redirect("/admin/settings/admin-users?error=self");

  const count = await prisma.adminUser.count().catch(() => 0);
  if (count <= 1) redirect("/admin/settings/admin-users?error=last");

  await prisma.adminUser.delete({ where: { id: userId } }).catch(() => null);

  revalidatePath("/admin/settings/admin-users");
  redirect("/admin/settings/admin-users?deleted=1");
}

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; reset?: string; deleted?: string; error?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;

  const me = await prisma.adminUser
    .findUnique({ where: { id: session.userId }, select: { id: true, email: true } })
    .catch(() => null);

  const users = await prisma.adminUser
    .findMany({ orderBy: [{ createdAt: "asc" }], select: { id: true, email: true, createdAt: true } })
    .catch(() => []);

  const errorText =
    sp.error === "invalid"
      ? "Bitte Email und Passwort ausfüllen."
      : sp.error === "exists"
        ? "Diese Email existiert bereits."
        : sp.error === "notfound"
          ? "User nicht gefunden."
          : sp.error === "self"
            ? "Du kannst deinen eigenen Admin-User nicht löschen."
            : sp.error === "last"
              ? "Der letzte Admin-User kann nicht gelöscht werden."
              : null;

  return (
    <AdminShell>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-base font-semibold">Admin User</div>
        <div className="mt-2 text-sm text-white/70">
          Lege zusätzliche Admin-Accounts an, die du weitergeben kannst.
          {me?.email ? <span className="ml-2 text-white/60">Eingeloggt als: {me.email}</span> : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-semibold">Neuen Admin anlegen</div>
            <form action={createUser} className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Email</label>
                <input
                  name="email"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Passwort</label>
                <input
                  name="password"
                  type="password"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  placeholder="Passwort setzen"
                />
              </div>
              <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Anlegen
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-semibold">Passwort zurücksetzen</div>
            <form action={resetPassword} className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">User</label>
                <select
                  name="userId"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  defaultValue={me?.id ?? ""}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                      {u.id === me?.id ? " (du)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">Neues Passwort</label>
                <input
                  name="password"
                  type="password"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                  placeholder="Neues Passwort setzen"
                />
              </div>
              <button className="w-fit rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                Speichern
              </button>
            </form>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/10">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Alle Admin User</div>
          <div className="divide-y divide-white/10">
            {users.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white/90">
                      {u.email} {isMe ? <span className="text-white/50">(du)</span> : null}
                    </div>
                    <div className="text-xs text-white/55">Erstellt: {u.createdAt.toLocaleString("de-DE")}</div>
                  </div>
                  <form action={deleteUser}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      disabled={isMe || users.length <= 1}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                        isMe || users.length <= 1
                          ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                          : "border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                      }`}
                    >
                      Löschen
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>

        {sp.created === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            Admin-User angelegt.
          </div>
        ) : null}
        {sp.reset === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            Passwort gespeichert.
          </div>
        ) : null}
        {sp.deleted === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            Admin-User gelöscht.
          </div>
        ) : null}
        {errorText ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorText}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}

