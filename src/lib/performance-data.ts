import "server-only";
import { fetchTransactionsData, money, resolveDateRange, type RangeKey } from "./sales-data";
import { parseSck, SEM_RASTREIO } from "./sck";

export type PerfLinha = {
  label: string;
  /** Contexto da linha (ex.: canal da campanha, conjunto do anúncio). */
  sub: string | null;
  vendas: number;
  faturamento: number;
  liquido: number;
  ticketMedio: number;
  pctVendas: number;
  pctFaturamento: number;
};

export type PerformanceData = {
  totalVendas: number;
  totalFaturamento: number;
  totalLiquido: number;
  rastreadasVendas: number;
  rastreadasFaturamento: number;
  rastreadasLiquido: number;
  porCanal: PerfLinha[];
  porCampanha: PerfLinha[];
  porAnuncio: PerfLinha[];
  porPosicionamento: PerfLinha[];
  /** Vendas rastreadas cuja origem não informa campanha (ex.: direto, página Hotmart). */
  rastreadasSemCampanha: number;
  rastreadasSemAnuncio: number;
  from: string | null;
  to: string;
  currentRange: RangeKey;
};

type Acc = { label: string; sub: string | null; vendas: number; faturamento: number; liquido: number };
const TOP = 15;

function linhas(map: Map<string, Acc>, totalVendas: number, totalFat: number, comOutros: boolean): PerfLinha[] {
  const arr = [...map.values()].sort((a, b) => b.faturamento - a.faturamento || b.vendas - a.vendas);
  let lista = arr;
  if (comOutros && arr.length > TOP) {
    const resto = arr.slice(TOP).reduce(
      (o, a) => ({ ...o, vendas: o.vendas + a.vendas, faturamento: o.faturamento + a.faturamento, liquido: o.liquido + a.liquido }),
      { label: `(outros — ${arr.length - TOP} itens)`, sub: null, vendas: 0, faturamento: 0, liquido: 0 } as Acc,
    );
    lista = [...arr.slice(0, TOP), resto];
  }
  return lista.map((a) => ({
    ...a,
    ticketMedio: a.vendas > 0 ? a.faturamento / a.vendas : 0,
    pctVendas: totalVendas > 0 ? (a.vendas / totalVendas) * 100 : 0,
    pctFaturamento: totalFat > 0 ? (a.faturamento / totalFat) * 100 : 0,
  }));
}

function soma(map: Map<string, Acc>, key: string, label: string, sub: string | null, fat: number, liq: number) {
  const a = map.get(key) || { label, sub, vendas: 0, faturamento: 0, liquido: 0 };
  a.vendas += 1;
  a.faturamento += fat;
  a.liquido += liq;
  map.set(key, a);
}

/** Vendas por origem de tráfego (sck da Hotmart). Faturamento e líquido seguem a convenção do dash (oferta, em reais). */
export async function getPerformanceData(
  range: RangeKey = "30",
  customFrom?: string | null,
  customTo?: string | null,
): Promise<PerformanceData> {
  const { from, to } = resolveDateRange(range, customFrom, customTo);
  const { rawRows } = await fetchTransactionsData(from, to);

  const canal = new Map<string, Acc>();
  const campanha = new Map<string, Acc>();
  const anuncio = new Map<string, Acc>();
  const posicionamento = new Map<string, Acc>();
  let totalFat = 0;
  let totalLiq = 0;
  let rastV = 0;
  let rastFat = 0;
  let rastLiq = 0;
  let semCampanha = 0;
  let semAnuncio = 0;

  for (const r of rawRows) {
    const m = money(r);
    const p = parseSck(r.tracking_source);
    totalFat += m.bruto;
    totalLiq += m.liquido;
    soma(canal, p.canal, p.canal, null, m.bruto, m.liquido);
    if (p.canal === SEM_RASTREIO) continue;

    rastV++;
    rastFat += m.bruto;
    rastLiq += m.liquido;
    if (p.campanha) soma(campanha, `${p.canal}\u0000${p.campanha}`, p.campanha, p.canal, m.bruto, m.liquido);
    else semCampanha++;
    if (p.anuncio) soma(anuncio, `${p.canal}\u0000${p.anuncio}\u0000${p.conjunto ?? ""}`, p.anuncio, [p.canal, p.conjunto].filter(Boolean).join(" · "), m.bruto, m.liquido);
    else semAnuncio++;
    if (p.posicionamento) soma(posicionamento, p.posicionamento, p.posicionamento, null, m.bruto, m.liquido);
  }

  const totalVendas = rawRows.length;
  return {
    totalVendas,
    totalFaturamento: totalFat,
    totalLiquido: totalLiq,
    rastreadasVendas: rastV,
    rastreadasFaturamento: rastFat,
    rastreadasLiquido: rastLiq,
    porCanal: linhas(canal, totalVendas, totalFat, false),
    porCampanha: linhas(campanha, totalVendas, totalFat, true),
    porAnuncio: linhas(anuncio, totalVendas, totalFat, true),
    porPosicionamento: linhas(posicionamento, totalVendas, totalFat, false),
    rastreadasSemCampanha: semCampanha,
    rastreadasSemAnuncio: semAnuncio,
    from,
    to,
    currentRange: range,
  };
}
