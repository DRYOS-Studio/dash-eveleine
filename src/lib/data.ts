import "server-only";
import { supabaseAdmin } from "./supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Fonte de leitura dos leads: view `leads_consolidados` (confirmada no banco-alvo
// em 2026-07-30). A view é um SELECT sobre a função get_all_leads(), que faz o
// union das tabelas `yay_<form_id>` — uma por formulário.
// Se o schema mudar, ajuste SÓ este bloco (SOURCE / COL).
const SOURCE = "leads_consolidados";
const COL = {
  formId: "form_id", // parte 1 da chave de ordenação estável
  id: "id", // sequência POR tabela — não é único no union
  formName: "form_name",
  status: "status", // partial | complete | scheduled → o funil
  submittedAt: "submitted_at",
} as const;

// Formulários recriados no Yay ganham `form_id` novo e ficam fora da `forms_names`,
// aparecendo como ID cru e quebrando o histórico do funil em duas barras. Aqui o
// form_id novo é apontado pro nome canônico do funil, somando as duas versões.
// Só cobre casos confirmados por comparação das perguntas — o certo é cadastrar o
// nome na `forms_names`, mas não temos escrita nesse banco.
const FORM_ALIAS: Record<string, string> = {
  // 44 leads desde 09/07/2026; 12 das 13 perguntas idênticas ao form abaixo
  "6a4e3e9826348f5cde09d3eb": "Aplicação Direta | Instagram",
  // 7 leads desde 07/07/2026; form curto (nome + WhatsApp + Calendly) vindo de
  // e-mail marketing (leadlovers). Nome confirmado pelo Rafael em 2026-07-30 —
  // é o `Versalhes | Reativação` recriado; a entrada original na `forms_names`
  // (69d5367171355988120bc208) nunca recebeu lead.
  "6a456089bc6c8b26eb0b5a56": "Versalhes | Reativação",
};

export const TZ_OFFSET_HOURS = 3; // America/Sao_Paulo = UTC-3 (sem DST)
const PAGE = 1000; // PostgREST corta em 1000 linhas/request → paginar

const TOP = 10; // barras por quebra; o resto vira uma linha "(outros)"

export type RangeKey = "hoje" | "ontem" | "7" | "30" | "90" | "all";
export const RANGE_KEYS: RangeKey[] = ["hoje", "ontem", "7", "30", "90", "all"];

/**
 * Estágios do funil, da coluna `status` da view. São mutuamente exclusivos:
 * `partial` começou e não terminou; `complete` terminou e não agendou;
 * `scheduled` terminou e agendou. Contar linhas sem separar isso soma abandono
 * como inscrito — 35% do total histórico.
 */
type Status = "partial" | "complete" | "scheduled";

/** Uma linha de quebra: volume + quantos daquele grupo agendaram. */
export type Count = { label: string; leads: number; agendou: number };
/** Quebra já cortada no top N: `rows` inclui a linha "(outros)" quando `capped`. */
export type Breakdown = { rows: Count[]; distinct: number; capped: boolean };

export const UTM_DIMS = ["source", "content", "medium", "campaign", "term"] as const;
export type UtmDim = (typeof UTM_DIMS)[number];

/**
 * Geo vem do jsonb `geolocation`. Leio só os dois campos que interessam, via
 * seletor de campo do PostgREST — trazer o objeto inteiro engordaria o payload
 * de 11 mil linhas por nada.
 */
const GEO_COLS = ["pais:geolocation->>country", "estado:geolocation->>state"] as const;

export type Funnel = {
  iniciaram: number;
  terminaram: number; // complete + scheduled
  agendaram: number;
  abandonaram: number;
};

/** Um dia da série, já no fuso de São Paulo. */
export type Day = {
  date: string; // YYYY-MM-DD
  leads: number;
  abandonou: number;
  terminou: number;
  agendou: number;
};

