# Eveleine · Captação — dashboard enxuta

Dashboard Next.js **mínima**: mostra apenas os **leads inscritos em formulários** e as
**origens** deles (`utm_source`), com filtro de período. Versão reduzida do
[Funis do Altis](https://github.com/rafaelemeth/funis-do-altis) — só leitura, 2 quebras e auth.

## Stack

- Next.js 15 (App Router) + React 19 · Tailwind CSS v4
- Supabase (`@supabase/supabase-js`) — acesso **só no servidor** (`service_role`)
- Auth por senha única (cookie de sessão assinado por HMAC)
- Sem gráficos client-side: as quebras são barras CSS renderizadas no servidor (SSR)

## Banco de dados

A fonte de leads fica num projeto Supabase de **outra org**. O app conecta por env vars em
runtime (não depende de MCP). A camada de leitura (`src/lib/data.ts`) lê a view
**`leads_consolidados`** (confirmada contra o banco-alvo em 2026-07-30), que é um `SELECT` sobre
a função `get_all_leads()` — union das tabelas `yay_<form_id>`, uma por formulário. Colunas
usadas: `form_id`, `form_name`, `utm_source`, `submitted_at`, `id`. Se o schema mudar, ajuste
só o bloco `SOURCE`/`COL` no topo de `data.ts`; o resto do código não depende do schema.

Notas do banco (verificadas, **não** alteradas por este app — que é 100% read-only):

- `id` **não** é único na view (sequência por tabela); o par `(form_id, id)` é — daí a
  ordenação de paginação.
- `form_name` vem `NULL` para formulários ausentes de `forms_names` (51 linhas hoje, 2
  form_ids) → a dash cai pro `form_id` como rótulo.
- A view é function-backed: cada request re-executa o union inteiro (~60 ms/página no plano
  atual, ~12 páginas em `range=all`). Sem índice pra empurrar filtro.
- `anon` tem `SELECT` na view, que roda `SECURITY DEFINER` (ignora RLS) → a anon key expõe
  todos os leads com PII. Não é config desta dash, mas vale revisar no projeto de origem.

## Rodar local

1. `cp .env.example .env.local` e preencha:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — do projeto de leads (nunca `NEXT_PUBLIC_`)
   - `DASHBOARD_PASSWORD` — senha de acesso
   - `AUTH_SECRET` — string aleatória longa (ausente = erro, sem fallback)
2. `npm install && npm run dev` → http://localhost:3000

## Deploy (Vercel)

Novo projeto Vercel apontando pro repo, com as 4 env vars acima. Push no branch de produção
redeploya.

## Estrutura

```
src/
  lib/
    supabase.ts   client service_role, server-only
    auth.ts       senha única (HMAC), sem fallback inseguro
    data.ts       getLeads(range) → { total, byForm, byOrigin }  ← única query
    theme.ts      paleta de barras
    constants.ts  nome do cookie
  middleware.ts   gate por presença de cookie
  app/
    layout.tsx            shell + fontes
    login/ + api/login/logout   auth
    (app)/layout.tsx      guarda isAuthenticated()
    (app)/page.tsx        a dashboard (total + por origem + por formulário)
```

## Invariantes herdados do Funis

- Acesso ao banco **só no servidor** (`supabase.ts` = `server-only`); key nunca vai pro browser.
- Fuso `America/Sao_Paulo` nos limites de período (`resolveRange`).
- PostgREST corta em 1000 linhas → `getLeads` pagina com `.range()` + ordenação estável
  `(origin, id)`.
