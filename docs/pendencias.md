# Pendências

## Reembolsos, chargebacks e contestações no `/financeiro`

**Estado hoje:** o dash lê só `status = APPROVED` e não mostra nada sobre perdas. As telas não trazem aviso sobre isso.

**O que a API da Hotmart mostra** (consulta em 2026-10-09, histórico 2024 → 2026):

| Status na API | Vendas | No banco |
|---|---|---|
| `REFUNDED` | 169 | não estão (a importação do CSV só trouxe aprovadas/completas) |
| `CHARGEBACK` | 8 | não estão |
| `PROTESTED` (contestação) | 3 | estavam como `APPROVED` (vieram pelo webhook); o backfill passou para `PROTESTED` |
| `CANCELLED` | 757 | não estão (não chegaram a ser venda) |

Os valores em R$ dessas vendas ainda não foram calculados.

**Por que é lacuna contínua:** o webhook só recebe os eventos ativados no painel da Hotmart. Com só
`PURCHASE_APPROVED`, uma venda aprovada hoje e reembolsada amanhã continua `APPROVED` no banco. O
código do webhook já trata `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK` e `PURCHASE_DISPUTE`
(`src/app/api/webhooks/hotmart/route.ts`), mas o evento de contestação (`PROTESTED`) não está coberto.
`scripts/backfill-hotmart-fees.js` reconcilia o status de vendas já no banco (reembolso, chargeback,
contestação), mas só quando é rodado.

**Para fazer:**
1. Ativar no painel da Hotmart os eventos de reembolso, chargeback e contestação no webhook.
2. Tratar `PROTESTED` no webhook, hoje só o status que a API devolve é reconhecido pelo backfill.
3. Trazer para `transactions` as vendas `REFUNDED`/`CHARGEBACK`/`PROTESTED` do histórico (hoje fora do banco),
   com status e valores, para o `/financeiro` poder mostrá-las.
4. Definir o card no `/financeiro`: quantidade e valor perdido por tipo, e taxa de reembolso sobre as vendas
   do período. Decidir se o faturamento exibido passa a descontar essas vendas ou se elas ficam em linha à parte.

## Vendas da Eduzz: entram ou não nos números do dash

**Estado hoje:** 279 vendas da Eduzz (Empreenda com Tábuas, out/2023 a ago/2025) estão em `transactions` com `plataforma = 'eduzz'`
(`scripts/import-eduzz-sales.js`). Dash, webhook, recálculo de recompra e backfills leem só `plataforma = 'hotmart'`: nenhum número
publicado inclui a Eduzz.

**Para decidir (se unificar):**
1. Recompra e cohorte entre plataformas: a Eduzz tem 3 `product_id` para o mesmo curso, então a regra "outro produto" marcaria a renovação como recompra.
2. `/financeiro`: a Eduzz não decompõe a taxa (só `Ganho Liquido`, já com a co-produção descontada); precisa de regra própria.
3. Vendas estrangeiras da Eduzz: os valores parecem estar em reais (o mesmo `Ganho Liquido` se repete em EUR/USD/CHF/PEN para a mesma oferta); confirmar.
4. Trocar o filtro `PLATAFORMA` em `src/lib/sales-data.ts`, os 2 filtros do webhook e o do `recalc-customer-history.js`; rodar o recálculo.

