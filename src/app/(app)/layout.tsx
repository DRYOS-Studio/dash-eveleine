import { redirect } from "next/navigation";
import Image from "next/image";
import { isAuthenticated } from "@/lib/auth";
import { NavMenu } from "@/components/nav-menu";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[#FAFAF8]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <Image
                src="/dryos-logo.png"
                alt="DRYOS"
                width={70}
                height={20}
                className="h-4 w-auto object-contain opacity-90"
                priority
              />
              <span className="text-xs text-[var(--color-mute-soft)]">/</span>
              <span className="font-heading text-base sm:text-lg font-bold tracking-tight text-[var(--color-ink)]">
                Partiu Empreender
              </span>
            </div>

            <NavMenu />
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-[var(--color-oak)]/15 bg-[var(--color-oak-tint)] px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[var(--color-oak)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-good)] animate-pulse" />
              Tempo Real
            </span>

            <form action="/api/logout" method="POST">
              <button
                type="submit"
                className="font-mono text-xs uppercase tracking-wider text-[var(--color-mute)] transition hover:text-[var(--color-ink)]"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
