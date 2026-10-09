import type { SaleRecord } from "@/lib/sales-data";

const cf = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function LatestSalesFeed({ sales }: { sales: SaleRecord[] }) {
  if (!sales || sales.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-mute)]">
        Nenhuma venda no período selecionado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-mute-soft)]">
            <th className="py-2.5 px-3">Data / Hora</th>
            <th className="py-2.5 pr-4">Produto</th>
            <th className="py-2.5 pr-4">Cliente</th>
            <th className="py-2.5 pr-4">Tipo</th>
            <th className="py-2.5 pr-4">Pagamento</th>
            <th className="py-2.5 pr-4 text-right">Faturamento</th>
            <th className="py-2.5 pr-4 text-right">Líquido</th>
            <th className="py-2.5 pr-3 text-right">Transação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line)]">
          {sales.map((s) => (
            <tr key={s.transaction_code} className="hover:bg-[var(--color-surface)]/60 transition-colors">
              <td className="py-3 px-3 font-mono text-xs text-[var(--color-mute)]">
                {new Date(s.approved_at).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="py-3 pr-4">
                <span className="font-medium text-[var(--color-ink)]">{s.product_name}</span>
                {s.family && s.family !== s.product_name && (
                  <span className="block font-mono text-[11px] text-[var(--color-mute)]">{s.family}</span>
                )}
              </td>
              <td className="py-3 pr-4">
                <div className="text-sm font-medium text-[var(--color-ink)]">{s.customer_name || "Cliente"}</div>
                <div className="font-mono text-[11px] text-[var(--color-mute)]">
                  {s.customer_email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}
                </div>
              </td>
              <td className="py-3 pr-4">
                {s.is_recompra ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-oak)]/15 bg-[var(--color-oak-tint)] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-oak)]">
                    Recompra
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-mute)]">
                    Sem recompra
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 text-xs capitalize text-[var(--color-mute)]">
                {s.payment_type}
                {s.installments > 1 ? ` (${s.installments}x)` : ""}
              </td>
              <td className="py-3 pr-4 text-right font-mono text-xs whitespace-nowrap text-[var(--color-mute)]">
                {cf(s.bruto)}
              </td>
              <td className="py-3 pr-4 text-right font-mono text-xs font-semibold text-[var(--color-oak)] whitespace-nowrap">
                {cf(s.liquido)}
              </td>
              <td className="py-3 pr-3 text-right font-mono text-[11px] text-[var(--color-mute-soft)]">
                {s.transaction_code}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
