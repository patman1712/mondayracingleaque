import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set("mrl_admin", "", { path: "/", maxAge: 0 });
  return res;
}
