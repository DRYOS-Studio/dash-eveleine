import "server-only";
import { supabaseAdmin } from "./supabase";
import { getLeadsPorEmail, normEmail, spMidnight, type Period } from "./data";
import { getPresencaPorHost } from "./agenda";
import { canonizar, chaveNome } from "./nomes";

// ─────────────────────────────────────────────────────────────────────────────
// Página de Vendas. Fonte: `vendas_versalhes` (espelho do board de vendas, com
// dados desde 27/10/2026). A tabela tem PII — documento, endereço, nascimento,
// comprovantes — e nada disso é selecionado aqui: só o que vira agregado. O
// e-mail entra apenas em memória, para ligar a venda ao lead (origem/score).
//
// RLS ligado e sem policy para anon: só a service_role lê. Com chave anon a
// resposta é 200 com lista vazia, sem erro — daí `tabelaVazia`.
//
// Leitura de campos (a confirmar com quem opera o board): `faturamento` = valor
// do contrato; `caixa` = quanto já entrou. Se isso estiver errado, "a receber" e
// "% recebido" mentem.

const TABELA = "vendas_versalhes";
const PAGE = 1000;

/**
 * Abaixo disto a venda não tem valor de contrato utilizável (medido em
 * 2026-11-03: placeholders de R$ 2,00 com caixa já recebido — o valor do contrato
 * ainda não foi preenchido no board). Conta como venda, mas fica fora de receita,
 * ticket e rankings. Decisão do Rafael.
 */
export const VALOR_MIN = 100;

const COLS = [
  "id",
  "data_compra",
  "faturamento",
  "caixa",
  "produto",
  "forma_pagamento",
  "funil",
  "closer",
  "agendado_por",
  "contrato_assinado",
  "pais",
  "email",
].join(", ");

type Row = {
  id: number;
  data_compra: string | null;
  faturamento: number | string | null;
  caixa: number | string | null;
  produto: string | null;
  forma_pagamento: string | null;
  funil: string | null;
  closer: string | null;
  agendado_por: string | null;
  contrato_assinado: string | null;
  pais: string | null;
  email: string | null;
};

export type LinhaVenda = { label: string; vendas: number; faturamento: number; caixa: number };
/** Closer + presença do anfitrião de mesmo nome na Agenda; null = sem anfitrião correspondente. */
export type LinhaCloser = LinhaVenda & { concluidas: number | null; faltas: number | null };
export type DiaVenda = { date: string; vendas: number; faturamento: number; caixa: number };

export type Vendas = {
  /** Nenhuma linha na tabela inteira (não só na janela): chave sem acesso ou tabela vazia. */
  tabelaVazia: boolean;
  total: number; // todas as vendas da janela
  validas: number; // com faturamento >= VALOR_MIN
  semValor: number;
  caixaSemValor: number;
  faturamento: number;
  caixa: number;
  aReceber: number; // Σ max(faturamento − caixa, 0)
  ticket: number | null;
  mediana: number | null;
  maior: { valor: number; pct: number } | null;
  internacional: number; // entre as válidas
  /** Vendas válidas que acharam lead pelo e-mail. */
  comLead: number;
  ciclo: { mediana: number | null; n: number };
  daily: DiaVenda[];
  byUtm: LinhaVenda[];
  byFunil: LinhaVenda[];
  byScore: LinhaVenda[];
  byCloser: LinhaCloser[];
  byAgendadoPor: LinhaVenda[];
  byForma: LinhaVenda[];
  byProduto: LinhaVenda[];
  byContrato: LinhaVenda[];
  /** Agenda/Calendly fora do ar ou sem token: closer × no-show vira "—". */
  presencaIndisponivel: boolean;
};

const SEM_LEAD = "(sem lead)";

const num = (v: number | string | null) => (v === null || v === "" ? 0 : Number(v));
const txt = (v: string | null, vazio: string) => (v ?? "").trim() || vazio;

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function somar(m: Map<string, LinhaVenda>, label: string, fat: number, caixa: number) {
  const cur = m.get(label) ?? { label, vendas: 0, faturamento: 0, caixa: 0 };
  cur.vendas++;
  cur.faturamento += fat;
  cur.caixa += caixa;
  m.set(label, cur);
}

const ordenar = <T extends LinhaVenda>(m: Map<string, T>) =>
  [...m.values()].sort(
    (a, b) => b.faturamento - a.faturamento || b.vendas - a.vendas || a.label.localeCompare(b.label),
  );

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** `submitted_at` ISO-UTC → data-calendário de São Paulo (UTC-3, sem DST). */
const dataSP = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

