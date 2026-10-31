import test from "node:test";
import assert from "node:assert/strict";
import { calcularCohorte, diaSP, quantil, type VendaCohorte } from "./cohorte-calc.ts";

const v = (email: string, prod: string, iso: string, fat: number, liq: number, rec = false): VendaCohorte => ({
  email, productId: prod, aprovadaEm: iso, faturamento: fat, liquido: liq, isRecompra: rec,
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
