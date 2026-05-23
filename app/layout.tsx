import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { listChats } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
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
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <div className="grid grid-cols-[340px_1fr] h-screen">
          <Sidebar chats={chats} />
          <main className="overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
