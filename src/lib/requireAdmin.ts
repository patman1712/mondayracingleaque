import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readAdminCookie, verifyAdminSession } from "@/lib/adminAuth";

export async function requireAdmin() {
  try {
    const adminCount = await prisma.adminUser.count();
    if (adminCount === 0) redirect("/admin/setup");
  } catch {
    redirect("/admin/setup");
  }

  const token = await readAdminCookie();
  if (!token) redirect("/admin/login");

  const session = await verifyAdminSession(token);
  if (!session) redirect("/admin/login");
  return session;
}
