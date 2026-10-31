// Contas da página Cohorte. Puro (sem banco) para ser testável: node --test src/lib/cohorte-calc.test.ts

export type VendaCohorte = {
  email: string;
  productId: string;
  /** products.family (ou o nome do produto, se sem família) */
  familia: string;
  /** products.edition */
  edicao: string | null;
  /** ISO-UTC de approved_at */
  aprovadaEm: string;
  /** preço da oferta (convenção do dash) */
  faturamento: number;
  liquido: number;
  isRecompra: boolean;
};

export type MesLinha = {
  /** AAAA-MM (fuso de São Paulo) */
  mes: string;
  vendas: number;
  clientes: number;
  faturamento: number;
  liquido: number;
  /** mês corrente: ainda não terminou */
  parcial: boolean;
};

export type LtvGrupo = {
  clientes: number;
  faturamentoMedio: number;
  faturamentoMediano: number;
  liquidoMedio: number;
};

export type FaixaLinha = { rotulo: string; clientes: number; pct: number; faturamentoMedio?: number };

export type CoorteLinha = {
  /** AAAA-MM do mês da 1ª compra */
  mes: string;
  novos: number;
  /** % que recomprou em até 60 / 90 dias da 1ª compra. null = a safra ainda não completou a janela. */
  rec60: number | null;
  rec90: number | null;
  /** % que recomprou até hoje (sem janela: safras novas tiveram menos tempo) */
  recAteHoje: number;
  /** faturamento médio por cliente até hoje */
  ltvMedio: number;
};

export type EntradaLinha = {
  familia: string;
  novos: number;
  /** % com ao menos uma recompra até hoje */
  pctRecompra: number;
  /** clientes com 90+ dias desde a 1ª compra e, entre eles, % que recomprou em até 90 dias */
  elegiveis90: number;
  pctRecompra90: number | null;
  ltvMedio: number;
  /** faturamento médio da 1ª compra */
  ticketEntrada: number;
};

export type JornadaLinha = { de: string; para: string; clientes: number; pct: number };

export type ParetoClientes = { topPct: number; clientes: number; pctFaturamento: number };
export type ParetoFamilia = { familia: string; faturamento: number; pct: number; acumulado: number };

export type FamiliaEdicaoLinha = {
  familia: string;
  edicao: string;
  vendas: number;
  faturamento: number;
  liquido: number;
  shareLiquido: number;
};

export type CohorteCalc = {
  /** vendas aprovadas dentro do período */
  vendasNoPeriodo: number;
  mensal: MesLinha[];
  coortes: CoorteLinha[];
  /** `ambiguos` = clientes cuja 1ª compra teve mais de uma família no mesmo instante */
  entrada: { linhas: EntradaLinha[]; ambiguos: number };
  jornadas: {
    linhas: JornadaLinha[];
    /** clientes com jornada definida (1ª compra e 1ª recompra com uma única família cada) */
    total: number;
    ambiguas: number;
  };
  pareto: { clientes: ParetoClientes[]; familias: ParetoFamilia[] };
  familiaEdicao: FamiliaEdicaoLinha[];
  ltv: { todos: LtvGrupo; semRecompra: LtvGrupo; comRecompra: LtvGrupo };
  /** Clientes por nº de produtos distintos comprados (1, 2, 3, 4, 5+). */
  produtosPorCliente: FaixaLinha[];
  /** 1ª compra → 1ª recompra, em dias corridos (fuso de São Paulo). */
  intervalo: {
    clientes: number;
    media: number;
    mediana: number;
    p25: number;
    p75: number;
    mesmoDia: number;
    faixas: FaixaLinha[];
  };
};

const TZ_OFFSET_MS = 3 * 3600_000;

/** Dia (AAAA-MM-DD) em São Paulo (UTC−3 fixo, como o resto do dash). */
export function diaSP(iso: string): string {
  return new Date(new Date(iso).getTime() - TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}

function ultimoDiaDoMes(mes: string): string {
  const prox = proximoMes(mes);
  return new Date(Date.UTC(+prox.slice(0, 4), +prox.slice(5, 7) - 1, 1) - 86400000).toISOString().slice(0, 10);
}

const TOP_JORNADAS = 15;
const TOPS_CLIENTES = [1, 5, 10, 20, 50];
const TOP_FAMILIAS = 10;

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

/** Percentil por interpolação linear entre posições (mesmo método do numpy). `p` de 0 a 1. */
export function quantil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const i = Math.floor(pos);
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (pos - i) : s[i];
}

