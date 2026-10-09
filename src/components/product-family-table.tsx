"use client";

import { useState } from "react";
import type { FamilyMetric, SaleRecord } from "@/lib/sales-data";

export const cf = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const nf = (n: number) => n.toLocaleString("pt-BR");
export const pf = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

export function ProductFamilyTable({
  families,
  periodQuery,
}: {
  families: FamilyMetric[];
  /** Querystring do período da tela (range/from/to), para o modal listar o mesmo recorte. */
  periodQuery: string;
}) {
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSelectFamily = async (fam: string) => {
    setSelectedFamily(fam);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/product-sales?family=${encodeURIComponent(fam)}&${periodQuery}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao buscar as vendas");
      setSales(data.sales || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setSales([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Falha ao buscar as vendas");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedFamily(null);
    setSales([]);
    setTotal(0);
    setError(null);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 pr-4">Família de Produto</th>
              <th className="py-2.5 pr-4 text-right">Vendas</th>
              <th className="py-2.5 pr-4 text-right">Receita Bruta</th>
              <th className="py-2.5 pr-4 text-right">Receita Líquida</th>
              <th className="py-2.5 pr-4 text-right">Ticket Médio</th>
              <th className="py-2.5 pr-3 text-right">Share Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {families.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--color-mute)]">
                  Nenhuma transação encontrada no período selecionado.
                </td>
              </tr>
            ) : (
              families.map((f, i) => (
                <tr
                  key={f.family}
                  onClick={() => handleSelectFamily(f.family)}
                  className="group cursor-pointer transition-colors hover:bg-[var(--color-surface)]/60"
                  title="Clique para ver as vendas desta família no período"
                >
                  <td className="py-3 px-3 font-mono text-xs text-[var(--color-mute-soft)]">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-3 pr-4 font-medium text-[var(--color-ink)] group-hover:text-[var(--color-oak)] transition-colors">
                    <div className="flex items-center gap-2">
                      <span>{f.family}</span>
                      <span className="opacity-0 transition-opacity font-mono text-[11px] text-[var(--color-oak)] group-hover:opacity-100">
                        ver vendas →
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs whitespace-nowrap">{nf(f.transacoes)}</td>
                  <td className="py-3 pr-4 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                    {cf(f.receitaBruta)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                    {cf(f.receitaLiquida)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-xs whitespace-nowrap">{cf(f.ticketMedio)}</td>
                  <td className="py-3 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--color-oak)]"
                          style={{ width: `${Math.min(100, f.shareLiquido)}%` }}
                        />
                      </div>
                      <span className="w-11 font-mono text-xs text-[var(--color-mute)]">
                        {pf(f.shareLiquido)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal / Drawer de Detalhe de Vendas do Produto */}
      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--color-line-strong)] bg-white shadow-2xl overflow-hidden">
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[#FAFAF8] p-6">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-oak-light)]">
                  Vendas da Família no Período
                </span>
                <h3 className="font-heading text-xl font-bold text-[var(--color-ink)] mt-0.5">
                  {selectedFamily}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-[var(--color-line-strong)] px-3 py-1.5 font-mono text-xs text-[var(--color-mute)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex h-48 items-center justify-center font-mono text-xs text-[var(--color-mute)]">
                  Carregando transações individuais...
                </div>
              ) : error ? (
                <div className="flex h-48 items-center justify-center text-sm text-[var(--color-negative)]">
                  Não foi possível carregar as vendas: {error}
                </div>
              ) : sales.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-[var(--color-mute)]">
                  Nenhuma venda desta família no período.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
                        <th className="py-2 px-3">Data / Hora</th>
                        <th className="py-2 pr-3">Cliente</th>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3">Pagamento</th>
                        <th className="py-2 pr-3 text-right">Bruto</th>
                        <th className="py-2 pr-3 text-right">Líquido</th>
                        <th className="py-2 pr-3 text-right">Transação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]">
                      {sales.map((s) => (
                        <tr key={s.transaction_code} className="hover:bg-[var(--color-surface)]/60 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-xs text-[var(--color-mute)]">
                            {new Date(s.approved_at).toLocaleString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="font-medium text-[var(--color-ink)]">{s.customer_name || "Cliente"}</div>
                            <div className="font-mono text-[11px] text-[var(--color-mute)]">
                              {s.customer_email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3">
                            {s.is_recompra ? (
                              <span className="inline-flex rounded-full border border-[var(--color-oak)]/15 bg-[var(--color-oak-tint)] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-oak)]">
                                Recompra
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-mute)]">
                                Sem recompra
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-xs capitalize text-[var(--color-mute)]">
                            {s.payment_type}
                            {s.installments > 1 ? ` (${s.installments}x)` : ""}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-xs whitespace-nowrap text-[var(--color-mute)]">
                            {cf(s.bruto)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                            {cf(s.liquido)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-[11px] text-[var(--color-mute-soft)]">
                            {s.transaction_code}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between border-t border-[var(--color-line)] bg-[#FAFAF8] p-4 text-xs font-mono text-[var(--color-mute)]">
              <span>{loading || error ? "" : `Exibindo ${nf(sales.length)} de ${nf(total)} vendas do período, as mais recentes primeiro`}</span>
              <button
                type="button"
                onClick={handleClose}
                className="font-medium text-[var(--color-oak)] hover:underline"
              >
                Fechar janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
