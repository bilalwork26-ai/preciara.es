/**
 * Proxy de Next.js 16 (sustituye a `middleware.ts`, ver
 * node_modules/next/dist/docs/.../proxy.md). Protege `/admin` y
 * `/api/admin`: sin `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` configuradas,
 * responde 404 siempre (cerrado, nunca abierto). Con sesión válida deja
 * pasar; si no, redirige a `/admin/login` (UI) o responde 401 (API). Añade
 * `X-Robots-Tag: noindex, nofollow` a toda la zona para que no se indexe.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, isAdminAuthConfigured, verifySessionToken } from "@/server/admin/auth";

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/admin");
  const isLoginPage = pathname === "/admin/login";

  if (!isAdminAuthConfigured()) {
    return withNoIndex(new NextResponse(null, { status: 404 }));
  }

  const hasValidSession = verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (hasValidSession) {
    return withNoIndex(NextResponse.next());
  }

  if (isApi) {
    return withNoIndex(NextResponse.json({ error: "No autenticado." }, { status: 401 }));
  }

  if (isLoginPage) {
    return withNoIndex(NextResponse.next());
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return withNoIndex(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