export type LeadsSummary = {
  funnel: Funnel;
  /** Mesmo funil na janela anterior de igual duração; null em `all`. */
  anterior: Funnel | null;
  daily: Day[];
  byForm: Breakdown;
  byUtm: Record<UtmDim, Breakdown>;
  /** `regiao` qualifica o estado com o país — a audiência não é só do Brasil. */
  byGeo: { pais: Breakdown; regiao: Breakdown };
  from: string | null;
  to: string | null;
};

type Row = {
  form_id: string | null;
  id: number;
  form_name: string | null;
  status: string | null;
  submitted_at: string;
  pais: string | null;
  estado: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

/** Período resolvido: limites ISO-UTC + como ecoar o filtro na URL. */
export type Period = {
  from: string | null;
  to: string | null; // exclusivo; null = até agora
  key: RangeKey | "custom";
  fromDate: string | null; // YYYY-MM-DD (SP) p/ preencher os inputs
  toDate: string | null;
};

const isDate = (s: string | undefined): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

/** 00:00 de um dia-calendário SP, em ISO-UTC. */
export const spMidnight = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d, TZ_OFFSET_HOURS, 0, 0)).toISOString();

/** Data-calendário SP de agora, deslocando -3h e lendo em UTC. */
export function spToday(): [number, number, number] {
  const sp = new Date(Date.now() - TZ_OFFSET_HOURS * 3600_000);
  return [sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()];
}

export const ymd = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/**
 * Traduz os query params em limites de consulta. `from`/`to` (YYYY-MM-DD) têm
 * precedência sobre `range`; datas inválidas caem no default de 30 dias.
 * O limite superior é sempre EXCLUSIVO — daí somar 1 dia no fim das janelas
 * fechadas, pra incluir o dia inteiro sem depender de milissegundo.
 */
export function resolvePeriod(params: {
  range?: string;
  from?: string;
  to?: string;
}): Period {
  const [y, m, d] = spToday();

  if (isDate(params.from) && isDate(params.to)) {
    // ordena o par se vier invertido, em vez de devolver janela vazia
    const [a, b] = [params.from, params.to].sort();
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return {
      from: spMidnight(ay, am - 1, ad),
      to: spMidnight(by, bm - 1, bd + 1),
      key: "custom",
      fromDate: a,
      toDate: b,
    };
  }

  const key: RangeKey = RANGE_KEYS.includes(params.range as RangeKey)
    ? (params.range as RangeKey)
    : "30";

  if (key === "all") {
    return { from: null, to: null, key, fromDate: null, toDate: null };
  }
  if (key === "ontem") {
    return {
      from: spMidnight(y, m, d - 1),
      to: spMidnight(y, m, d),
      key,
      fromDate: ymd(y, m, d - 1),
      toDate: ymd(y, m, d - 1),
    };
  }
  // hoje = 1 dia; 7/30/90 contam o dia corrente como o último da janela
  const days = key === "hoje" ? 1 : Number(key);
  return {
    from: spMidnight(y, m, d - (days - 1)),
    to: null,
    key,
    fromDate: ymd(y, m, d - (days - 1)),
    toDate: ymd(y, m, d),
  };
}

const DIA_MS = 86_400_000;

/**
 * Janela anterior de igual duração em dias de calendário, terminando onde a
 * atual começa. Em `all` não existe "anterior" — devolve null e a tela omite
 * os deltas em vez de comparar com zero.
 */
export function periodoAnterior(p: Period): { from: string; to: string } | null {
  if (!p.fromDate || !p.toDate) return null;
  const ini = Date.parse(p.fromDate + "T00:00:00Z");
  const fim = Date.parse(p.toDate + "T00:00:00Z");
  const dias = Math.round((fim - ini) / DIA_MS) + 1;
  const d = (t: number) => new Date(t).toISOString().slice(0, 10).split("-").map(Number);
  const [ay, am, ad] = d(ini - dias * DIA_MS);
  return { from: spMidnight(ay, am - 1, ad), to: p.from! };
}

