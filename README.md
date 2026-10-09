# Partiu Empreender — Inteligência de Vendas (DRYOS)

Dashboard de vendas da Hotmart. Duas telas, só leitura, acesso por senha única.

- **`/` — Vendas & Retenção:** faturamento, ticket, clientes únicos, compra única vs recompra,
  mix por família de produto, últimas 20 vendas, meios de pagamento e parcelamento.
- **`/financeiro` — Financeiro:** caixa e retenção da plataforma, eficiência por meio de
  pagamento, módulo Parcelado Hotmart, curva de parcelamento no cartão e extrato de vendas.

## Stack

- Next.js 15 (App Router) + React 19 · Tailwind CSS v4
- Supabase (`@supabase/supabase-js`) — acesso **só no servidor** (`service_role`)
- Deploy em Cloudflare Workers via `@opennextjs/cloudflare` (`wrangler.jsonc`)
- Auth por senha única; cookie `partiu_session` com HMAC

## Fluxo dos dados

1. **Histórico:** `scripts/import-hotmart-history.js` importa CSV/XLSX exportados da Hotmart;
   `scripts/recalc-customer-history.js` recalcula recompra e acumulados do cliente;
   `scripts/backfill-hotmart-fees.js` preenche taxa exata e comissões pela API da Hotmart.
2. **Tempo real:** a Hotmart chama `POST /api/webhooks/hotmart` (header `X-HOTMART-HOTTOK`).
   Cada evento é gravado em `webhook_events`; vendas aprovadas viram linhas em `transactions`.
3. **Leitura:** as telas leem `transactions` (apenas `status = APPROVED`) e `products`
   (família) em `src/lib/sales-data.ts`.

Tabelas: `transactions`, `products`, `customers`, `webhook_events`. Migrations em `docs/migrations/`.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` (e `.dev.vars` para o preview do Worker):

| Variável | Para quê |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Banco (nunca `NEXT_PUBLIC_`) |
| `HOTMART_HOTTOK` | Token do webhook |
| `DASHBOARD_PASSWORD` | Senha de acesso |
| `AUTH_SECRET` | Segredo do HMAC do cookie (ausente = erro, sem fallback) |
| `HOTMART_BASIC` | Credencial da API Hotmart (só os scripts) |

## Comandos

```
npm run dev       # local, http://localhost:3000
npm run preview   # build do Worker + preview local
npm run deploy    # build do Worker + deploy (Cloudflare)
```

## Convenção do projeto

**Informação errada é pior que informação nenhuma.** Todo número ou texto de interpretação
na tela vem do banco; o que não puder ser medido aparece como `—`, nunca como valor
estimado ou frase fixa. Ver `CLAUDE.md`; definições dos indicadores em `docs/indicadores.md`.

## Invariantes

- Acesso ao banco só no servidor (`src/lib/supabase.ts` é `server-only`).
- Fuso `America/Sao_Paulo` fixo em UTC−3 nos limites de período (`resolveDateRange`).
- PostgREST corta em 1000 linhas: `fetchTransactionsData` pagina em blocos de 1000.
