import type { ReactNode } from "react";
import { Teko } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { prisma } from "@/lib/db";

const racing = Teko({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-racing",
  display: "swap"
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uploadUrl(fileName: string | null | undefined) {
  if (!fileName) return null;
  return `/api/uploads/${encodeURIComponent(fileName)}`;
}

export async function generateMetadata() {
  const row = await prisma.appConfig
    .findUnique({ where: { key: "branding:logoPath" }, select: { value: true } })
    .catch(() => null);
  const logoPath = row?.value ? String(row.value) : null;
  const icon = uploadUrl(logoPath) ?? "/favicon.ico";

  return {
    title: {
      default: "Monday Racing League",
      template: "%s · Monday Racing League"
    },
    description: "F1 26 Simracing Liga",
    icons: {
      icon
    }
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const [logoRow, discordRow] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: "branding:logoPath" }, select: { value: true } }).catch(() => null),
    prisma.appConfig.findUnique({ where: { key: "branding:discordInviteUrl" }, select: { value: true } }).catch(() => null)
  ]);
  const logoPath = logoRow?.value ? String(logoRow.value) : null;
  const discordUrl = discordRow?.value ? String(discordRow.value) : "https://discord.gg/FFxKvcnYXj";

  return (
    <html lang="de">
      <body className={`${racing.variable} min-h-dvh`}>
        <Header logoSrc={uploadUrl(logoPath) ?? "/logo.svg"} discordUrl={discordUrl} />
        <main className="min-h-[60dvh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
