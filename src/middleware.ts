import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

// A validação do cookie TEM de morar aqui: no Next, layout e página renderizam em
// paralelo, então um redirect no layout chega depois de a página já ter lido o banco e
// posto os números no corpo da resposta (medido em produção em 2026-11-03: cookie
// inventado → 307 com os KPIs no HTML). O layout mantém a checagem como segunda linha.
//
// Mesmo token de `sessionToken()` em lib/auth.ts — HMAC-SHA256(DASHBOARD_PASSWORD) com
// AUTH_SECRET, em hex — calculado com Web Crypto porque o middleware roda no runtime edge.
async function tokenEsperado(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null; // sem segredo ninguém entra (lib/auth.ts também falha)
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(process.env.DASHBOARD_PASSWORD ?? ""));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// as entradas são envs fixas do deploy: calcula uma vez por instância
let esperadoP: Promise<string | null> | undefined;

/** Comparação em tempo constante para strings de mesmo tamanho. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/warm se autentica sozinha, com o CRON_SECRET (o cron do Vercel não tem cookie);
  // /api/logout só apaga o cookie — barrá-la mandaria o POST de quem tem cookie velho
  // para /login (307 preserva o método) e a pessoa não conseguiria sair
  const isPublic =
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/api/logout" ||
    pathname === "/api/warm";

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  // falha do Web Crypto não fica memoizada: a próxima request tenta de novo
  const esperado = cookie
    ? await (esperadoP ??= tokenEsperado().catch((e) => {
        esperadoP = undefined;
        throw e;
      }))
    : null;
  const valida = !!cookie && !!esperado && iguais(cookie, esperado);

  if (!valida && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (valida && pathname === "/login") {
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
