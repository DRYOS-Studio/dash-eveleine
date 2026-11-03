import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  CACHE_S,
  FONE_MIN,
  getNoShowDeals,
  getOrigensComCarimbo,
  type LeadOrigem,
  type NoShowDeal,
  spDate,
  spMidnight,
  spToday,
  ymd,
} from "./data";
import {
  listarEventos,
  listarInviteesDe,
  uuidDe,
  type CalendlyEvent,
  type CalendlyInvitee,
} from "./calendly";
import { fixtureEventos, fixtureInvitees } from "./calendly-fixture";
import { canonizar, chaveNome } from "./nomes";

// ─────────────────────────────────────────────────────────────────────────────
// Agregação do painel de agendamento.
//
// Duas camadas, porque os dois lados custam coisas muito diferentes (ver o
// comentário de topo de `calendly.ts`):
//
//   getAgenda()   — só a listagem de eventos. ~6 requests para um mês.
//   getPresenca() — no-show e lista nominal. UM REQUEST POR EVENTO.
//
// A página renderiza a primeira na hora e streama a segunda, para a visão do
// mês ser útil antes de o fan-out terminar.

const TOP = 10; // linhas por quebra; o resto vira "(outros)"

// As duas camadas pedem os mesmos dois insumos, e a página chama as duas no
// mesmo request. `cache()` do React dedupa dentro do request: sem isso o mapa
// de origens custaria 6 páginas de Supabase em vez de 3. (Os fetches da
// Calendly já contam com o Data Cache; isto resolve o lado do Supabase, que
// não passa por `fetch` e portanto não é cacheado pelo Next.)
const origensC = cache(getOrigensComCarimbo);
const origens = async () => (await origensC()).mapa;
const noShowDeals = cache(getNoShowDeals);

/**
 * Modo de demonstração: dados falsos para olhar a tela antes de existir
 * CALENDLY_TOKEN. Nunca liga em produção, mesmo que a env vaze pra lá.
 * Para remover: apagar estas linhas e `calendly-fixture.ts`.
 */
export const MODO_FIXTURE =
  process.env.CALENDLY_FIXTURE === "1" && process.env.NODE_ENV !== "production";

// Listagem de eventos com carimbo de hora DENTRO do valor em cache (ver `origensEntradas`
// em data.ts). 5 min, como o antigo TTL_FUTURO: um agendamento novo tem de aparecer.
export const TTL_LISTAGEM_S = 300;
const eventosCarimbados = (from: string, to: string) =>
  unstable_cache(
    async () => ({ geradoEm: new Date().toISOString(), eventos: await listarEventos(from, to) }),
    ["eventos-calendly", from, to],
    { revalidate: TTL_LISTAGEM_S },
  )();
const eventosC = cache(async (from: string, to: string) =>
  MODO_FIXTURE
    ? { geradoEm: new Date().toISOString(), eventos: await fixtureEventos(from, to) }
    : eventosCarimbados(from, to),
);
const eventosDa = async (from: string, to: string) => (await eventosC(from, to)).eventos;
const maisAntigo = (...isos: string[]) => isos.reduce((a, b) => (a < b ? a : b));
const inviteesDe = MODO_FIXTURE
  ? (eventos: CalendlyEvent[]) => fixtureInvitees(eventos)
  : listarInviteesDe;

/** Eventos fora do funil de formulário (agendamento direto, remarcação). */
export const SEM_LEAD = "(fora do funil)";

// ─────────────────────────────────────────────────────────────────────────────
// Janela

export type AgendaKey = "hoje" | "amanha" | "prox7" | "ult7" | "mes";
export const AGENDA_KEYS: AgendaKey[] = ["hoje", "amanha", "prox7", "ult7", "mes"];

export const AGENDA_LABEL: Record<string, string> = {
  hoje: "Hoje",
  amanha: "Amanhã",
  prox7: "Próx. 7 dias",
  ult7: "Últ. 7 dias",
  mes: "Este mês",
  custom: "Personalizado",
};

/**
 * Janela resolvida. Diferente da dash de Captação, o eixo aqui é
 * `start_time` — quando a reunião ACONTECE, não quando foi marcada. São
 * perguntas diferentes: "marcadas pro dia" é a primeira, e a segunda já é
 * respondida pelo funil da outra página.
 */
export type AgendaPeriod = {
  from: string; // ISO-UTC, inclusivo
  to: string; // ISO-UTC, exclusivo
  key: AgendaKey | "custom";
  fromDate: string; // YYYY-MM-DD (SP)
  toDate: string; // YYYY-MM-DD (SP), inclusivo no rótulo
};