function proximoMes(m: string): string {
  const ano = +m.slice(0, 4);
  const mes = +m.slice(5, 7);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

const FAIXAS_DIAS: Array<{ rotulo: string; max: number }> = [
  { rotulo: "Mesmo dia", max: 0 },
  { rotulo: "1 a 7 dias", max: 7 },
  { rotulo: "8 a 14 dias", max: 14 },
  { rotulo: "15 a 30 dias", max: 30 },
  { rotulo: "31 a 60 dias", max: 60 },
  { rotulo: "61 a 90 dias", max: 90 },
  { rotulo: "Mais de 90 dias", max: Infinity },
];

function grupoLtv(totais: Array<{ fat: number; liq: number }>): LtvGrupo {
  return {
    clientes: totais.length,
    faturamentoMedio: media(totais.map((t) => t.fat)),
    faturamentoMediano: quantil(totais.map((t) => t.fat), 0.5),
    liquidoMedio: media(totais.map((t) => t.liq)),
  };
}

/** Dias (AAAA-MM-DD, São Paulo, inclusivos) do período escolhido; null = sem limite. */
export type Periodo = { de: string | null; ate: string | null };

/**
 * `hoje` = dia atual em São Paulo (AAAA-MM-DD).
 * `periodo` filtra de dois jeitos (todas as vendas entram no cálculo; só o recorte muda):
 *  - seções por venda (mensal, famílias, família × edição): vendas aprovadas dentro do período;
 *  - seções por cliente (LTV, intervalo, coortes, entrada, jornadas, concentração de clientes):
 *    clientes cuja 1ª compra caiu no período, com a vida inteira deles até hoje.
 */
export function calcularCohorte(vendas: VendaCohorte[], hoje: string, periodo: Periodo = { de: null, ate: null }): CohorteCalc {
  const dentro = (iso: string) => {
    const d = diaSP(iso);
    return (!periodo.de || d >= periodo.de) && (!periodo.ate || d <= periodo.ate);
  };
  const vendasPeriodo = vendas.filter((v) => dentro(v.aprovadaEm));

  // ---- mensal
  const porMes = new Map<string, { vendas: number; clientes: Set<string>; fat: number; liq: number }>();
  for (const v of vendasPeriodo) {
    const mes = diaSP(v.aprovadaEm).slice(0, 7);
    const m = porMes.get(mes) || { vendas: 0, clientes: new Set<string>(), fat: 0, liq: 0 };
    m.vendas += 1;
    m.clientes.add(v.email);
    m.fat += v.faturamento;
    m.liq += v.liquido;
    porMes.set(mes, m);
  }
  const mensal: MesLinha[] = [];
  const meses = [...porMes.keys()].sort();
  if (meses.length > 0) {
    // meses sem venda entram zerados: buraco na linha do tempo é informação
    for (let m = meses[0]; m <= meses[meses.length - 1]; m = proximoMes(m)) {
      const x = porMes.get(m);
      mensal.push({
        mes: m,
        vendas: x?.vendas ?? 0,
        clientes: x?.clientes.size ?? 0,
        faturamento: x?.fat ?? 0,
        liquido: x?.liq ?? 0,
        // mês corrente, ou mês cortado pelo início/fim do período escolhido
        parcial:
          m === hoje.slice(0, 7) ||
          (periodo.de != null && m === periodo.de.slice(0, 7) && periodo.de.slice(8) !== "01") ||
          (periodo.ate != null && m === periodo.ate.slice(0, 7) && periodo.ate < ultimoDiaDoMes(m)),
      });
    }
  }

  // ---- por cliente
  const porCliente = new Map<string, VendaCohorte[]>();
  for (const v of vendas) {
    const l = porCliente.get(v.email);
    if (l) l.push(v);
    else porCliente.set(v.email, [v]);
  }

  const todos: Array<{ fat: number; liq: number }> = [];
  const sem: Array<{ fat: number; liq: number }> = [];
  const com: Array<{ fat: number; liq: number }> = [];
  const nProdutos = new Map<number, { clientes: number; fat: number }>();
  const dias: number[] = [];
  const coorte = new Map<string, { novos: number; rec60: number; rec90: number; recAll: number; fat: number }>();
  const entrada = new Map<string, { novos: number; rec: number; eleg: number; rec90: number; fat: number; entradaFat: number }>();
  const jornada = new Map<string, { de: string; para: string; clientes: number }>();
  let entradaAmbigua = 0;
  let jornadasAmbiguas = 0;
  let jornadasTotal = 0;

  for (const lista of porCliente.values()) {
    lista.sort((a, b) => a.aprovadaEm.localeCompare(b.aprovadaEm));
    if (!dentro(lista[0].aprovadaEm)) continue; // seções por cliente: 1ª compra no período
    const tot = { fat: 0, liq: 0 };
    for (const v of lista) {
      tot.fat += v.faturamento;
      tot.liq += v.liquido;
    }
    todos.push(tot);
    const primeiraRecompra = lista.find((v) => v.isRecompra);
    (primeiraRecompra ? com : sem).push(tot);
    const diaPrimeira = diaSP(lista[0].aprovadaEm);
    const diasAteRecompra = primeiraRecompra ? diasEntre(diaPrimeira, diaSP(primeiraRecompra.aprovadaEm)) : null;
    if (diasAteRecompra != null) dias.push(diasAteRecompra);

    // coorte = mês da 1ª compra
    const c = coorte.get(diaPrimeira.slice(0, 7)) || { novos: 0, rec60: 0, rec90: 0, recAll: 0, fat: 0 };
    c.novos += 1;
    c.fat += tot.fat;
    if (diasAteRecompra != null) {
      c.recAll += 1;
      if (diasAteRecompra <= 60) c.rec60 += 1;
      if (diasAteRecompra <= 90) c.rec90 += 1;
    }
    coorte.set(diaPrimeira.slice(0, 7), c);

    // porta de entrada: só quando a 1ª compra tem uma única família (senão não dá para atribuir)
    const t0 = new Date(lista[0].aprovadaEm).getTime();
    const primeiros = lista.filter((v) => new Date(v.aprovadaEm).getTime() === t0);
    const famEntrada = new Set(primeiros.map((v) => v.familia));
    let familiaEntrada: string | null = null;
    if (famEntrada.size === 1) {
      familiaEntrada = primeiros[0].familia;
      const e = entrada.get(familiaEntrada) || { novos: 0, rec: 0, eleg: 0, rec90: 0, fat: 0, entradaFat: 0 };
      e.novos += 1;
      e.fat += tot.fat;
      e.entradaFat += primeiros.reduce((s, v) => s + v.faturamento, 0);
      if (diasAteRecompra != null) e.rec += 1;
      if (diasEntre(diaPrimeira, hoje) >= 90) {
        e.eleg += 1;
        if (diasAteRecompra != null && diasAteRecompra <= 90) e.rec90 += 1;
      }
      entrada.set(familiaEntrada, e);
    } else {
      entradaAmbigua += 1;
    }

    // jornada 1ª → 1ª recompra, também só com família única nas duas pontas
    if (primeiraRecompra) {
      const tr = new Date(primeiraRecompra.aprovadaEm).getTime();
      const destinos = new Set(lista.filter((v) => v.isRecompra && new Date(v.aprovadaEm).getTime() === tr).map((v) => v.familia));
      if (familiaEntrada != null && destinos.size === 1) {
        const para = [...destinos][0];
        const k = `${familiaEntrada}\u0000${para}`;
        const j = jornada.get(k) || { de: familiaEntrada, para, clientes: 0 };
        j.clientes += 1;
        jornada.set(k, j);
        jornadasTotal += 1;
      } else {
        jornadasAmbiguas += 1;
      }
    }

    const n = Math.min(5, new Set(lista.map((v) => v.productId)).size);
    const f = nProdutos.get(n) || { clientes: 0, fat: 0 };
    f.clientes += 1;
    f.fat += tot.fat;
    nProdutos.set(n, f);
  }

  const totalClientes = todos.length;
  const produtosPorCliente: FaixaLinha[] = [1, 2, 3, 4, 5]
    .filter((n) => nProdutos.has(n))
    .map((n) => {
      const f = nProdutos.get(n)!;
      return {
        rotulo: n === 5 ? "5 ou mais" : String(n),
        clientes: f.clientes,
        pct: totalClientes > 0 ? (f.clientes / totalClientes) * 100 : 0,
        faturamentoMedio: f.clientes > 0 ? f.fat / f.clientes : 0,
      };
    });

  const faixas: FaixaLinha[] = FAIXAS_DIAS.map((f, i) => {
    const min = i === 0 ? -Infinity : FAIXAS_DIAS[i - 1].max;
    const n = dias.filter((d) => d > min && d <= f.max).length;
    return { rotulo: f.rotulo, clientes: n, pct: dias.length > 0 ? (n / dias.length) * 100 : 0 };
  });

  const coortes: CoorteLinha[] = [...coorte.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, c]) => {
      // a safra só tem janela justa quando o último cliente do mês já viveu W dias
      const completa = (w: number) => diasEntre(ultimoDiaDoMes(mes), hoje) >= w;
      return {
        mes,
        novos: c.novos,
        rec60: completa(60) ? (c.rec60 / c.novos) * 100 : null,
        rec90: completa(90) ? (c.rec90 / c.novos) * 100 : null,
        recAteHoje: (c.recAll / c.novos) * 100,
        ltvMedio: c.fat / c.novos,
      };
    });

  const entradaLinhas: EntradaLinha[] = [...entrada.entries()]
    .map(([familia, e]) => ({
      familia,
      novos: e.novos,
      pctRecompra: (e.rec / e.novos) * 100,
      elegiveis90: e.eleg,
      pctRecompra90: e.eleg > 0 ? (e.rec90 / e.eleg) * 100 : null,
      ltvMedio: e.fat / e.novos,
      ticketEntrada: e.entradaFat / e.novos,
    }))
    .sort((a, b) => b.novos - a.novos || a.familia.localeCompare(b.familia));

  const jornadasOrd = [...jornada.values()].sort((a, b) => b.clientes - a.clientes || a.de.localeCompare(b.de) || a.para.localeCompare(b.para));
  const pctJ = (n: number) => (jornadasTotal > 0 ? (n / jornadasTotal) * 100 : 0);
  const jornadasLinhas: JornadaLinha[] = jornadasOrd.slice(0, TOP_JORNADAS).map((j) => ({ ...j, pct: pctJ(j.clientes) }));
  if (jornadasOrd.length > TOP_JORNADAS) {
    const resto = jornadasOrd.slice(TOP_JORNADAS).reduce((s, j) => s + j.clientes, 0);
    jornadasLinhas.push({ de: `(outras ${jornadasOrd.length - TOP_JORNADAS} jornadas)`, para: "", clientes: resto, pct: pctJ(resto) });
  }

  // Pareto
  const ltvOrd = todos.map((t) => t.fat).sort((a, b) => b - a);
  const fatTotal = ltvOrd.reduce((s, x) => s + x, 0);
  const paretoClientes: ParetoClientes[] = ltvOrd.length
    ? TOPS_CLIENTES.map((p) => {
        const k = Math.max(1, Math.ceil((ltvOrd.length * p) / 100));
        return { topPct: p, clientes: k, pctFaturamento: fatTotal > 0 ? (ltvOrd.slice(0, k).reduce((s, x) => s + x, 0) / fatTotal) * 100 : 0 };
      })
    : [];

  const porFamilia = new Map<string, number>();
  const porFamEd = new Map<string, { familia: string; edicao: string; vendas: number; fat: number; liq: number }>();
  let liqTotal = 0;
  for (const v of vendasPeriodo) {
    porFamilia.set(v.familia, (porFamilia.get(v.familia) || 0) + v.faturamento);
    const ed = v.edicao ?? "—";
    const k = `${v.familia}\u0000${ed}`;
    const x = porFamEd.get(k) || { familia: v.familia, edicao: ed, vendas: 0, fat: 0, liq: 0 };
    x.vendas += 1;
    x.fat += v.faturamento;
    x.liq += v.liquido;
    porFamEd.set(k, x);
    liqTotal += v.liquido;
  }
  // total das vendas do período (as famílias saem das vendas; o top de clientes, de clientes com 1ª compra no período)
  const famFatTotal = [...porFamilia.values()].reduce((s, x) => s + x, 0);
  const famOrd = [...porFamilia.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const paretoFamilias: ParetoFamilia[] = [];
  let acum = 0;
  for (const [familia, fat] of famOrd.slice(0, TOP_FAMILIAS)) {
    acum += fat;
    paretoFamilias.push({ familia, faturamento: fat, pct: famFatTotal > 0 ? (fat / famFatTotal) * 100 : 0, acumulado: famFatTotal > 0 ? (acum / famFatTotal) * 100 : 0 });
  }
  if (famOrd.length > TOP_FAMILIAS) {
    const resto = famFatTotal - acum;
    paretoFamilias.push({ familia: `(outras ${famOrd.length - TOP_FAMILIAS} famílias)`, faturamento: resto, pct: famFatTotal > 0 ? (resto / famFatTotal) * 100 : 0, acumulado: famFatTotal > 0 ? 100 : 0 });
  }

  const familiaEdicao: FamiliaEdicaoLinha[] = [...porFamEd.values()]
    .map((x) => ({ familia: x.familia, edicao: x.edicao, vendas: x.vendas, faturamento: x.fat, liquido: x.liq, shareLiquido: liqTotal > 0 ? (x.liq / liqTotal) * 100 : 0 }))
    .sort((a, b) => b.liquido - a.liquido || a.familia.localeCompare(b.familia) || a.edicao.localeCompare(b.edicao));

  return {
    vendasNoPeriodo: vendasPeriodo.length,
    mensal,
    coortes,
    entrada: { linhas: entradaLinhas, ambiguos: entradaAmbigua },
    jornadas: { linhas: jornadasLinhas, total: jornadasTotal, ambiguas: jornadasAmbiguas },
    pareto: { clientes: paretoClientes, familias: paretoFamilias },
    familiaEdicao,
    ltv: { todos: grupoLtv(todos), semRecompra: grupoLtv(sem), comRecompra: grupoLtv(com) },
    produtosPorCliente,
    intervalo: {
      clientes: dias.length,
      media: media(dias),
      mediana: quantil(dias, 0.5),
      p25: quantil(dias, 0.25),
      p75: quantil(dias, 0.75),
      mesmoDia: dias.filter((d) => d === 0).length,
      faixas,
    },
  };
}
