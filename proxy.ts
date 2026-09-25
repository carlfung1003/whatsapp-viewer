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
<meta name="theme-color" content="#09090b">
<title>WhatsApp viewer</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;color:#f4f4f5;
    font:16px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;
    background:radial-gradient(ellipse 70% 45% at 50% 0%,rgb(52 211 153/.10),transparent),#09090b}
  main{width:min(320px,100%);text-align:center;animation:rise .35s cubic-bezier(.16,1,.3,1) both}
  .mark{width:56px;height:56px;margin:0 auto 20px;border-radius:16px;display:grid;place-items:center;
    background:rgb(52 211 153/.15);color:#6ee7b7}
  h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em}
  p{margin:6px 0 24px;color:#a1a1aa;font-size:14px}
  form{display:flex;flex-direction:column;gap:10px}
  input{height:52px;padding:0 16px;border-radius:12px;border:1px solid #26262b;background:#17171a;color:inherit;
    font-size:22px;letter-spacing:.3em;text-align:center;outline:none;transition:border-color .15s}
  input::placeholder{letter-spacing:.02em;font-size:15px;color:#71717a}
  input:focus{border-color:rgb(52 211 153/.6);box-shadow:0 0 0 3px rgb(52 211 153/.15)}
  button{height:48px;border:0;border-radius:12px;background:#34d399;color:#022c22;font-weight:600;font-size:15px;cursor:pointer;
    transition:transform .1s,background .15s}
  button:hover{background:#6ee7b7} button:active{transform:scale(.98)}
  .err{margin:4px 0 0;color:#fca5a5;font-size:13px}
  @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){main{animation:none}}
</style></head><body>
<main>
  <div class="mark" aria-hidden="true">
    <!-- Phosphor "LockSimple" (regular), copied from @phosphor-icons/react -->
    <svg width="28" height="28" viewBox="0 0 256 256" fill="currentColor"><path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z"/></svg>
  </div>
  <h1>WhatsApp viewer</h1>
  <p>Enter your passcode to continue</p>
  <form method="post" action="${LOGIN_PATH}">
    <input type="hidden" name="next" value="${esc}">
    <input name="passcode" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Passcode" aria-label="Passcode" autofocus required>
    <button type="submit">Unlock</button>
    ${failed ? '<p class="err" role="alert">Wrong passcode, try again</p>' : ""}
  </form>
</main>
</body></html>`;
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
      // Plain http is fine over the tailnet (WireGuard-encrypted), but a
      // Secure cookie would never be stored there and login would loop.
      secure: proto === "https",
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
