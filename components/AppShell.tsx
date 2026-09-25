"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import type { ChatRow } from "@/lib/db";
import Sidebar from "@/components/Sidebar";

export const SIDEBAR_DEFAULT = 280;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 560;

// Persisted in cookies (read by the server layout) so the first paint already
// has the right width — no localStorage flash.
function saveCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

// Desktop: resizable, collapsible sidebar + content. Mobile: WhatsApp-style —
// the chat list is the home screen, every other route is full-width with a
// back bar.
export default function AppShell({
  chats,
  initialWidth,
  initialCollapsed,
  children,
}: {
  chats: ChatRow[];
  initialWidth: number;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const isHome = usePathname() === "/";
  const [width, setWidth] = useState(initialWidth);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    saveCookie("wa_sb_c", v ? "1" : "0");
  }

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      widthRef.current = w;
      setWidth(w);
    };
    const onUp = () => {
      setDragging(false);
      saveCookie("wa_sb_w", String(Math.round(widthRef.current)));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resetWidth() {
    widthRef.current = SIDEBAR_DEFAULT;
    setWidth(SIDEBAR_DEFAULT);
    saveCookie("wa_sb_w", String(SIDEBAR_DEFAULT));
  }

  return (
    <div
      className={`grid h-dvh grid-cols-1 ${collapsed ? "" : "md:grid-cols-[var(--sb)_minmax(0,1fr)]"} ${
        dragging ? "select-none cursor-col-resize" : ""
      }`}
      style={{ "--sb": `${width}px` } as React.CSSProperties}
    >
      <div
        className={`${isHome ? "block" : "hidden"} ${collapsed ? "md:hidden" : "md:block"} relative min-h-0 h-dvh`}
      >
        <Sidebar chats={chats} onCollapse={() => setCollapsedPersist(true)} />
        <div
          onPointerDown={startDrag}
          onDoubleClick={resetWidth}
          title="Drag to resize · double-click to reset"
          className={`hidden md:block absolute top-0 -right-1 w-2 h-full cursor-col-resize z-30 hover:bg-emerald-500/30 ${
            dragging ? "bg-emerald-500/40" : ""
          }`}
        />
      </div>
      <main className={`${isHome ? "hidden" : "flex"} md:flex flex-col min-w-0 min-h-0 h-dvh`}>
        <div className="md:hidden shrink-0 border-b border-zinc-800 px-3 py-2">
          <Link href="/" className="text-sm text-emerald-400">
            ← Chats
          </Link>
        </div>
        {collapsed && (
          <button
            onClick={() => setCollapsedPersist(false)}
            className="hidden md:block shrink-0 text-left border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
            title="Show chat list"
          >
            » Chats
          </button>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
