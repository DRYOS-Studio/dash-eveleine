import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <span className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          {/* fonte de 96px renderizada a 32 = 3x exato em retina; alt vazio
              porque o nome ao lado já identifica a marca */}
          <img
            src="/versalhes-crest.png"
            alt=""
            width={21}
            height={32}
            className="h-8 w-auto"
          />
          <span className="text-[var(--color-muted)]">Versalhes</span>
        </span>
        <nav className="flex gap-1 text-sm">
          {[
            ["/", "Captação"],
            ["/agenda", "Agenda"],
          ].map(([href, nome]) => (
            <a
              key={href}
              href={href}
              className="rounded-md px-3 py-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            >
              {nome}
            </a>
          ))}
        </nav>
        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="text-sm text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
          >
            Sair
          </button>
        </form>
      </header>
      <main className="p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
