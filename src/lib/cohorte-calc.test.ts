import test from "node:test";
import assert from "node:assert/strict";
import { calcularCohorte, diaSP, quantil, type VendaCohorte } from "./cohorte-calc.ts";

const v = (email: string, prod: string, iso: string, fat: number, liq: number, rec = false, edicao: string | null = "EVERGREEN"): VendaCohorte => ({
  email, productId: prod, familia: `F${prod.slice(1)}`, edicao, aprovadaEm: iso, faturamento: fat, liquido: liq, isRecompra: rec,
});

test("dia em São Paulo: 02:30Z ainda é o dia anterior", () => {
  assert.equal(diaSP("2026-03-02T02:30:00Z"), "2026-03-01");
  assert.equal(diaSP("2026-03-02T03:00:00Z"), "2026-03-02");
});

test("quantil interpola como numpy", () => {
  assert.equal(quantil([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantil([0, 10], 0.25), 2.5);
  assert.equal(quantil([], 0.5), 0);
  assert.equal(quantil([7], 0.75), 7);
});

const base = [
  v("a@x", "P1", "2026-01-10T15:00:00Z", 100, 80),
  v("a@x", "P2", "2026-01-10T18:00:00Z", 50, 40, true), // mesmo dia (SP) da 1ª
  v("b@x", "P1", "2026-01-20T15:00:00Z", 100, 80),
  v("b@x", "P1", "2026-03-05T15:00:00Z", 100, 80), // repete o produto: não é recompra
  v("c@x", "P1", "2026-03-01T01:00:00Z", 30, 20), // 28/02 em SP
  v("c@x", "P3", "2026-03-31T15:00:00Z", 70, 60, true), // 31 dias depois
];

test("mensal: meses sem venda entram zerados e o mês corrente é parcial", () => {
  const r = calcularCohorte(base, "2026-03-20");
  assert.deepEqual(r.mensal.map((m) => m.mes), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(r.mensal[0].vendas, 3);
  assert.equal(r.mensal[0].clientes, 2);
  assert.equal(r.mensal[0].faturamento, 250);
  assert.equal(r.mensal[1].mes, "2026-02");
  assert.equal(r.mensal[1].vendas, 1); // c@x, 28/02 em SP
  assert.equal(r.mensal[2].vendas, 2);
  assert.deepEqual(r.mensal.map((m) => m.parcial), [false, false, true]);
});

test("LTV: segmenta por existir venda de recompra, soma a vida inteira", () => {
  const r = calcularCohorte(base, "2026-03-20");
  assert.equal(r.ltv.todos.clientes, 3);
  assert.equal(r.ltv.comRecompra.clientes, 2); // a e c
  assert.equal(r.ltv.semRecompra.clientes, 1); // b
  assert.equal(r.ltv.semRecompra.faturamentoMedio, 200);
  assert.equal(r.ltv.comRecompra.faturamentoMedio, (150 + 100) / 2);
  assert.equal(r.ltv.todos.faturamentoMediano, 150);
  assert.equal(r.ltv.todos.liquidoMedio, (120 + 160 + 80) / 3);
});

test("produtos distintos por cliente: repetir produto não conta", () => {
  const r = calcularCohorte(base, "2026-03-20");
  assert.deepEqual(r.produtosPorCliente.map((f) => [f.rotulo, f.clientes]), [["1", 1], ["2", 2]]);
});

test("intervalo: 1ª compra → 1ª recompra, em dias corridos de SP", () => {
  const r = calcularCohorte(base, "2026-03-20");
  assert.equal(r.intervalo.clientes, 2);
  assert.equal(r.intervalo.mesmoDia, 1);
  // a: 0 dia · c: 28/02 → 31/03 = 31 dias
  assert.equal(r.intervalo.mediana, 15.5);
  assert.equal(r.intervalo.media, 15.5);
  const f = Object.fromEntries(r.intervalo.faixas.map((x) => [x.rotulo, x.clientes]));
  assert.equal(f["Mesmo dia"], 1);
  assert.equal(f["31 a 60 dias"], 1);
  assert.equal(r.intervalo.faixas.reduce((s, x) => s + x.clientes, 0), 2);
});

test("sem vendas: tudo zerado, sem quebrar", () => {
  const r = calcularCohorte([], "2026-03-20");
  assert.equal(r.mensal.length, 0);
  assert.equal(r.ltv.todos.clientes, 0);
  assert.equal(r.intervalo.clientes, 0);
  assert.equal(r.intervalo.mediana, 0);
});

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("coortes: só mostra a janela de 60/90 dias quando a safra inteira já viveu esses dias", () => {
  // jan: último dia 31/01. Em 20/03 passaram 48 dias → nenhuma janela completa
  let c = calcularCohorte(base, "2026-03-20").coortes;
  assert.deepEqual(c.map((x) => x.mes), ["2026-01", "2026-02"]);
  assert.equal(c[0].novos, 2);
  assert.equal(c[0].rec60, null);
  assert.equal(c[0].rec90, null);
  near(c[0].recAteHoje, 50);
  near(c[0].ltvMedio, 175);
  // 25/04: jan tem 84 dias (60 ok, 90 não); fev tem 56 (nenhuma)
  c = calcularCohorte(base, "2026-04-25").coortes;
  near(c[0].rec60 as number, 50);
  assert.equal(c[0].rec90, null);
  assert.equal(c[1].rec60, null);
  // 30/06: tudo completo. c recomprou com 31 dias → conta em 60 e 90
  c = calcularCohorte(base, "2026-06-30").coortes;
  near(c[0].rec60 as number, 50);
  near(c[0].rec90 as number, 50);
  near(c[1].rec60 as number, 100);
  near(c[1].rec90 as number, 100);
});

test("porta de entrada: família da 1ª compra, recompra até hoje e em 90 dias só entre quem tem 90+ dias", () => {
  const e = calcularCohorte(base, "2026-06-30").entrada;
  assert.equal(e.ambiguos, 0);
  assert.equal(e.linhas.length, 1);
  const l = e.linhas[0];
  assert.equal(l.familia, "F1");
  assert.equal(l.novos, 3);
  near(l.pctRecompra, (2 / 3) * 100);
  assert.equal(l.elegiveis90, 3);
  near(l.pctRecompra90 as number, (2 / 3) * 100);
  near(l.ltvMedio, 150);
  near(l.ticketEntrada, (100 + 100 + 30) / 3);
  // em 20/03 ninguém tem 90 dias: sem dado, não 0%
  assert.equal(calcularCohorte(base, "2026-03-20").entrada.linhas[0].pctRecompra90, null);
});

test("porta de entrada: 1ª compra com duas famílias no mesmo instante fica fora e é contada", () => {
  const r = calcularCohorte(
    [v("d@x", "P1", "2026-01-10T15:00:00Z", 10, 8), v("d@x", "P2", "2026-01-10T15:00:00Z", 10, 8), ...base],
    "2026-06-30",
  );
  assert.equal(r.entrada.ambiguos, 1);
  assert.equal(r.entrada.linhas[0].novos, 3);
});

test("jornadas: 1ª família → família da 1ª recompra", () => {
  const j = calcularCohorte(base, "2026-06-30").jornadas;
  assert.equal(j.total, 2);
  assert.equal(j.ambiguas, 0);
  assert.deepEqual(j.linhas.map((x) => [x.de, x.para, x.clientes]), [["F1", "F2", 1], ["F1", "F3", 1]]);
  near(j.linhas[0].pct, 50);
});

test("jornadas: 1ª recompra com duas famílias no mesmo instante é ambígua", () => {
  const j = calcularCohorte(
    [v("e@x", "P1", "2026-01-10T15:00:00Z", 10, 8), v("e@x", "P2", "2026-02-10T15:00:00Z", 10, 8, true), v("e@x", "P3", "2026-02-10T15:00:00Z", 10, 8, true)],
    "2026-06-30",
  ).jornadas;
  assert.equal(j.total, 0);
  assert.equal(j.ambiguas, 1);
});

test("pareto: top % dos clientes por LTV e famílias com acumulado", () => {
  const p = calcularCohorte(base, "2026-06-30").pareto;
  // LTVs 200, 150, 100 (total 450)
  assert.deepEqual(p.clientes.map((x) => [x.topPct, x.clientes]), [[1, 1], [5, 1], [10, 1], [20, 1], [50, 2]]);
  near(p.clientes[0].pctFaturamento, (200 / 450) * 100);
  near(p.clientes[4].pctFaturamento, (350 / 450) * 100);
  // F1 330, F3 70, F2 50
  assert.deepEqual(p.familias.map((x) => x.familia), ["F1", "F3", "F2"]);
  near(p.familias[0].pct, (330 / 450) * 100);
  near(p.familias[1].acumulado, (400 / 450) * 100);
  near(p.familias[2].acumulado, 100);
});

test("família × edição: soma por par, ordenado por líquido", () => {
  const f = calcularCohorte([...base, v("z@x", "P1", "2026-02-01T15:00:00Z", 40, 30, false, "2026")], "2026-06-30").familiaEdicao;
  assert.deepEqual(f.map((x) => [x.familia, x.edicao, x.vendas]), [["F1", "EVERGREEN", 4], ["F3", "EVERGREEN", 1], ["F2", "EVERGREEN", 1], ["F1", "2026", 1]]);
  near(f[0].liquido, 260);
  near(f.reduce((s, x) => s + x.shareLiquido, 0), 100);
});

test("período: seções por venda usam vendas do período; por cliente usam quem comprou 1ª vez no período, com a vida toda", () => {
  // período = fev/2026 inteiro. Vendas em fev: só c (28/02, 30). Cliente com 1ª compra em fev: só c (inclui a recompra de 31/03).
  const r = calcularCohorte(base, "2026-06-30", { de: "2026-02-01", ate: "2026-02-28" });
  assert.equal(r.vendasNoPeriodo, 1);
  assert.deepEqual(r.mensal.map((m) => [m.mes, m.vendas]), [["2026-02", 1]]);
  assert.equal(r.ltv.todos.clientes, 1);
  near(r.ltv.todos.faturamentoMedio, 100); // c: 30 + 70, mesmo com a 2ª venda fora do período
  assert.equal(r.ltv.comRecompra.clientes, 1);
  assert.equal(r.intervalo.mediana, 31);
  assert.deepEqual(r.coortes.map((c) => [c.mes, c.novos]), [["2026-02", 1]]);
  assert.deepEqual(r.entrada.linhas.map((l) => [l.familia, l.novos]), [["F1", 1]]);
  assert.equal(r.jornadas.total, 1);
  // famílias: só a venda de fev (F1 30); a recompra de mar (F3 70) fica fora
  assert.deepEqual(r.pareto.familias.map((f) => [f.familia, f.faturamento]), [["F1", 30]]);
  near(r.pareto.familias[0].pct, 100);
  assert.deepEqual(r.familiaEdicao.map((f) => [f.familia, f.vendas]), [["F1", 1]]);
  near(r.familiaEdicao[0].shareLiquido, 100);
  assert.deepEqual(r.produtosPorCliente.map((f) => [f.rotulo, f.clientes, f.pct]), [["2", 1, 100]]);
});

test("período: mês cortado pelo início ou fim do período é parcial; período vazio não quebra", () => {
  const r = calcularCohorte(base, "2026-06-30", { de: "2026-01-15", ate: "2026-03-10" });
  assert.deepEqual(r.mensal.map((m) => [m.mes, m.parcial]), [["2026-01", true], ["2026-02", false], ["2026-03", true]]);
  const v = calcularCohorte(base, "2026-06-30", { de: "2025-01-01", ate: "2025-01-31" });
  assert.equal(v.vendasNoPeriodo, 0);
  assert.equal(v.ltv.todos.clientes, 0);
  assert.equal(v.mensal.length, 0);
  assert.equal(v.pareto.clientes.length, 0);
});

test("jornadas: além das 15 maiores, as restantes ficam disponíveis e somam a linha (outras)", () => {
  const vs: VendaCohorte[] = [];
  for (let i = 1; i <= 16; i++) {
    vs.push(v(`c${i}@x`, `P${i}`, "2026-01-10T15:00:00Z", 10, 8));
    vs.push(v(`c${i}@x`, "P99", "2026-02-10T15:00:00Z", 10, 8, true));
  }
  const j = calcularCohorte(vs, "2026-06-30").jornadas;
  assert.equal(j.total, 16);
  assert.equal(j.linhas.length, 16); // 15 + (outras)
  assert.equal(j.restantes.length, 1);
  assert.equal(j.linhas[15].clientes, j.restantes.reduce((s, x) => s + x.clientes, 0));
  assert.equal(j.restantes[0].para, "F99");
});

test("famílias: além das 10 maiores, as restantes trazem % e acumulado e fecham em 100%", () => {
  const vs: VendaCohorte[] = [];
  for (let i = 1; i <= 12; i++) vs.push(v(`c${i}@x`, `P${i}`, "2026-01-10T15:00:00Z", 100 - i, 80));
  const p = calcularCohorte(vs, "2026-06-30").pareto;
  assert.equal(p.familias.length, 11); // 10 + (outras)
  assert.equal(p.familiasRestantes.length, 2);
  const outras = p.familias[10];
  near(outras.faturamento, p.familiasRestantes.reduce((s, f) => s + f.faturamento, 0));
  near(p.familiasRestantes[1].acumulado, 100);
  assert.ok(p.familiasRestantes[0].acumulado > p.familias[9].acumulado);
});
