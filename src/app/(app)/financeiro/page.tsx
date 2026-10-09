import {
  getFinancialData,
  RANGE_KEYS,
  type RangeKey,
} from "@/lib/sales-data";
import {
  Avisos,
  Card,
  FiltroPeriodo,
  Tile,
  cf,
  nf,
  pf,
} from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { FinancialLedgerTable } from "@/components/financial-ledger-table";

export const dynamic = "force-dynamic";

const RANGE_LABEL: Record<RangeKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7": "7 dias",
  "30": "30 dias",
  "90": "90 dias",
  ano: "Este Ano",
  all: "Todo o histórico",
};

type PageProps = {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function FinancialDashboardPage(props: PageProps) {
  const params = await props.searchParams;
  const range = (params.range as RangeKey) || "30";
  const { from, to } = params;

  const data = await getFinancialData(range, from, to);
  const {
    synthesis,
    paymentMethods,
    parceladoHotmart,
    cardInstallments,
    transactions,
  } = data;

  const activeKey = from || to ? "custom" : range;

  return (
    <div className="flex flex-col gap-8 max-w-[1320px] mx-auto">
      {/* 1. Cabeçalho e Filtro de Período */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-line)] pb-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)] mb-1">
            — Auditoria e Operação de Caixa
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--color-ink)]">
            Visão Financeira & Meios de Pagamento
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--color-mute)]">
              Taxa exata da Hotmart, comissões de terceiros, Parcelado Hotmart e parcelamento no cartão. Em reais, só vendas aprovadas; faturamento = preço da oferta, sem juros de parcelamento.
            </p>
            <span className="hidden sm:inline text-xs text-[var(--color-line-strong)]">·</span>
            <AutoRefresh intervalMinutes={5} />
          </div>
        </div>

        <FiltroPeriodo
          action="/financeiro"
          keys={RANGE_KEYS}
          labels={RANGE_LABEL}
          activeKey={activeKey}
          fromDate={from ?? null}
          toDate={to ?? null}
        />
      </div>

      <Avisos
        foreignCount={data.foreignCount}
        convertidasCount={data.convertidasCount}
        semDecomposicao={data.semDecomposicao}
      />

      {/* 2. Top KPIs: Síntese de Caixa & Retenções */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
            01 / 04 · Síntese: Faturamento, Taxa e Líquido
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Faturamento (oferta)" valor={cf(synthesis.faturamentoBruto, true)}>
            <span className="text-xs text-[var(--color-mute)]">
              {nf(synthesis.totalTransacoes)} vendas aprovadas
            </span>
          </Tile>

          <Tile label="Faturamento Líquido" valor={cf(synthesis.faturamentoLiquido, true)}>
            <span className="text-xs font-semibold text-[var(--color-good)]">
              {pf(synthesis.margemLiquida)} do faturamento
            </span>
          </Tile>

          <Tile label="Taxa Hotmart" valor={cf(synthesis.retencaoTotal, true)}>
            <span className="text-xs text-[var(--color-clay)]">
              {pf(synthesis.pctRetencao)} do faturamento
            </span>
          </Tile>

          <Tile label="Outras comissões" valor={cf(synthesis.outrasComissoes, true)}>
            <span className="text-xs text-[var(--color-mute)]">
              Co-produtor, add-on e câmbio
            </span>
          </Tile>

          <Tile label="Ticket Médio Líquido" valor={cf(synthesis.ticketMedioLiquido)}>
            <span className="text-xs text-[var(--color-mute)]">
              Faturamento: {cf(synthesis.ticketMedioBruto)}
            </span>
          </Tile>

          <Tile label="Clientes Únicos" valor={nf(synthesis.clientesUnicos)}>
            <span className="text-xs text-[var(--color-mute)]">
              No período selecionado
            </span>
          </Tile>
        </div>
      </section>

      {/* 3. Raio-X Completo de Meios de Pagamento */}
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          02 / 04 · Meios de Pagamento
        </span>
        <Card
          title="Meios de pagamento"
          sub="Faturamento (oferta), taxa exata da Hotmart, comissões de terceiros e líquido por meio de pagamento."
          wide
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
                  <th className="py-2.5 px-3">Meio de Pagamento</th>
                  <th className="py-2.5 pr-3 text-right">Vendas</th>
                  <th className="py-2.5 pr-3 text-right">Share Vol.</th>
                  <th className="py-2.5 pr-3 text-right">Faturamento</th>
                  <th className="py-2.5 pr-3 text-right">Taxa Hotmart</th>
                  <th className="py-2.5 pr-3 text-right">Outras comissões</th>
                  <th className="py-2.5 pr-3 text-right">Líquido</th>
                  <th className="py-2.5 pr-3 text-right">Ticket Médio</th>
                  <th className="py-2.5 pr-3 text-right">Taxa %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {paymentMethods.map((p) => {
                  const isPix = p.method.toLowerCase().includes("pix");
                  const isCard = p.method.toLowerCase().includes("cartão");
                  const isParcelado = p.method.toLowerCase().includes("parcelado");

                  return (
                    <tr
                      key={p.method}
                      className="hover:bg-[var(--color-surface)]/60 transition-colors"
                    >
                      <td className="py-3 px-3 font-medium text-[var(--color-ink)] flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isPix
                              ? "bg-[var(--color-good)]"
                              : isCard
                              ? "bg-[var(--color-oak)]"
                              : isParcelado
                              ? "bg-[#D97706]"
                              : "bg-[var(--color-mute)]"
                          }`}
                        />
                        <span>{p.method}</span>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-ink)]">
                        {nf(p.transacoes)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-mute)]">
                        {pf(p.shareVolume)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                        {cf(p.bruto)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-clay)] whitespace-nowrap">
                        -{cf(p.taxa)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                        {cf(p.outras)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-good)] whitespace-nowrap">
                        {cf(p.liquido)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-ink)] whitespace-nowrap">
                        {cf(p.ticketMedio)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-xs whitespace-nowrap font-medium">
                        {pf(p.taxaPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </Card>
      </section>

      {/* 4. Módulo Parcelado Hotmart & Curva de Juros de Cartão */}
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          03 / 04 · Parcelado Hotmart e Parcelamento no Cartão
        </span>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Dossiê: Parcelado Hotmart */}
          <Card
            title="Parcelado Hotmart"
            sub="Vendas com meio de pagamento Parcelado Hotmart. Cada venda é uma parcela paga."
          >
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] block truncate">
                    Compradores
                  </span>
                  <span className="font-heading text-lg font-bold text-[var(--color-ink)]">
                    {nf(parceladoHotmart.alunasUnicas)}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] block truncate">
                    Parcelas pagas
                  </span>
                  <span className="font-heading text-lg font-bold text-[var(--color-ink)]">
                    {nf(parceladoHotmart.totalTransacoes)}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] block truncate">
                    Líquido
                  </span>
                  <span className="font-heading text-lg font-bold text-[var(--color-good)] whitespace-nowrap">
                    {cf(parceladoHotmart.receitaLiquida, true)}
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] block truncate">
                    Taxa Hotmart
                  </span>
                  <span className="font-heading text-lg font-bold text-[var(--color-clay)] whitespace-nowrap">
                    {cf(parceladoHotmart.retencaoTotal, true)}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[var(--color-ink)] mb-2 uppercase font-mono tracking-wider">
                  Parcelas pagas por plano de parcelamento
                </h4>
                {parceladoHotmart.porParcela.length === 0 && (
                  <p className="py-4 text-xs text-[var(--color-mute)]">
                    Nenhuma venda no Parcelado Hotmart no período.
                  </p>
                )}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {parceladoHotmart.porParcela.map((p) => {
                    const maxTx = Math.max(
                      ...parceladoHotmart.porParcela.map((x) => x.transacoes),
                      1,
                    );
                    const pctBar = (p.transacoes / maxTx) * 100;

                    return (
                      <div key={p.parcela} className="flex items-center gap-3 text-xs">
                        <span className="w-16 font-mono text-[var(--color-mute)]">
                          plano {p.parcela}x
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#D97706] transition-all"
                            style={{ width: `${pctBar}%` }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono font-medium text-[var(--color-ink)]">
                          {nf(p.transacoes)}
                        </span>
                        <span className="w-20 text-right font-mono text-[var(--color-mute)] whitespace-nowrap">
                          {cf(p.bruto)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </Card>

          {/* Curva de Eficiência no Parcelamento de Cartão */}
          <Card
            title="Taxa Hotmart por parcelas no cartão (1x a 12x)"
            sub="Taxa Hotmart ÷ faturamento (oferta) das vendas no cartão, por número de parcelas."
          >
            <div className="flex flex-col gap-3">
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {cardInstallments
                  .filter((inst) => inst.transacoes > 0)
                  .map((inst) => {
                    const is12x = inst.parcela === 12;
                    const is1x = inst.parcela === 1;

                    return (
                      <div
                        key={inst.parcela}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-[var(--color-surface)] transition text-xs border border-[var(--color-line)]"
                      >
                        <div className="flex items-center gap-2 w-28">
                          <span
                            className={`font-mono font-semibold ${
                              is1x
                                ? "text-[var(--color-good)]"
                                : is12x
                                ? "text-[var(--color-clay)]"
                                : "text-[var(--color-ink)]"
                            }`}
                          >
                            {`${inst.parcela}x`}
                          </span>
                          <span className="text-[10px] text-[var(--color-mute)] font-mono">
                            ({nf(inst.transacoes)})
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div className="min-w-[80px]">
                            <span className="text-[10px] text-[var(--color-mute)] block font-mono">Faturamento</span>
                            <span className="font-mono text-xs font-medium text-[var(--color-ink)] whitespace-nowrap">
                              {cf(inst.bruto, true)}
                            </span>
                          </div>

                          <div className="min-w-[70px]">
                            <span className="text-[10px] text-[var(--color-mute)] block font-mono">Taxa Hotmart</span>
                            <span
                              className="font-mono text-xs font-semibold whitespace-nowrap text-[var(--color-oak)]"
                            >
                              {pf(inst.taxaMediaPct)}
                            </span>
                          </div>

                        </div>
                      </div>
                    );
                  })}
              </div>

            </div>
          </Card>
        </div>
      </section>

      {/* 5. Extrato de Transações */}
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          04 / 04 · Extrato de Vendas
        </span>
        <Card
          title="Extrato de vendas"
          sub="Vendas do período, da mais recente para a mais antiga, com taxa retida e meio de pagamento."
          wide
        >
          <FinancialLedgerTable transactions={transactions} total={synthesis.totalTransacoes} />
        </Card>
      </section>
    </div>
  );
}
