import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: {
    default: "Monday Racing League",
    template: "%s · Monday Racing League"
  },
  description: "F1 26 Simracing Liga"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-dvh">
        <Header />
        <main className="min-h-[60dvh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
