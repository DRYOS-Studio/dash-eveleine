import { RANGE_KEYS, RANGE_LABEL, resolvePeriod } from "@/lib/data";
import {
  getVendas,
  VALOR_MIN,
  type DiaVenda,
  type LinhaCloser,
  type LinhaVenda,
} from "@/lib/vendas";
import { Card, FiltroPeriodo, Tile, diaMes, fmtDate, nf, niceMax, pf, taxa } from "@/components/ui";

export const dynamic = "force-dynamic";

const MIN_DIAS_GRAFICO = 3; // com 1 ou 2 dias o gráfico não diz nada que os KPIs já não digam
// Mesma convenção da Agenda: abaixo disso a taxa é ruído de amostra, não desempenho.
const N_BAIXO = 10;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Eixo do gráfico: R$ 50 mil em vez de R$ 50.000. */
const brlEixo = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(n);

// ─────────────────────────────────────────────────────────────────────────────

/** Fatia do faturamento que já entrou em caixa. */
const recebido = (l: { faturamento: number; caixa: number }) =>
  l.faturamento > 0 ? pf(taxa(l.caixa, l.faturamento)) : "—";

function TabelaQuebra({ linhas, coluna }: { linhas: LinhaVenda[]; coluna: string }) {
  if (linhas.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nenhuma venda no período.</p>;
  }
  const max = Math.max(...linhas.map((l) => l.faturamento), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
            <th className="py-1.5 pr-3 text-left font-semibold">{coluna}</th>
            <th className="px-3 py-1.5 text-right font-semibold">Vendas</th>
            <th className="px-3 py-1.5 text-right font-semibold">Faturamento</th>
            <th className="px-3 py-1.5 text-right font-semibold">Caixa</th>
            <th className="py-1.5 pl-3 text-right font-semibold">Volume</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.label} className="border-t">
              <td className="max-w-[22rem] truncate py-2 pr-3" title={l.label}>
                {l.label}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{nf(l.vendas)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{brl(l.faturamento)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">
                {brl(l.caixa)} · {recebido(l)}
              </td>
              <td className="py-2 pl-3">
                <span className="ml-auto block h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-stage-3)]"
                    style={{ width: `${(l.faturamento / max) * 100}%` }}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Closer + o no-show do anfitrião de mesmo nome na Agenda. */
function TabelaCloser({ linhas }: { linhas: LinhaCloser[] }) {
  if (linhas.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nenhuma venda no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
            <th className="py-1.5 pr-3 text-left font-semibold">Closer</th>
            <th className="px-3 py-1.5 text-right font-semibold">Vendas</th>
            <th className="px-3 py-1.5 text-right font-semibold">Faturamento</th>
            <th className="px-3 py-1.5 text-right font-semibold">Ticket</th>
            <th className="px-3 py-1.5 text-right font-semibold">Reuniões</th>
            <th className="py-1.5 pl-3 text-right font-semibold">No-show</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.label} className="border-t">
              <td className="max-w-[16rem] truncate py-2 pr-3" title={l.label}>
                {l.label}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{nf(l.vendas)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{brl(l.faturamento)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">
                {brl(l.faturamento / l.vendas)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">
                {l.concluidas === null ? "—" : nf(l.concluidas)}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums text-[var(--color-muted)]">
                {l.concluidas === null || l.faltas === null || l.concluidas === 0
                  ? "—"
                  : `${nf(l.faltas)} · ${pf(taxa(l.faltas, l.concluidas))}${l.concluidas < N_BAIXO ? "*" : ""}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Duas colunas por dia: faturamento e caixa. SVG montado no servidor. */
function GraficoDiario({ daily }: { daily: DiaVenda[] }) {
  const W = 980,
    H = 220,
    ML = 74,
    MR = 8,
    MT = 10,
    MB = 26;
  const pw = W - ML - MR,
    ph = H - MT - MB;
  const max = niceMax(Math.max(...daily.flatMap((d) => [d.faturamento, d.caixa])));
  const band = pw / daily.length;
  const bw = Math.min(14, Math.max(2, (band - 4) / 2));
  const y = (v: number) => MT + ph * (1 - v / max);
  const ticks = [0, max / 2, max];
  const passo = Math.max(1, Math.ceil(daily.length / 12));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Faturamento e caixa por dia de ${fmtDate(daily[0].date)} a ${fmtDate(daily[daily.length - 1].date)}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={ML}
            x2={W - MR}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? "var(--color-border)" : "var(--color-surface-2)"}
            strokeWidth="1"
          />
          <text
            x={ML - 8}
            y={y(t) + 3.5}
            textAnchor="end"
            className="fill-[var(--color-muted-2)] text-[10px] tabular-nums"
          >
            {brlEixo(t)}
          </text>
        </g>
      ))}
      {daily.map((d, i) => {
        const x0 = ML + band * i + band / 2 - bw - 1;
        return (
          <g key={d.date}>
            <title>{`${fmtDate(d.date)} — ${nf(d.vendas)} vendas · faturamento ${brl(d.faturamento)} · caixa ${brl(d.caixa)}`}</title>
            {d.faturamento > 0 && (
              <rect
                x={x0}
                y={y(d.faturamento)}
                width={bw}
                height={Math.max(1, y(0) - y(d.faturamento))}
                rx="2"
                fill="var(--color-stage-3)"
              />
            )}
            {d.caixa > 0 && (
              <rect
                x={x0 + bw + 2}
                y={y(d.caixa)}
                width={bw}
                height={Math.max(1, y(0) - y(d.caixa))}
                rx="2"
                fill="var(--color-stage-1)"
              />
            )}
          </g>
        );
      })}
      {daily.map((d, i) =>
        i % passo === 0 || i === daily.length - 1 ? (
          <text
            key={d.date}
            x={ML + band * i + band / 2}
            y={H - 8}
            textAnchor="middle"
            className="fill-[var(--color-muted-2)] text-[10px]"
          >
            {diaMes(d.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function TabelaDias({ daily }: { daily: DiaVenda[] }) {
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer py-1 text-xs text-[var(--color-muted)]">
        Ver como tabela
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
              <th className="py-1.5 pr-3 text-left font-semibold">Dia</th>
              <th className="px-3 py-1.5 text-right font-semibold">Vendas</th>
              <th className="px-3 py-1.5 text-right font-semibold">Faturamento</th>
              <th className="py-1.5 pl-3 text-right font-semibold">Caixa</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-t">
                <td className="py-1.5 pr-3">{fmtDate(d.date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.vendas)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{brl(d.faturamento)}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">{brl(d.caixa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const v = await getVendas(period);
  const temGrafico = v.daily.length >= MIN_DIAS_GRAFICO;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl">Vendas</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Receita, origem, time comercial e forma de pagamento das vendas fechadas.
          </p>
        </div>

        <FiltroPeriodo
          action="/vendas"
          keys={RANGE_KEYS}
          labels={RANGE_LABEL}
          activeKey={period.key}
          fromDate={period.fromDate}
          toDate={period.toDate}
        />

        <p className="text-sm text-[var(--color-muted)]">
          {v.daily.length > 0
            ? `Vendas de ${fmtDate(v.daily[0].date)} a ${fmtDate(v.daily[v.daily.length - 1].date)} · `
            : ""}
          por data da compra, fuso de São Paulo
        </p>
      </header>

      {v.tabelaVazia ? (
        <Card
          title="Nenhuma venda lida"
          sub="A tabela vendas_versalhes não devolveu nenhuma linha."
        >
          <p className="text-sm text-[var(--color-muted)]">
            Essa tabela só é legível com a chave <b>service_role</b>. Com a chave{" "}
            <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[13px]">
              anon
            </code>{" "}
            a resposta vem vazia, sem erro. Confira{" "}
            <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[13px]">
              SUPABASE_SERVICE_ROLE_KEY
            </code>{" "}
            neste ambiente e faça um novo deploy.
          </p>
        </Card>
      ) : v.total === 0 ? (
        <Card title="Nenhuma venda nesta janela" sub="Troque o período acima.">
          <p className="text-sm text-[var(--color-muted)]">
            O painel filtra pela data da compra registrada no board de vendas.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Vendas" valor={nf(v.total)}>
              <span className="text-xs text-[var(--color-muted-2)]">
                {nf(v.validas)} com valor de contrato · {nf(v.semValor)} sem
              </span>
            </Tile>
            <Tile label="Faturamento" valor={v.validas ? brl(v.faturamento) : "—"}>
              <span className="text-xs text-[var(--color-muted-2)]">valor dos contratos</span>
            </Tile>
            <Tile label="Caixa recebido" valor={v.validas ? brl(v.caixa) : "—"}>
              <span className="text-xs text-[var(--color-muted-2)]">
                {v.faturamento > 0 ? pf(taxa(v.caixa, v.faturamento)) : "—"} do faturamento
              </span>
            </Tile>
            <Tile label="A receber" valor={v.validas ? brl(v.aReceber) : "—"}>
              <span className="text-xs text-[var(--color-muted-2)]">faturamento − caixa</span>
            </Tile>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Ticket médio" valor={v.ticket === null ? "—" : brl(v.ticket)}>
              <span className="text-xs text-[var(--color-muted-2)]">
                mediana {v.mediana === null ? "—" : brl(v.mediana)}
              </span>
            </Tile>
            <Tile label="Maior venda" valor={v.maior ? brl(v.maior.valor) : "—"}>
              <span className="text-xs text-[var(--color-muted-2)]">
                {v.maior ? `${pf(v.maior.pct)} do faturamento` : "—"}
              </span>
            </Tile>
            <Tile
              label="Ciclo de venda"
              valor={v.ciclo.mediana === null ? "—" : `${nf(Math.round(v.ciclo.mediana))} dias`}
            >
              <span className="text-xs text-[var(--color-muted-2)]">
                mediana do 1º contato à compra · {nf(v.ciclo.n)} de {nf(v.validas)} vendas
              </span>
            </Tile>
            <Tile label="Internacional" valor={nf(v.internacional)}>
              <span className="text-xs text-[var(--color-muted-2)]">
                de {nf(v.validas)} vendas com valor
              </span>
            </Tile>
          </div>

          {v.semValor > 0 && (
            <p className="rounded-lg border p-3 text-[13px] text-[var(--color-muted)]">
              <strong className="font-semibold text-[var(--color-text)]">
                {nf(v.semValor)} {v.semValor === 1 ? "venda" : "vendas"} sem valor de contrato
                válido
              </strong>{" "}
              (abaixo de {brl(VALOR_MIN)}). Entram na contagem de vendas, mas ficam fora de
              faturamento, ticket e rankings. Caixa já recebido nelas: {brl(v.caixaSemValor)}.
            </p>
          )}

          {temGrafico && (
            <Card title="Dia a dia" sub="Por data da compra, só vendas com valor de contrato.">
              <div className="mb-4 flex flex-wrap items-center gap-4 text-[13px] text-[var(--color-muted)]">
                {[
                  ["var(--color-stage-3)", "Faturamento"],
                  ["var(--color-stage-1)", "Caixa"],
                ].map(([cor, nome]) => (
                  <span key={nome} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-sm"
                      style={{ background: cor }}
                    />
                    {nome}
                  </span>
                ))}
              </div>
              <GraficoDiario daily={v.daily} />
              <TabelaDias daily={v.daily} />
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card
              title="Por origem (UTM)"
              sub={`Ligada ao lead pelo e-mail — ${nf(v.comLead)} de ${nf(v.validas)} vendas acharam lead.`}
            >
              <TabelaQuebra linhas={v.byUtm} coluna="UTM source" />
            </Card>
            <Card title="Por funil" sub="Funil registrado na venda.">
              <TabelaQuebra linhas={v.byFunil} coluna="Funil" />
            </Card>
            <Card title="Por score do lead" sub="Score da resposta mais recente do mesmo e-mail.">
              <TabelaQuebra linhas={v.byScore} coluna="Score" />
            </Card>
            <Card title="Por quem agendou" sub="Tráfego, SDR, social seller ou formulário.">
              <TabelaQuebra linhas={v.byAgendadoPor} coluna="Agendado por" />
            </Card>
          </div>

          <Card
            title="Time comercial"
            sub="Vendas por closer, com o no-show do anfitrião de mesmo nome na Agenda (mesmo período)."
            wide
          >
            <TabelaCloser linhas={v.byCloser} />
            <p className="mt-3 text-xs text-[var(--color-muted-2)]">
              {v.presencaIndisponivel
                ? "Agenda indisponível neste momento (Calendly sem token ou fora do ar): reuniões e no-show aparecem como —. "
                : ""}
              * menos de {N_BAIXO} reuniões concluídas — taxa é ruído de amostra. Nomes são
              ligados por grafia (acento, caixa e espaço); grafias que não coincidem ficam como
              pessoas distintas.
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Forma de pagamento" sub="Faturamento e caixa por forma.">
              <TabelaQuebra linhas={v.byForma} coluna="Forma" />
            </Card>
            <Card title="Produto">
              <TabelaQuebra linhas={v.byProduto} coluna="Produto" />
            </Card>
            <Card title="Contrato assinado" sub="Faturamento e caixa por situação do contrato." wide>
              <TabelaQuebra linhas={v.byContrato} coluna="Contrato assinado" />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
