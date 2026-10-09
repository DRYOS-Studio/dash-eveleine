# Indicadores — o que cada número mede

Todos saem de `src/lib/sales-data.ts`. Base: vendas com `status = APPROVED` em `transactions`.
A decomposição de taxas vem da API/webhook da Hotmart (ver `CLAUDE.md`).
Se uma conta mudar, este arquivo mente até ser corrigido junto.

## Escopo e limites

- **Só vendas aprovadas.** O webhook da Hotmart só envia compra aprovada: reembolsos,
  chargebacks e contestações posteriores só saem dos números quando `scripts/backfill-hotmart-fees.js`
  reconcilia o status.
- **Período:** filtra por `approved_at`, em horário de São Paulo (UTC−3 fixo). Padrão: 30 dias.
  "7 dias" = hoje + 6 dias anteriores. O dia final de um intervalo personalizado entra inteiro.
- **Faturamento** = preço da oferta (`preco_oferta`), sem os juros de parcelamento que o comprador
  paga por fora. **Taxa Hotmart** = comissão exata da Hotmart (`taxa_hotmart_exata`).
  **Outras comissões** = co-produtor e add-on. **Líquido** = o que fica para a conta.
  Faturamento = Taxa Hotmart + Outras comissões + Líquido.
- **Só reais.** Vendas em moeda estrangeira não entram; a tela avisa quantas ficaram de fora.
- Vendas sem decomposição exata de taxa entram com o valor pago e taxa 0, e a tela avisa quantas são.
- **Cliente único** = e-mail distinto no período.

## Vendas & Retenção (`/`)

| Indicador | Conta |
|---|---|
| Ticket médio / mediana | Faturamento ÷ vendas; mediana do faturamento por venda |
| Clientes únicos → "com recompra" | E-mails com ao menos uma venda de recompra no período |
| Taxa de recompra | Clientes com recompra ÷ clientes únicos |
| Faturamento por cliente | Faturamento ÷ clientes únicos do período (não é LTV) |
| Cenário A "sem recompra" | Vendas com `is_recompra = false` |
| Cenário B "recompra" | Vendas com `is_recompra = true` |
| Participação da recompra | Líquido de B ÷ líquido total; B ÷ total de vendas |
| Famílias | Agrupado por `products.family`, ordenado por líquido |

**Recompra** = primeira compra de um produto por quem já tinha comprado **outro** produto
em instante anterior. Parcelas, repetições do mesmo produto e compras simultâneas
(mesmo `approved_at`) não contam. O campo é gravado pelo webhook, pelo import e por
`scripts/recalc-customer-history.js`, todos com essa regra.

## Financeiro (`/financeiro`)

| Indicador | Conta |
|---|---|
| Taxa Hotmart % | Taxa Hotmart ÷ faturamento (por meio de pagamento e por nº de parcelas no cartão) |
| Meios de pagamento | `payment_type` normalizado (`normalizePaymentMethod`); faturamento, taxa, outras comissões e líquido |
| Parcelado Hotmart | Vendas com meio "Parcelado Hotmart". No banco cada venda é uma parcela; `installments` é o tamanho do plano |
| Taxa no cartão | Taxa Hotmart ÷ faturamento por nº de parcelas (~9% em qualquer parcelamento) |
| Extrato | As 200 vendas mais recentes do período (a tela informa o total) |
