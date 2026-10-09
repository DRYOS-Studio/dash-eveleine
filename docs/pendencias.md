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
