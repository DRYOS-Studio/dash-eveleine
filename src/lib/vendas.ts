import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "./supabase";
import {
  CACHE_S,
  getLeadsPorEmail,
  normEmail,
  spMidnight,
  spToday,
  type Period,
} from "./data";
import { getPresencaPorHost, type PresencaHost } from "./agenda";
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
  /** ISO-UTC do momento em que o dado foi lido do banco (vem dentro do cache). */
  geradoEm: string;
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
  /** Só vendas; reuniões/no-show do anfitrião chegam por `getPresencaClosers` (streamado pela página). */
  byCloser: LinhaVenda[];
  /** Janela de reuniões a cruzar com os closers (ISO-UTC, `ate` exclusivo); null se não há venda. */
  janelaPresenca: { de: string; ate: string } | null;
  byAgendadoPor: LinhaVenda[];
  byForma: LinhaVenda[];
  byProduto: LinhaVenda[];
  byContrato: LinhaVenda[];
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

export async function calcularVendas(p: Period): Promise<Vendas> {
  const [rows, naTabela] = await Promise.all([lerVendas(p), totalNaTabela()]);

  const validasRows = rows.filter((r) => num(r.faturamento) >= VALOR_MIN);
  const leads = await getLeadsPorEmail(validasRows.map((r) => normEmail(r.email)));

  // Janela das reuniões a cruzar: do dia da PRIMEIRA venda da janela até agora. A tabela só
  // tem vendas desde 27/10/2026; começar no início do filtro ("30 dias") listaria no
  // Calendly semanas de eventos sem venda nenhuma para comparar (~1 s por 100 eventos).
  const datas = rows.map((r) => r.data_compra).filter((d): d is string => !!d).sort();
  const [hy, hm, hd] = spToday();
  const janelaPresenca = datas[0]
    ? { de: isoMeiaNoiteSP(datas[0]), ate: p.to ?? spMidnight(hy, hm, hd + 1) }
    : null;

  // closers que só diferem na grafia viram uma linha (ver nomes.ts)
  const canonCloser = canonizar(rows.map((r) => r.closer ?? ""));
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

  return {
    geradoEm: new Date().toISOString(),
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
    byCloser: ordenar(mCloser),
    janelaPresenca,
    byAgendadoPor: ordenar(mAgendador),
    byForma: ordenar(mForma),
    byProduto: ordenar(mProduto),
    byContrato: ordenar(mContrato),
  };
}

/** Leitura com cache de CACHE_S; a chave é a janela de datas do filtro. */
export const getVendas = (p: Period): Promise<Vendas> =>
  unstable_cache(() => calcularVendas(p), ["vendas", p.fromDate ?? "", p.toDate ?? ""], {
    revalidate: CACHE_S,
  })();

/**
 * Liga cada closer ao anfitrião de mesmo nome na Agenda (por grafia — nomes.ts) e
 * traz reuniões concluídas e faltas dele. Separado de `getVendas` porque é a parte
 * lenta (listagem de eventos no Calendly): a página streama esta tabela em Suspense.
 * Sem token do Calendly ou com a API fora, `indisponivel` e as colunas viram "—".
 * `ler` é injetável só para teste fora do runtime do Next.
 */
export async function getPresencaClosers(
  janela: { de: string; ate: string },
  closers: LinhaVenda[],
  ler: (de: string, ate: string) => Promise<{ geradoEm: string; hosts: PresencaHost[] }> = getPresencaPorHost,
): Promise<{ linhas: LinhaCloser[]; indisponivel: boolean; geradoEm: string | null }> {
  let hosts: Map<string, PresencaHost> | null = null;
  let geradoEm: string | null = null;
  try {
    const r = await ler(janela.de, janela.ate);
    hosts = new Map(r.hosts.map((h) => [h.chave, h]));
    geradoEm = r.geradoEm;
  } catch {
    hosts = null; // sem token do Calendly ou API fora: o resto da página segue
  }
  return {
    indisponivel: hosts === null,
    geradoEm,
    linhas: closers.map((l) => {
      const h = hosts?.get(chaveNome(l.label));
      return { ...l, concluidas: h?.concluidas ?? null, faltas: h?.faltas ?? null };
    }),
  };
}

/** `YYYY-MM-DD` (SP) → 00:00 SP em ISO-UTC. */
function isoMeiaNoiteSP(d: string): string {
  const [y, m, dia] = d.split("-").map(Number);
  return spMidnight(y, m - 1, dia);
}
