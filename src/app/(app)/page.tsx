import { getLeads, type RangeKey, type Count } from "@/lib/data";
import { colorAt } from "@/lib/theme";

export const dynamic = "force-dynamic";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
  { key: "all", label: "Tudo" },
];

const fmt = (n: number) => n.toLocaleString("pt-BR");

function Bars({ rows, colored }: { rows: Count[]; colored?: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">Nenhum lead no período.</p>
    );
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {fmt(r.count)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(r.count / max) * 100}%`,
                background: colored ? colorAt(i) : "var(--color-accent)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-[var(--color-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = (["7", "30", "90", "all"].includes(sp.range ?? "")
    ? sp.range
    : "30") as RangeKey;

  const data = await getLeads(range);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Captação</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Leads inscritos em formulários e suas origens.
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg border bg-[var(--color-surface)] p-1">
          {RANGES.map((r) => {
            const active = r.key === range;
            return (
              <a
                key={r.key}
                href={`/?range=${r.key}`}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {r.label}
              </a>
            );
          })}
        </nav>
      </header>

      <section className="rounded-xl border bg-[var(--color-surface)] p-5 shadow-sm">
        <p className="text-sm text-[var(--color-muted)]">Total de inscritos</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {fmt(data.total)}
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Por origem" subtitle="utm_source, como veio do formulário">
          <Bars rows={data.byOrigin} colored />
        </Card>
        <Card title="Por formulário" subtitle="cada form de inscrição">
          <Bars rows={data.byForm} />
        </Card>
      </div>
    </div>
  );
}
