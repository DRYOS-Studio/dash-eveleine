import "server-only";

// ─────────────────────────────────────────────────────────────────────────────
// Cliente da API do Calendly v2 (https://api.calendly.com), read-only.
//
// Campos e endpoints conferidos contra o OpenAPI oficial
// (developer.calendly.com/openapi/calendly-api.yaml) em 2026-09-18:
//
//   GET /scheduled_events        → status, start_time, end_time, name (= nome da
//                                  agenda), event_type, event_memberships (host),
//                                  cancellation. Paginado, `count` máx 100.
//   GET /scheduled_events/{u}/invitees → no_show, name, email, tracking (utm).
//
// ⚠️ `no_show` vive no Invitee, NÃO no Event, e não existe listagem org-wide de
// invitees (`/invitees` é POST-only, da Scheduling API). Logo saber quem faltou
// custa UM REQUEST POR EVENTO. É essa assimetria que justifica o desenho em duas
// camadas do painel: o que é barato renderiza na hora, o no-show entra depois.

const API = "https://api.calendly.com";

const PAGE = 100; // máximo aceito pelo `count` da API
const CONCORRENCIA = 5; // teto do fan-out por evento
const TENTATIVAS = 3;

/**
 * TTLs do Data Cache, por idade do evento. O que torna a visão do mês viável
 * sem banco próprio: cada evento é uma entrada de cache independente, então
 * recarregar o mês só re-busca os dias quentes.
 */
const TTL_FUTURO = 300; // 5 min — ainda pode ser cancelado/remarcado
const TTL_RECENTE = 3600; // 1 h — o operador ainda vai marcar falta
const TTL_ANTIGO = 86400; // 24 h — no-show já estabilizou
const DIAS_RECENTE = 7;

function token(): string {
  const t = process.env.CALENDLY_TOKEN;
  if (!t) {
    throw new Error(
      "Falta CALENDLY_TOKEN nas variáveis de ambiente (Personal Access Token do Calendly).",
    );
  }
  return t;
}

export class CalendlyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CalendlyError";
  }
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET autenticado com retentativa.
 *
 * O limite de requisições da Calendly não está declarado no OpenAPI nem foi
 * possível confirmá-lo na documentação pública — por isso o cliente respeita o
 * `Retry-After` quando vem e usa backoff exponencial quando não vem, em vez de
 * assumir um número.
 */
async function get<T>(path: string, revalidate: number): Promise<T> {
  const url = path.startsWith("http") ? path : `${API}${path}`;

  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      next: { revalidate },
    });

    if (res.ok) return (await res.json()) as T;

    const podeTentarDeNovo = res.status === 429 || res.status >= 500;
    if (!podeTentarDeNovo || tentativa === TENTATIVAS) {
      const corpo = await res.text().catch(() => "");
      throw new CalendlyError(
        `Calendly ${res.status} em ${path}${corpo ? ` — ${corpo.slice(0, 300)}` : ""}`,
        res.status,
      );
    }

    const retryAfter = Number(res.headers.get("retry-after"));
    await dorme(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 500 * 2 ** (tentativa - 1),
    );
  }
}

