# Captação Versalhes — dashboard enxuta

Dashboard Next.js **mínima**, duas páginas, só leitura e auth por senha única.
Versão reduzida do [Funis do Altis](https://github.com/rafaelemeth/funis-do-altis).

- **`/` — Captação:** funil de inscrição (quantos iniciaram, terminaram, agendaram call),
  com quebra por formulário, geografia e UTM. Fonte: Supabase.
- **`/agenda` — Agenda:** o que acontece *depois* do agendamento — reuniões do dia,
  no-show, cancelamentos, por agenda e por anfitrião. Fonte: API do Calendly, enriquecida
  pelo Supabase.

A definição de cada indicador — numerador, denominador e o que fica de fora — está no
[manual do produto](docs/manual-do-produto.md), escrito para quem lê a dash.

## Stack

- Next.js 15 (App Router) + React 19 · Tailwind CSS v4
- Supabase (`@supabase/supabase-js`) — acesso **só no servidor** (`service_role`)
- Auth por senha única (cookie de sessão assinado por HMAC)
- Gráficos são SVG montado no servidor, com `<title>` por marca e tabela-gêmea em
  `<details>` — nenhum valor fica só no hover. Nenhum componente é `"use client"`; a única
  coisa que o browser executa é o streaming do `<Suspense>` da `/agenda`

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

## Calendly (página `/agenda`)

O Supabase **não guarda nada de agendamento além do UUID**: a view expõe só `calendly_url`,
`calendly_event_id` e `calendly_invitee_id`. Horário, status, tipo de agenda e anfitrião
vivem exclusivamente na [API do Calendly v2](https://developer.calendly.com), que é a fonte
da página. O banco entra só para dizer de qual formulário/UTM veio cada reunião, cruzando
pelo `calendly_event_id`.

Exige um **Personal Access Token de admin/owner da organização** — sem esse papel,
`GET /scheduled_events?organization=…` devolve só os eventos do próprio usuário.

### O custo assimétrico que define o desenho

| Dado | Endpoint | Custo |
|---|---|---|
| status, início/fim, nome da agenda, anfitrião, cancelamento (e por quem) | `GET /scheduled_events` | **barato** — 100 por request, ~6 requests pro mês |
| **no-show**, nome do convidado | `GET /scheduled_events/{uuid}/invitees` | **1 request POR evento** |

`no_show` vive no *Invitee*, não no *Event*, e **não existe listagem org-wide de invitees**
(`/invitees` é POST-only, da Scheduling API). Por isso a página renderiza em duas camadas: o
barato sai na hora, e o bloco de presença entra depois via `<Suspense>`.

O que torna a visão do mês viável sem banco próprio é o **Data Cache**: cada evento é uma
entrada independente, com TTL pela idade — 24 h se terminou há mais de 7 dias (no-show já
estabilizou), 1 h se é recente, 5 min se é futuro. O mês custa caro **uma vez**; nas
recargas só os dias quentes voltam à API.

O limite de requisições da Calendly não está declarado no OpenAPI e não foi possível
confirmá-lo na documentação pública — o cliente usa teto de concorrência 5, respeita
`Retry-After` e faz backoff, em vez de assumir um número.

### Limites conhecidos

- **Remarcação quebra o cruzamento.** Quem remarca gera evento novo no Calendly; a linha do
  banco guarda o UUID **antigo**. A reunião aparece certa (a fonte é o Calendly), mas sem
  formulário/UTM — cai em `(fora do funil)`, junto de quem marcou direto pelo link.
- **A página mostra nomes.** A Captação só mostra agregados; a lista de reuniões é nominal.
  Sem e-mail e sem telefone, e atrás da mesma senha.
- **O no-show depende de o time marcar falta no Calendly.** Se ninguém marca, a métrica é
  zero legítimo — e indistinguível de zero por bug.

## Rodar local

1. `cp .env.example .env.local` e preencha:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — do projeto de leads (nunca `NEXT_PUBLIC_`)
   - `DASHBOARD_PASSWORD` — senha de acesso
   - `AUTH_SECRET` — string aleatória longa (ausente = erro, sem fallback)
   - `CALENDLY_TOKEN` — Personal Access Token de admin/owner (só a `/agenda` usa)
   - `CALENDLY_ORG_URI` — opcional; vazio = descoberto via `GET /users/me`
2. `npm install && npm run dev` → http://localhost:3000

## Deploy (Vercel)

Novo projeto Vercel apontando pro repo, com as 5 env vars obrigatórias acima
(`CALENDLY_ORG_URI` é opcional). Push no branch de produção redeploya.

## Estrutura

```
src/
  lib/
    supabase.ts   client service_role, server-only
    auth.ts       senha única (HMAC), sem fallback inseguro
    data.ts       getLeads(period) → funil + quebras · getLeadsByCalendlyEvent() → a cola
    calendly.ts   client da API v2: paginação, teto de concorrência, TTL por idade
    agenda.ts     getAgenda() (camada barata) + getPresenca() (o fan-out caro)
    theme.ts      paleta de barras
    constants.ts  nome do cookie
  components/
    ui.tsx        peças usadas pelas duas páginas (Tile, Card, Delta, FiltroPeriodo…)
  middleware.ts   gate por presença de cookie
  app/
    layout.tsx            shell + fontes
    login/ + api/login/logout   auth
    (app)/layout.tsx      guarda isAuthenticated() + navegação
    (app)/page.tsx        Captação — o funil
    (app)/agenda/page.tsx Agenda — reuniões, presença, cancelamento
```

## Invariantes herdados do Funis

- Acesso ao banco **só no servidor** (`supabase.ts` = `server-only`); key nunca vai pro browser.
- Fuso `America/Sao_Paulo` nos limites de período (`resolveRange`).
- PostgREST corta em 1000 linhas → `getLeads` pagina com `.range()` + ordenação estável
  `(origin, id)`.
