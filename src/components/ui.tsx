export const cf = (n: number, hideDecimals = false) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: hideDecimals ? 0 : 2,
    maximumFractionDigits: hideDecimals ? 0 : 2,
  });
export const cfInt = (n: number) => cf(n, true);
export const nf = (n: number) => n.toLocaleString("pt-BR");
export const pf = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";


export function Tile({
  label,
  valor,
  children,
  hero,
}: {
  label: string;
  valor: string;
  children?: React.ReactNode;
  hero?: boolean;
}) {
  const isLong = valor.length > 12;
  const isMedium = valor.length > 8;

  const sizeClass = hero
    ? "text-3xl sm:text-4xl lg:text-5xl"
    : isLong
      ? "text-base sm:text-lg lg:text-lg xl:text-xl"
      : isMedium
        ? "text-lg sm:text-xl lg:text-xl xl:text-2xl"
        : "text-xl sm:text-2xl lg:text-2xl xl:text-3xl";

  return (
    <div className="flex flex-col justify-between min-w-0 rounded-xl border border-[var(--color-line)] bg-white p-4 sm:p-4.5 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-[var(--color-mute)] truncate" title={label}>
        {label}
      </span>
      <span
        className={`font-heading font-bold leading-tight tracking-tight text-[var(--color-ink)] whitespace-nowrap truncate mt-1 ${sizeClass}`}
        title={valor}
      >
        {valor}
      </span>
      <div className="mt-2 text-xs text-[var(--color-mute)] truncate">{children}</div>
    </div>
  );
}

export function Card({
  title,
  sub,
  children,
  wide,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-[var(--color-line-strong)] bg-white p-5 sm:p-6 shadow-[0_1px_4px_rgba(0,0,0,0.02)] ${wide ? "md:col-span-2" : ""}`}
    >
      <h2 className="font-heading text-lg font-bold tracking-tight text-[var(--color-ink)]">{title}</h2>
      {sub && <p className="mb-5 mt-1 text-[13px] text-[var(--color-mute)]">{sub}</p>}
      {!sub && <div className="mb-5" />}
      {children}
    </section>
  );
}

/**
 * Chips de janela + intervalo personalizado com estética editorial DRYOS.
 */
export function FiltroPeriodo({
  action,
  keys,
  labels,
  activeKey,
  fromDate,
  toDate,
}: {
  action: string;
  keys: readonly string[];
  labels: Record<string, string>;
  activeKey: string;
  fromDate: string | null;
  toDate: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
        {keys.map((k) => {
          const active = k === activeKey;
          return (
            <a
              key={k}
              href={`${action}?range=${k}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-xs sm:text-sm transition ${
                active
                  ? "bg-[var(--color-oak)] font-medium text-[var(--color-bg)] shadow-xs"
                  : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
              }`}
            >
              {labels[k]}
            </a>
          );
        })}
      </nav>

      <form
        method="get"
        action={action}
        className={`flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 pl-3 ${
          activeKey === "custom" ? "border-[var(--color-oak)]" : ""
        }`}
      >
        <label htmlFor="from" className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-mute)]">
          De
        </label>
        <input
          id="from"
          type="date"
          name="from"
          defaultValue={fromDate ?? ""}
          className="rounded-md border border-[var(--color-line-strong)] bg-white px-2 py-1 text-xs sm:text-sm text-[var(--color-ink)]"
        />
        <label htmlFor="to" className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-mute)]">
          até
        </label>
        <input
          id="to"
          type="date"
          name="to"
          defaultValue={toDate ?? ""}
          className="rounded-md border border-[var(--color-line-strong)] bg-white px-2 py-1 text-xs sm:text-sm text-[var(--color-ink)]"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--color-oak)] px-3 py-1.5 text-xs sm:text-sm font-medium text-[var(--color-bg)] transition hover:bg-[var(--color-ink)]"
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}

/** Avisos de cobertura: o que ficou fora ou sem decomposição exata no período. */
export function Avisos({
  foreignCount,
  semDecomposicao,
}: {
  foreignCount: number;
  semDecomposicao: number;
}) {
  const itens: string[] = [];
  if (foreignCount > 0) {
    itens.push(
      `${nf(foreignCount)} ${foreignCount === 1 ? "venda em moeda estrangeira não incluída" : "vendas em moeda estrangeira não incluídas"} nos valores (sem conversão para BRL).`,
    );
  }
  if (semDecomposicao > 0) {
    itens.push(
      `${nf(semDecomposicao)} ${semDecomposicao === 1 ? "venda ainda sem" : "vendas ainda sem"} a taxa exata da Hotmart: o valor é o pago pelo comprador e a taxa aparece como R$ 0.`,
    );
  }
  if (itens.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--color-clay)]/30 bg-[var(--color-clay)]/5 px-4 py-2.5 text-xs text-[var(--color-ink-soft)] leading-relaxed">
      {itens.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </div>
  );
}
