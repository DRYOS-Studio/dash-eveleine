# Indicadores — o que cada número mede

Todos saem de `src/lib/sales-data.ts`. Base: vendas com `status = APPROVED` em `transactions`.
Se uma conta mudar, este arquivo mente até ser corrigido junto.

## Escopo e limites

- **Só vendas aprovadas.** O webhook da Hotmart só envia compra aprovada: estornos e
  reembolsos não entram em nenhum número.
- **Período:** filtra por `approved_at`, em horário de São Paulo (UTC−3 fixo). Padrão: 30 dias.
  "7 dias" = hoje + 6 dias anteriores. O dia final de um intervalo personalizado entra inteiro.
- **Faturamento bruto** = valor da venda. **Líquido** = comissão do produtor.
  **Taxa Hotmart / Retenção** = bruto − líquido.
- **Cliente único** = e-mail distinto no período.

## Vendas & Retenção (`/`)

| Indicador | Conta |
|---|---|
| Ticket médio / mediana | Bruto ÷ vendas; mediana do bruto por venda |
| Clientes únicos → "com recompra" | E-mails com ao menos uma venda de recompra no período |
| Taxa de recompra | Clientes com recompra ÷ clientes únicos |
| Receita bruta por cliente | Bruto ÷ clientes únicos do período (não é LTV) |
| Cenário A "sem recompra" | Vendas com `is_recompra = false` |
| Cenário B "recompra" | Vendas com `is_recompra = true` |
| Participação da recompra | Líquido de B ÷ líquido total; B ÷ total de vendas |
| Famílias | Agrupado por `products.family`, ordenado por líquido |
| Parcelamento no cartão | Vendas em Cartão de Crédito por nº de parcelas (1x a 12x) |

**Recompra** = primeira compra de um produto por quem já tinha comprado **outro** produto
em instante anterior. Parcelas, repetições do mesmo produto e compras simultâneas
(mesmo `approved_at`) não contam. O campo é gravado pelo webhook, pelo import e por
`scripts/recalc-customer-history.js`, todos com essa regra.

## Financeiro (`/financeiro`)

| Indicador | Conta |
|---|---|
| Margem líquida | Líquido ÷ bruto |
| Meios de pagamento | `payment_type` normalizado (`normalizePaymentMethod`); eficiência = líquido ÷ bruto |
| Parcelado Hotmart | Vendas com meio "Parcelado Hotmart". No banco cada venda é uma parcela; `installments` é o tamanho do plano |
| Eficiência no cartão | Taxa média e líquido ÷ bruto por nº de parcelas |
| Extrato | As 200 vendas mais recentes do período (a tela informa o total) |
