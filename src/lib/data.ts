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
  source: "utm_source",
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

const TZ_OFFSET_HOURS = 3; // America/Sao_Paulo = UTC-3 (sem DST)
const PAGE = 1000; // PostgREST corta em 1000 linhas/request → paginar

const TOP = 10; // barras por quebra; o resto vira uma linha "(outros)"

export type RangeKey = "hoje" | "ontem" | "7" | "30" | "90" | "all";
export const RANGE_KEYS: RangeKey[] = ["hoje", "ontem", "7", "30", "90", "all"];

export type Count = { label: string; count: number };
/** Quebra já cortada no top N: `rows` inclui a linha "(outros)" quando `capped`. */
export type Breakdown = { rows: Count[]; distinct: number; capped: boolean };

export const UTM_DIMS = ["source", "medium", "campaign", "content", "term"] as const;
export type UtmDim = (typeof UTM_DIMS)[number];

export type LeadsSummary = {
  total: number;
  byForm: Breakdown;
  byUtm: Record<UtmDim, Breakdown>;
  from: string | null;
  to: string | null;
};

type Row = {
  form_id: string | null;
  id: number;
  form_name: string | null;
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
const spMidnight = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d, TZ_OFFSET_HOURS, 0, 0)).toISOString();

/** Data-calendário SP de agora, deslocando -3h e lendo em UTC. */
function spToday(): [number, number, number] {
  const sp = new Date(Date.now() - TZ_OFFSET_HOURS * 3600_000);
  return [sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()];
}

const ymd = (y: number, m: number, d: number) =>
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

/** Lê os leads da janela e agrega total + quebras por formulário e por UTM. */
export async function getLeads(period: Period): Promise<LeadsSummary> {
  const { from, to } = period;
  const cols = [
    COL.formId,
    COL.id,
    COL.formName,
    ...UTM_DIMS.map((d) => `utm_${d}`),
  ].join(", ");

  const query = (a: number, b: number) => {
    let q = supabaseAdmin.from(SOURCE).select(cols);
    if (to) q = q.lt(COL.submittedAt, to); // limite superior exclusivo
    if (from) q = q.gte(COL.submittedAt, from);
    // ordenação estável (form_id, id): `id` sozinho não é único no union das
    // tabelas (cada `yay_<form_id>` tem sua própria sequência); o par é.
    return q
      .order(COL.formId, { ascending: true })
      .order(COL.id, { ascending: true })
      .range(a, b);
  };

  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    const a = page * PAGE;
    const { data, error } = await query(a, a + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const byFormMap = new Map<string, number>();
  const utmMaps: Record<UtmDim, Map<string, number>> = {
    source: new Map(),
    medium: new Map(),
    campaign: new Map(),
    content: new Map(),
    term: new Map(),
  };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const r of rows) {
    bump(
      byFormMap,
      FORM_ALIAS[r.form_id ?? ""] ??
        (r.form_name || r.form_id || "(sem nome)").trim(),
    );
    for (const dim of UTM_DIMS) {
      const raw = r[`utm_${dim}` as const];
      bump(utmMaps[dim], (raw || "").trim() || "(não informado)");
    }
  }

  /** Ordena desc e corta no top N, somando a cauda numa linha "(outros)". */
  const cut = (m: Map<string, number>): Breakdown => {
    const all = [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
    if (all.length <= TOP) return { rows: all, distinct: all.length, capped: false };
    const tail = all.slice(TOP);
    const label = `(outros ${tail.length} ${tail.length === 1 ? "valor" : "valores"})`;
    return {
      rows: [
        ...all.slice(0, TOP),
        { label, count: tail.reduce((s, r) => s + r.count, 0) },
      ],
      distinct: all.length,
      capped: true,
    };
  };

  return {
    total: rows.length,
    byForm: cut(byFormMap),
    byUtm: {
      source: cut(utmMaps.source),
      medium: cut(utmMaps.medium),
      campaign: cut(utmMaps.campaign),
      content: cut(utmMaps.content),
      term: cut(utmMaps.term),
    },
    from,
    to,
  };
}
