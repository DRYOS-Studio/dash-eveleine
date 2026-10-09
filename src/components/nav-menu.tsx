"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Vendas & Retenção", href: "/" },
  { label: "Financeiro", href: "/financeiro" },
];

export function NavMenu() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação Principal"
      className="flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 text-xs sm:text-[13px]"
    >
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-all ${
              isActive
                ? "bg-[var(--color-oak)] font-semibold text-white shadow-xs"
                : "text-[var(--color-mute)] hover:bg-white/80 hover:text-[var(--color-ink)]"
            }`}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono uppercase ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[var(--color-line-strong)] text-[var(--color-mute)]"
                }`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
