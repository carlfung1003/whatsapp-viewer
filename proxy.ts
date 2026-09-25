import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// Passcode gate for access over Tailscale Serve. Requests made directly to
// localhost (scripts, tests, the Mac's own browser) skip it; everything that
// arrives through the tailnet hostname must carry the auth cookie.
//
// The login page is rendered here as standalone HTML on purpose: the root
// layout calls listChats(), so any in-app login route would leak chat names.

const COOKIE = "wa_auth";
const LOGIN_PATH = "/__login";

function digest(value: string): Buffer {
  return createHash("sha256").update(`wa-viewer:${value}`).digest();
}

function isDirectLocal(req: NextRequest): boolean {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  // Serve connects from localhost too, but keeps the ts.net Host and adds
  // tailscale-* headers. (Next itself sets x-forwarded-for on every request.)
  return local && !req.headers.has("tailscale-headers-info") && !req.headers.has("tailscale-user-login");
}

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function loginPage(next: string, failed: boolean): NextResponse {
  const esc = next.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhatsApp viewer</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#f4f4f5;font:16px system-ui,sans-serif}
  form{display:flex;flex-direction:column;gap:12px;width:min(280px,calc(100vw - 32px))}
  input{padding:12px;border-radius:8px;border:1px solid #3f3f46;background:#18181b;color:inherit;font-size:20px;letter-spacing:.2em;text-align:center}
  button{padding:12px;border:0;border-radius:8px;background:#10b981;color:#052e16;font-weight:600;font-size:16px}
  p{margin:0;color:#f87171;text-align:center;font-size:14px}
</style></head><body>
<form method="post" action="${LOGIN_PATH}">
  <input type="hidden" name="next" value="${esc}">
  <input name="passcode" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Passcode" autofocus required>
  <button type="submit">Unlock</button>
  ${failed ? "<p>Wrong passcode</p>" : ""}
</form></body></html>`;
  return new NextResponse(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function proxy(req: NextRequest) {
  const passcode = process.env.VIEWER_PASSCODE;
  if (!passcode || isDirectLocal(req)) return NextResponse.next();

  const expected = digest(passcode);
  const { pathname, search } = req.nextUrl;

  if (pathname === LOGIN_PATH && req.method === "POST") {
    const form = await req.formData();
    const next = safeNext(form.get("next")?.toString() ?? null);
    const given = digest(form.get("passcode")?.toString() ?? "");
    if (!timingSafeEqual(given, expected)) {
      await new Promise((r) => setTimeout(r, 750)); // slow down guessing
      return loginPage(next, true);
    }
    // Build from the forwarded host — req.url may say 127.0.0.1 behind Serve.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const res = NextResponse.redirect(`${proto}://${host}${next}`, 303);
    res.cookies.set(COOKIE, expected.toString("hex"), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  const cookie = req.cookies.get(COOKIE)?.value ?? "";
  const cookieBuf = Buffer.from(cookie, "hex");
  if (cookieBuf.length === expected.length && timingSafeEqual(cookieBuf, expected)) {
    return NextResponse.next();
  }

  return loginPage(safeNext(pathname + search), false);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
