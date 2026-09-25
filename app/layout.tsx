import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { listChats } from "@/lib/db";
import { cookies } from "next/headers";
import AppShell, { SIDEBAR_DEFAULT } from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WhatsApp viewer",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const chats = listChats(60);
  const jar = await cookies();
  const savedWidth = Number(jar.get("wa_sb_w")?.value);
  const sidebarWidth = Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : SIDEBAR_DEFAULT;
  const sidebarCollapsed = jar.get("wa_sb_c")?.value === "1";
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
        <AppShell chats={chats} initialWidth={sidebarWidth} initialCollapsed={sidebarCollapsed}>{children}</AppShell>
      </body>
    </html>
  );
}
