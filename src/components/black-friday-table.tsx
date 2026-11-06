"use client";

import { useState, useMemo } from "react";
import type { BFTransaction } from "@/lib/black-friday-data";
import { cf, nf } from "@/components/ui";

interface Props {
  transacoes: BFTransaction[];
}

export function BlackFridayTable({ transacoes }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCanal, setSelectedCanal] = useState("TODOS");
  const [selectedPayment, setSelectedPayment] = useState("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const canais = useMemo(() => {
    const set = new Set<string>();
    transacoes.forEach((t) => set.add(t.parsedSck.canal || "Sem rastreio"));
    return ["TODOS", ...Array.from(set).sort()];
  }, [transacoes]);

  const payments = useMemo(() => {
    const set = new Set<string>();
    transacoes.forEach((t) => set.add(t.paymentType));
    return ["TODOS", ...Array.from(set).sort()];
  }, [transacoes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return transacoes.filter((t) => {
      const canal = t.parsedSck.canal || "Sem rastreio";
      if (selectedCanal !== "TODOS" && canal !== selectedCanal) return false;
      if (selectedPayment !== "TODOS" && t.paymentType !== selectedPayment) return false;
      if (!q) return true;

      return (
        t.code.toLowerCase().includes(q) ||
        t.cliente.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        (t.ofertaNome && t.ofertaNome.toLowerCase().includes(q)) ||
        (t.trackingSource && t.trackingSource.toLowerCase().includes(q)) ||
        canal.toLowerCase().includes(q)
      );
    });
  }, [transacoes, search, selectedCanal, selectedPayment]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  return (
    <div className="flex flex-col gap-4">
      {/* Controles de busca e filtro */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar por cliente, e-mail, código ou SCK..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-[var(--color-line-strong)] bg-white px-3.5 py-2 text-xs sm:text-sm text-[var(--color-ink)] placeholder-[var(--color-mute-soft)] transition focus:border-[var(--color-oak)] focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-2.5 text-xs text-[var(--color-mute)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de Canal */}
          <select
            value={selectedCanal}
            onChange={(e) => {
              setSelectedCanal(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-[var(--color-line-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-oak)] focus:outline-none"
          >
            <option value="TODOS">Todos os canais ({transacoes.length})</option>
            {canais.filter((c) => c !== "TODOS").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Filtro de Pagamento */}
          <select
            value={selectedPayment}
            onChange={(e) => {
              setSelectedPayment(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-[var(--color-line-strong)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-oak)] focus:outline-none"
          >
            <option value="TODOS">Todos os pagamentos</option>
            {payments.filter((p) => p !== "TODOS").map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-white shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
              <th className="py-2.5 px-3">Data / Hora</th>
              <th className="py-2.5 pr-3">Cliente</th>
              <th className="py-2.5 pr-3">Produto / Oferta</th>
              <th className="py-2.5 pr-3">Rastreio (SCK)</th>
              <th className="py-2.5 pr-3">Pagamento</th>
              <th className="py-2.5 pr-3 text-right">Oferta</th>
              <th className="py-2.5 pr-3 text-right">Líquido</th>
              <th className="py-2.5 pr-3 text-right">Transação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-xs text-[var(--color-mute)]">
                  Nenhuma transação encontrada com os filtros aplicados.
                </td>
              </tr>
            ) : (
              pageItems.map((t) => {
                const isParcelado = t.paymentType === "Parcelado Hotmart";
                const msg = t.parsedSck.campanha || t.parsedSck.anuncio;

                return (
                  <tr key={t.code} className="hover:bg-[var(--color-surface)]/60 transition-colors">
                    <td className="py-3 px-3 font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                      {new Date(t.approved_at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="py-3 pr-3 max-w-[200px]">
                      <div className="font-medium text-[var(--color-ink)] truncate" title={t.cliente}>
                        {t.cliente}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--color-mute)] truncate" title={t.email}>
                        {t.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <div className="font-medium text-[var(--color-ink)] text-xs">
                        {t.produto}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.ofertaNome && (
                          <span className="font-mono text-[10px] text-[var(--color-oak)] bg-[var(--color-oak-tint)] px-1.5 py-0.2 rounded">
                            {t.ofertaNome}
                          </span>
                        )}
                        {t.isRecompra ? (
                          <span className="font-mono text-[9px] uppercase font-semibold text-[var(--color-oak)]">
                            Recompra
                          </span>
                        ) : (
                          <span className="font-mono text-[9px] uppercase text-[var(--color-mute-soft)]">
                            1ª compra
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 pr-3 max-w-[180px]">
                      <div className="font-medium text-xs text-[var(--color-ink)] truncate" title={t.parsedSck.canal}>
                        {t.parsedSck.canal}
                      </div>
                      {msg && (
                        <div className="font-mono text-[10px] text-[var(--color-mute)] truncate" title={msg}>
                          {msg}
                        </div>
                      )}
                      {!msg && t.trackingSource && t.trackingSource !== "direct" && (
                        <div className="font-mono text-[10px] text-[var(--color-mute)] truncate" title={t.trackingSource}>
                          {t.trackingSource}
                        </div>
                      )}
                    </td>

                    <td className="py-3 pr-3 whitespace-nowrap">
                      <div className="text-xs font-medium text-[var(--color-ink)]">
                        {t.paymentType}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--color-mute)]">
                        {isParcelado ? `${t.installments}x (Parcelado)` : t.installments > 1 ? `${t.installments}x` : "à vista"}
                      </div>
                    </td>

                    <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-ink)] whitespace-nowrap">
                      {cf(t.precoOferta)}
                      {t.bruto > t.precoOferta && (
                        <span className="block text-[10px] text-[var(--color-mute-soft)]" title="Valor pago com juros">
                          {cf(t.bruto)}
                        </span>
                      )}
                    </td>

                    <td className="py-3 pr-3 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                      {cf(t.liquido)}
                    </td>

                    <td className="py-3 pr-3 text-right font-mono text-xs text-[var(--color-mute)] whitespace-nowrap">
                      {t.code}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação e contagem */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-1 text-xs text-[var(--color-mute)]">
        <div>
          Mostrando <strong className="text-[var(--color-ink)]">{pageItems.length}</strong> de{" "}
          <strong className="text-[var(--color-ink)]">{filtered.length}</strong> vendas filtradas
          {filtered.length !== transacoes.length && ` (total geral: ${transacoes.length})`}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded border border-[var(--color-line)] px-2.5 py-1 text-xs transition disabled:opacity-40 hover:bg-white"
            >
              Anterior
            </button>
            <span className="px-2 font-mono text-xs">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded border border-[var(--color-line)] px-2.5 py-1 text-xs transition disabled:opacity-40 hover:bg-white"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
