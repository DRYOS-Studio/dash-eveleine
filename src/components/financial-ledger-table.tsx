"use client";

import { useState, useMemo } from "react";
import type { FinancialTransactionItem } from "@/lib/sales-data";
import { cf, nf } from "@/components/ui";

interface Props {
  transactions: FinancialTransactionItem[];
  /** Total de vendas no período (a lista traz só as mais recentes). */
  total: number;
}

export function FinancialLedgerTable({ transactions, total }: Props) {
  const [search, setSearch] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Lista única de meios de pagamento para o filtro
  const availableMethods = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.payment_type));
    return ["TODOS", ...Array.from(set).sort()];
  }, [transactions]);

  // Filtragem
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return transactions.filter((t) => {
      const matchMethod =
        selectedMethod === "TODOS" || t.payment_type === selectedMethod;

      if (!matchMethod) return false;
      if (!q) return true;

      return (
        t.transaction_code.toLowerCase().includes(q) ||
        t.product_name.toLowerCase().includes(q) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q)) ||
        t.customer_email.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, selectedMethod]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const handleMethodChange = (m: string) => {
    setSelectedMethod(m);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      {total > transactions.length && (
        <p className="text-xs text-[var(--color-mute)]">
          Exibindo as {nf(transactions.length)} vendas mais recentes de {nf(total)} no período.
          A busca e o filtro valem só para estas.
        </p>
      )}

      {/* Controles de Busca e Filtro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por código, cliente, email ou produto..."
            className="w-full rounded-lg border border-[var(--color-line-strong)] bg-white px-3 py-1.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-mute)] focus:border-[var(--color-oak)] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)] px-1"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-mute)]">
            Meio:
          </span>
          <select
            value={selectedMethod}
            onChange={(e) => handleMethodChange(e.target.value)}
            className="rounded-lg border border-[var(--color-line-strong)] bg-white px-2.5 py-1.5 text-xs sm:text-sm text-[var(--color-ink)] focus:border-[var(--color-oak)] focus:outline-none"
          >
            {availableMethods.map((m) => (
              <option key={m} value={m}>
                {m === "TODOS" ? "Todos os Meios" : m}
              </option>
            ))}
          </select>

          <span className="font-mono text-xs text-[var(--color-mute)] ml-1">
            {nf(filtered.length)} {filtered.length === 1 ? "venda" : "vendas"}
          </span>
        </div>
      </div>

      {/* Tabela de Transações */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
              <th className="py-2.5 px-3">Transação</th>
              <th className="py-2.5 px-3">Data / Hora</th>
              <th className="py-2.5 px-3">Cliente</th>
              <th className="py-2.5 px-3">Produto</th>
              <th className="py-2.5 px-3">Meio / Parcelas</th>
              <th className="py-2.5 pr-3 text-right">Bruto</th>
              <th className="py-2.5 pr-3 text-right">Taxa</th>
              <th className="py-2.5 pr-3 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[var(--color-mute)]">
                  Nenhuma transação encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              pageItems.map((t) => {
                const dateObj = new Date(t.approved_at);
                const dateFmt = dateObj.toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                });
                const timeFmt = dateObj.toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <tr
                    key={t.transaction_code}
                    className="hover:bg-[var(--color-surface)]/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono font-medium text-[var(--color-ink)] whitespace-nowrap">
                      {t.transaction_code}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[var(--color-mute)] font-mono text-[11px]">
                      <span>{dateFmt}</span>{" "}
                      <span className="text-[var(--color-mute-soft)]">{timeFmt}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[var(--color-ink)] truncate max-w-[170px]" title={t.customer_name || t.customer_email}>
                        {t.customer_name || t.customer_email.split("@")[0]}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--color-mute)] truncate max-w-[170px]" title={t.customer_email}>
                        {t.customer_email}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="truncate max-w-[200px] font-medium text-[var(--color-ink)]" title={t.product_name}>
                        {t.product_name}
                      </div>
                      {t.is_recompra && (
                        <span className="inline-block rounded-full bg-[var(--color-oak-tint)] text-[var(--color-oak)] px-1.5 py-0.2 text-[9px] font-mono uppercase font-semibold">
                          Recompra
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-medium text-[var(--color-ink)]">{t.payment_type}</div>
                      <div className="font-mono text-[10px] text-[var(--color-mute)]">
                        {`${t.installments}x`}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono font-medium text-[var(--color-ink)] whitespace-nowrap">
                      {cf(t.bruto)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-[var(--color-clay)] whitespace-nowrap">
                      -{cf(t.taxa_hotmart)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono font-semibold text-[var(--color-good)] whitespace-nowrap">
                      {cf(t.liquido)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-[var(--color-mute)]">
            Página <strong className="text-[var(--color-ink)]">{currentPage}</strong> de{" "}
            <strong className="text-[var(--color-ink)]">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-[var(--color-line)] bg-white px-2.5 py-1 font-mono text-xs text-[var(--color-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface)] transition"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-[var(--color-line)] bg-white px-2.5 py-1 font-mono text-xs text-[var(--color-ink)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-surface)] transition"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
