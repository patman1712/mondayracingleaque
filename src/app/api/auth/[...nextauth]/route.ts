import NextAuth from "next-auth";
import { getAuthOptions, isAuthConfigured } from "@/lib/auth";

export async function GET(req: Request) {
  if (!isAuthConfigured()) {
    return new Response("Auth not configured", { status: 503 });
  }
  const handler = NextAuth(getAuthOptions());
  return (handler as unknown as (r: Request) => Promise<Response>)(req);
}

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return new Response("Auth not configured", { status: 503 });
  }
  const handler = NextAuth(getAuthOptions());
  return (handler as unknown as (r: Request) => Promise<Response>)(req);
}
