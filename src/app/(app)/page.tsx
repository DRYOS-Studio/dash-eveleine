import {
  getDashboardData,
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
import { ProductFamilyTable } from "@/components/product-family-table";
import { LatestSalesFeed } from "@/components/latest-sales-feed";
import { AutoRefresh } from "@/components/auto-refresh";

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

export default async function SalesDashboardPage(props: PageProps) {
  const params = await props.searchParams;
  const range = (params.range as RangeKey) || "30";
  const { from, to } = params;

  const data = await getDashboardData(range, from, to);
  const { synthesis, cenarioUnica, cenarioRecompra, shareLiquidoRecompra } = data;

  const activeKey = from || to ? "custom" : range;
  const periodQuery = new URLSearchParams(
    from || to
      ? { ...(from ? { from } : {}), ...(to ? { to } : {}) }
      : { range },
  ).toString();

  return (
    <div className="flex flex-col gap-8 max-w-[1320px] mx-auto">
      {/* 1. Cabeçalho e Filtro de Período */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-line)] pb-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)] mb-1">
            — Painel de Inteligência Executiva
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--color-ink)]">
            Partiu Empreender em números
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--color-mute)]">
              Vendas aprovadas na Hotmart, em reais. Faturamento = preço da oferta, sem os juros de parcelamento. Estornos e reembolsos não são recebidos.
            </p>
            <span className="hidden sm:inline text-xs text-[var(--color-line-strong)]">·</span>
            <AutoRefresh intervalMinutes={5} />
          </div>
        </div>

        <FiltroPeriodo
          action="/"
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

      {/* 2. Barra de Síntese (Top KPIs) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
            01 / 04 · Síntese de Receita e Clientes
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Faturamento (oferta)" valor={cf(synthesis.faturamentoBruto, true)}>
            <span className="text-xs text-[var(--color-mute)]">
              {nf(synthesis.totalTransacoes)} vendas aprovadas
            </span>
          </Tile>

          <Tile label="Faturamento Líquido" valor={cf(synthesis.faturamentoLiquido, true)}>
            <span className="text-xs font-medium text-[var(--color-good)]">
              {pf(synthesis.faturamentoBruto > 0 ? (synthesis.faturamentoLiquido / synthesis.faturamentoBruto) * 100 : 0)} do faturamento
            </span>
          </Tile>

          <Tile label="Taxa Hotmart" valor={cf(synthesis.taxaHotmartTotal, true)}>
            <span className="text-xs text-[var(--color-mute)]">
              {pf(synthesis.pctTaxaHotmart)} do faturamento
            </span>
          </Tile>

          <Tile label="Ticket Médio" valor={cf(synthesis.ticketMedioBruto)}>
            <span className="text-xs text-[var(--color-mute)]">
              Mediana: {cf(synthesis.ticketMedianoBruto)}
            </span>
          </Tile>

          <Tile label="Clientes Únicos" valor={nf(synthesis.clientesUnicos)}>
            <span className="text-xs text-[var(--color-mute)]">
              {nf(synthesis.recompradores)} com recompra
            </span>
          </Tile>

          <Tile label="Taxa de Recompra" valor={pf(synthesis.taxaRecompra)}>
            <span className="text-xs font-semibold text-[var(--color-oak)]">
              Faturamento por cliente: {cf(synthesis.ltvMedioBruto)}
            </span>
          </Tile>
        </div>
      </section>

      {/* 3. Cenários: Sem recompra vs. Recompra */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
              02 / 04 · Comportamento de Compra
            </span>
            <h2 className="font-heading text-xl font-bold text-[var(--color-ink)] mt-0.5">
              Sem recompra vs Recompra
            </h2>
            <p className="text-sm text-[var(--color-mute)]">
              Recompra = primeira compra de um produto por quem já tinha comprado outro produto. Parcelas e repetições do mesmo produto não contam.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Cenário A */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--color-line-strong)] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
            <div>
              <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)]">
                  Cenário A
                </span>
                <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider font-medium text-[var(--color-mute)]">
                  Sem recompra
                </span>
              </div>
              <h3 className="mt-3 font-heading text-2xl font-bold text-[var(--color-ink)]">Vendas sem recompra</h3>
              <p className="mt-1 text-xs text-[var(--color-mute)]">
                Primeira compra do cliente, compras simultâneas e repetições do mesmo produto.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] truncate block">Transações</span>
                  <p className="text-base sm:text-lg font-heading font-bold truncate text-[var(--color-ink)]">{nf(cenarioUnica.transacoes)}</p>
                  <span className="text-xs text-[var(--color-mute)] truncate block">
                    {pf(cenarioUnica.pctVolume)} do volume
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] truncate block">Receita Líquida</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-[var(--color-good)] whitespace-nowrap truncate" title={cf(cenarioUnica.receitaLiquida)}>
                    {cf(cenarioUnica.receitaLiquida, true)}
                  </p>
                  <span className="text-xs text-[var(--color-mute)] whitespace-nowrap truncate block" title={`Faturamento: ${cf(cenarioUnica.receitaBruta)}`}>
                    Faturamento: {cf(cenarioUnica.receitaBruta, true)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] truncate block">Ticket Médio</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-[var(--color-ink)] whitespace-nowrap truncate" title={cf(cenarioUnica.ticketMedio)}>{cf(cenarioUnica.ticketMedio)}</p>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute)] truncate block">Ticket Mediano</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-[var(--color-ink)] whitespace-nowrap truncate" title={cf(cenarioUnica.ticketMediano)}>{cf(cenarioUnica.ticketMediano)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cenário B */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--color-oak)] bg-[var(--color-oak)] p-6 shadow-md text-[var(--color-bg)]">
            <div>
              <div className="flex items-center justify-between border-b border-white/15 pb-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#9DBFA8] font-medium">
                  Cenário B
                </span>
                <span className="rounded-full bg-[#E9EEE9] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold text-[#1F3A2A]">
                  Recompra
                </span>
              </div>
              <h3 className="mt-3 font-heading text-2xl font-bold text-white !text-white">
                Vendas de recompra
              </h3>
              <p className="mt-1 text-xs text-[#DCE6DD]">
                Primeira compra de um produto por quem já tinha comprado outro.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9DBFA8] truncate block">Transações</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-white !text-white truncate">
                    {nf(cenarioRecompra.transacoes)}
                  </p>
                  <span className="text-xs text-[#C8D6CB] truncate block">
                    {pf(cenarioRecompra.pctVolume)} do volume
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9DBFA8] truncate block">Receita Líquida</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-[#9DBFA8] whitespace-nowrap truncate" title={cf(cenarioRecompra.receitaLiquida)}>
                    {cf(cenarioRecompra.receitaLiquida, true)}
                  </p>
                  <span className="text-xs text-[#C8D6CB] whitespace-nowrap truncate block" title={`Faturamento: ${cf(cenarioRecompra.receitaBruta)}`}>
                    Faturamento: {cf(cenarioRecompra.receitaBruta, true)}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9DBFA8] truncate block">Ticket Médio</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-white !text-white whitespace-nowrap truncate" title={cf(cenarioRecompra.ticketMedio)}>
                    {cf(cenarioRecompra.ticketMedio)}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9DBFA8] truncate block">Ticket Mediano</span>
                  <p className="text-base sm:text-lg font-heading font-bold text-white !text-white whitespace-nowrap truncate" title={cf(cenarioRecompra.ticketMediano)}>
                    {cf(cenarioRecompra.ticketMediano)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Participação da recompra */}
        <div className="rounded-xl border border-[var(--color-oak)]/20 bg-[var(--color-oak-tint)] p-4.5 text-sm text-[var(--color-ink)] leading-relaxed">
          <span className="font-heading font-bold text-[var(--color-oak)]">
            {pf(shareLiquidoRecompra)}
          </span>{" "}
          do faturamento líquido do período vem de vendas de recompra, que são{" "}
          {pf(cenarioRecompra.pctVolume)} das vendas.
        </div>
      </section>

      {/* 4. Produtos & Famílias de Produtos (Interativo por Clique) */}
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          03 / 04 · Mix de Produtos por Família
        </span>
        <Card
          title="Vendas por família de produto"
          sub="Vendas do período por família de produto. Clique em uma linha para listar as vendas da família."
          wide
        >
          <ProductFamilyTable families={data.families} periodQuery={periodQuery} />
        </Card>
      </section>

      {/* 5. Feed das 20 últimas vendas do período */}
      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          04 / 04 · Últimas Vendas
        </span>
        <Card
          title="Últimas 20 vendas do período"
          sub="As 20 vendas aprovadas mais recentes dentro do período selecionado."
          wide
        >
          <LatestSalesFeed sales={data.latestSales} />
        </Card>
      </section>
    </div>
  );
}
