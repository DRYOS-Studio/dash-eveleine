import "server-only";
import { supabaseAdmin } from "./supabase";
import { fetchTransactionsData, money, resolveDateRange, type RangeKey } from "./sales-data";
import { calcularCohorte, diaSP, type CohorteCalc } from "./cohorte-calc";

/**
 * Carrega o histórico inteiro (LTV, intervalo e coortes precisam da vida toda do cliente) e recorta pelo período:
 * seções por venda usam as vendas do período; seções por cliente usam quem fez a 1ª compra no período.
 */
export async function getCohorteData(
  range: RangeKey = "all",
  customFrom?: string | null,
  customTo?: string | null,
): Promise<CohorteCalc & { clientes: number; from: string | null; to: string; currentRange: RangeKey }> {
  const { from, to } = resolveDateRange(range, customFrom, customTo);
  const { to: agora } = resolveDateRange("all");
  const { rawRows, productFamilyMap } = await fetchTransactionsData(null, agora);
  const { data: produtos, error } = await supabaseAdmin.from("products").select("id, edition");
  if (error) throw error;
  const edicoes = new Map<string, string | null>((produtos || []).map((p) => [String(p.id), p.edition ?? null]));

  const vendas = rawRows.map((r) => {
    const m = money(r);
    return {
      email: String(r.customer_email),
      productId: String(r.product_id),
      familia: productFamilyMap.get(r.product_id) || String(r.product_name),
      edicao: edicoes.get(String(r.product_id)) ?? null,
      aprovadaEm: String(r.approved_at),
      faturamento: m.bruto,
      liquido: m.liquido,
      isRecompra: r.is_recompra === true,
    };
  });

  const calc = calcularCohorte(vendas, diaSP(new Date().toISOString()), {
    de: from ? diaSP(from) : null,
    ate: diaSP(to),
  });
  return { ...calc, clientes: calc.ltv.todos.clientes, from, to, currentRange: range };
}
