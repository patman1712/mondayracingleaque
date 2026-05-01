import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getAuthOptions, isAuthConfigured } from "@/lib/auth";

export async function requireAdmin() {
  if (!isAuthConfigured()) redirect("/admin/setup");

  const session = await getServerSession(getAuthOptions());
  if (!session) redirect("/admin/login");
  return session;
}
