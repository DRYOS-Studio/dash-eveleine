import "server-only";
import { supabaseAdmin } from "./supabase";

export const TZ_OFFSET_HOURS = 3; // America/Sao_Paulo (UTC-3)

export type RangeKey = "hoje" | "ontem" | "7" | "30" | "90" | "ano" | "all";
export const RANGE_KEYS: RangeKey[] = ["hoje", "ontem", "7", "30", "90", "ano", "all"];

export type SaleRecord = {
  transaction_code: string;
  product_id: string | null;
  product_name: string;
  family?: string;
  customer_email: string;
  customer_name: string | null;
  status: string;
  approved_at: string;
  bruto: number;
  liquido: number;
  taxa_hotmart: number;
  payment_type: string | null;
  installments: number;
  purchase_sequence: number;
  is_recompra: boolean;
};

export type SynthesisMetrics = {
  faturamentoBruto: number;
  faturamentoLiquido: number;
  taxaHotmartTotal: number;
  pctTaxaHotmart: number;
  totalTransacoes: number;
  clientesUnicos: number;
  recompradores: number;
  taxaRecompra: number;
  ticketMedioBruto: number;
  ticketMedianoBruto: number;
  ltvMedioBruto: number;
};

export type ScenarioMetrics = {
  transacoes: number;
  pctVolume: number;
  receitaBruta: number;
  receitaLiquida: number;
  ticketMedio: number;
  ticketMediano: number;
};

export type FamilyMetric = {
  family: string;
  transacoes: number;
  receitaBruta: number;
  receitaLiquida: number;
  ticketMedio: number;
  taxaHotmart: number;
  shareLiquido: number;
};

export type PaymentMethodMetric = {
  method: string;
  transacoes: number;
  bruto: number;
  liquido: number;
  ticketMedio: number;
  eficienciaPct: number; // liquido / bruto * 100
};

export type InstallmentMetric = {
  installments: number;
  transacoes: number;
  bruto: number;
};

export type DaySeries = {
  date: string;
  bruto: number;
  liquido: number;
  transacoes: number;
};

export type DashboardData = {
  synthesis: SynthesisMetrics;
  cenarioUnica: ScenarioMetrics;
  cenarioRecompra: ScenarioMetrics;
  shareLiquidoRecompra: number;
  families: FamilyMetric[];
  payments: PaymentMethodMetric[];
  installments: InstallmentMetric[];
  dailySeries: DaySeries[];
  latestSales: SaleRecord[];
  from: string | null;
  to: string;
  currentRange: RangeKey;
};

export type FinancialSynthesisMetrics = {
  faturamentoBruto: number;
  faturamentoLiquido: number;
  retencaoTotal: number;
  pctRetencao: number;
  margemLiquida: number;
  totalTransacoes: number;
  clientesUnicos: number;
  ticketMedioBruto: number;
  ticketMedioLiquido: number;
};

export type FinancialPaymentMethod = {
  method: string;
  transacoes: number;
  bruto: number;
  liquido: number;
  taxa: number;
  ticketMedio: number;
  eficienciaPct: number;
  shareReceitaBruta: number;
  shareVolume: number;
};

export type ParceladoHotmartMetric = {
  totalTransacoes: number;
  alunasUnicas: number;
  receitaBruta: number;
  receitaLiquida: number;
  retencaoTotal: number;
  ticketMedioParcela: number;
  eficienciaPct: number;
  porParcela: Array<{
    parcela: number;
    transacoes: number;
    bruto: number;
    liquido: number;
    taxa: number;
  }>;
};

export type CardInstallmentDetail = {
  parcela: number;
  transacoes: number;
  bruto: number;
  liquido: number;
  taxaRetida: number;
  eficienciaPct: number;
  taxaMediaPct: number;
  ticketMedio: number;
};

export type FinancialTransactionItem = {
  transaction_code: string;
  product_name: string;
  family: string;
  customer_name: string | null;
  customer_email: string;
  approved_at: string;
  payment_type: string;
  installments: number;
  bruto: number;
  liquido: number;
  taxa_hotmart: number;
  is_recompra: boolean;
};

export type FinancialData = {
  synthesis: FinancialSynthesisMetrics;
  paymentMethods: FinancialPaymentMethod[];
  parceladoHotmart: ParceladoHotmartMetric;
  cardInstallments: CardInstallmentDetail[];
  transactions: FinancialTransactionItem[];
  from: string | null;
  to: string;
  currentRange: RangeKey;
};

