import { Suspense } from "react";
import {
  AGENDA_KEYS,
  AGENDA_LABEL,
  getAgenda,
  getPresenca,
  MODO_FIXTURE,
  resolveAgendaPeriod,
  SEM_LEAD,
  type AgendaPeriod,
  type DiaAgenda,
  type QuebraAgenda,
  type Reuniao,
  type Situacao,
} from "@/lib/agenda";
import {
  Card,
  FiltroPeriodo,
  Tile,
  diaMes,
  fmtDate,
  nf,
  niceMax,
  pf,
  taxa,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const MIN_DIAS_GRAFICO = 3; // com 1 ou 2 dias o gráfico não diz nada além dos KPIs
// Mesma convenção da Captação: abaixo disso a taxa é ruído de amostra, não
// desempenho. Numa janela de um dia quase toda linha cai aqui — e é justamente
// aí que "50,0% de falta" sobre 2 reuniões enganaria mais.
const N_BAIXO = 10;

/** Hora no fuso de São Paulo, sem depender de Intl (mesma convenção do data.ts). */
const horaSP = (iso: string) =>
  new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(11, 16);

const SITUACAO: Record<Situacao, { texto: string; cor: string }> = {
  futura: { texto: "Marcada", cor: "var(--color-stage-2)" },
  agora: { texto: "Acontecendo", cor: "var(--color-accent)" },
  realizada: { texto: "Realizada", cor: "var(--color-stage-3)" },
  falta: { texto: "No-show", cor: "var(--color-negative)" },
  cancelada: { texto: "Cancelada", cor: "var(--color-muted-2)" },
};

// ─────────────────────────────────────────────────────────────────────────────

function Selo({ s }: { s: Situacao }) {
  const { texto, cor } = SITUACAO[s];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="size-2 rounded-full" style={{ background: cor }} />
      {texto}
    </span>
  );
}

