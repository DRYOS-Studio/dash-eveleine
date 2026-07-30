import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

// Sem fallback inseguro: env ausente = erro (não token forjável).
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET nas variáveis de ambiente.");
  return s;
}

/** Token = HMAC(password) — validado sem guardar a senha no cookie. */
export function sessionToken(): string {
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  return createHmac("sha256", getSecret()).update(password).digest("hex");
}

export function checkPassword(input: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const expected = sessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