const isDate = (s: string | undefined): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

/** Monta a janela a partir de um par de offsets em dias sobre hoje (SP). */
function janela(
  key: AgendaKey | "custom",
  y: number,
  m: number,
  diaIni: number,
  diaFim: number, // exclusivo
): AgendaPeriod {
  return {
    from: spMidnight(y, m, diaIni),
    to: spMidnight(y, m, diaFim),
    key,
    fromDate: ymd(y, m, diaIni),
    toDate: ymd(y, m, diaFim - 1),
  };
}

export function resolveAgendaPeriod(params: {
  range?: string;
  from?: string;
  to?: string;
}): AgendaPeriod {
  const [y, m, d] = spToday();

  if (isDate(params.from) && isDate(params.to)) {
    const [a, b] = [params.from, params.to].sort(); // ordena se vier invertido
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return {
      from: spMidnight(ay, am - 1, ad),
      to: spMidnight(by, bm - 1, bd + 1), // limite superior exclusivo
      key: "custom",
      fromDate: a,
      toDate: b,
    };
  }

  const key: AgendaKey = AGENDA_KEYS.includes(params.range as AgendaKey)
    ? (params.range as AgendaKey)
    : "hoje";

  switch (key) {
    case "amanha":
      return janela(key, y, m, d + 1, d + 2);
    case "prox7":
      return janela(key, y, m, d, d + 7);
    case "ult7":
      return janela(key, y, m, d - 6, d + 1);
    case "mes":
      // Date.UTC normaliza o estouro de mês, então `m + 1` com dia 1 dá o
      // primeiro dia do mês seguinte sem precisar saber quantos dias tem este
      return {
        from: spMidnight(y, m, 1),
        to: spMidnight(y, m + 1, 1),
        key,
        fromDate: ymd(y, m, 1),
        toDate: ymd(y, m + 1, 0),
      };
    default:
      return janela("hoje", y, m, d, d + 1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada 1 — listagem de eventos

/** Estado operacional de uma reunião, derivado do status + do relógio. */
export type Situacao = "cancelada" | "futura" | "agora" | "realizada" | "falta";

export type LinhaAgenda = { label: string; total: number; canceladas: number };
export type QuebraAgenda = { rows: LinhaAgenda[]; distinct: number; capped: boolean };

export type DiaAgenda = { date: string; total: number; canceladas: number };

export type Agenda = {
  /** ISO-UTC do dado mais antigo usado (listagem do Calendly e cola evento→lead). */
  geradoEm: string;
  total: number;
  ativas: number;
  canceladas: number;
  /** Quem puxou o cancelamento: o time ou a própria lead. */
  canceladasPeloHost: number;
  canceladasPeloLead: number;
  score10: number;
  score3: number;
  daily: DiaAgenda[];
  byAgenda: QuebraAgenda;
  byHost: QuebraAgenda;
  byForm: QuebraAgenda;
  byUtm: QuebraAgenda;
  /** Reuniões sem linha correspondente no banco de leads. */
  semLead: number;
};

const bump = (m: Map<string, LinhaAgenda>, label: string, cancelada: boolean) => {
  const cur = m.get(label);
  if (cur) {
    cur.total++;
    if (cancelada) cur.canceladas++;
  } else {
    m.set(label, { label, total: 1, canceladas: cancelada ? 1 : 0 });
  }
};

/** Ordena por volume desc e corta no top N, somando a cauda em "(outros)". */
const cortar = (m: Map<string, LinhaAgenda>): QuebraAgenda => {
  const all = [...m.values()].sort(
    (x, y) => y.total - x.total || x.label.localeCompare(y.label),
  );
  if (all.length <= TOP) return { rows: all, distinct: all.length, capped: false };
  const tail = all.slice(TOP);
  return {
    rows: [
      ...all.slice(0, TOP),
      {
        label: `(outros ${tail.length} ${tail.length === 1 ? "valor" : "valores"})`,
        total: tail.reduce((s, r) => s + r.total, 0),
        canceladas: tail.reduce((s, r) => s + r.canceladas, 0),
      },
    ],
    distinct: all.length,
    capped: true,
  };
};

/** Host da reunião. Round-robin troca o anfitrião a cada evento. */
const hostDe = (e: CalendlyEvent) =>
  e.event_memberships
    .map((m) => m.user_name || m.user_email || "")
    .filter(Boolean)
    .join(", ") || "(sem anfitrião)";

const agendaDe = (e: CalendlyEvent) => (e.name || "").trim() || "(sem nome)";

/**
 * Situação de uma reunião. `faltou` vem da camada 2 — sem ela, um evento
 * concluído é reportado como "realizada", que é o caso majoritário; a camada 2
 * corrige para "falta" quando o no-show existe.
 */
function situacaoDe(
  e: CalendlyEvent,
  agora: number,
  faltou = false,
): Situacao {
  if (e.status === "canceled") return "cancelada";
  if (Date.parse(e.start_time) > agora) return "futura";
  if (Date.parse(e.end_time) > agora) return "agora";
  return faltou ? "falta" : "realizada";
}

export async function getAgenda(period: AgendaPeriod): Promise<Agenda> {
  const [eventosR, origensR] = await Promise.all([
    eventosC(period.from, period.to),
    origensC(),
  ]);
  const eventos = eventosR.eventos;
  const porUuid = origensR.mapa;

  // mesma pessoa com grafia diferente no Calendly vira uma linha só (ver nomes.ts)
  const hostCanon = canonizar(eventos.map(hostDe));

  const mapAgenda = new Map<string, LinhaAgenda>();
  const mapHost = new Map<string, LinhaAgenda>();
  const mapForm = new Map<string, LinhaAgenda>();
  const mapUtm = new Map<string, LinhaAgenda>();
  const mapDia = new Map<string, DiaAgenda>();

  let canceladas = 0;
  let canceladasPeloHost = 0;
  let canceladasPeloLead = 0;
  let semLead = 0;
  let score10 = 0;
  let score3 = 0;

  for (const e of eventos) {
    const cancelada = e.status === "canceled";
    if (cancelada) {
      canceladas++;
      if (e.cancellation?.canceler_type === "host") canceladasPeloHost++;
      else canceladasPeloLead++;
    }

    const origem = porUuid.get(uuidDe(e.uri));
    if (!origem) {
      semLead++;
    } else {
      if (origem.score === 10) {
        score10++;
      } else if (origem.score === 3) {
        score3++;
      }
    }

    bump(mapAgenda, agendaDe(e), cancelada);
    bump(mapHost, hostCanon(hostDe(e)), cancelada);
    bump(mapForm, origem?.form ?? SEM_LEAD, cancelada);
    bump(mapUtm, origem?.utmSource ?? SEM_LEAD, cancelada);

    const dia = spDate(e.start_time);
    const acc = mapDia.get(dia) ?? { date: dia, total: 0, canceladas: 0 };
    acc.total++;
    if (cancelada) acc.canceladas++;
    mapDia.set(dia, acc);
  }

  return {
    geradoEm: maisAntigo(eventosR.geradoEm, origensR.geradoEm),
    total: eventos.length,
    ativas: eventos.length - canceladas,
    canceladas,
    canceladasPeloHost,
    canceladasPeloLead,
    score10,
    score3,
    daily: [...mapDia.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byAgenda: cortar(mapAgenda),
    byHost: cortar(mapHost),
    byForm: cortar(mapForm),
    byUtm: cortar(mapUtm),
    semLead,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada 2 — no-show e lista nominal (o fan-out caro)

export type Reuniao = {
  uuid: string;
  quem: string;
  inicio: string; // ISO-UTC
  agenda: string;
  host: string;
  situacao: Situacao;
  origem: string;
  score?: number | null;
  /** Só quando cancelada: quem cancelou e por quê. */
  canceladaPor?: "host" | "invitee";
  motivo?: string | null;
};

export type LinhaPresenca = { label: string; concluidas: number; faltas: number };

export type ContagemScore = { concluidas: number; faltas: number };

export type Presenca = {
  /** Reuniões ativas que já terminaram. Denominador da taxa de falta. */
  concluidas: number;
  compareceram: number;
  faltaram: number;
  byAgenda: LinhaPresenca[];
  byHost: LinhaPresenca[];
  /** Mesmo critério de `concluidas`/`faltas`, só das reuniões de lead com Score 10 ou 3. */
  porScore: { s10: ContagemScore; s3: ContagemScore };
  reunioes: Reuniao[];
  /** Quantos eventos a API não respondeu — a taxa é sobre o que deu pra ler. */
  falhas: number;
  /**
   * A falta vem da `lead_no_shows` (deals 'No-show' do CRM), cruzada por
   * e-mail/telefone. Zero faltas casadas na janela não distingue "ninguém
   * faltou" de "a tabela não cobre este período" (ela só tem deals de
   * 22/10/2026 em diante) — e exibir 0 afirmaria uma presença que não foi
   * medida. Quando isto é falso, presença vira "—" em vez de zero.
   */
  rastreado: boolean;
};

/**
 * Uuids das reuniões marcadas como falta. A `lead_no_shows` não diz QUAL reunião
 * foi a falta, então cada deal vira UMA reunião: a última, já concluída e não
 * cancelada, de um lead com o mesmo e-mail ou telefone (decisão do Rafael,
 * 2026-11-01). Só enxerga os eventos da janela — um lead cuja falta real foi
 * antes dela e que compareceu a outra dentro dela é marcado nesta.
 * Dois deals da mesma pessoa caem na mesma reunião e contam uma vez.
 */
function reunioesEmFalta(
  eventos: CalendlyEvent[],
  porUuid: Map<string, LeadOrigem>,
  deals: NoShowDeal[],
  agora: number,
): Set<string> {
  const fim = new Map<string, number>(); // uuid → end_time
  const porEmail = new Map<string, string>(); // chave → uuid da reunião mais recente
  const porFone = new Map<string, string>();

  const guardar = (m: Map<string, string>, chave: string, uuid: string) => {
    if (!chave) return;
    const atual = m.get(chave);
    if (atual === undefined || fim.get(uuid)! > fim.get(atual)!) m.set(chave, uuid);
  };

  for (const e of eventos) {
    const end = Date.parse(e.end_time);
    if (e.status === "canceled" || end > agora) continue;
    const uuid = uuidDe(e.uri);
    const lead = porUuid.get(uuid);
    if (!lead) continue;
    fim.set(uuid, end);
    guardar(porEmail, lead.email, uuid);
    guardar(porFone, lead.fone.length >= FONE_MIN ? lead.fone : "", uuid);
  }

  const emFalta = new Set<string>();
  for (const d of deals) {
    const achados = [
      porEmail.get(d.email),
      d.fone.length >= FONE_MIN ? porFone.get(d.fone) : undefined,
    ].filter((u): u is string => u !== undefined);
    if (achados.length === 0) continue;
    emFalta.add(achados.reduce((a, b) => (fim.get(b)! > fim.get(a)! ? b : a)));
  }
  return emFalta;
}

const nomeDe = (invitees: CalendlyInvitee[]) =>
  invitees.map((i) => i.name).filter(Boolean).join(", ") || "(sem nome)";

const somaPresenca = (
  m: Map<string, LinhaPresenca>,
  label: string,
  concluida: boolean,
  falta: boolean,
) => {
  const cur = m.get(label) ?? { label, concluidas: 0, faltas: 0 };
  if (concluida) cur.concluidas++;
  if (falta) cur.faltas++;
  m.set(label, cur);
};

/**
 * Busca os invitees de cada evento da janela. É o request caro — um por
 * evento — e hoje serve só para o nome na lista nominal (`nomeDe`) dos eventos
 * SEM lead: quando o evento casa com uma resposta de formulário, o nome vem dela
 * (93% dos eventos em 2026-11-03). A falta vem da `lead_no_shows`, não do invitee.
 */
async function calcularPresenca(period: AgendaPeriod): Promise<Presenca> {
  const agora = Date.now();

  // memoizados: a camada 1 já resolveu os dois neste mesmo request
  const [eventos, porUuid, deals] = await Promise.all([
    eventosDa(period.from, period.to),
    origens(),
    noShowDeals(),
  ]);

  const semNome = eventos.filter((e) => !porUuid.get(uuidDe(e.uri))?.nome);
  const porEvento = await inviteesDe(semNome, agora);
  const emFalta = reunioesEmFalta(eventos, porUuid, deals, agora);

  const hostCanon = canonizar(eventos.map(hostDe));
  const mapAgenda = new Map<string, LinhaPresenca>();
  const mapHost = new Map<string, LinhaPresenca>();
  const reunioes: Reuniao[] = [];

  let compareceram = 0;
  let faltaram = 0;
  let concluidas = 0;
  let falhas = 0;
  const porScore = {
    s10: { concluidas: 0, faltas: 0 },
    s3: { concluidas: 0, faltas: 0 },
  };

  for (const e of eventos) {
    const uuid = uuidDe(e.uri);
    const nomeLead = porUuid.get(uuid)?.nome;
    const invitees = porEvento.get(uuid);
    if (!nomeLead && !invitees) falhas++; // só conta quem dependia do Calendly

    const ativa = e.status !== "canceled";
    const concluida = ativa && Date.parse(e.end_time) <= agora;
    const falta = emFalta.has(uuid); // só contém reuniões concluídas e ativas
    const score = porUuid.get(uuid)?.score ?? null;

    if (concluida) {
      concluidas++;
      if (falta) faltaram++;
      else compareceram++;

      const faixa = score === 10 ? porScore.s10 : score === 3 ? porScore.s3 : null;
      if (faixa) {
        faixa.concluidas++;
        if (falta) faixa.faltas++;
      }
    }

    const agenda = agendaDe(e);
    const host = hostCanon(hostDe(e));
    somaPresenca(mapAgenda, agenda, concluida, falta);
    somaPresenca(mapHost, host, concluida, falta);

    reunioes.push({
      uuid,
      quem: nomeLead || (invitees ? nomeDe(invitees) : "(indisponível)"),
      inicio: e.start_time,
      agenda,
      host,
      situacao: situacaoDe(e, agora, falta),
      origem: porUuid.get(uuid)?.form ?? SEM_LEAD,
      score,
      canceladaPor: e.cancellation?.canceler_type,
      motivo: e.cancellation?.reason,
    });
  }

  const ordenar = (m: Map<string, LinhaPresenca>) =>
    [...m.values()]
      .filter((r) => r.concluidas > 0)
      .sort((a, b) => b.faltas - a.faltas || b.concluidas - a.concluidas);

  return {
    concluidas,
    compareceram,
    faltaram,
    byAgenda: ordenar(mapAgenda),
    byHost: ordenar(mapHost),
    porScore,
    reunioes: reunioes.sort((a, b) => a.inicio.localeCompare(b.inicio)),
    falhas,
    rastreado: faltaram > 0,
  };
}

/**
 * Memoizado porque a página abre DUAS fronteiras de Suspense sobre o mesmo
 * cálculo — os KPIs de presença no topo e a lista nominal no rodapé. Sem isto
 * o fan-out por evento aconteceria duas vezes.
 */
export const getPresenca = cache(calcularPresenca);

export type PresencaHost = {
  /** `chaveNome(nome)` — o que o chamador usa para ligar um closer a este anfitrião. */
  chave: string;
  nome: string;
  concluidas: number;
  faltas: number;
};

/**
 * Presença por anfitrião SEM o fan-out de invitees: contar reuniões concluídas
 * e faltas só precisa da listagem de eventos (barata) + `lead_no_shows`. É o que
 * a página de Vendas usa para cruzar closer × anfitrião — `getPresenca` custaria
 * um request por evento. Chaveado por `chaveNome` (grafia ≠ pessoa diferente).
 * `from`/`to` em ISO-UTC; `to` exclusivo. Devolve lista (não Map) para caber no
 * Data Cache.
 */
export async function lerPresencaPorHost(
  from: string,
  to: string,
): Promise<{ geradoEm: string; hosts: PresencaHost[] }> {
  const agora = Date.now();
  const [eventosR, origensR, deals] = await Promise.all([
    eventosC(from, to),
    origensC(),
    noShowDeals(),
  ]);
  const eventos = eventosR.eventos;
  const porUuid = origensR.mapa;
  const emFalta = reunioesEmFalta(eventos, porUuid, deals, agora);
  const canon = canonizar(eventos.map(hostDe));

  const mapa = new Map<string, PresencaHost>();
  for (const e of eventos) {
    if (e.status === "canceled" || Date.parse(e.end_time) > agora) continue;
    const nome = canon(hostDe(e));
    const chave = chaveNome(nome);
    const cur = mapa.get(chave) ?? { chave, nome, concluidas: 0, faltas: 0 };
    cur.concluidas++;
    if (emFalta.has(uuidDe(e.uri))) cur.faltas++;
    mapa.set(chave, cur);
  }
  // dado mais antigo entre as entradas (os deals de no-show seguem o mesmo cache de CACHE_S)
  return { geradoEm: maisAntigo(eventosR.geradoEm, origensR.geradoEm), hosts: [...mapa.values()] };
}

export const getPresencaPorHost = (from: string, to: string) =>
  unstable_cache(() => lerPresencaPorHost(from, to), ["presenca-por-host", from, to], {
    revalidate: CACHE_S,
  })();
