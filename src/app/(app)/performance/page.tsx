import { getPerformanceData, type PerfLinha } from "@/lib/performance-data";
import { RANGE_KEYS, sanitizePeriod, type RangeKey } from "@/lib/sales-data";
import { SEM_RASTREIO } from "@/lib/sck";
import { Card, FiltroPeriodo, Tile, cf, nf, pf } from "@/components/ui";
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
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
};

function TabelaPerf({ titulo, linhas, vazio }: { titulo: string; linhas: PerfLinha[]; vazio: string }) {
  if (linhas.length === 0) {
    return <p className="py-6 text-center text-xs text-[var(--color-mute)]">{vazio}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
            <th className="py-2.5 px-3">{titulo}</th>
            <th className="py-2.5 pr-3 text-right">Vendas</th>
            <th className="py-2.5 pr-3 text-right">Faturamento</th>
            <th className="py-2.5 pr-3 text-right">% do fat.</th>
            <th className="py-2.5 pr-3 text-right">Líquido</th>
            <th className="py-2.5 pr-3 text-right">Ticket médio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line)]">
          {linhas.map((l) => (
            <tr key={`${l.sub ?? ""}|${l.label}`} className="hover:bg-[var(--color-surface)]/60 transition-colors">
              <td className="py-2.5 px-3 max-w-[340px]">
                <div className="font-medium text-[var(--color-ink)] truncate" title={l.label}>{l.label}</div>
                {l.sub && (
                  <div className="font-mono text-[10px] text-[var(--color-mute)] truncate" title={l.sub}>{l.sub}</div>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs">{nf(l.vendas)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">{cf(l.faturamento)}</td>
              <td className="py-2.5 pr-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-oak)]"
                      style={{ width: `${Math.min(100, l.pctFaturamento)}%` }}
                    />
                  </div>
                  <span className="w-12 font-mono text-xs text-[var(--color-mute)]">{pf(l.pctFaturamento)}</span>
                </div>
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">{cf(l.liquido)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs whitespace-nowrap">{cf(l.ticketMedio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PerformancePage(props: PageProps) {
  const { range, from, to } = sanitizePeriod(await props.searchParams);
  const data = await getPerformanceData(range, from, to);
  const activeKey = from || to ? "custom" : range;

  const pctRast = data.totalVendas > 0 ? (data.rastreadasVendas / data.totalVendas) * 100 : 0;
  const pctFatRast = data.totalFaturamento > 0 ? (data.rastreadasFaturamento / data.totalFaturamento) * 100 : 0;
  const maior = data.porCanal.find((c) => c.label !== SEM_RASTREIO);

  return (
    <div className="flex flex-col gap-8 max-w-[1320px] mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-line)] pb-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)] mb-1">
            — Origem do Tráfego
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--color-ink)]">
            Performance
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--color-mute)]">
              Vendas por origem, campanha e anúncio, lidas do rastreio (sck) de cada venda. Mostra só vendas:
              cliques, impressões e gasto com anúncios não estão no banco.
            </p>
            <span className="hidden sm:inline text-xs text-[var(--color-line-strong)]">·</span>
            <AutoRefresh intervalMinutes={5} />
          </div>
        </div>

        <FiltroPeriodo
          action="/performance"
          keys={RANGE_KEYS}
          labels={RANGE_LABEL}
          activeKey={activeKey}
          fromDate={from}
          toDate={to}
        />
      </div>

      <section className="flex flex-col gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          01 / 04 · Cobertura do Rastreio
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Vendas no período" valor={nf(data.totalVendas)}>
            <span className="text-xs text-[var(--color-mute)]">{cf(data.totalFaturamento, true)} de faturamento</span>
          </Tile>
          <Tile label="Com rastreio" valor={nf(data.rastreadasVendas)}>
            <span className="text-xs text-[var(--color-mute)]">{pf(pctRast)} das vendas</span>
          </Tile>
          <Tile label="Faturamento rastreado" valor={cf(data.rastreadasFaturamento, true)}>
            <span className="text-xs text-[var(--color-mute)]">{pf(pctFatRast)} do faturamento</span>
          </Tile>
          <Tile label="Líquido rastreado" valor={cf(data.rastreadasLiquido, true)}>
            <span className="text-xs font-medium text-[var(--color-good)]">
              {pf(data.rastreadasFaturamento > 0 ? (data.rastreadasLiquido / data.rastreadasFaturamento) * 100 : 0)} do faturamento
            </span>
          </Tile>
          <Tile
            label="Ticket médio rastreado"
            valor={cf(data.rastreadasVendas > 0 ? data.rastreadasFaturamento / data.rastreadasVendas : 0)}
          >
            <span className="text-xs text-[var(--color-mute)]">Só vendas com rastreio</span>
          </Tile>
          <Tile label="Maior canal" valor={maior ? maior.label : "—"}>
            <span className="text-xs text-[var(--color-mute)]">
              {maior ? `${pf(maior.pctFaturamento)} do faturamento` : "Sem vendas rastreadas"}
            </span>
          </Tile>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          02 / 04 · Por Canal
        </span>
        <Card
          title="Vendas por canal de origem"
          sub="Agrupa metaads, Facebook-Ads e Meta-ads como Meta Ads; os demais aparecem como vêm no rastreio. “Sem rastreio” são vendas sem sck ou sem origem informada."
          wide
        >
          <TabelaPerf titulo="Canal" linhas={data.porCanal} vazio="Nenhuma venda no período selecionado." />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          03 / 04 · Por Campanha
        </span>
        <Card
          title="Vendas por campanha"
          sub={`Só vendas rastreadas que informam a campanha${
            data.rastreadasSemCampanha > 0 ? `; ${nf(data.rastreadasSemCampanha)} vendas rastreadas não informam (ex.: direto, página Hotmart)` : ""
          }. Mostra as 15 maiores por faturamento.`}
          wide
        >
          <TabelaPerf titulo="Campanha" linhas={data.porCampanha} vazio="Nenhuma venda com campanha informada no período." />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
          04 / 04 · Por Anúncio e Posicionamento
        </span>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Vendas por anúncio"
            sub={`Só vendas rastreadas que informam o anúncio${
              data.rastreadasSemAnuncio > 0 ? `; ${nf(data.rastreadasSemAnuncio)} não informam` : ""
            }. 15 maiores por faturamento.`}
          >
            <TabelaPerf titulo="Anúncio" linhas={data.porAnuncio} vazio="Nenhuma venda com anúncio informado no período." />
          </Card>
          <Card title="Vendas por posicionamento" sub="Onde o anúncio foi exibido (ex.: Instagram_Feed), quando o rastreio informa.">
            <TabelaPerf titulo="Posicionamento" linhas={data.porPosicionamento} vazio="Nenhuma venda com posicionamento informado no período." />
          </Card>
        </div>
      </section>
    </div>
  );
}
