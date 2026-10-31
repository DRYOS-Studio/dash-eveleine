import { getCohorteData } from "@/lib/cohorte-data";
import type { FaixaLinha, MesLinha } from "@/lib/cohorte-calc";
import { Card, Tile, cf, nf, pf } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
const dias = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${n === 1 ? "dia" : "dias"}`;

function GraficoMensal({ meses }: { meses: MesLinha[] }) {
  const max = Math.max(...meses.map((m) => m.faturamento), 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 h-52 border-b border-[var(--color-line-strong)]" style={{ minWidth: meses.length * 44 }}>
        {meses.map((m) => (
          <div
            key={m.mes}
            className="flex flex-1 items-end justify-center gap-0.5 h-full"
            title={`${rotuloMes(m.mes)}${m.parcial ? " (parcial)" : ""} · faturamento ${cf(m.faturamento)} · líquido ${cf(m.liquido)}`}
          >
            <div
              className={`w-3 rounded-t-sm bg-[var(--color-oak)] ${m.parcial ? "opacity-50" : ""}`}
              style={{ height: `${(m.faturamento / max) * 100}%` }}
            />
            <div
              className="w-3 rounded-t-sm bg-[var(--color-oak-light)]"
              style={{ height: `${(m.liquido / max) * 100}%`, opacity: m.parcial ? 0.3 : 0.55 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5" style={{ minWidth: meses.length * 44 }}>
        {meses.map((m) => (
          <span key={m.mes} className="flex-1 text-center font-mono text-[10px] text-[var(--color-mute)]">
            {rotuloMes(m.mes)}
            {m.parcial ? "*" : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--color-mute)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-oak)]" /> Faturamento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--color-oak-light)] opacity-55" /> Líquido
        </span>
        {meses.some((m) => m.parcial) && <span>* mês em andamento</span>}
      </div>
    </div>
  );
}

function TabelaMensal({ meses }: { meses: MesLinha[] }) {
  const linhas = [...meses].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
            <th className="py-2.5 px-3">Mês</th>
            <th className="py-2.5 pr-3 text-right">Vendas</th>
            <th className="py-2.5 pr-3 text-right">Clientes únicos</th>
            <th className="py-2.5 pr-3 text-right">Faturamento</th>
            <th className="py-2.5 pr-3 text-right">Líquido</th>
            <th className="py-2.5 pr-3 text-right">Ticket médio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line)]">
          {linhas.map((m) => (
            <tr key={m.mes} className="hover:bg-[var(--color-surface)]/60 transition-colors">
              <td className="py-2.5 px-3 font-medium text-[var(--color-ink)] whitespace-nowrap">
                {rotuloMes(m.mes)}
                {m.parcial && <span className="ml-2 font-mono text-[10px] text-[var(--color-warn)]">parcial</span>}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs">{nf(m.vendas)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs">{nf(m.clientes)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">{cf(m.faturamento)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">{cf(m.liquido)}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs whitespace-nowrap">
                {m.vendas > 0 ? cf(m.faturamento / m.vendas) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaFaixas({ titulo, faixas, comLtv }: { titulo: string; faixas: FaixaLinha[]; comLtv?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
            <th className="py-2.5 px-3">{titulo}</th>
            <th className="py-2.5 pr-3 text-right">Clientes</th>
            <th className="py-2.5 pr-3 text-right">% dos clientes</th>
            {comLtv && <th className="py-2.5 pr-3 text-right">LTV médio</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line)]">
          {faixas.map((f) => (
            <tr key={f.rotulo} className="hover:bg-[var(--color-surface)]/60 transition-colors">
              <td className="py-2.5 px-3 font-medium text-[var(--color-ink)]">{f.rotulo}</td>
              <td className="py-2.5 pr-3 text-right font-mono text-xs">{nf(f.clientes)}</td>
              <td className="py-2.5 pr-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <div className="h-full rounded-full bg-[var(--color-oak)]" style={{ width: `${Math.min(100, f.pct)}%` }} />
                  </div>
                  <span className="w-12 font-mono text-xs text-[var(--color-mute)]">{pf(f.pct)}</span>
                </div>
              </td>
              {comLtv && (
                <td className="py-2.5 pr-3 text-right font-mono text-xs whitespace-nowrap">
                  {f.faturamentoMedio != null ? cf(f.faturamentoMedio) : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CohortePage() {
  const d = await getCohorteData();
  const { ltv, intervalo } = d;
  const razao = ltv.semRecompra.faturamentoMedio > 0 ? ltv.comRecompra.faturamentoMedio / ltv.semRecompra.faturamentoMedio : null;

  return (
    <div className="flex flex-col gap-8 max-w-[1320px] mx-auto">
      <div className="border-b border-[var(--color-line)] pb-6">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)] mb-1">
          — Histórico e Retenção
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--color-ink)]">
          Cohorte
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--color-mute)]">
            Sempre todo o histórico: {nf(d.vendas)} vendas e {nf(d.clientes)} clientes (e-mail distinto).
            Faturamento é o preço da oferta, sem juros de parcelamento.
          </p>
          <span className="hidden sm:inline text-xs text-[var(--color-line-strong)]">·</span>
          <AutoRefresh intervalMinutes={5} />
        </div>
      </div>

      {d.vendas === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-mute)]">Nenhuma venda aprovada no banco.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
              01 / 03 · Linha do Tempo
            </span>
            <Card
              title="Faturamento e líquido por mês"
              sub="Mês pela data de aprovação, no horário de São Paulo. Meses sem venda aparecem zerados."
              wide
            >
              <GraficoMensal meses={d.mensal} />
            </Card>
            <Card
              title="Mês a mês"
              sub="Clientes únicos contam cada e-mail uma vez dentro do mês; os meses não somam entre si."
              wide
            >
              <TabelaMensal meses={d.mensal} />
            </Card>
          </section>

          <section className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
              02 / 03 · LTV
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="LTV médio" valor={cf(ltv.todos.faturamentoMedio)}>
                <span className="text-xs text-[var(--color-mute)]">Faturamento por cliente</span>
              </Tile>
              <Tile label="LTV mediano" valor={cf(ltv.todos.faturamentoMediano)}>
                <span className="text-xs text-[var(--color-mute)]">Metade dos clientes abaixo</span>
              </Tile>
              <Tile label="LTV líquido médio" valor={cf(ltv.todos.liquidoMedio)}>
                <span className="text-xs text-[var(--color-mute)]">O que fica por cliente</span>
              </Tile>
              <Tile label="Sem recompra" valor={cf(ltv.semRecompra.faturamentoMedio)}>
                <span className="text-xs text-[var(--color-mute)]">{nf(ltv.semRecompra.clientes)} clientes</span>
              </Tile>
              <Tile label="Com recompra" valor={cf(ltv.comRecompra.faturamentoMedio)}>
                <span className="text-xs text-[var(--color-mute)]">{nf(ltv.comRecompra.clientes)} clientes</span>
              </Tile>
              <Tile label="Com ÷ sem recompra" valor={razao != null ? `${razao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×` : "—"}>
                <span className="text-xs text-[var(--color-mute)]">Razão dos LTVs médios</span>
              </Tile>
            </div>
            <Card
              title="Clientes por produtos distintos comprados"
              sub="LTV = soma do faturamento de todas as vendas do cliente. “Com recompra” = cliente com ao menos uma venda de recompra (1ª compra de um produto, tendo comprado outro antes). Comprar o mesmo produto de novo e parcelas não aumentam a coluna."
              wide
            >
              <TabelaFaixas titulo="Produtos distintos" faixas={d.produtosPorCliente} comLtv />
            </Card>
          </section>

          <section className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-mute-soft)]">
              03 / 03 · Intervalo de Recompra
            </span>
            {intervalo.clientes === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-mute)]">Nenhum cliente com recompra.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Tile label="Clientes com recompra" valor={nf(intervalo.clientes)}>
                    <span className="text-xs text-[var(--color-mute)]">
                      {pf(d.clientes > 0 ? (intervalo.clientes / d.clientes) * 100 : 0)} dos clientes
                    </span>
                  </Tile>
                  <Tile label="Mediana" valor={dias(intervalo.mediana)}>
                    <span className="text-xs text-[var(--color-mute)]">1ª compra → 1ª recompra</span>
                  </Tile>
                  <Tile label="Média" valor={dias(intervalo.media)}>
                    <span className="text-xs text-[var(--color-mute)]">Soma dos dias ÷ clientes</span>
                  </Tile>
                  <Tile label="25% voltam em até" valor={dias(intervalo.p25)}>
                    <span className="text-xs text-[var(--color-mute)]">Percentil 25</span>
                  </Tile>
                  <Tile label="75% voltam em até" valor={dias(intervalo.p75)}>
                    <span className="text-xs text-[var(--color-mute)]">Percentil 75</span>
                  </Tile>
                  <Tile label="Mesmo dia" valor={nf(intervalo.mesmoDia)}>
                    <span className="text-xs text-[var(--color-mute)]">
                      {pf((intervalo.mesmoDia / intervalo.clientes) * 100)} dos que recompram
                    </span>
                  </Tile>
                </div>
                <Card
                  title="Quanto tempo até a 1ª recompra"
                  sub="Um valor por cliente: dias corridos (horário de São Paulo) entre a 1ª compra e a primeira venda de recompra."
                  wide
                >
                  <TabelaFaixas titulo="Intervalo" faixas={intervalo.faixas} />
                </Card>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