/** Executa as tarefas com teto de concorrência, preservando a ordem da entrada. */
async function comTeto<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length);
  let proximo = 0;
  const worker = async () => {
    while (true) {
      const i = proximo++;
      if (i >= itens.length) return;
      out[i] = await fn(itens[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, worker),
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos — só o subconjunto de campos que o painel usa.

export type CalendlyUser = {
  uri: string;
  name: string;
  email: string;
  current_organization: string;
};

export type EventMembership = {
  user: string;
  user_name?: string;
  user_email?: string;
};

export type Cancellation = {
  canceled_by: string;
  reason: string | null;
  canceler_type: "host" | "invitee";
  created_at: string;
};

export type CalendlyEvent = {
  uri: string;
  name: string | null;
  status: "active" | "canceled";
  start_time: string;
  end_time: string;
  event_type: string;
  event_memberships: EventMembership[];
  cancellation?: Cancellation;
};

export type CalendlyInvitee = {
  uri: string;
  name: string;
  email: string;
  status: "active" | "canceled";
  no_show: { uri: string; created_at: string } | null;
  rescheduled: boolean;
  new_invitee: string | null;
  cancellation?: Cancellation;
};

type Paged<T> = { collection: T[]; pagination: { next_page: string | null } };

/** UUID no fim de uma URI canônica da Calendly. */
export const uuidDe = (uri: string) => uri.split("/").pop()!.toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Organização do token. Sem ela a listagem devolve só os eventos do próprio
 * usuário — o painel do time depende de um token com papel de admin/owner.
 * Fica em cache longo porque não muda.
 */
export async function orgUri(): Promise<string> {
  const fixa = process.env.CALENDLY_ORG_URI?.trim();
  if (fixa) return fixa;
  const me = await get<{ resource: CalendlyUser }>("/users/me", TTL_ANTIGO);
  return me.resource.current_organization;
}

export async function euSou(): Promise<CalendlyUser> {
  const me = await get<{ resource: CalendlyUser }>("/users/me", TTL_ANTIGO);
  return me.resource;
}

/**
 * Eventos da organização com início na janela [min, max). Camada barata:
 * ~6 requests para um mês inteiro.
 *
 * Sem filtro de `status` de propósito — o painel precisa dos cancelados
 * tanto quanto dos ativos.
 */
export async function listarEventos(
  minStart: string,
  maxStart: string,
): Promise<CalendlyEvent[]> {
  const org = await orgUri();
  const eventos: CalendlyEvent[] = [];

  let url =
    `/scheduled_events?organization=${encodeURIComponent(org)}` +
    `&min_start_time=${encodeURIComponent(minStart)}` +
    `&max_start_time=${encodeURIComponent(maxStart)}` +
    `&count=${PAGE}&sort=start_time:asc`;

  // a janela pode incluir dias futuros (reuniões ainda por acontecer), então o
  // TTL da listagem segue o teto curto: um agendamento novo tem de aparecer
  for (;;) {
    const pagina: Paged<CalendlyEvent> = await get(url, TTL_FUTURO);
    eventos.push(...pagina.collection);
    const prox = pagina.pagination?.next_page;
    if (!prox) break;
    url = prox;
  }

  return eventos;
}

/** TTL de um evento conforme quanto tempo faz que ele terminou. */
function ttlDoEvento(endTime: string, agora: number): number {
  const fim = Date.parse(endTime);
  if (fim > agora) return TTL_FUTURO;
  return agora - fim < DIAS_RECENTE * 86_400_000 ? TTL_RECENTE : TTL_ANTIGO;
}

/**
 * Invitees de um evento. É daqui que sai o no-show — e é o request caro.
 * Um evento 1:1 tem um invitee; a paginação existe para eventos coletivos.
 */
export async function listarInvitees(
  event: CalendlyEvent,
  agora = Date.now(),
): Promise<CalendlyInvitee[]> {
  const ttl = ttlDoEvento(event.end_time, agora);
  const invitees: CalendlyInvitee[] = [];

  let url = `/scheduled_events/${uuidDe(event.uri)}/invitees?count=${PAGE}`;
  for (;;) {
    const pagina: Paged<CalendlyInvitee> = await get(url, ttl);
    invitees.push(...pagina.collection);
    const prox = pagina.pagination?.next_page;
    if (!prox) break;
    url = prox;
  }

  return invitees;
}

/**
 * Fan-out dos invitees sobre vários eventos, com teto de concorrência.
 *
 * Falha por evento é tolerada — o evento fica FORA do mapa e quem chama conta
 * o buraco, em vez de a página inteira cair por causa de um request. Mas 401 e
 * 403 sobem: são configuração errada (token inválido, sem papel de admin), e
 * aconteceriam em todos os eventos — engolir isso mostraria "zero faltas" com
 * cara de dado bom.
 */
export async function listarInviteesDe(
  eventos: CalendlyEvent[],
  agora = Date.now(),
): Promise<Map<string, CalendlyInvitee[]>> {
  const listas = await comTeto(eventos, async (e) => {
    try {
      return await listarInvitees(e, agora);
    } catch (err) {
      if (err instanceof CalendlyError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      return null;
    }
  });

  const mapa = new Map<string, CalendlyInvitee[]>();
  eventos.forEach((e, i) => {
    const lista = listas[i];
    if (lista) mapa.set(uuidDe(e.uri), lista);
  });
  return mapa;
}
