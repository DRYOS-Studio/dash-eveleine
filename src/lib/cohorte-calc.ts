// Contas da página Cohorte. Puro (sem banco) para ser testável: node --test src/lib/cohorte-calc.test.ts

export type VendaCohorte = {
  email: string;
  productId: string;
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

export type CohorteCalc = {
  mensal: MesLinha[];
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

/** `hoje` = dia atual em São Paulo (AAAA-MM-DD); define qual mês é parcial. */
export function calcularCohorte(vendas: VendaCohorte[], hoje: string): CohorteCalc {
  // ---- mensal
  const porMes = new Map<string, { vendas: number; clientes: Set<string>; fat: number; liq: number }>();
  for (const v of vendas) {
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
        parcial: m === hoje.slice(0, 7),
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

  for (const lista of porCliente.values()) {
    lista.sort((a, b) => a.aprovadaEm.localeCompare(b.aprovadaEm));
    const tot = { fat: 0, liq: 0 };
    for (const v of lista) {
      tot.fat += v.faturamento;
      tot.liq += v.liquido;
    }
    todos.push(tot);
    const primeiraRecompra = lista.find((v) => v.isRecompra);
    (primeiraRecompra ? com : sem).push(tot);
    if (primeiraRecompra) dias.push(diasEntre(diaSP(lista[0].aprovadaEm), diaSP(primeiraRecompra.aprovadaEm)));

    const n = Math.min(5, new Set(lista.map((v) => v.productId)).size);
    const f = nProdutos.get(n) || { clientes: 0, fat: 0 };
    f.clientes += 1;
    f.fat += tot.fat;
    nProdutos.set(n, f);
  }

  const totalClientes = porCliente.size;
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

  return {
    mensal,
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
