import { NextResponse, type NextRequest } from "next/server";

/**
 * Comprobación OPTIMISTA: si no hay cookie, las páginas redirigen a /login.
 * No verifica la cookie (eso es caro y no es el lugar): la verificación real está en
 * cada Route Handler con exigirUsuario(). Por eso /api queda fuera del matcher:
 * una API sin sesión responde 401, no una redirección.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("sesion")) return NextResponse.next();
  const url = request.nextUrl.clone();
  const siguiente = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = siguiente && siguiente !== "/" ? `?siguiente=${encodeURIComponent(siguiente)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
