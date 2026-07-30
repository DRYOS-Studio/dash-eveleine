import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

// Gate rápido por presença do cookie. A validação real (HMAC) acontece
// no layout server-side via isAuthenticated().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;

  const isPublic = pathname === "/login" || pathname.startsWith("/api/login");

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Arquivos de `public/` são servidos na raiz e caíam no gate: sem cookie, a
  // logo da tela de login voltava 307 pro próprio /login e aparecia quebrada.
  // Só assets estáticos ficam de fora — nenhum dado de lead vive em public/.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
