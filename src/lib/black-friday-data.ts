import "server-only";
import { supabaseAdmin } from "./supabase";
import { money, normalizePaymentMethod, resolveDateRange, type RangeKey } from "./sales-data";
import { parseSck, SEM_RASTREIO, type ParsedSck } from "./sck";

export type BFTransaction = {
  code: string;
  approved_at: string;
  dataHora: string;
  cliente: string;
  email: string;
  produto: string;
  ofertaNome: string | null;
  ofertaCodigo: string | null;
  precoOferta: number;
  liquido: number;
  taxa: number;
  bruto: number;
  paymentType: string;
  installments: number;
  trackingSource: string | null;
  parsedSck: ParsedSck;
  isRecompra: boolean;
};

export type BFDailyMetric = {
  date: string;
  dateLabel: string;
  vendas: number;
  faturamentoOferta: number;
  faturamentoLiquido: number;
  taxaHotmart: number;
  valorBruto: number;
  ticketMedio: number;
};

export type BFCanalLinha = {
  canal: string;
  vendas: number;
  faturamento: number;
  liquido: number;
  ticketMedio: number;
  pctVendas: number;
  pctFaturamento: number;
  mensagens: {
    label: string;
    vendas: number;
    faturamento: number;
    liquido: number;
  }[];
};

export type BFPaymentMetric = {
  metodo: string;
  vendas: number;
  faturamento: number;
  liquido: number;
  pctVendas: number;
  pctFaturamento: number;
};

export type BFProductMetric = {
  produto: string;
  vendas: number;
  faturamento: number;
  liquido: number;
  pctVendas: number;
};

export type BFSynthesis = {
  totalVendas: number;
  faturamentoOferta: number;
  faturamentoLiquido: number;
  taxaHotmartTotal: number;
  valorBrutoPago: number;
  clientesUnicos: number;
  recompradores: number;
  taxaRecompra: number;
  ticketMedioOferta: number;
  ticketMedioLiquido: number;
  vendasHoje: number;
  faturamentoHoje: number;
  liquidoHoje: number;
};

export type BlackFridayData = {
  synthesis: BFSynthesis;
  dailySeries: BFDailyMetric[];
  porCanal: BFCanalLinha[];
  porPagamento: BFPaymentMetric[];
  porProduto: BFProductMetric[];
  transacoes: BFTransaction[];
  from: string | null;
  to: string;
  currentRange: RangeKey;
};

