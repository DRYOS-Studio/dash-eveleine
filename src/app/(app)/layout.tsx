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
        <span className="text-sm font-medium tracking-tight">
          Captação <span className="text-[var(--color-muted)]">Versalhes</span>
        </span>
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
