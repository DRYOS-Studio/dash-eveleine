import "server-only";
import { fetchTransactionsData, money, resolveDateRange } from "./sales-data";
import { calcularCohorte, diaSP, type CohorteCalc } from "./cohorte-calc";

/** Cohorte: sempre todo o histórico (LTV e intervalo só fazem sentido com a vida inteira do cliente). */
export async function getCohorteData(): Promise<CohorteCalc & { vendas: number; clientes: number; primeiraVenda: string | null }> {
  const { to } = resolveDateRange("all");
  const { rawRows } = await fetchTransactionsData(null, to);

  const vendas = rawRows.map((r) => {
    const m = money(r);
    return {
      email: String(r.customer_email),
      productId: String(r.product_id),
      aprovadaEm: String(r.approved_at),
      faturamento: m.bruto,
      liquido: m.liquido,
      isRecompra: r.is_recompra === true,
    };
  });

  const calc = calcularCohorte(vendas, diaSP(new Date().toISOString()));
  return {
    ...calc,
    vendas: vendas.length,
    clientes: calc.ltv.todos.clientes,
    primeiraVenda: calc.mensal[0]?.mes ?? null,
  };
}
