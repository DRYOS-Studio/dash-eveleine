# Captação Versalhes — dashboard enxuta

Dashboard Next.js **mínima** do funil de inscrição: quantos iniciaram, terminaram e
agendaram call, com quebra por formulário, geografia e UTM, e filtro de período.
Versão reduzida do [Funis do Altis](https://github.com/rafaelemeth/funis-do-altis) —
só leitura e auth por senha única.

## Stack

- Next.js 15 (App Router) + React 19 · Tailwind CSS v4
- Supabase (`@supabase/supabase-js`) — acesso **só no servidor** (`service_role`)
- Auth por senha única (cookie de sessão assinado por HMAC)
- Sem JS de cliente: gráficos são SVG montado no servidor, com `<title>` por marca e
  tabela-gêmea em `<details>` — nenhum valor fica só no hover

## Identidade

O app roda no design system **Altis (Cortex)**, variante escura — terracota
`#d98153` como accent, Libre Caslon nos títulos, Inter no corpo. Os estágios do funil
usam um ramp ordinal de terracota (`#f0b48c` → `#d07f50` → `#a05531`) validado contra a
superfície escura: contraste, ΔL entre degraus e hue única.

A marca do cliente é o brasão **VM** em folha de ouro (`public/versalhes-crest.png`,
recortado do lockup original — o wordmark "VERSALHES MENTORIA" fica ilegível na altura do
header). Paleta de ouro medida do arquivo, para referência: claro `#e8d360`, médio
`#c08f28`, profundo `#96601a` — passa nos mesmos gates como ramp ordinal, caso um dia se
queira unificar marca e dados.

**Ouro é da marca; terracota é dos dados.** A separação é intencional: a logo identifica,
o gráfico mede. Cor de marca reutilizada como série vira categoria aos olhos de quem lê.
O original vetorial (`.eps`) está no Drive do cliente — se precisar de logo nítida em
tamanho grande, exportar SVG de lá, porque `.eps` não é conversível aqui.

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
