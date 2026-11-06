import { getBlackFridayData } from "@/lib/black-friday-data";
import { RANGE_KEYS, sanitizePeriod, type RangeKey } from "@/lib/sales-data";
import { Card, FiltroPeriodo, Tile, cf, nf, pf } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { BlackFridayTable } from "@/components/black-friday-table";

export const dynamic = "force-dynamic";

const BF_RANGE_KEYS = ["all", "hoje", "ontem", "7"] as const;

const BF_RANGE_LABELS: Record<string, string> = {
  all: "Toda a Campanha",
  hoje: "Hoje",
  ontem: "Ontem",
  "7": "Últimos 7 dias",
};

type PageProps = {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function BlackFridayPage(props: PageProps) {
  const params = await props.searchParams;
  // Se não passou range nem datas customizadas, o default é "all" (toda a campanha da BF)
  const rangeParam = params.range ?? (params.from || params.to ? undefined : "all");
  const { range, from, to } = sanitizePeriod({ ...params, range: rangeParam });

  const data = await getBlackFridayData(range, from, to);
  const { synthesis, dailySeries, porCanal, porPagamento, porProduto, transacoes } = data;

  const activeKey = from || to ? "custom" : range;
  const pctMargem = synthesis.faturamentoOferta > 0 ? (synthesis.faturamentoLiquido / synthesis.faturamentoOferta) * 100 : 0;
  const pctTaxa = synthesis.faturamentoOferta > 0 ? (synthesis.taxaHotmartTotal / synthesis.faturamentoOferta) * 100 : 0;
  const maxDailyFat = Math.max(...dailySeries.map((d) => d.faturamentoOferta), 1);

  return (
    <div className="flex flex-col gap-8 max-w-[1320px] mx-auto pb-12">
      {/* Header com indicador de página oculta e AutoRefresh */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-line)] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)]">
              — Campanha Especial
            </span>
            <span className="inline-flex items-center rounded-full bg-[var(--color-clay)]/10 px-2 py-0.5 font-mono text-[9px] uppercase font-semibold text-[var(--color-clay)] border border-[var(--color-clay)]/20">
              Página Oculta
            </span>
          </div>

          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--color-ink)]">
            Combo Black Friday 2027
          </h1>

          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--color-mute)]">
              Monitoramento exclusivo das vendas, faturamento, meios de pagamento e rastreio (SCK) dos Combos de Black Friday.
            </p>
            <span className="hidden sm:inline text-xs text-[var(--color-line-strong)]">·</span>
            <AutoRefresh intervalMinutes={1} />
          </div>
        </div>

        <div>
          <FiltroPeriodo
            action="/black-friday"
            keys={BF_RANGE_KEYS}
            labels={BF_RANGE_LABELS}
            activeKey={activeKey}
            fromDate={from ? from.slice(0, 10) : null}
            toDate={to ? to.slice(0, 10) : null}
          />
        </div>
      </div>

      {/* 1. Destaques Financeiros Principais (Faturamento da Oferta & Líquido) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-xl border border-[var(--color-line-strong)] bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-mute)]">
              Faturamento da Oferta
            </span>
            <span className="font-mono text-xs text-[var(--color-mute)]">
              {nf(synthesis.totalVendas)} vendas aprovadas
            </span>
          </div>

          <div className="my-2.5">
            <span className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--color-ink)]">
              {cf(synthesis.faturamentoOferta)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-mute)] border-t border-[var(--color-line)] pt-3 mt-1">
            <span>Ticket médio: <strong className="text-[var(--color-ink)] font-mono">{cf(synthesis.ticketMedioOferta)}</strong></span>
            <span>·</span>
            <span>Hoje: <strong className="text-[var(--color-oak)] font-mono">{cf(synthesis.faturamentoHoje)}</strong> ({synthesis.vendasHoje} vendas)</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-[var(--color-oak)]/30 bg-[var(--color-oak-tint)]/30 p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-oak)] font-semibold">
              Faturamento Líquido (Recebido)
            </span>
            <span className="rounded-full bg-[var(--color-oak)]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-oak)]">
              {pf(pctMargem)} margem
            </span>
          </div>

          <div className="my-2.5">
            <span className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--color-oak)]">
              {cf(synthesis.faturamentoLiquido)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-mute)] border-t border-[var(--color-oak)]/15 pt-3 mt-1">
            <span>Taxas Hotmart: <strong className="text-[var(--color-clay)] font-mono">{cf(synthesis.taxaHotmartTotal)}</strong> ({pf(pctTaxa)})</span>
            <span>·</span>
            <span>Ticket liq.: <strong className="text-[var(--color-ink)] font-mono">{cf(synthesis.ticketMedioLiquido)}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. Grid de Métricas Secundárias */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Tile label="Vendas Totais" valor={nf(synthesis.totalVendas)}>
          <span>
            {nf(synthesis.clientesUnicos)} clientes ({pf(synthesis.taxaRecompra)} recompra)
          </span>
        </Tile>

        <Tile label="Vendas Hoje" valor={nf(synthesis.vendasHoje)}>
          <span className="text-[var(--color-oak)] font-medium">
            {cf(synthesis.faturamentoHoje, true)} na oferta
          </span>
        </Tile>

        <Tile label="Ticket Médio" valor={cf(synthesis.ticketMedioOferta, true)}>
          <span>Líquido: {cf(synthesis.ticketMedioLiquido, true)}</span>
        </Tile>

        <Tile label="Total Pago c/ Juros" valor={cf(synthesis.valorBrutoPago, true)}>
          <span className="text-[11px] text-[var(--color-mute-soft)]">
            + {cf(synthesis.valorBrutoPago - synthesis.faturamentoOferta, true)} juros Hotmart
          </span>
        </Tile>
      </div>

      {/* Evolução Diária */}
      <Card
        title="Evolução Diária da Campanha"
        sub="Vendas aprovadas por dia em horário de Brasília (UTC-3). O faturamento segue o preço de oferta."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 pr-4 text-right">Vendas</th>
                <th className="py-2.5 pr-4 text-right">Faturamento (Oferta)</th>
                <th className="py-2.5 pr-4 text-right">Participação</th>
                <th className="py-2.5 pr-4 text-right">Líquido</th>
                <th className="py-2.5 pr-4 text-right">Taxa Hotmart</th>
                <th className="py-2.5 pr-4 text-right">Valor Pago (c/ juros)</th>
                <th className="py-2.5 pr-3 text-right">Ticket Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {dailySeries.map((d) => {
                const pctFat = synthesis.faturamentoOferta > 0 ? (d.faturamentoOferta / synthesis.faturamentoOferta) * 100 : 0;
                return (
                  <tr key={d.date} className="hover:bg-[var(--color-surface)]/60 transition-colors">
                    <td className="py-3 px-3 font-semibold text-[var(--color-ink)]">
                      {d.date}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-sm font-bold text-[var(--color-ink)]">
                      {nf(d.vendas)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-[var(--color-ink)] whitespace-nowrap">
                      {cf(d.faturamentoOferta)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-oak)]"
                            style={{ width: `${Math.min(100, (d.faturamentoOferta / maxDailyFat) * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 font-mono text-xs text-[var(--color-mute)]">{pf(pctFat)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                      {cf(d.faturamentoLiquido)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                      {cf(d.taxaHotmart)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-xs text-[var(--color-mute-soft)] whitespace-nowrap">
                      {cf(d.valorBruto)}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono text-xs whitespace-nowrap">
                      {cf(d.ticketMedio)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Rastreio e Origens (SCK / UTMs) */}
      <Card
        title="Desempenho por Canal & SCK"
        sub="Origem capturada no parâmetro sck de cada venda, com abertura por mensagem/link enviado."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
                <th className="py-2.5 px-3">Canal / Mensagem</th>
                <th className="py-2.5 pr-4 text-right">Vendas</th>
                <th className="py-2.5 pr-4 text-right">Faturamento</th>
                <th className="py-2.5 pr-4 text-right">% do Fat.</th>
                <th className="py-2.5 pr-4 text-right">Líquido</th>
                <th className="py-2.5 pr-3 text-right">Ticket Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {porCanal.map((c) => (
                <tr key={c.canal} className="hover:bg-[var(--color-surface)]/60 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[var(--color-ink)] text-sm">{c.canal}</div>
                    {c.mensagens.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.mensagens.map((m) => (
                          <span
                            key={m.label}
                            className="inline-flex items-center gap-1 rounded bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-ink-soft)]"
                          >
                            <span className="font-semibold">{m.label}:</span> {m.vendas} vendas ({cf(m.faturamento)})
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs font-bold text-[var(--color-ink)]">
                    {nf(c.vendas)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                    {cf(c.faturamento)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-oak)]"
                          style={{ width: `${Math.min(100, c.pctFaturamento)}%` }}
                        />
                      </div>
                      <span className="w-12 font-mono text-xs text-[var(--color-mute)]">{pf(c.pctFaturamento)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                    {cf(c.liquido)}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono text-xs whitespace-nowrap">
                    {cf(c.ticketMedio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Grid com Meios de Pagamento e Produtos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Meios de Pagamento */}
        <Card
          title="Meios de Pagamento"
          sub="Distribuição entre Cartão, Parcelado Hotmart, Pix, Apple Pay e NuPay."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
                  <th className="py-2.5 px-3">Método</th>
                  <th className="py-2.5 pr-3 text-right">Vendas</th>
                  <th className="py-2.5 pr-3 text-right">Share %</th>
                  <th className="py-2.5 pr-3 text-right">Faturamento</th>
                  <th className="py-2.5 pr-3 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {porPagamento.map((p) => (
                  <tr key={p.metodo} className="hover:bg-[var(--color-surface)]/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                      {p.metodo}
                      {p.metodo === "Parcelado Hotmart" && (
                        <span className="ml-2 inline-block rounded bg-[var(--color-clay)]/10 px-1.5 py-0.2 font-mono text-[9px] uppercase font-semibold text-[var(--color-clay)]">
                          Ativo hoje
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-ink)]">
                      {nf(p.vendas)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-[var(--color-mute)]">
                      {pf(p.pctVendas)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs whitespace-nowrap">
                      {cf(p.faturamento)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                      {cf(p.liquido)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Produtos */}
        <Card
          title="Produtos da Black Friday"
          sub="Divisão entre oferta principal e oferta exclusiva para alunos."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 pr-3 text-right">Vendas</th>
                  <th className="py-2.5 pr-3 text-right">Share %</th>
                  <th className="py-2.5 pr-3 text-right">Faturamento</th>
                  <th className="py-2.5 pr-3 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {porProduto.map((pr) => (
                  <tr key={pr.produto} className="hover:bg-[var(--color-surface)]/60 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">
                      {pr.produto}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-ink)]">
                      {nf(pr.vendas)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs text-[var(--color-mute)]">
                      {pf(pr.pctVendas)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs whitespace-nowrap">
                      {cf(pr.faturamento)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                      {cf(pr.liquido)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Extrato Completo de Vendas em Tempo Real */}
      <Card
        title="Extrato de Vendas em Tempo Real"
        sub="Lista completa de transações aprovadas dos Combos Black Friday com busca instantânea e filtros."
      >
        <BlackFridayTable transacoes={transacoes} />
      </Card>
    </div>
  );
}
