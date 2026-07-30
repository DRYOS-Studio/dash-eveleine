import {
  getLeads,
  resolvePeriod,
  RANGE_KEYS,
  type Breakdown,
  type RangeKey,
} from "@/lib/data";
import { colorAt } from "@/lib/theme";

export const dynamic = "force-dynamic";

const RANGE_LABEL: Record<RangeKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7": "7 dias",
  "30": "30 dias",
  "90": "90 dias",
  all: "Tudo",
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtDate = (d: string) => d.split("-").reverse().join("/");

function Bars({ data, colored }: { data: Breakdown; colored?: boolean }) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nenhum lead no período.</p>;
  }
  const max = Math.max(1, ...data.rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {data.rows.map((r, i) => (
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
  data,
  colored,
  className,
}: {
  title: string;
  data: Breakdown;
  colored?: boolean;
  className?: string;
}) {
  const plural = data.distinct === 1 ? "valor" : "valores";
  return (
    <section
      className={`rounded-xl border bg-[var(--color-surface)] p-5 shadow-sm ${className ?? ""}`}
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-[var(--color-muted)]">
          {data.capped
            ? `${fmt(data.distinct)} ${plural} — top 10 abaixo`
            : `${fmt(data.distinct)} ${plural}`}
        </p>
      </div>
      <Bars data={data} colored={colored} />
    </section>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const data = await getLeads(period);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl">Captação</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Leads inscritos em formulários e seus parâmetros de origem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap gap-1 rounded-lg border bg-[var(--color-surface)] p-1">
            {RANGE_KEYS.map((k) => {
              const active = k === period.key;
              return (
                <a
                  key={k}
                  href={`/?range=${k}`}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-[var(--color-accent)] text-white"
                      : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {RANGE_LABEL[k]}
                </a>
              );
            })}
          </nav>

          <form
            method="get"
            action="/"
            className={`flex flex-wrap items-center gap-2 rounded-lg border p-1 pl-3 ${
              period.key === "custom"
                ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                : "bg-[var(--color-surface)]"
            }`}
          >
            <label htmlFor="from" className="text-sm text-[var(--color-muted)]">
              De
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={period.fromDate ?? ""}
              className="rounded-md border bg-transparent px-2 py-1 text-sm"
            />
            <label htmlFor="to" className="text-sm text-[var(--color-muted)]">
              até
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={period.toDate ?? ""}
              className="rounded-md border bg-transparent px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white"
            >
              Aplicar
            </button>
          </form>
        </div>

        <p className="text-sm text-[var(--color-muted)]">
          {period.fromDate && period.toDate
            ? `Período: ${fmtDate(period.fromDate)} a ${fmtDate(period.toDate)} (fuso de São Paulo)`
            : "Período: todo o histórico"}
        </p>
      </header>

      <section className="rounded-xl border bg-[var(--color-surface)] p-5 shadow-sm">
        <p className="text-sm text-[var(--color-muted)]">Total de inscritos</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">{fmt(data.total)}</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Por formulário" data={data.byForm} />
        <Card title="Origem — utm_source" data={data.byUtm.source} colored />
        <Card title="Mídia — utm_medium" data={data.byUtm.medium} colored />
        <Card title="Termo — utm_term" data={data.byUtm.term} colored />
        <Card
          title="Campanha — utm_campaign"
          data={data.byUtm.campaign}
          colored
          className="md:col-span-2"
        />
        <Card
          title="Conteúdo — utm_content"
          data={data.byUtm.content}
          colored
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}
