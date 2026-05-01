import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "mrl_admin";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function base64Url(input: Buffer) {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function getOrCreateCookieSecret() {
  const existing = await prisma.appConfig.findUnique({
    where: { key: "cookieSecret" },
    select: { value: true }
  });
  if (existing?.value) return existing.value;

  const value = base64Url(crypto.randomBytes(32));
  await prisma.appConfig.upsert({
    where: { key: "cookieSecret" },
    create: { key: "cookieSecret", value },
    update: { value }
  });
  return value;
}

export async function createAdminSession(userId: string) {
  const secret = await getOrCreateCookieSecret();
  const exp = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  const sig = base64Url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export async function verifyAdminSession(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;

  const secret = await getOrCreateCookieSecret();
  const payload = `${userId}.${exp}`;
  const expected = base64Url(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );
  if (!safeEqual(sig, expected)) return null;
  return { userId };
}

export async function setAdminCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS
  });
}

export async function clearAdminCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export async function readAdminCookie() {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value ?? null;
}
