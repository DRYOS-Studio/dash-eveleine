import "server-only";
import { cache } from "react";
import {
  getLeadsByCalendlyEvent,
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
const origens = cache(getLeadsByCalendlyEvent);

/**
 * Modo de demonstração: dados falsos para olhar a tela antes de existir
 * CALENDLY_TOKEN. Nunca liga em produção, mesmo que a env vaze pra lá.
 * Para remover: apagar estas linhas e `calendly-fixture.ts`.
 */
export const MODO_FIXTURE =
  process.env.CALENDLY_FIXTURE === "1" && process.env.NODE_ENV !== "production";

const eventosDa = cache(MODO_FIXTURE ? fixtureEventos : listarEventos);
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
  total: number;
  ativas: number;
  canceladas: number;
  /** Quem puxou o cancelamento: o time ou a própria lead. */
  canceladasPeloHost: number;
  canceladasPeloLead: number;
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
  const [eventos, porUuid] = await Promise.all([
    eventosDa(period.from, period.to),
    origens(),
  ]);

  const mapAgenda = new Map<string, LinhaAgenda>();
  const mapHost = new Map<string, LinhaAgenda>();
  const mapForm = new Map<string, LinhaAgenda>();
  const mapUtm = new Map<string, LinhaAgenda>();
  const mapDia = new Map<string, DiaAgenda>();

  let canceladas = 0;
  let canceladasPeloHost = 0;
  let canceladasPeloLead = 0;
  let semLead = 0;

  for (const e of eventos) {
    const cancelada = e.status === "canceled";
    if (cancelada) {
      canceladas++;
      if (e.cancellation?.canceler_type === "host") canceladasPeloHost++;
      else canceladasPeloLead++;
    }

    const origem = porUuid.get(uuidDe(e.uri));
    if (!origem) semLead++;

    bump(mapAgenda, agendaDe(e), cancelada);
    bump(mapHost, hostDe(e), cancelada);
    bump(mapForm, origem?.form ?? SEM_LEAD, cancelada);
    bump(mapUtm, origem?.utmSource ?? SEM_LEAD, cancelada);

    const dia = spDate(e.start_time);
    const acc = mapDia.get(dia) ?? { date: dia, total: 0, canceladas: 0 };
    acc.total++;
    if (cancelada) acc.canceladas++;
    mapDia.set(dia, acc);
  }

  return {
    total: eventos.length,
    ativas: eventos.length - canceladas,
    canceladas,
    canceladasPeloHost,
    canceladasPeloLead,
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
  /** Só quando cancelada: quem cancelou e por quê. */
  canceladaPor?: "host" | "invitee";
  motivo?: string | null;
};

export type LinhaPresenca = { label: string; concluidas: number; faltas: number };

export type Presenca = {
  /** Reuniões ativas que já terminaram. Denominador da taxa de falta. */
  concluidas: number;
  compareceram: number;
  faltaram: number;
  byAgenda: LinhaPresenca[];
  byHost: LinhaPresenca[];
  reunioes: Reuniao[];
  /** Quantos eventos a API não respondeu — a taxa é sobre o que deu pra ler. */
  falhas: number;
  /**
   * `no_show` no Calendly só é preenchido quando alguém marca a falta à mão.
   * Zero marcações na janela não distingue "ninguém faltou" de "ninguém marca"
   * — e exibir 0 faltas afirmaria uma presença que não foi medida. Quando isto
   * é falso, presença vira "—" em vez de zero.
   */
  rastreado: boolean;
};

const faltou = (invitees: CalendlyInvitee[]) =>
  invitees.some((i) => i.no_show !== null && i.status !== "canceled");

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
 * evento — e é a única forma de saber no-show: a API não expõe listagem
 * org-wide de invitees.
 */
async function calcularPresenca(period: AgendaPeriod): Promise<Presenca> {
  const agora = Date.now();

  // memoizados: a camada 1 já resolveu os dois neste mesmo request
  const [eventos, porUuid] = await Promise.all([
    eventosDa(period.from, period.to),
    origens(),
  ]);

  const porEvento = await inviteesDe(eventos, agora);

  const mapAgenda = new Map<string, LinhaPresenca>();
  const mapHost = new Map<string, LinhaPresenca>();
  const reunioes: Reuniao[] = [];

  let compareceram = 0;
  let faltaram = 0;
  let concluidas = 0;
  let falhas = 0;

  for (const e of eventos) {
    const uuid = uuidDe(e.uri);
    const invitees = porEvento.get(uuid);
    if (!invitees) falhas++;

    const ativa = e.status !== "canceled";
    const concluida = ativa && Date.parse(e.end_time) <= agora;
    const falta = concluida && !!invitees && faltou(invitees);

    if (concluida) {
      concluidas++;
      if (falta) faltaram++;
      else compareceram++;
    }

    const agenda = agendaDe(e);
    const host = hostDe(e);
    somaPresenca(mapAgenda, agenda, concluida, falta);
    somaPresenca(mapHost, host, concluida, falta);

    reunioes.push({
      uuid,
      quem: invitees ? nomeDe(invitees) : "(indisponível)",
      inicio: e.start_time,
      agenda,
      host,
      situacao: situacaoDe(e, agora, falta),
      origem: porUuid.get(uuid)?.form ?? SEM_LEAD,
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