const COLS = [
  COL.formId,
  COL.id,
  COL.formName,
  COL.status,
  COL.submittedAt,
  ...GEO_COLS,
  ...UTM_DIMS.map((d) => `utm_${d}`),
].join(", ");

/** Puxa todas as linhas de uma janela, paginando o corte de 1000 do PostgREST. */
async function fetchRows(from: string | null, to: string | null): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    let q = supabaseAdmin.from(SOURCE).select(COLS);
    if (to) q = q.lt(COL.submittedAt, to); // limite superior exclusivo
    if (from) q = q.gte(COL.submittedAt, from);
    // ordenação estável (form_id, id): `id` sozinho não é único no union das
    // tabelas (cada `yay_<form_id>` tem sua própria sequência); o par é.
    const { data, error } = await q
      .order(COL.formId, { ascending: true })
      .order(COL.id, { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

const funnelOf = (rows: Row[]): Funnel => {
  let agendaram = 0;
  let abandonaram = 0;
  for (const r of rows) {
    if (r.status === "scheduled") agendaram++;
    else if (r.status === "partial") abandonaram++;
  }
  return {
    iniciaram: rows.length,
    terminaram: rows.length - abandonaram,
    agendaram,
    abandonaram,
  };
};

/** Data-calendário SP de um instante ISO-UTC, sem depender de Intl. */
export const spDate = (iso: string) =>
  new Date(Date.parse(iso) - TZ_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);

/** Lê a janela (e a anterior, p/ deltas) e agrega funil, série diária e quebras. */
export async function getLeads(period: Period): Promise<LeadsSummary> {
  const { from, to } = period;
  const prev = periodoAnterior(period);

  // as duas janelas em paralelo — a anterior só alimenta os deltas
  const [rows, rowsPrev] = await Promise.all([
    fetchRows(from, to),
    prev ? fetchRows(prev.from, prev.to) : Promise.resolve(null),
  ]);

  const byFormMap = new Map<string, Count>();
  const utmMaps: Record<UtmDim, Map<string, Count>> = {
    source: new Map(),
    content: new Map(),
    medium: new Map(),
    campaign: new Map(),
    term: new Map(),
  };
  const paisMap = new Map<string, Count>();
  const regiaoMap = new Map<string, Count>();
  const dayMap = new Map<string, Day>();

  const bump = (m: Map<string, Count>, label: string, agendou: boolean) => {
    const cur = m.get(label);
    if (cur) {
      cur.leads++;
      if (agendou) cur.agendou++;
    } else {
      m.set(label, { label, leads: 1, agendou: agendou ? 1 : 0 });
    }
  };

  for (const r of rows) {
    const st = (r.status ?? "") as Status;
    const agendou = st === "scheduled";

    bump(
      byFormMap,
      FORM_ALIAS[r.form_id ?? ""] ??
        (r.form_name || r.form_id || "(sem nome)").trim(),
      agendou,
    );
    for (const dim of UTM_DIMS) {
      bump(utmMaps[dim], (r[`utm_${dim}` as const] || "").trim() || "(não informado)", agendou);
    }

    const pais = (r.pais || "").trim();
    const estado = (r.estado || "").trim();
    bump(paisMap, pais || "(não informado)", agendou);
    // "São Paulo" e "California" na mesma lista precisam do país pra não virar
    // uma soma sem sentido — e há estados homônimos entre países
    bump(regiaoMap, estado ? (pais ? `${estado} · ${pais}` : estado) : "(não informado)", agendou);

    const dia = spDate(r.submitted_at);
    const d = dayMap.get(dia) ?? { date: dia, leads: 0, abandonou: 0, terminou: 0, agendou: 0 };
    d.leads++;
    if (agendou) d.agendou++;
    else if (st === "partial") d.abandonou++;
    else d.terminou++;
    dayMap.set(dia, d);
  }

  /** Ordena por volume desc e corta no top N, somando a cauda em "(outros)". */
  const cut = (m: Map<string, Count>): Breakdown => {
    const all = [...m.values()].sort(
      (x, y) => y.leads - x.leads || x.label.localeCompare(y.label),
    );
    if (all.length <= TOP) return { rows: all, distinct: all.length, capped: false };
    const tail = all.slice(TOP);
    return {
      rows: [
        ...all.slice(0, TOP),
        {
          label: `(outros ${tail.length} ${tail.length === 1 ? "valor" : "valores"})`,
          leads: tail.reduce((s, r) => s + r.leads, 0),
          agendou: tail.reduce((s, r) => s + r.agendou, 0),
        },
      ],
      distinct: all.length,
      capped: true,
    };
  };

  return {
    funnel: funnelOf(rows),
    anterior: rowsPrev ? funnelOf(rowsPrev) : null,
    daily: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byForm: cut(byFormMap),
    byUtm: {
      source: cut(utmMaps.source),
      content: cut(utmMaps.content),
      medium: cut(utmMaps.medium),
      campaign: cut(utmMaps.campaign),
      term: cut(utmMaps.term),
    },
    byGeo: { pais: cut(paisMap), regiao: cut(regiaoMap) },
    from,
    to,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ponte com o painel de Agenda.
//
// O Calendly não sabe de onde o lead veio: ele só guarda o agendamento. Quem
// sabe é este banco, que grava `calendly_event_id` na linha do formulário. O
// mapa abaixo é a única cola entre as duas fontes.
//
// Puxa o histórico inteiro (2.272 linhas com agendamento em set/2026, ~3
// páginas) em vez de filtrar por data: o lead preenche o formulário dias antes
// da reunião acontecer, então uma janela sobre `submitted_at` cortaria
// justamente os agendamentos mais distantes. O custo é baixo e o resultado é
// cacheável inteiro.

export type LeadOrigem = {
  form: string;
  utmSource: string;
  pais: string;
};

type OrigemRow = {
  calendly_event_id: string | null;
  form_id: string | null;
  form_name: string | null;
  utm_source: string | null;
  pais: string | null;
};

const ORIGEM_COLS = [
  "calendly_event_id",
  COL.formId,
  COL.formName,
  "utm_source",
  GEO_COLS[0],
].join(", ");

/**
 * Mapa `uuid do evento Calendly` → origem do lead.
 *
 * Chave em minúsculas: o UUID vem do Calendly num request e do Postgres no
 * outro, e não temos garantia de que os dois normalizem o caso igual.
 */
export async function getLeadsByCalendlyEvent(): Promise<Map<string, LeadOrigem>> {
  const mapa = new Map<string, LeadOrigem>();

  for (let page = 0; ; page++) {
    const { data, error } = await supabaseAdmin
      .from(SOURCE)
      .select(ORIGEM_COLS)
      .not("calendly_event_id", "is", null)
      .order(COL.formId, { ascending: true })
      .order(COL.id, { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);

    const batch = (data ?? []) as unknown as OrigemRow[];
    for (const r of batch) {
      const uuid = (r.calendly_event_id ?? "").trim().toLowerCase();
      if (!uuid) continue;
      // primeira linha vence: se duas respostas apontam pro mesmo evento
      // (reenvio do formulário), a mais antiga é a que gerou o agendamento
      if (mapa.has(uuid)) continue;
      mapa.set(uuid, {
        form:
          FORM_ALIAS[r.form_id ?? ""] ??
          (r.form_name || r.form_id || "(sem nome)").trim(),
        utmSource: (r.utm_source || "").trim() || "(não informado)",
        pais: (r.pais || "").trim() || "(não informado)",
      });
    }
    if (batch.length < PAGE) break;
  }

  return mapa;
}