export function normalizePaymentMethod(raw: string | null | undefined): string {
  if (!raw) return "Outros";
  const s = raw.toLowerCase().trim();
  if (s.includes("parcelado") || s.includes("hotmart_installments")) {
    return "Parcelado Hotmart";
  }
  if (s.includes("pix")) {
    return "Pix";
  }
  if (s.includes("cart") || s.includes("credit") || s.includes("conta hotmart (cartão)")) {
    return "Cartão de Crédito";
  }
  if (s.includes("boleto")) {
    return "Boleto Bancário";
  }
  if (s.includes("nupay")) {
    return "NuPay";
  }
  if (s.includes("apple")) {
    return "Apple Pay";
  }
  if (s.includes("paypal")) {
    return "PayPal";
  }
  if (s.includes("mbway") || s.includes("mb way")) {
    return "MB WAY";
  }
  if (s.includes("klarna")) {
    return "Klarna";
  }
  if (s.includes("saldo")) {
    return "Saldo Hotmart";
  }
  if (s.includes("cash")) {
    return "Cash Payment";
  }
  return raw;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Converte a chave ?range (ou datas de/até) em limites ISO-UTC ajustados para o horário de Brasília. */
export function resolveDateRange(
  range: RangeKey = "30",
  customFrom?: string | null,
  customTo?: string | null,
): { from: string | null; to: string } {
  if (customFrom || customTo) {
    const to = customTo
      ? new Date(`${customTo}T23:59:59-03:00`).toISOString()
      : new Date().toISOString();
    const from = customFrom
      ? new Date(`${customFrom}T00:00:00-03:00`).toISOString()
      : null;
    return { from, to };
  }

  const now = new Date();
  const to = now.toISOString();

  if (range === "all") return { from: null, to };

  // Hoje no fuso de SP
  const spTime = new Date(now.getTime() - TZ_OFFSET_HOURS * 3600_000);
  const curYear = spTime.getUTCFullYear();
  const curMonth = spTime.getUTCMonth();
  const curDate = spTime.getUTCDate();

  if (range === "hoje") {
    const start = new Date(Date.UTC(curYear, curMonth, curDate, TZ_OFFSET_HOURS, 0, 0));
    return { from: start.toISOString(), to };
  }

  if (range === "ontem") {
    const start = new Date(Date.UTC(curYear, curMonth, curDate - 1, TZ_OFFSET_HOURS, 0, 0));
    const end = new Date(Date.UTC(curYear, curMonth, curDate, TZ_OFFSET_HOURS, 0, 0) - 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (range === "ano") {
    const start = new Date(Date.UTC(curYear, 0, 1, TZ_OFFSET_HOURS, 0, 0));
    return { from: start.toISOString(), to };
  }

  const days = Number(range);
  const start = new Date(
    Date.UTC(curYear, curMonth, curDate - (days - 1), TZ_OFFSET_HOURS, 0, 0),
  );
  return { from: start.toISOString(), to };
}

/** Carrega transações e metadados de produtos em paralelo com alta eficiência. */
async function fetchTransactionsData(from: string | null, to: string) {
  let countQuery = supabaseAdmin
    .from("transactions")
    .select("transaction_code", { count: "exact", head: true })
    .eq("status", "APPROVED")
    .lte("approved_at", to);

  if (from) {
    countQuery = countQuery.gte("approved_at", from);
  }

  const [countResult, productsResult] = await Promise.all([
    countQuery,
    supabaseAdmin.from("products").select("id, name, family, edition"),
  ]);

  if (countResult.error) throw countResult.error;
  if (productsResult.error) throw productsResult.error;

  const total = countResult.count || 0;
  const productFamilyMap = new Map<string, string>();
  for (const p of productsResult.data || []) {
    if (p.id) productFamilyMap.set(p.id, p.family || p.name);
  }

  if (total === 0) {
    return { rawRows: [], productFamilyMap };
  }

  const PAGE_SIZE = 1000;
  const numPages = Math.ceil(total / PAGE_SIZE);

  const pagePromises = Array.from({ length: numPages }, (_, page) => {
    let q = supabaseAdmin
      .from("transactions")
      .select(`
        transaction_code,
        product_id,
        product_name,
        customer_email,
        customer_name,
        status,
        approved_at,
        bruto,
        liquido,
        taxa_hotmart,
        payment_type,
        installments,
        purchase_sequence,
        is_recompra
      `)
      .eq("status", "APPROVED")
      .lte("approved_at", to)
      // desempate por transaction_code: sem ele, vendas no mesmo instante podem duplicar/sumir entre páginas
      .order("approved_at", { ascending: false })
      .order("transaction_code", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (from) {
      q = q.gte("approved_at", from);
    }
    return q;
  });

  const batches = await Promise.all(pagePromises);
  const rawRows: any[] = [];
  for (const b of batches) {
    if (b.error) throw b.error;
    if (b.data) rawRows.push(...b.data);
  }

  return { rawRows, productFamilyMap };
}

/** Carrega os dados analíticos completos para alimentar a Dashboard. */
export async function getDashboardData(
  range: RangeKey = "30",
  customFrom?: string | null,
  customTo?: string | null,
): Promise<DashboardData> {
  const { from, to } = resolveDateRange(range, customFrom, customTo);
  const { rawRows, productFamilyMap } = await fetchTransactionsData(from, to);

  const rows: SaleRecord[] = rawRows.map((r: any) => ({
    transaction_code: r.transaction_code,
    product_id: r.product_id,
    product_name: r.product_name,
    family: productFamilyMap.get(r.product_id) || r.product_name,
    customer_email: r.customer_email,
    customer_name: r.customer_name,
    status: r.status,
    approved_at: r.approved_at,
    bruto: Number(r.bruto) || 0,
    liquido: Number(r.liquido) || 0,
    taxa_hotmart: Number(r.taxa_hotmart) || 0,
    payment_type: normalizePaymentMethod(r.payment_type),
    installments: Number(r.installments) || 1,
    purchase_sequence: Number(r.purchase_sequence) || 1,
    is_recompra: Boolean(r.is_recompra),
  }));

  // 1. Agregação de Síntese
  let totalBruto = 0;
  let totalLiquido = 0;
  let totalTaxa = 0;
  const customersSet = new Set<string>();
  const recompradoresSet = new Set<string>();
  const brutosList: number[] = [];

  // Cenários
  const unicas: number[] = [];
  let unicasBruto = 0;
  let unicasLiquido = 0;

  const recompras: number[] = [];
  let recomprasBruto = 0;
  let recomprasLiquido = 0;

  // Famílias
  const familyMap = new Map<string, { transacoes: number; bruto: number; liquido: number; taxa: number }>();

  // Meios de Pagamento
  const payMap = new Map<string, { transacoes: number; bruto: number; liquido: number }>();

  // Parcelamento
  const instMap = new Map<number, { transacoes: number; bruto: number }>();

  // Série diária
  const dayMap = new Map<string, { bruto: number; liquido: number; count: number }>();

  for (const row of rows) {
    totalBruto += row.bruto;
    totalLiquido += row.liquido;
    totalTaxa += row.taxa_hotmart;
    customersSet.add(row.customer_email);
    brutosList.push(row.bruto);

    if (row.is_recompra) {
      recompradoresSet.add(row.customer_email);
      recompras.push(row.bruto);
      recomprasBruto += row.bruto;
      recomprasLiquido += row.liquido;
    } else {
      unicas.push(row.bruto);
      unicasBruto += row.bruto;
      unicasLiquido += row.liquido;
    }

    // Família
    const famKey = row.family || row.product_name;
    const fam = familyMap.get(famKey) || { transacoes: 0, bruto: 0, liquido: 0, taxa: 0 };
    fam.transacoes += 1;
    fam.bruto += row.bruto;
    fam.liquido += row.liquido;
    fam.taxa += row.taxa_hotmart;
    familyMap.set(famKey, fam);

    // Meio de pagamento
    const payKey = normalizePaymentMethod(row.payment_type);
    const pay = payMap.get(payKey) || { transacoes: 0, bruto: 0, liquido: 0 };
    pay.transacoes += 1;
    pay.bruto += row.bruto;
    pay.liquido += row.liquido;
    payMap.set(payKey, pay);

    // Parcelas no cartão de crédito
    if (payKey === "Cartão de Crédito") {
      const n = Math.min(Math.max(1, row.installments), 12);
      const inst = instMap.get(n) || { transacoes: 0, bruto: 0 };
      inst.transacoes += 1;
      inst.bruto += row.bruto;
      instMap.set(n, inst);
    }

    // Dia (YYYY-MM-DD em SP)
    const spDate = new Date(new Date(row.approved_at).getTime() - TZ_OFFSET_HOURS * 3600_000);
    const dayStr = spDate.toISOString().slice(0, 10);
    const d = dayMap.get(dayStr) || { bruto: 0, liquido: 0, count: 0 };
    d.bruto += row.bruto;
    d.liquido += row.liquido;
    d.count += 1;
    dayMap.set(dayStr, d);
  }

  const totalTransacoes = rows.length;
  const clientesUnicos = customersSet.size;
  const recompradores = recompradoresSet.size;

  const synthesis: SynthesisMetrics = {
    faturamentoBruto: totalBruto,
    faturamentoLiquido: totalLiquido,
    taxaHotmartTotal: totalTaxa,
    pctTaxaHotmart: totalBruto > 0 ? (totalTaxa / totalBruto) * 100 : 0,
    totalTransacoes,
    clientesUnicos,
    recompradores,
    taxaRecompra: clientesUnicos > 0 ? (recompradores / clientesUnicos) * 100 : 0,
    ticketMedioBruto: totalTransacoes > 0 ? totalBruto / totalTransacoes : 0,
    ticketMedianoBruto: median(brutosList),
    ltvMedioBruto: clientesUnicos > 0 ? totalBruto / clientesUnicos : 0,
  };

  const cenarioUnica: ScenarioMetrics = {
    transacoes: unicas.length,
    pctVolume: totalTransacoes > 0 ? (unicas.length / totalTransacoes) * 100 : 0,
    receitaBruta: unicasBruto,
    receitaLiquida: unicasLiquido,
    ticketMedio: unicas.length > 0 ? unicasBruto / unicas.length : 0,
    ticketMediano: median(unicas),
  };

  const cenarioRecompra: ScenarioMetrics = {
    transacoes: recompras.length,
    pctVolume: totalTransacoes > 0 ? (recompras.length / totalTransacoes) * 100 : 0,
    receitaBruta: recomprasBruto,
    receitaLiquida: recomprasLiquido,
    ticketMedio: recompras.length > 0 ? recomprasBruto / recompras.length : 0,
    ticketMediano: median(recompras),
  };

  const shareLiquidoRecompra =
    totalLiquido > 0 ? (recomprasLiquido / totalLiquido) * 100 : 0;

  // Famílias ordenadas por receita líquida
  const families: FamilyMetric[] = [...familyMap.entries()]
    .map(([family, data]) => ({
      family,
      transacoes: data.transacoes,
      receitaBruta: data.bruto,
      receitaLiquida: data.liquido,
      ticketMedio: data.transacoes > 0 ? data.bruto / data.transacoes : 0,
      taxaHotmart: data.taxa,
      shareLiquido: totalLiquido > 0 ? (data.liquido / totalLiquido) * 100 : 0,
    }))
    .sort((a, b) => b.receitaLiquida - a.receitaLiquida);

  // Pagamentos ordenados por volume financeiro
  const payments: PaymentMethodMetric[] = [...payMap.entries()]
    .map(([method, data]) => ({
      method,
      transacoes: data.transacoes,
      bruto: data.bruto,
      liquido: data.liquido,
      ticketMedio: data.transacoes > 0 ? data.bruto / data.transacoes : 0,
      eficienciaPct: data.bruto > 0 ? (data.liquido / data.bruto) * 100 : 0,
    }))
    .sort((a, b) => b.bruto - a.bruto);

  // Parcelas 1 a 12
  const installments: InstallmentMetric[] = [];
  for (let i = 1; i <= 12; i++) {
    const inst = instMap.get(i) || { transacoes: 0, bruto: 0 };
    installments.push({
      installments: i,
      transacoes: inst.transacoes,
      bruto: inst.bruto,
    });
  }

  // Série temporal ordenada por data
  const dailySeries: DaySeries[] = [...dayMap.entries()]
    .map(([date, data]) => ({
      date,
      bruto: data.bruto,
      liquido: data.liquido,
      transacoes: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Últimas 20 vendas
  const latestSales = rows.slice(0, 20);

  return {
    synthesis,
    cenarioUnica,
    cenarioRecompra,
    shareLiquidoRecompra,
    families,
    payments,
    installments,
    dailySeries,
    latestSales,
    from,
    to,
    currentRange: range,
  };
}

/** Vendas de uma família no período, para o modal da tabela de produtos. */
export async function getProductSalesDetail(
  family: string,
  from: string | null,
  to: string,
  limit = 50,
): Promise<{ sales: SaleRecord[]; total: number }> {
  const { data: prods, error: prodErr } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("family", family);
  if (prodErr) throw prodErr;

  const productIds = (prods || []).map((p: { id: string }) => p.id);
  if (productIds.length === 0) return { sales: [], total: 0 };

  let query = supabaseAdmin
    .from("transactions")
    .select(
      `transaction_code, product_id, product_name, customer_email, customer_name, status,
       approved_at, bruto, liquido, taxa_hotmart, payment_type, installments,
       purchase_sequence, is_recompra`,
      { count: "exact" },
    )
    .eq("status", "APPROVED")
    .in("product_id", productIds)
    .lte("approved_at", to);
  if (from) query = query.gte("approved_at", from);

  const { data, error, count } = await query.order("approved_at", { ascending: false }).limit(limit);
  if (error) throw error;

  const sales: SaleRecord[] = (data || []).map((r: any) => ({
    transaction_code: r.transaction_code,
    product_id: r.product_id,
    product_name: r.product_name,
    family,
    customer_email: r.customer_email,
    customer_name: r.customer_name,
    status: r.status,
    approved_at: r.approved_at,
    bruto: Number(r.bruto) || 0,
    liquido: Number(r.liquido) || 0,
    taxa_hotmart: Number(r.taxa_hotmart) || 0,
    payment_type: normalizePaymentMethod(r.payment_type),
    installments: Number(r.installments) || 1,
    purchase_sequence: Number(r.purchase_sequence) || 1,
    is_recompra: Boolean(r.is_recompra),
  }));
  return { sales, total: count ?? sales.length };
}

/**
 * Consulta e agrega métricas financeiras detalhadas para a página /financeiro:
 * - Síntese de Caixa & Retenção
 * - Detalhamento por Meio de Pagamento
 * - Módulo Especial: Parcelado Hotmart (recorrência/boletos mensais de A Formação)
 * - Curva de Juros e Eficiência no Parcelamento de Cartão (1x a 12x)
 * - Extrato de Transações do período
 */
export async function getFinancialData(
  range: RangeKey = "30",
  customFrom?: string | null,
  customTo?: string | null,
): Promise<FinancialData> {
  const { from, to } = resolveDateRange(range, customFrom, customTo);

  const { rawRows, productFamilyMap } = await fetchTransactionsData(from, to);

  let totalBruto = 0;
  let totalLiquido = 0;
  let totalTaxa = 0;
  const customersSet = new Set<string>();

  const payMap = new Map<string, { transacoes: number; bruto: number; liquido: number; taxa: number }>();
  const cardMap = new Map<number, { transacoes: number; bruto: number; liquido: number; taxa: number }>();
  const parceladoMap = new Map<number, { transacoes: number; bruto: number; liquido: number; taxa: number }>();
  const parceladoBuyers = new Set<string>();
  let parceladoBruto = 0;
  let parceladoLiquido = 0;
  let parceladoTaxa = 0;
  let parceladoCount = 0;

  const transactions: FinancialTransactionItem[] = [];

  for (const r of rawRows) {
    const bruto = Number(r.bruto) || 0;
    const liquido = Number(r.liquido) || 0;
    const taxa = Number(r.taxa_hotmart) || 0;
    const normPay = normalizePaymentMethod(r.payment_type);
    const installments = Math.max(1, Number(r.installments) || 1);

    totalBruto += bruto;
    totalLiquido += liquido;
    totalTaxa += taxa;
    customersSet.add(r.customer_email);

    // Meios de pagamento
    const pData = payMap.get(normPay) || { transacoes: 0, bruto: 0, liquido: 0, taxa: 0 };
    pData.transacoes += 1;
    pData.bruto += bruto;
    pData.liquido += liquido;
    pData.taxa += taxa;
    payMap.set(normPay, pData);

    // Cartão de Crédito
    if (normPay === "Cartão de Crédito") {
      const n = Math.min(Math.max(1, installments), 12);
      const cData = cardMap.get(n) || { transacoes: 0, bruto: 0, liquido: 0, taxa: 0 };
      cData.transacoes += 1;
      cData.bruto += bruto;
      cData.liquido += liquido;
      cData.taxa += taxa;
      cardMap.set(n, cData);
    }

    // Parcelado Hotmart
    if (normPay === "Parcelado Hotmart") {
      parceladoCount += 1;
      parceladoBruto += bruto;
      parceladoLiquido += liquido;
      parceladoTaxa += taxa;
      parceladoBuyers.add(r.customer_email);

      const n = Math.min(Math.max(1, installments), 12);
      const parData = parceladoMap.get(n) || { transacoes: 0, bruto: 0, liquido: 0, taxa: 0 };
      parData.transacoes += 1;
      parData.bruto += bruto;
      parData.liquido += liquido;
      parData.taxa += taxa;
      parceladoMap.set(n, parData);
    }

    if (transactions.length < 200) {
      transactions.push({
        transaction_code: r.transaction_code,
        product_name: r.product_name,
        family: productFamilyMap.get(r.product_id) || r.product_name,
        customer_name: r.customer_name,
        customer_email: r.customer_email,
        approved_at: r.approved_at,
        payment_type: normPay,
        installments,
        bruto,
        liquido,
        taxa_hotmart: taxa,
        is_recompra: Boolean(r.is_recompra),
      });
    }
  }

  const totalTransacoes = rawRows.length;
  const clientesUnicos = customersSet.size;

  const synthesis: FinancialSynthesisMetrics = {
    faturamentoBruto: totalBruto,
    faturamentoLiquido: totalLiquido,
    retencaoTotal: totalTaxa,
    pctRetencao: totalBruto > 0 ? (totalTaxa / totalBruto) * 100 : 0,
    margemLiquida: totalBruto > 0 ? (totalLiquido / totalBruto) * 100 : 0,
    totalTransacoes,
    clientesUnicos,
    ticketMedioBruto: totalTransacoes > 0 ? totalBruto / totalTransacoes : 0,
    ticketMedioLiquido: totalTransacoes > 0 ? totalLiquido / totalTransacoes : 0,
  };

  const paymentMethods: FinancialPaymentMethod[] = [...payMap.entries()]
    .map(([method, data]) => ({
      method,
      transacoes: data.transacoes,
      bruto: data.bruto,
      liquido: data.liquido,
      taxa: data.taxa,
      ticketMedio: data.transacoes > 0 ? data.bruto / data.transacoes : 0,
      eficienciaPct: data.bruto > 0 ? (data.liquido / data.bruto) * 100 : 0,
      shareReceitaBruta: totalBruto > 0 ? (data.bruto / totalBruto) * 100 : 0,
      shareVolume: totalTransacoes > 0 ? (data.transacoes / totalTransacoes) * 100 : 0,
    }))
    .sort((a, b) => b.bruto - a.bruto);

  const cardInstallments: CardInstallmentDetail[] = [];
  for (let i = 1; i <= 12; i++) {
    const data = cardMap.get(i) || { transacoes: 0, bruto: 0, liquido: 0, taxa: 0 };
    cardInstallments.push({
      parcela: i,
      transacoes: data.transacoes,
      bruto: data.bruto,
      liquido: data.liquido,
      taxaRetida: data.taxa,
      eficienciaPct: data.bruto > 0 ? (data.liquido / data.bruto) * 100 : 0,
      taxaMediaPct: data.bruto > 0 ? (data.taxa / data.bruto) * 100 : 0,
      ticketMedio: data.transacoes > 0 ? data.bruto / data.transacoes : 0,
    });
  }

  const porParcelaParcelado = [];
  for (let i = 1; i <= 12; i++) {
    const data = parceladoMap.get(i) || { transacoes: 0, bruto: 0, liquido: 0, taxa: 0 };
    if (data.transacoes > 0) {
      porParcelaParcelado.push({
        parcela: i,
        transacoes: data.transacoes,
        bruto: data.bruto,
        liquido: data.liquido,
        taxa: data.taxa,
      });
    }
  }

  const parceladoHotmart: ParceladoHotmartMetric = {
    totalTransacoes: parceladoCount,
    alunasUnicas: parceladoBuyers.size,
    receitaBruta: parceladoBruto,
    receitaLiquida: parceladoLiquido,
    retencaoTotal: parceladoTaxa,
    ticketMedioParcela: parceladoCount > 0 ? parceladoBruto / parceladoCount : 0,
    eficienciaPct: parceladoBruto > 0 ? (parceladoLiquido / parceladoBruto) * 100 : 0,
    porParcela: porParcelaParcelado,
  };

  return {
    synthesis,
    paymentMethods,
    parceladoHotmart,
    cardInstallments,
    transactions,
    from,
    to,
    currentRange: range,
  };
}

