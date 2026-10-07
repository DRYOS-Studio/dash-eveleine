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
  days_since_first_purchase: number;
  days_since_prev_purchase: number;
  tracking_source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
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

/** Carrega os dados analíticos completos para alimentar a Dashboard. */
export async function getDashboardData(
  range: RangeKey = "30",
  customFrom?: string | null,
  customTo?: string | null,
): Promise<DashboardData> {
  const { from, to } = resolveDateRange(range, customFrom, customTo);

  // Consulta transações no período com paginação automática (supera limite de 1.000 do PostgREST)
  const PAGE_SIZE = 1000;
  const rawRows: any[] = [];

  for (let page = 0; ; page++) {
    const fromIndex = page * PAGE_SIZE;
    const toIndex = fromIndex + PAGE_SIZE - 1;

    let pageQuery = supabaseAdmin
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
        is_recompra,
        days_since_first_purchase,
        days_since_prev_purchase,
        tracking_source,
        utm_source,
        utm_medium,
        utm_campaign,
        products (family, edition)
      `)
      .eq("status", "APPROVED")
      .lte("approved_at", to)
      .order("approved_at", { ascending: false })
      .range(fromIndex, toIndex);

    if (from) {
      pageQuery = pageQuery.gte("approved_at", from);
    }

    const { data: batch, error } = await pageQuery;
    if (error) {
      throw new Error(`Falha ao buscar transações no Supabase: ${error.message}`);
    }

    if (batch && batch.length > 0) {
      rawRows.push(...batch);
    }

    if (!batch || batch.length < PAGE_SIZE) {
      break;
    }
  }

  const rows: SaleRecord[] = (rawRows || []).map((r: any) => ({
    transaction_code: r.transaction_code,
    product_id: r.product_id,
    product_name: r.product_name,
    family: r.products?.family || r.product_name,
    customer_email: r.customer_email,
    customer_name: r.customer_name,
    status: r.status,
    approved_at: r.approved_at,
    bruto: Number(r.bruto) || 0,
    liquido: Number(r.liquido) || 0,
    taxa_hotmart: Number(r.taxa_hotmart) || 0,
    payment_type: r.payment_type || "Outro",
    installments: Number(r.installments) || 1,
    purchase_sequence: Number(r.purchase_sequence) || 1,
    is_recompra: Boolean(r.is_recompra),
    days_since_first_purchase: Number(r.days_since_first_purchase) || 0,
    days_since_prev_purchase: Number(r.days_since_prev_purchase) || 0,
    tracking_source: r.tracking_source,
    utm_source: r.utm_source,
    utm_medium: r.utm_medium,
    utm_campaign: r.utm_campaign,
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
    const payKey = row.payment_type || "Outro";
    const pay = payMap.get(payKey) || { transacoes: 0, bruto: 0, liquido: 0 };
    pay.transacoes += 1;
    pay.bruto += row.bruto;
    pay.liquido += row.liquido;
    payMap.set(payKey, pay);

    // Parcelas no cartão
    if (payKey.toLowerCase().includes("cart") || payKey.toLowerCase().includes("credit")) {
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

/** Retorna vendas de um produto ou família específica para o Drawer/Modal interativo. */
export async function getProductSalesDetail(
  familyOrName: string,
  limit = 50,
): Promise<SaleRecord[]> {
  const normalizedSearch = familyOrName.trim();

  // 1. Localiza produtos correspondentes à família ou nome
  const { data: matchedProducts } = await supabaseAdmin
    .from("products")
    .select("id")
    .or(`name.ilike.%${normalizedSearch}%,family.ilike.%${normalizedSearch}%`);

  const productIds = (matchedProducts || []).map((p: any) => p.id);

  let query = supabaseAdmin
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
      is_recompra,
      days_since_first_purchase,
      days_since_prev_purchase,
      tracking_source,
      utm_source,
      utm_medium,
      utm_campaign,
      products (family, edition)
    `)
    .eq("status", "APPROVED");

  if (productIds.length > 0) {
    query = query.or(`product_id.in.(${productIds.join(",")}),product_name.ilike.%${normalizedSearch}%`);
  } else {
    query = query.ilike("product_name", `%${normalizedSearch}%`);
  }

  const { data, error } = await query
    .order("approved_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as any[]).map((r) => ({
      transaction_code: r.transaction_code,
      product_id: r.product_id,
      product_name: r.product_name,
      family: r.products?.family || r.product_name,
      customer_email: r.customer_email,
      customer_name: r.customer_name,
      status: r.status,
      approved_at: r.approved_at,
      bruto: Number(r.bruto) || 0,
      liquido: Number(r.liquido) || 0,
      taxa_hotmart: Number(r.taxa_hotmart) || 0,
      payment_type: r.payment_type || "Outro",
      installments: Number(r.installments) || 1,
      purchase_sequence: Number(r.purchase_sequence) || 1,
      is_recompra: Boolean(r.is_recompra),
      days_since_first_purchase: Number(r.days_since_first_purchase) || 0,
      days_since_prev_purchase: Number(r.days_since_prev_purchase) || 0,
      tracking_source: r.tracking_source,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
    }));
}
