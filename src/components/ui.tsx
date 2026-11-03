import { CACHE_S, type Breakdown } from "@/lib/data";

// Peças de apresentação usadas por mais de uma página (Captação e Agenda).
// O que serve a uma página só continua morando no arquivo dela — aqui entra
// exclusivamente o que já tem dois usos reais.

export const nf = (n: number) => n.toLocaleString("pt-BR");
export const pf = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
export const fmtDate = (d: string) => d.split("-").reverse().join("/");
export const diaMes = (d: string) => d.slice(8, 10);
export const taxa = (parte: number, total: number) => (total ? (parte / total) * 100 : 0);

/** Arredonda o topo do eixo pra um número limpo acima do máximo. */
export function niceMax(v: number): number {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

/** Subtítulo de card de quebra: quantos valores distintos, e se foi cortado no top 10. */
export function legenda(b: Breakdown): string {
  const plural = b.distinct === 1 ? "valor" : "valores";
  return b.capped
    ? `${nf(b.distinct)} ${plural} — top 10 abaixo`
    : `${nf(b.distinct)} ${plural}`;
}

const TZ_SP_MS = 3 * 3600_000; // America/Sao_Paulo = UTC-3, sem horário de verão

function idade(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "há instantes";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86_400)} d`;
}

/**
 * Quando o dado foi LIDO — o carimbo vem de dentro do valor em cache, então uma resposta
 * servida do cache (mesmo velha) mostra a hora verdadeira, não a da visita.
 *
 * Só sugere recarregar quando o dado passou do prazo de validade da fonte (`validoS`, mais
 * 30 s de folga para a renovação): aí a visita já disparou a renovação em segundo plano e
 * recarregar traz o atual. Dentro do prazo recarregar não muda nada — a listagem do
 * Calendly, por exemplo, vale 5 min de propósito.
 */
export function Atualizado({
  geradoEm,
  rotulo = "Atualizado",
  validoS = CACHE_S,
}: {
  geradoEm: string;
  rotulo?: string;
  validoS?: number;
}) {
  const t = Date.parse(geradoEm);
  const sp = new Date(t - TZ_SP_MS).toISOString(); // lido em UTC = hora de SP
  const quando = `${sp.slice(8, 10)}/${sp.slice(5, 7)} às ${sp.slice(11, 16)}`;
  const ms = Date.now() - t;
  return (
    <span className="text-xs text-[var(--color-muted-2)]">
      {rotulo} em {quando} ({idade(ms)})
      {ms > (validoS + 30) * 1000 ? " — recarregue para ver o mais recente" : ""}
    </span>
  );
}

export function Delta({
  atual,
  anterior,
  pp,
}: {
  atual: number;
  anterior: number;
  pp?: boolean;
}) {
  // pp = pontos percentuais (para taxas); senão, variação relativa
  const dif = pp ? atual - anterior : anterior === 0 ? 0 : ((atual - anterior) / anterior) * 100;
  if (!pp && anterior === 0) {
    return <span className="text-xs text-[var(--color-muted-2)]">sem base anterior</span>;
  }
  const subiu = dif >= 0;
  const cor = subiu ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]";
  const valor = pp
    ? Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p."
    : pf(Math.abs(dif));
  return (
    <span className={`flex items-baseline gap-1.5 text-xs font-semibold ${cor}`}>
      <span aria-hidden className="text-[9px]">
        {subiu ? "▲" : "▼"}
      </span>
      {valor}
      <span className="font-normal text-[var(--color-muted-2)]">
        {subiu ? "acima de" : "abaixo de"} {pp ? pf(anterior) : nf(anterior)}
      </span>
    </span>
  );
}

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
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-[var(--color-surface)] p-5">
      <span className="text-[13px] text-[var(--color-muted)]">{label}</span>
      <span
        className={`font-semibold leading-tight tracking-tight ${hero ? "text-5xl" : "text-3xl"}`}
      >
        {valor}
      </span>
      {children}
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
    // min-w-0: sem isso o item de grid cresce pra caber a tabela e empurra a
    // página pra rolar lateralmente, em vez de a tabela rolar dentro do card
    <section
      className={`min-w-0 rounded-xl border bg-[var(--color-surface)] p-5 ${wide ? "md:col-span-2" : ""}`}
    >
      <h2 className="text-base font-semibold">{title}</h2>
      {sub && <p className="mb-4 text-[13px] text-[var(--color-muted)]">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </section>
  );
}

/**
 * Chips de janela + intervalo personalizado. As páginas filtram por
 * período, mas nem todas com as mesmas chaves (a Vendas usa as da Captação): a Captação olha pra trás (leads que já
 * entraram), a Agenda também olha pra frente (reuniões que vão acontecer).
 * Daí as chaves e a rota virem por prop em vez de fixas.
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
      <nav className="flex flex-wrap gap-1 rounded-lg border bg-[var(--color-surface)] p-1">
        {keys.map((k) => {
          const active = k === activeKey;
          return (
            <a
              key={k}
              href={`${action}?range=${k}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-[var(--color-accent)] font-medium text-[#231108]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
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
        className={`flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--color-surface)] p-1 pl-3 ${
          activeKey === "custom" ? "border-[var(--color-accent)]" : ""
        }`}
      >
        <label htmlFor="from" className="text-sm text-[var(--color-muted)]">
          De
        </label>
        <input
          id="from"
          type="date"
          name="from"
          defaultValue={fromDate ?? ""}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
        />
        <label htmlFor="to" className="text-sm text-[var(--color-muted)]">
          até
        </label>
        <input
          id="to"
          type="date"
          name="to"
          defaultValue={toDate ?? ""}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#231108]"
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}