export async function getBlackFridayData(
  range: RangeKey = "all",
  customFrom?: string | null,
  customTo?: string | null,
): Promise<BlackFridayData> {
  const { from, to } = resolveDateRange(range, customFrom, customTo);

  let query = supabaseAdmin
    .from("transactions")
    .select(`
      transaction_code, product_id, product_name, customer_email, customer_name, status,
      approved_at, bruto, liquido, payment_type, installments, purchase_sequence, is_recompra,
      moeda, preco_oferta, taxa_hotmart_exata, outras_comissoes, tracking_source, raw_payload
    `)
    .eq("plataforma", "hotmart")
    .eq("status", "APPROVED")
    .ilike("product_name", "%black friday 2027%")
    .lte("approved_at", to)
    .order("approved_at", { ascending: false });

  if (from) {
    query = query.gte("approved_at", from);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const rawList = rows || [];

  // Data de "Hoje" no fuso de SP para métricas de hoje
  const now = new Date();
  const spTodayStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);

  const customersSet = new Set<string>();
  const recompradoresSet = new Set<string>();

  let faturamentoOferta = 0;
  let faturamentoLiquido = 0;
  let taxaHotmartTotal = 0;
  let valorBrutoPago = 0;
  let vendasHoje = 0;
  let faturamentoHoje = 0;
  let liquidoHoje = 0;

  const dailyMap = new Map<string, {
    date: string;
    dateLabel: string;
    vendas: number;
    oferta: number;
    liquido: number;
    taxa: number;
    bruto: number;
  }>();

  const canalMap = new Map<string, {
    canal: string;
    vendas: number;
    faturamento: number;
    liquido: number;
    msgs: Map<string, { label: string; vendas: number; faturamento: number; liquido: number }>;
  }>();

  const payMap = new Map<string, { metodo: string; vendas: number; faturamento: number; liquido: number }>();
  const prodMap = new Map<string, { produto: string; vendas: number; faturamento: number; liquido: number }>();

  const transacoes: BFTransaction[] = [];

  for (const r of rawList) {
    const m = money(r);
    const precoOferta = m.bruto; // convenção do dash: m.bruto é o preço da oferta quando decomposta
    const liquido = m.liquido;
    const taxa = m.taxa_hotmart;
    const brutoComJuros = Number(r.bruto) || precoOferta;
    const paymentNorm = normalizePaymentMethod(r.payment_type);
    const installments = Math.max(1, Number(r.installments) || 1);
    const pSck = parseSck(r.tracking_source);

    const email = (r.customer_email || "").toLowerCase().trim();
    if (email) {
      customersSet.add(email);
      if (r.is_recompra) recompradoresSet.add(email);
    }

    faturamentoOferta += precoOferta;
    faturamentoLiquido += liquido;
    taxaHotmartTotal += taxa;
    valorBrutoPago += brutoComJuros;

    const d = new Date(r.approved_at);
    const dayStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);

    const horaStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

    if (dayStr === spTodayStr) {
      vendasHoje++;
      faturamentoHoje += precoOferta;
      liquidoHoje += liquido;
    }

    // Daily
    const curDay = dailyMap.get(dayStr) || {
      date: dayStr,
      dateLabel: dayStr.slice(0, 5),
      vendas: 0,
      oferta: 0,
      liquido: 0,
      taxa: 0,
      bruto: 0,
    };
    curDay.vendas++;
    curDay.oferta += precoOferta;
    curDay.liquido += liquido;
    curDay.taxa += taxa;
    curDay.bruto += brutoComJuros;
    dailyMap.set(dayStr, curDay);

    // Canal & Mensagens
    const canalNome = pSck.canal || SEM_RASTREIO;
    const msgNome = pSck.campanha || pSck.anuncio || "(sem mensagem)";
    let cEntry = canalMap.get(canalNome);
    if (!cEntry) {
      cEntry = { canal: canalNome, vendas: 0, faturamento: 0, liquido: 0, msgs: new Map() };
      canalMap.set(canalNome, cEntry);
    }
    cEntry.vendas++;
    cEntry.faturamento += precoOferta;
    cEntry.liquido += liquido;

    const mEntry = cEntry.msgs.get(msgNome) || { label: msgNome, vendas: 0, faturamento: 0, liquido: 0 };
    mEntry.vendas++;
    mEntry.faturamento += precoOferta;
    mEntry.liquido += liquido;
    cEntry.msgs.set(msgNome, mEntry);

    // Meio de pagamento
    const payEntry = payMap.get(paymentNorm) || { metodo: paymentNorm, vendas: 0, faturamento: 0, liquido: 0 };
    payEntry.vendas++;
    payEntry.faturamento += precoOferta;
    payEntry.liquido += liquido;
    payMap.set(paymentNorm, payEntry);

    // Produto
    const prodNome = r.product_name || "Combo Black Friday 2027";
    const prEntry = prodMap.get(prodNome) || { produto: prodNome, vendas: 0, faturamento: 0, liquido: 0 };
    prEntry.vendas++;
    prEntry.faturamento += precoOferta;
    prEntry.liquido += liquido;
    prodMap.set(prodNome, prEntry);

    // Detalhe de oferta do raw_payload
    const offerData = r.raw_payload?.data?.purchase?.offer;
    const ofertaNome = offerData?.name || null;
    const ofertaCodigo = offerData?.code || null;

    transacoes.push({
      code: r.transaction_code,
      approved_at: r.approved_at,
      dataHora: horaStr,
      cliente: r.customer_name || "Cliente",
      email: r.customer_email,
      produto: prodNome,
      ofertaNome,
      ofertaCodigo,
      precoOferta,
      liquido,
      taxa,
      bruto: brutoComJuros,
      paymentType: paymentNorm,
      installments,
      trackingSource: r.tracking_source,
      parsedSck: pSck,
      isRecompra: Boolean(r.is_recompra),
    });
  }

  const totalVendas = rawList.length;

  // Daily series ordenado por data crescente
  const dailySeries: BFDailyMetric[] = [...dailyMap.values()]
    .map((d) => ({
      date: d.date,
      dateLabel: d.dateLabel,
      vendas: d.vendas,
      faturamentoOferta: d.oferta,
      faturamentoLiquido: d.liquido,
      taxaHotmart: d.taxa,
      valorBruto: d.bruto,
      ticketMedio: d.vendas > 0 ? d.oferta / d.vendas : 0,
    }))
    .reverse();

  // Canais ordenados por faturamento decrescente
  const porCanal: BFCanalLinha[] = [...canalMap.values()]
    .map((c) => ({
      canal: c.canal,
      vendas: c.vendas,
      faturamento: c.faturamento,
      liquido: c.liquido,
      ticketMedio: c.vendas > 0 ? c.faturamento / c.vendas : 0,
      pctVendas: totalVendas > 0 ? (c.vendas / totalVendas) * 100 : 0,
      pctFaturamento: faturamentoOferta > 0 ? (c.faturamento / faturamentoOferta) * 100 : 0,
      mensagens: [...c.msgs.values()].sort((a, b) => b.faturamento - a.faturamento),
    }))
    .sort((a, b) => b.faturamento - a.faturamento);

  // Pagamentos ordenados por vendas decrescentes
  const porPagamento: BFPaymentMetric[] = [...payMap.values()]
    .map((p) => ({
      metodo: p.metodo,
      vendas: p.vendas,
      faturamento: p.faturamento,
      liquido: p.liquido,
      pctVendas: totalVendas > 0 ? (p.vendas / totalVendas) * 100 : 0,
      pctFaturamento: faturamentoOferta > 0 ? (p.faturamento / faturamentoOferta) * 100 : 0,
    }))
    .sort((a, b) => b.vendas - a.vendas);

  // Produtos ordenados por faturamento decrescente
  const porProduto: BFProductMetric[] = [...prodMap.values()]
    .map((pr) => ({
      produto: pr.produto,
      vendas: pr.vendas,
      faturamento: pr.faturamento,
      liquido: pr.liquido,
      pctVendas: totalVendas > 0 ? (pr.vendas / totalVendas) * 100 : 0,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);

  const clientesUnicos = customersSet.size;
  const recompradores = recompradoresSet.size;

  const synthesis: BFSynthesis = {
    totalVendas,
    faturamentoOferta,
    faturamentoLiquido,
    taxaHotmartTotal,
    valorBrutoPago,
    clientesUnicos,
    recompradores,
    taxaRecompra: clientesUnicos > 0 ? (recompradores / clientesUnicos) * 100 : 0,
    ticketMedioOferta: totalVendas > 0 ? faturamentoOferta / totalVendas : 0,
    ticketMedioLiquido: totalVendas > 0 ? faturamentoLiquido / totalVendas : 0,
    vendasHoje,
    faturamentoHoje,
    liquidoHoje,
  };

  return {
    synthesis,
    dailySeries,
    porCanal,
    porPagamento,
    porProduto,
    transacoes,
    from,
    to,
    currentRange: range,
  };
}
