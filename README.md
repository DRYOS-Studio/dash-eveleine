# Captação Versalhes — dashboard enxuta

Dashboard Next.js **mínima**, três páginas, só leitura e auth por senha única.
Versão reduzida do [Funis do Altis](https://github.com/rafaelemeth/funis-do-altis).

- **`/` — Captação:** funil de inscrição (quantos iniciaram, terminaram, agendaram call),
  com quebra por formulário, geografia e UTM. Fonte: Supabase.
- **`/agenda` — Agenda:** o que acontece *depois* do agendamento — reuniões do dia,
  qualificação por score (Score 10 e Score 3), no-show (também por score), cancelamentos, por agenda e por anfitrião. Fonte: API do Calendly,
  enriquecida pelo Supabase (inclusive a `lead_no_shows`, que marca as faltas).
- **`/vendas` — Vendas:** receita e caixa, origem (UTM, funil, score do lead), time comercial
  (closer × no-show do anfitrião), forma de pagamento e contrato. Fonte: tabela
  `vendas_versalhes` do Supabase.

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
| nome do convidado (só dos eventos **sem lead**) | `GET /scheduled_events/{uuid}/invitees` | **1 request POR evento** |

O **no-show não vem do Calendly**: vem da tabela `lead_no_shows` (deals `No-show` do CRM),
ligada à reunião por e-mail/telefone — ver `reunioesEmFalta` em `src/lib/agenda.ts`. Os
invitees só servem para o nome na lista nominal **dos eventos sem lead** (quando o evento casa
com uma resposta de formulário, o nome vem do banco — 93% dos eventos em 2026-11-03), e
**não existe listagem org-wide de invitees** (`/invitees` é POST-only, da Scheduling API). Por isso a página renderiza em duas
camadas: o barato sai na hora, e o bloco de presença entra depois via `<Suspense>`.

O que torna a visão do mês viável sem banco próprio é o **Data Cache**: cada evento é uma
entrada independente, com TTL pela idade — 24 h se terminou há mais de 7 dias, 1 h se é
recente, 5 min se é futuro. O mês custa caro **uma vez**; nas recargas só os dias quentes
voltam à API.

O limite de requisições da Calendly não está declarado no OpenAPI e não foi possível
confirmá-lo na documentação pública — o cliente usa teto de concorrência 5, respeita
`Retry-After` e faz backoff, em vez de assumir um número.

### Limites conhecidos

- **Remarcação quebra o cruzamento.** Quem remarca gera evento novo no Calendly; a linha do
  banco guarda o UUID **antigo**. A reunião aparece certa (a fonte é o Calendly), mas sem
  formulário/UTM — cai em `(fora do funil)`, junto de quem marcou direto pelo link.
- **A página mostra nomes.** A Captação só mostra agregados; a lista de reuniões é nominal.
  Sem e-mail e sem telefone, e atrás da mesma senha.
- **O no-show depende da `lead_no_shows`**, que só tem deals de 22/10/2026 em diante (janelas
  que cruzam essa data têm taxa subestimada) e é ligada à reunião por e-mail/telefone, de forma
  aproximada. Tem RLS sem policy para anon: **exige `SUPABASE_SERVICE_ROLE_KEY` de verdade** —
  com chave `anon` a leitura volta vazia, sem erro, e presença aparece como "—".

## Vendas (página `/vendas`)

Lê `vendas_versalhes` (espelho do board comercial; dados desde 27/10/2026) em `src/lib/vendas.ts`.
Contas e leitura dos campos: [manual do produto](docs/manual-do-produto.md#vendas--receita-origem-e-time-comercial).

- **PII:** a tabela guarda documento, endereço, nascimento e comprovantes. O `select` lista só
  as colunas que viram agregado (`COLS` em `vendas.ts`); o e-mail entra em memória, para ligar
  a venda ao lead, e nunca é renderizado. Não adicione colunas sensíveis ao `COLS`.
- **RLS sem policy para anon:** exige `SUPABASE_SERVICE_ROLE_KEY` de verdade. Com chave `anon`
  a tabela volta vazia, sem erro — a página detecta (contagem total = 0) e mostra um card de
  aviso em vez de zeros.
- **Venda → lead é só por e-mail** (`getLeadsPorEmail`, em lotes de 100). O telefone exigiria
  varrer a view inteira (22 mil linhas) e só acrescentaria 2 de 33 vendas.
- **`VALOR_MIN = 100`:** venda com faturamento abaixo disso conta no total, mas fica fora de
  receita, ticket e rankings (valor do contrato ainda não preenchido no board).
- **Closer × no-show:** `getPresencaPorHost` (`agenda.ts`) conta reuniões concluídas e faltas
  por anfitrião só com a listagem de eventos — sem o fan-out de invitees. A janela de reuniões
  começa no dia da **primeira venda** da janela (não no início do filtro): listar eventos custa
  ~1 s por 100 e a tabela só tem vendas desde 27/10. A tabela de closers é streamada em
  `<Suspense>`: as vendas aparecem na hora e as colunas da Agenda chegam depois. Closer e anfitrião
  são ligados por `chaveNome` (`nomes.ts`): acento, caixa, pontuação e espaço. **Sem
  similaridade, de propósito** — "Thaise Vianna" e "Thais Santos" são pessoas diferentes.
- Se o Calendly estiver sem token ou fora do ar, a página segue e o no-show do closer vira `—`.

## Cache

As leituras do Supabase (`getLeads`, a cola evento→lead, os deals de no-show, `getVendas`) e a
presença por anfitrião passam por `unstable_cache` com **`CACHE_S = 60`** (`src/lib/data.ts`): uma
visita repetida não repagina a view inteira. Passados 60 s o Next serve o valor guardado na hora
e o renova em segundo plano (stale-while-revalidate): a visita seguinte já vê o dado novo, mas a
**primeira depois de um intervalo longo pode mostrar números antigos** — não é um teto de 60 s.

A listagem de eventos do Calendly é cacheada em `agenda.ts` (`eventosCarimbados`, **5 min**,
`TTL_LISTAGEM_S`); `listarEventos` em `calendly.ts` não usa cache de `fetch`, de propósito: um
cache ali faria o carimbo de hora afirmar um frescor que a resposta não tem. Os invitees
(nome de quem não veio de formulário) mantêm o TTL por idade do evento. A `/agenda` em si
(`getAgenda`/`getPresenca`) não é cacheada; o que ela lê, é.

**Aquecimento.** As chaves do cache incluem a data da janela, então à 00:00 de São Paulo todas
viram chaves novas. O cron do `vercel.json` (`5 3 * * *`, 03 UTC; no plano Hobby dispara em algum
momento dessa hora) chama `GET /api/warm`, que roda as mesmas funções cacheadas das páginas para
os filtros predefinidos — menos "Hoje" de Captação e Vendas (aquecido à 00:05 mostraria ~0 na
1ª visita da manhã; frio custa < 1 s). Período personalizado continua frio na 1ª visita.
Depois de um deploy, aquecer na mão:
`curl -H "Authorization: Bearer $CRON_SECRET" https://<domínio>/api/warm`.

**Auth.** A validação do cookie mora no `middleware.ts`: layout e página renderizam em paralelo,
então um redirect no layout chegava depois de a página já ter posto os dados no corpo.

**Carimbo de hora.** Cada tela mostra "Atualizado em dd/mm às HH:mm (há N min)"
(`Atualizado`, em `ui.tsx`). O carimbo (`geradoEm`) viaja **dentro** do valor em cache — é o
momento em que o dado foi lido, não o da visita — e na Agenda é o mais antigo entre a
listagem do Calendly e a cola evento→lead. O aviso "recarregue" só aparece quando o dado
passou do prazo da própria fonte (`validoS`: 60 s no banco, 5 min no Calendly), porque aí
a visita já disparou a renovação. Os deals de no-show seguem o mesmo cache de 60 s, mas não
entram no carimbo da Agenda.

## Rodar local

1. `cp .env.example .env.local` e preencha:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — do projeto de leads (nunca `NEXT_PUBLIC_`)
   - `DASHBOARD_PASSWORD` — senha de acesso
   - `AUTH_SECRET` — string aleatória longa (ausente = erro, sem fallback)
   - `CALENDLY_TOKEN` — Personal Access Token de admin/owner (a `/agenda` exige; a `/vendas` usa só para o no-show do closer e segue sem ele)
   - `CALENDLY_ORG_URI` — opcional; vazio = descoberto via `GET /users/me`
   - `CRON_SECRET` — segredo do cron de aquecimento (ausente = `/api/warm` responde 401)
2. `npm install && npm run dev` → http://localhost:3000

## Deploy (Vercel)

Novo projeto Vercel apontando pro repo, com as 6 env vars obrigatórias acima
(`CALENDLY_ORG_URI` é opcional). Push no branch de produção redeploya.

## Estrutura

```
src/
  lib/
    supabase.ts   client service_role, server-only
    auth.ts       senha única (HMAC), sem fallback inseguro
    data.ts       getLeads(period) → funil + quebras · getLeadsByCalendlyEvent() → a cola
    calendly.ts   client da API v2: paginação, teto de concorrência, TTL por idade
    agenda.ts     getAgenda() (camada barata) + getPresenca() (o fan-out caro) + getPresencaPorHost() (sem fan-out)
    vendas.ts     getVendas(period) → receita, quebras e closer × no-show
    nomes.ts      chaveNome()/canonizar(): mesma pessoa, grafia diferente (acento, caixa, espaço)
    theme.ts      paleta de barras
    constants.ts  nome do cookie
  components/
    ui.tsx        peças usadas por mais de uma página (Tile, Card, Delta, FiltroPeriodo…)
  middleware.ts   valida o cookie (HMAC) antes de qualquer render; libera /login, /api/login, /api/logout, /api/warm
  app/
    layout.tsx            shell + fontes
    login/ + api/login/logout   auth
    (app)/layout.tsx      isAuthenticated() como 2ª linha + navegação
    api/warm/route.ts     aquece o cache dos filtros predefinidos (cron, Bearer CRON_SECRET)
    (app)/page.tsx        Captação — o funil
    (app)/agenda/page.tsx Agenda — reuniões, presença, cancelamento
    (app)/vendas/page.tsx Vendas — receita, origem, time comercial, pagamento
```

## Invariantes herdados do Funis

- Acesso ao banco **só no servidor** (`supabase.ts` = `server-only`); key nunca vai pro browser.
- Fuso `America/Sao_Paulo` nos limites de período (`resolveRange`).
- PostgREST corta em 1000 linhas → `getLeads` pagina com `.range()` + ordenação estável
  `(origin, id)`.
