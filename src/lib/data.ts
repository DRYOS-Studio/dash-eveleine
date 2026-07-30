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
};

const TZ_OFFSET_HOURS = 3; // America/Sao_Paulo = UTC-3 (sem DST)
const PAGE = 1000; // PostgREST corta em 1000 linhas/request → paginar

export type RangeKey = "7" | "30" | "90" | "all";
export type Count = { label: string; count: number };
export type LeadsSummary = {
  total: number;
  byForm: Count[];
  byOrigin: Count[];
  from: string | null;
  to: string;
};

type Row = {
  form_id: string | null;
  id: number;
  form_name: string | null;
  utm_source: string | null;
};

/** Converte a janela (?range) em limites ISO-UTC alinhados ao dia de São Paulo. */
export function resolveRange(range: RangeKey): { from: string | null; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (range === "all") return { from: null, to };
  const days = Number(range);
  // "hoje" em SP: desloca -3h e lê a data de calendário
  const sp = new Date(now.getTime() - TZ_OFFSET_HOURS * 3600_000);
  const startUtc = Date.UTC(
    sp.getUTCFullYear(),
    sp.getUTCMonth(),
    sp.getUTCDate() - (days - 1), // início da janela: (hoje_SP − (days−1)) 00:00 SP = 03:00Z
    TZ_OFFSET_HOURS,
    0,
    0,
  );
  return { from: new Date(startUtc).toISOString(), to };
}

/** Lê os leads da janela e agrega total + quebras por formulário e por origem. */
export async function getLeads(range: RangeKey): Promise<LeadsSummary> {
  const { from, to } = resolveRange(range);
  const cols = `${COL.formId}, ${COL.id}, ${COL.formName}, ${COL.source}`;

  const query = (a: number, b: number) => {
    let q = supabaseAdmin.from(SOURCE).select(cols).lte(COL.submittedAt, to);
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
  const byOriginMap = new Map<string, number>();
  for (const r of rows) {
    const form =
      FORM_ALIAS[r.form_id ?? ""] ??
      (r.form_name || r.form_id || "(sem nome)").trim();
    byFormMap.set(form, (byFormMap.get(form) ?? 0) + 1);
    const src = (r.utm_source || "").trim() || "(sem origem)";
    byOriginMap.set(src, (byOriginMap.get(src) ?? 0) + 1);
  }

  const toSorted = (m: Map<string, number>): Count[] =>
    [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((x, y) => y.count - x.count);

  return {
    total: rows.length,
    byForm: toSorted(byFormMap),
    byOrigin: toSorted(byOriginMap),
    from,
    to,
  };
}
