import {
  getLeads,
  resolvePeriod,
  RANGE_KEYS,
  type Breakdown,
  type Day,
  type Funnel,
  type RangeKey,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const RANGE_LABEL: Record<RangeKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7": "7 dias",
  "30": "30 dias",
  "90": "90 dias",
  all: "Tudo",
};

const MIN_DIAS_GRAFICO = 3; // com 1 ou 2 dias o gráfico não diz nada que os KPIs já não digam
const N_BAIXO = 20; // abaixo disso a taxa do dia é ruído de amostra

const nf = (n: number) => n.toLocaleString("pt-BR");
const pf = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const diaMes = (d: string) => d.slice(8, 10);
const taxa = (agendou: number, leads: number) => (leads ? (agendou / leads) * 100 : 0);

/** Arredonda o topo do eixo pra um número limpo acima do máximo. */
function niceMax(v: number): number {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

// ─────────────────────────────────────────────────────────────────────────────

function Delta({
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
        {subiu ? "acima de" : "abaixo de"}{" "}
        {pp ? pf(anterior) : nf(anterior)}
      </span>
    </span>
  );
}

function Tile({
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

function Card({
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

/** Tabela de uma quebra: volume + agendados + taxa por linha. */
function TabelaQuebra({ data, coluna }: { data: Breakdown; coluna: string }) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nenhum lead no período.</p>;
  }
  // A escala da barra ignora linhas de amostra pequena: uma origem com 1 lead e
  // 1 agendamento marca 100% e comprimiria todas as barras reais a um traço.
  const maxTaxa = Math.max(
    ...data.rows.filter((r) => r.leads >= N_BAIXO).map((r) => taxa(r.agendou, r.leads)),
    0.01,
  );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
            <th className="py-1.5 pr-3 text-left font-semibold">{coluna}</th>
            <th className="px-3 py-1.5 text-right font-semibold">Leads</th>
            <th className="px-3 py-1.5 text-right font-semibold">Agend.</th>
            <th className="py-1.5 pl-3 text-right font-semibold">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const t = taxa(r.agendou, r.leads);
            return (
              <tr key={r.label} className="border-t">
                <td className="max-w-[22rem] truncate py-2 pr-3" title={r.label}>
                  {r.label}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{nf(r.leads)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">
                  {nf(r.agendou)}
                </td>
                <td className="py-2 pl-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      {r.leads >= N_BAIXO && (
                        <span
                          className="block h-full rounded-full bg-[var(--color-stage-3)]"
                          style={{ width: `${Math.min(100, (t / maxTaxa) * 100)}%` }}
                        />
                      )}
                    </span>
                    {r.leads >= N_BAIXO ? (
                      <b className="w-14 text-right font-semibold tabular-nums">{pf(t)}</b>
                    ) : (
                      <b
                        className="w-14 text-right font-normal tabular-nums text-[var(--color-muted-2)]"
                        title={`Só ${nf(r.leads)} ${r.leads === 1 ? "lead" : "leads"} — taxa sem significado estatístico`}
                      >
                        {pf(t)}*
                      </b>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      {data.rows.some((r) => r.leads < N_BAIXO) && (
        <p className="mt-3 text-xs text-[var(--color-muted-2)]">
          * menos de {N_BAIXO} leads — taxa mostrada, mas fora da escala da barra por
          falta de amostra.
        </p>
      )}
    </>
  );
}

/** Colunas empilhadas por estágio, uma por dia. SVG montado no servidor. */
function GraficoDiario({ daily }: { daily: Day[] }) {
  const W = 980,
    H = 250,
    ML = 46,
    MR = 8,
    MT = 10,
    MB = 26;
  const pw = W - ML - MR,
    ph = H - MT - MB;
  const max = niceMax(Math.max(...daily.map((d) => d.leads)));
  const band = pw / daily.length;
  const bw = Math.min(22, Math.max(2, band - 4));
  const y = (v: number) => MT + ph * (1 - v / max);
  const ticks = [0, max / 2, max];
  const passo = Math.max(1, Math.ceil(daily.length / 12));

  const SEG = [
    { k: "agendou", cor: "var(--color-stage-3)", nome: "agendou" },
    { k: "terminou", cor: "var(--color-stage-2)", nome: "terminou" },
    { k: "abandonou", cor: "var(--color-stage-1)", nome: "abandonou" },
  ] as const;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Leads por dia de ${fmtDate(daily[0].date)} a ${fmtDate(daily[daily.length - 1].date)}, divididos por estágio do funil`}
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
            {nf(t)}
          </text>
        </g>
      ))}
      {daily.map((d, i) => {
        const x = ML + band * i + (band - bw) / 2;
        let acc = 0;
        return (
          <g key={d.date}>
            <title>{`${fmtDate(d.date)} — ${nf(d.leads)} entraram · ${nf(d.agendou)} agendaram · ${nf(d.terminou)} terminaram · ${nf(d.abandonou)} abandonaram`}</title>
            {SEG.map((s) => {
              const v = d[s.k];
              if (v <= 0) return null;
              const y0 = y(acc);
              acc += v;
              // gap de 2px na cor da superfície separa os segmentos
              return (
                <rect
                  key={s.k}
                  x={x}
                  y={y(acc)}
                  width={bw}
                  height={Math.max(1, y0 - y(acc) - 2)}
                  rx="2"
                  fill={s.cor}
                />
              );
            })}
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

/** Taxa de agendamento por dia — gráfico separado de propósito (nunca 2 eixos Y). */
function GraficoTaxa({ daily }: { daily: Day[] }) {
  const W = 980,
    H = 190,
    ML = 46,
    MR = 8,
    MT = 12,
    MB = 26;
  const pw = W - ML - MR,
    ph = H - MT - MB;
  const serie = daily.map((d) => taxa(d.agendou, d.leads));
  const max = niceMax(Math.max(...serie, 1));
  const step = daily.length > 1 ? pw / (daily.length - 1) : 0;
  const x = (i: number) => ML + step * i;
  const y = (v: number) => MT + ph * (1 - v / max);
  const pts = serie.map((v, i) => `${x(i)},${y(v)}`).join("L");
  const ticks = [0, max / 2, max];
  const passo = Math.max(1, Math.ceil(daily.length / 12));
  const ultimo = daily.length - 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Taxa de agendamento por dia"
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
            {t.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
          </text>
        </g>
      ))}
      <path
        d={`M${x(0)},${y(0)}L${pts}L${x(ultimo)},${y(0)}Z`}
        fill="var(--color-stage-3)"
        fillOpacity="0.12"
      />
      <path
        d={`M${pts}`}
        fill="none"
        stroke="var(--color-stage-3)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {daily.map((d, i) => {
        const fraco = d.leads < N_BAIXO;
        if (!fraco && i !== ultimo) return null;
        return (
          <circle
            key={d.date}
            cx={x(i)}
            cy={y(serie[i])}
            r={i === ultimo ? 4.5 : 3.5}
            fill={fraco ? "var(--color-surface)" : "var(--color-stage-3)"}
            stroke={fraco ? "var(--color-stage-3)" : "var(--color-surface)"}
            strokeWidth="2"
          >
            <title>{`${fmtDate(d.date)} — ${pf(serie[i])}${fraco ? " (amostra pequena)" : ""}`}</title>
          </circle>
        );
      })}
      <text
        x={x(ultimo) - 6}
        y={y(serie[ultimo]) - 12}
        textAnchor="end"
        className="fill-[var(--color-text)] text-[12px] font-semibold tabular-nums"
      >
        {pf(serie[ultimo])}
      </text>
      {daily.map((d, i) =>
        i % passo === 0 || i === ultimo ? (
          <text
            key={d.date}
            x={x(i)}
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

function TabelaDias({ daily }: { daily: Day[] }) {
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
              <th className="px-3 py-1.5 text-right font-semibold">Entraram</th>
              <th className="px-3 py-1.5 text-right font-semibold">Abandonaram</th>
              <th className="px-3 py-1.5 text-right font-semibold">Terminaram</th>
              <th className="px-3 py-1.5 text-right font-semibold">Agendaram</th>
              <th className="py-1.5 pl-3 text-right font-semibold">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-t">
                <td className="py-1.5 pr-3">{fmtDate(d.date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.leads)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.abandonou)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.terminou)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.agendou)}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {pf(taxa(d.agendou, d.leads))}
                  {d.leads < N_BAIXO && (
                    <span className="text-[var(--color-muted-2)]"> · amostra pequena</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Funil({ f }: { f: Funnel }) {
  const pctTerm = taxa(f.terminaram, f.iniciaram);
  const pctAgend = taxa(f.agendaram, f.iniciaram);
  const pctAgendDosTerm = taxa(f.agendaram, f.terminaram);
  const linha = (nome: string, valor: number, largura: number, cor: string) => (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-[var(--color-muted)]">{nome}</span>
        <span className="font-semibold tabular-nums">{nf(valor)}</span>
      </div>
      <div
        className="h-5 rounded"
        style={{ width: `${Math.max(largura, 0.6)}%`, background: cor }}
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5">
      {linha("Iniciaram o formulário", f.iniciaram, 100, "var(--color-stage-1)")}
      <p className="text-[13px] text-[var(--color-muted)]">
        <span aria-hidden className="mr-1.5 text-[10px]">
          ▼
        </span>
        {pf(pctTerm)} terminaram
        <span className="text-[var(--color-muted-2)]">
          {" "}
          · {nf(f.abandonaram)} desistiram no meio
        </span>
      </p>
      {linha("Terminaram", f.terminaram, pctTerm, "var(--color-stage-2)")}
      <p className="text-[13px] text-[var(--color-muted)]">
        <span aria-hidden className="mr-1.5 text-[10px]">
          ▼
        </span>
        {pf(pctAgendDosTerm)} dos que terminaram agendaram
      </p>
      {linha("Agendaram call", f.agendaram, pctAgend, "var(--color-stage-3)")}
    </div>
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
  const data = await getLeads(period);
  const { funnel: f, anterior: a, daily } = data;
  const temGrafico = daily.length >= MIN_DIAS_GRAFICO;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl">Captação</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Funil de inscrição por formulário e por origem.
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
                      ? "bg-[var(--color-accent)] font-medium text-[#231108]"
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
            className={`flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--color-surface)] p-1 pl-3 ${
              period.key === "custom" ? "border-[var(--color-accent)]" : ""
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
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#231108]"
            >
              Aplicar
            </button>
          </form>
        </div>

        <p className="text-sm text-[var(--color-muted)]">
          {period.fromDate && period.toDate
            ? `${fmtDate(period.fromDate)} a ${fmtDate(period.toDate)} · fuso de São Paulo`
            : "Todo o histórico"}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Iniciaram o formulário" valor={nf(f.iniciaram)}>
          {a && <Delta atual={f.iniciaram} anterior={a.iniciaram} />}
        </Tile>
        <Tile label="Terminaram" valor={nf(f.terminaram)}>
          {a && <Delta atual={f.terminaram} anterior={a.terminaram} />}
        </Tile>
        <Tile label="Agendaram call" valor={nf(f.agendaram)}>
          {a && <Delta atual={f.agendaram} anterior={a.agendaram} />}
        </Tile>
        <Tile label="Taxa de agendamento" valor={pf(taxa(f.agendaram, f.iniciaram))}>
          {a && (
            <Delta
              pp
              atual={taxa(f.agendaram, f.iniciaram)}
              anterior={taxa(a.agendaram, a.iniciaram)}
            />
          )}
        </Tile>
      </div>

      {temGrafico && (
        <>
          <Card
            title="Dia a dia, por estágio"
            sub="A altura é quanta gente entrou; a divisão é onde parou."
          >
            <div className="mb-4 flex flex-wrap items-center gap-4 text-[13px] text-[var(--color-muted)]">
              {[
                ["var(--color-stage-3)", "Agendou call"],
                ["var(--color-stage-2)", "Terminou, não agendou"],
                ["var(--color-stage-1)", "Abandonou no meio"],
              ].map(([cor, nome]) => (
                <span key={nome} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-[3px]"
                    style={{ background: cor }}
                  />
                  {nome}
                </span>
              ))}
            </div>
            <GraficoDiario daily={daily} />
            <TabelaDias daily={daily} />
          </Card>

          <Card
            title="Taxa de agendamento por dia"
            sub="Gráfico separado do volume de propósito — duas escalas num eixo só inventam correlação que não existe no dado."
          >
            <GraficoTaxa daily={daily} />
            <p className="mt-3 text-[13px] text-[var(--color-muted)]">
              Pontos vazados são dias com menos de {N_BAIXO} leads: a taxa oscila por falta
              de gente, não por desempenho.
            </p>
          </Card>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Funil" sub={`${nf(f.iniciaram)} registros no período`} wide>
          <Funil f={f} />
        </Card>

        <Card
          title="Por formulário"
          sub={`${nf(data.byForm.distinct)} ${data.byForm.distinct === 1 ? "funil" : "funis"} no período · cada um é um funil separado`}
          wide
        >
          <TabelaQuebra data={data.byForm} coluna="Formulário" />
        </Card>

        <Card title="Por país" sub={legenda(data.byGeo.pais)}>
          <TabelaQuebra data={data.byGeo.pais} coluna="País" />
        </Card>

        <Card
          title="Por região"
          sub={`${legenda(data.byGeo.regiao)} · estado qualificado pelo país`}
        >
          <TabelaQuebra data={data.byGeo.regiao} coluna="Estado / região" />
        </Card>

        <Card
          title="Origem — utm_source"
          sub={legenda(data.byUtm.source)}
          wide
        >
          <TabelaQuebra data={data.byUtm.source} coluna="utm_source" />
        </Card>

        <Card
          title="Conteúdo — utm_content"
          sub={legenda(data.byUtm.content)}
          wide
        >
          <TabelaQuebra data={data.byUtm.content} coluna="utm_content" />
        </Card>

        <Card title="Mídia — utm_medium" sub={legenda(data.byUtm.medium)} wide>
          <TabelaQuebra data={data.byUtm.medium} coluna="utm_medium" />
        </Card>

        <Card title="Campanha — utm_campaign" sub={legenda(data.byUtm.campaign)} wide>
          <TabelaQuebra data={data.byUtm.campaign} coluna="utm_campaign" />
        </Card>

        <Card title="Termo — utm_term" sub={legenda(data.byUtm.term)} wide>
          <TabelaQuebra data={data.byUtm.term} coluna="utm_term" />
        </Card>
      </div>
    </div>
  );
}

function legenda(b: Breakdown): string {
  const plural = b.distinct === 1 ? "valor" : "valores";
  return b.capped
    ? `${nf(b.distinct)} ${plural} — top 10 abaixo`
    : `${nf(b.distinct)} ${plural}`;
}