/** Quebra da camada 1: volume + cancelamento. Presença fica na camada 2. */
function TabelaQuebra({ data, coluna }: { data: QuebraAgenda; coluna: string }) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nenhuma reunião no período.</p>;
  }
  const max = Math.max(...data.rows.map((r) => r.total), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
            <th className="py-1.5 pr-3 text-left font-semibold">{coluna}</th>
            <th className="px-3 py-1.5 text-right font-semibold">Reuniões</th>
            <th className="px-3 py-1.5 text-right font-semibold">Cancel.</th>
            <th className="py-1.5 pl-3 text-right font-semibold">Volume</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="max-w-[22rem] truncate py-2 pr-3" title={r.label}>
                {r.label}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{nf(r.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">
                {r.canceladas ? `${nf(r.canceladas)} · ${pf(taxa(r.canceladas, r.total))}` : "—"}
              </td>
              <td className="py-2 pl-3">
                <span className="ml-auto block h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-stage-3)]"
                    style={{ width: `${(r.total / max) * 100}%` }}
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

/** Colunas por dia: marcadas vs canceladas. SVG montado no servidor. */
function GraficoDiario({ daily }: { daily: DiaAgenda[] }) {
  const W = 980,
    H = 220,
    ML = 46,
    MR = 8,
    MT = 10,
    MB = 26;
  const pw = W - ML - MR,
    ph = H - MT - MB;
  const max = niceMax(Math.max(...daily.map((d) => d.total)));
  const band = pw / daily.length;
  const bw = Math.min(22, Math.max(2, band - 4));
  const y = (v: number) => MT + ph * (1 - v / max);
  const ticks = [0, max / 2, max];
  const passo = Math.max(1, Math.ceil(daily.length / 12));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Reuniões por dia de ${fmtDate(daily[0].date)} a ${fmtDate(daily[daily.length - 1].date)}, separando as canceladas`}
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
        const ativas = d.total - d.canceladas;
        return (
          <g key={d.date}>
            <title>{`${fmtDate(d.date)} — ${nf(d.total)} marcadas · ${nf(d.canceladas)} canceladas`}</title>
            {d.canceladas > 0 && (
              <rect
                x={x}
                y={y(d.total)}
                width={bw}
                height={Math.max(1, y(ativas) - y(d.total) - 2)}
                rx="2"
                fill="var(--color-stage-1)"
              />
            )}
            {ativas > 0 && (
              <rect
                x={x}
                y={y(ativas)}
                width={bw}
                height={Math.max(1, y(0) - y(ativas))}
                rx="2"
                fill="var(--color-stage-3)"
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

function TabelaDias({ daily }: { daily: DiaAgenda[] }) {
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
              <th className="px-3 py-1.5 text-right font-semibold">Marcadas</th>
              <th className="px-3 py-1.5 text-right font-semibold">Canceladas</th>
              <th className="py-1.5 pl-3 text-right font-semibold">De pé</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-t">
                <td className="py-1.5 pr-3">{fmtDate(d.date)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.total)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{nf(d.canceladas)}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {nf(d.total - d.canceladas)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada 2 — streamada, porque custa um request por evento

function EsqueletoPresenca() {
  return (
    <Card
      title="Presença"
      sub="Consultando o Calendly evento a evento — o no-show só existe no invitee, não na listagem."
    >
      <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <span
          aria-hidden
          className="size-3 animate-spin rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-accent)]"
        />
        Carregando…
      </div>
    </Card>
  );
}

function ListaReunioes({ reunioes }: { reunioes: Reuniao[] }) {
  return (
    <div className="overflow-x-auto">
      {/* table-fixed: com layout auto a soma das colunas estoura o card e a
          Situação fica cortada, porque `truncate` embute whitespace-nowrap e o
          min-content de cada célula vira o texto inteiro. */}
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[5.5rem]" />
          <col className="w-[4rem]" />
          <col />
          <col />
          <col className="w-[9rem]" />
          <col className="w-[10rem]" />
          <col className="w-[8.5rem]" />
        </colgroup>
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
            <th className="py-1.5 pr-3 text-left font-semibold">Dia</th>
            <th className="px-3 py-1.5 text-left font-semibold">Hora</th>
            <th className="px-3 py-1.5 text-left font-semibold">Quem</th>
            <th className="px-3 py-1.5 text-left font-semibold">Agenda</th>
            <th className="px-3 py-1.5 text-left font-semibold">Anfitrião</th>
            <th className="px-3 py-1.5 text-left font-semibold">Origem</th>
            <th className="py-1.5 pl-3 text-left font-semibold">Situação</th>
          </tr>
        </thead>
        <tbody>
          {reunioes.map((r) => (
            <tr key={r.uuid} className="border-t">
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.inicio.slice(0, 10))}</td>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">{horaSP(r.inicio)}</td>
              <td className="truncate px-3 py-2" title={r.quem}>
                {r.quem}
              </td>
              <td className="truncate px-3 py-2" title={r.agenda}>
                {r.agenda}
              </td>
              <td className="truncate px-3 py-2" title={r.host}>
                {r.host}
              </td>
              <td
                className="truncate px-3 py-2 text-[var(--color-muted)]"
                title={r.origem}
              >
                {r.origem}
              </td>
              <td className="py-2 pl-3">
                <Selo s={r.situacao} />
                {r.situacao === "cancelada" && r.canceladaPor && (
                  <span
                    className="block text-xs text-[var(--color-muted-2)]"
                    title={r.motivo ?? undefined}
                  >
                    por {r.canceladaPor === "host" ? "quem atende" : "quem marcou"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function BlocoPresenca({ period }: { period: AgendaPeriod }) {
  const p = await getPresenca(period);
  const taxaFalta = taxa(p.faltaram, p.concluidas);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Já aconteceram" valor={nf(p.concluidas)} />
        <Tile label="Compareceram" valor={p.rastreado ? nf(p.compareceram) : "—"} />
        <Tile label="No-show" valor={p.rastreado ? nf(p.faltaram) : "—"} />
        <Tile
          label="Taxa de no-show"
          valor={p.rastreado && p.concluidas ? pf(taxaFalta) : "—"}
        />
      </div>

      {p.concluidas > 0 && !p.rastreado && (
        <p className="rounded-lg border p-3 text-[13px] text-[var(--color-muted)]">
          <strong className="font-semibold text-[var(--color-fg)]">Presença não rastreada.</strong>{" "}
          Nenhuma das {nf(p.concluidas)} reuniões concluídas tem no-show marcado no Calendly — e o
          campo só é preenchido quando o anfitrião marca a falta à mão. Por isso presença aparece
          como &ldquo;—&rdquo; e não como zero: não dá para distinguir &ldquo;ninguém faltou&rdquo;
          de &ldquo;ninguém marca&rdquo;.
        </p>
      )}

      {p.falhas > 0 && (
        <p className="rounded-lg border border-[var(--color-negative)] p-3 text-[13px] text-[var(--color-muted)]">
          {nf(p.falhas)} {p.falhas === 1 ? "reunião não pôde ser lida" : "reuniões não puderam ser lidas"} no
          Calendly. Os números de presença cobrem só o restante.
        </p>
      )}

      {p.concluidas === 0 ? (
        <Card
          title="Presença"
          sub="Nenhuma reunião do período já terminou — não há o que medir ainda."
        >
          <p className="text-sm text-[var(--color-muted)]">
            No-show só faz sentido depois que a reunião acontece.
          </p>
        </Card>
      ) : !p.rastreado ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            title="No-show por agenda"
            sub="Sobre as reuniões que já terminaram e não foram canceladas."
          >
            <TabelaPresenca linhas={p.byAgenda} coluna="Agenda" />
          </Card>
          <Card title="No-show por anfitrião" sub="Mesmo denominador.">
            <TabelaPresenca linhas={p.byHost} coluna="Anfitrião" />
          </Card>
        </div>
      )}

    </>
  );
}

/**
 * Lista nominal, em fronteira de Suspense própria e no rodapé: no mês são ~300
 * linhas, e deixá-la no meio empurrava gráfico e quebras para fora da tela.
 * `getPresenca` é memoizado, então isto não refaz o fan-out.
 */
async function BlocoLista({ period }: { period: AgendaPeriod }) {
  const p = await getPresenca(period);
  return (
    <Card
      title="Reuniões do período"
      sub={`${nf(p.reunioes.length)} ${p.reunioes.length === 1 ? "reunião" : "reuniões"} · horário de São Paulo`}
      wide
    >
      {p.reunioes.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nada marcado nesta janela.</p>
      ) : (
        <ListaReunioes reunioes={p.reunioes} />
      )}
    </Card>
  );
}

function TabelaPresenca({
  linhas,
  coluna,
}: {
  linhas: { label: string; concluidas: number; faltas: number }[];
  coluna: string;
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">Nada concluído no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--color-muted-2)]">
            <th className="py-1.5 pr-3 text-left font-semibold">{coluna}</th>
            <th className="px-3 py-1.5 text-right font-semibold">Aconteceram</th>
            <th className="px-3 py-1.5 text-right font-semibold">Faltas</th>
            <th className="py-1.5 pl-3 text-right font-semibold">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="max-w-[18rem] truncate py-2 pr-3" title={r.label}>
                {r.label}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{nf(r.concluidas)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{nf(r.faltas)}</td>
              {r.concluidas >= N_BAIXO ? (
                <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                  {pf(taxa(r.faltas, r.concluidas))}
                </td>
              ) : (
                <td
                  className="py-2 pl-3 text-right tabular-nums text-[var(--color-muted-2)]"
                  title={`Só ${nf(r.concluidas)} ${r.concluidas === 1 ? "reunião concluída" : "reuniões concluídas"} — taxa sem significado estatístico`}
                >
                  {pf(taxa(r.faltas, r.concluidas))}*
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {linhas.some((r) => r.concluidas < N_BAIXO) && (
        <p className="mt-3 text-xs text-[var(--color-muted-2)]">
          * menos de {N_BAIXO} reuniões concluídas — a taxa aparece, mas oscila por falta de
          amostra, não por desempenho.
        </p>
      )}
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
  const period = resolveAgendaPeriod(sp);

  // O header linka "Agenda" pra todo mundo, então a janela entre o deploy e a
  // env configurada viraria erro seco em cima de um clique. Isto é checagem de
  // configuração, não captura de exceção: nenhum erro de runtime é engolido.
  if (!process.env.CALENDLY_TOKEN && !MODO_FIXTURE) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <h1 className="text-2xl">Agenda</h1>
        <Card
          title="Falta conectar o Calendly"
          sub="A variável de ambiente CALENDLY_TOKEN não está definida neste ambiente."
        >
          <p className="text-sm text-[var(--color-muted)]">
            Este painel lê a API do Calendly — os dados de reunião não existem no banco de
            leads, que guarda só o identificador do agendamento. Defina{" "}
            <code className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[13px]">
              CALENDLY_TOKEN
            </code>{" "}
            com um Personal Access Token de <b>admin/owner</b> da organização e faça um novo
            deploy — alterar a variável não afeta o deploy que já está no ar.
          </p>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            A página de <a className="underline" href="/">Captação</a> não depende disso e
            continua funcionando.
          </p>
        </Card>
      </div>
    );
  }

  const a = await getAgenda(period);
  const temGrafico = a.daily.length >= MIN_DIAS_GRAFICO;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl">Agenda</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Reuniões do Calendly por dia, agenda e anfitrião — volume, cancelamento e, quando o
            time marca no-show, presença.
          </p>
        </div>

        {MODO_FIXTURE && (
          <p className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)] p-3 text-[13px]">
            <b>Dados de demonstração.</b> Não há <code>CALENDLY_TOKEN</code> configurado —
            horário, status, agenda, anfitrião e no-show abaixo são <b>inventados</b>. Só os
            identificadores de reunião são reais, para o cruzamento com formulário e
            utm_source mostrar os rótulos verdadeiros do banco.
          </p>
        )}

        <FiltroPeriodo
          action="/agenda"
          keys={AGENDA_KEYS}
          labels={AGENDA_LABEL}
          activeKey={period.key}
          fromDate={period.fromDate}
          toDate={period.toDate}
        />

        <p className="text-sm text-[var(--color-muted)]">
          {period.fromDate === period.toDate
            ? fmtDate(period.fromDate)
            : `${fmtDate(period.fromDate)} a ${fmtDate(period.toDate)}`}{" "}
          · por horário da reunião, fuso de São Paulo
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Reuniões marcadas" valor={nf(a.total)} />
        <Tile label="De pé" valor={nf(a.ativas)} />
        <Tile label="Canceladas" valor={nf(a.canceladas)}>
          {a.canceladas > 0 && (
            <span className="text-xs text-[var(--color-muted-2)]">
              {nf(a.canceladasPeloLead)} por quem marcou · {nf(a.canceladasPeloHost)} por quem
              atende
            </span>
          )}
        </Tile>
        <Tile
          label="Taxa de cancelamento"
          valor={a.total ? pf(taxa(a.canceladas, a.total)) : "—"}
        />
      </div>

      {a.total === 0 ? (
        <Card title="Nenhuma reunião nesta janela" sub="Troque o período acima.">
          <p className="text-sm text-[var(--color-muted)]">
            O painel lê o Calendly pelo horário de início da reunião.
          </p>
        </Card>
      ) : (
        <>
          <Suspense fallback={<EsqueletoPresenca />}>
            <BlocoPresenca period={period} />
          </Suspense>

          {temGrafico && (
            <Card
              title="Dia a dia"
              sub="A coluna é o que foi marcado pro dia; a faixa de cima é o que caiu."
            >
              <div className="mb-4 flex flex-wrap items-center gap-4 text-[13px] text-[var(--color-muted)]">
                {[
                  ["var(--color-stage-3)", "De pé"],
                  ["var(--color-stage-1)", "Cancelada"],
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
              <GraficoDiario daily={a.daily} />
              <TabelaDias daily={a.daily} />
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Por agenda" sub={legenda(a.byAgenda, "tipo de reunião", "tipos de reunião")}>
              <TabelaQuebra data={a.byAgenda} coluna="Agenda" />
            </Card>

            <Card title="Por anfitrião" sub={legenda(a.byHost, "pessoa do time", "pessoas do time")}>
              <TabelaQuebra data={a.byHost} coluna="Anfitrião" />
            </Card>

            <Card
              title="Por formulário de origem"
              sub={`${legenda(a.byForm, "origem", "origens")} · ${nf(a.semLead)} sem lead no banco`}
              wide
            >
              <TabelaQuebra data={a.byForm} coluna="Formulário" />
            </Card>

            <Card title="Por utm_source" sub={legenda(a.byUtm, "origem", "origens")} wide>
              <TabelaQuebra data={a.byUtm} coluna="utm_source" />
            </Card>
          </div>

          <Suspense
            fallback={
              <Card title="Reuniões do período" sub="Carregando…">
                <p className="text-sm text-[var(--color-muted)]">
                  Buscando os convidados de cada reunião.
                </p>
              </Card>
            }
          >
            <BlocoLista period={period} />
          </Suspense>

          {a.semLead > 0 && (
            <p className="text-[13px] text-[var(--color-muted-2)]">
              {nf(a.semLead)} {a.semLead === 1 ? "reunião aparece" : "reuniões aparecem"} como{" "}
              <b>{SEM_LEAD}</b>: o agendamento existe no Calendly mas nenhuma resposta de
              formulário aponta pra ele. Acontece com quem marcou direto pelo link e com quem
              remarcou — a remarcação cria um evento novo, e o banco guarda o antigo.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Plural em português não é sufixo: "reunião"/"reuniões", "origem"/"origens". */
function legenda(b: QuebraAgenda, singular: string, plural: string): string {
  const unidade = b.distinct === 1 ? singular : plural;
  return b.capped
    ? `${nf(b.distinct)} ${unidade} — top 10 abaixo`
    : `${nf(b.distinct)} ${unidade}`;
}
