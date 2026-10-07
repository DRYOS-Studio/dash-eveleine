import Image from "next/image";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
      <form
        action="/api/login"
        method="POST"
        className="w-full max-w-sm rounded-2xl border border-[var(--color-line-strong)] bg-white p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/dryos-logo.png"
            alt="DRYOS"
            width={90}
            height={26}
            className="h-5 w-auto object-contain opacity-90 mb-3"
            priority
          />
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)]">
            — Painel Executivo
          </div>
          <h1 className="font-heading text-2xl font-bold text-[var(--color-ink)] mt-1">
            Partiu Empreender
          </h1>
          <p className="text-xs text-[var(--color-mute)] mt-1.5">
            Inteligência de Vendas · Informe a senha de acesso
          </p>
        </div>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          placeholder="Senha de acesso"
          autoFocus
          required
          className="w-full rounded-lg border border-[var(--color-line-strong)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-oak)]"
        />
        {error && (
          <p className="mt-2 text-xs font-mono text-[var(--color-negative)]">
            Senha incorreta. Tente novamente.
          </p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-[var(--color-oak)] px-3 py-2.5 text-sm font-medium text-[var(--color-bg)] transition hover:bg-[var(--color-ink)]"
        >
          Entrar no painel
        </button>
      </form>
    </main>
  );
}
