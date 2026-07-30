export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        action="/api/login"
        method="POST"
        className="w-full max-w-sm rounded-2xl border bg-[var(--color-surface)] p-8 shadow-xl"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/versalhes-crest-lg.png"
            alt=""
            width={36}
            height={56}
            className="mb-3 h-14 w-auto"
          />
          <h1 className="text-xl font-semibold">Captação Versalhes</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Acesso restrito. Informe a senha.
          </p>
        </div>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input
          type="password"
          name="password"
          placeholder="Senha"
          autoFocus
          required
          className="w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        {error && (
          <p className="mt-2 text-sm text-[var(--color-negative)]">
            Senha incorreta.
          </p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-[var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 transition"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