async function lerVendas(p: Period): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; ; page++) {
    let q = supabaseAdmin.from(TABELA).select(COLS);
    if (p.fromDate) q = q.gte("data_compra", p.fromDate);
    if (p.toDate) q = q.lte("data_compra", p.toDate);
    const { data, error } = await q
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Row[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function totalNaTabela(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(TABELA)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getVendas(p: Period): Promise<Vendas> {
  const [rows, naTabela] = await Promise.all([lerVendas(p), totalNaTabela()]);

  const validasRows = rows.filter((r) => num(r.faturamento) >= VALOR_MIN);
  const leads = await getLeadsPorEmail(validasRows.map((r) => normEmail(r.email)));

  // Closer e anfitrião da Agenda são a mesma pessoa grafada de jeitos diferentes:
  // o rótulo canônico é calculado sobre a UNIÃO das duas fontes (ver nomes.ts).
  let presenca: Awaited<ReturnType<typeof getPresencaPorHost>> | null = null;
  const datas = rows.map((r) => r.data_compra).filter((d): d is string => !!d).sort();
  const de = p.from ?? (datas[0] ? isoMeiaNoiteSP(datas[0]) : null);
  const ate = p.to ?? new Date().toISOString();
  if (de) {
    try {
      presenca = await getPresencaPorHost(de, ate);
    } catch {
      presenca = null; // sem token do Calendly ou API fora: o resto da página segue
    }
  }
  const canonCloser = canonizar([
    ...rows.map((r) => r.closer ?? ""),
    ...[...(presenca?.values() ?? [])].map((h) => h.nome),
  ]);
  const canonAgendador = canonizar(rows.map((r) => r.agendado_por ?? ""));

  const mUtm = new Map<string, LinhaVenda>();
  const mFunil = new Map<string, LinhaVenda>();
  const mScore = new Map<string, LinhaVenda>();
  const mCloser = new Map<string, LinhaVenda>();
  const mAgendador = new Map<string, LinhaVenda>();
  const mForma = new Map<string, LinhaVenda>();
  const mProduto = new Map<string, LinhaVenda>();
  const mContrato = new Map<string, LinhaVenda>();
  const mDia = new Map<string, DiaVenda>();

  let faturamento = 0;
  let caixa = 0;
  let aReceber = 0;
  let internacional = 0;
  let comLead = 0;
  let caixaSemValor = 0;
  const valores: number[] = [];
  const ciclos: number[] = [];

  for (const r of rows) {
    const fat = num(r.faturamento);
    const cx = num(r.caixa);
    if (fat < VALOR_MIN) {
      caixaSemValor += cx;
      continue;
    }

    faturamento += fat;
    caixa += cx;
    aReceber += Math.max(fat - cx, 0);
    valores.push(fat);
    if (chaveNome(r.pais ?? "") !== "brasil" && (r.pais ?? "").trim()) internacional++;

    const lead = leads.get(normEmail(r.email));
    if (lead) comLead++;
    if (lead && r.data_compra) {
      const d = diasEntre(dataSP(lead.primeiroContato), r.data_compra);
      if (d >= 0) ciclos.push(d); // lead que respondeu depois da compra não mede ciclo
    }

    somar(mUtm, lead ? lead.utmSource : SEM_LEAD, fat, cx);
    somar(mFunil, txt(r.funil, "(sem funil)"), fat, cx);
    somar(
      mScore,
      lead ? (lead.score === null ? "(sem score)" : `Score ${lead.score}`) : SEM_LEAD,
      fat,
      cx,
    );
    somar(mCloser, canonCloser(txt(r.closer, "(sem closer)")), fat, cx);
    somar(mAgendador, canonAgendador(txt(r.agendado_por, "(sem agendador)")), fat, cx);
    somar(mForma, txt(r.forma_pagamento, "(sem forma)"), fat, cx);
    somar(mProduto, txt(r.produto, "(sem produto)"), fat, cx);
    somar(mContrato, txt(r.contrato_assinado, "(sem informação)"), fat, cx);

    if (r.data_compra) {
      const dia = mDia.get(r.data_compra) ?? {
        date: r.data_compra,
        vendas: 0,
        faturamento: 0,
        caixa: 0,
      };
      dia.vendas++;
      dia.faturamento += fat;
      dia.caixa += cx;
      mDia.set(r.data_compra, dia);
    }
  }

  const maiorValor = valores.length ? Math.max(...valores) : null;

  const byCloser: LinhaCloser[] = ordenar(mCloser).map((l) => {
    const h = presenca?.get(chaveNome(l.label));
    return { ...l, concluidas: h?.concluidas ?? null, faltas: h?.faltas ?? null };
  });

  return {
    tabelaVazia: naTabela === 0,
    total: rows.length,
    validas: validasRows.length,
    semValor: rows.length - validasRows.length,
    caixaSemValor,
    faturamento,
    caixa,
    aReceber,
    ticket: valores.length ? faturamento / valores.length : null,
    mediana: mediana(valores),
    maior: maiorValor === null ? null : { valor: maiorValor, pct: (maiorValor / faturamento) * 100 },
    internacional,
    comLead,
    ciclo: { mediana: mediana(ciclos), n: ciclos.length },
    daily: [...mDia.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byUtm: ordenar(mUtm),
    byFunil: ordenar(mFunil),
    byScore: ordenar(mScore),
    byCloser,
    byAgendadoPor: ordenar(mAgendador),
    byForma: ordenar(mForma),
    byProduto: ordenar(mProduto),
    byContrato: ordenar(mContrato),
    presencaIndisponivel: presenca === null,
  };
}

/** `YYYY-MM-DD` (SP) → 00:00 SP em ISO-UTC. */
function isoMeiaNoiteSP(d: string): string {
  const [y, m, dia] = d.split("-").map(Number);
  return spMidnight(y, m - 1, dia);
}
