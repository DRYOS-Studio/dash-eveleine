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
- **Tudo em reais.** Vendas em moeda estrangeira entram convertidas para BRL pela cotação da compra que a
  Hotmart informa; o líquido é o valor que o vendedor recebeu em reais (a Hotmart paga em USD e converte).
  Nessas vendas, "Outras comissões" inclui também a diferença cambial. Estrangeiras ainda sem o valor
  recebido em reais ficam fora, e a tela avisa quantas são.
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
| Taxa por faixa de cobrança | Cada venda em reais é classificada pela combinação percentual + fixo (`oferta × % + fixo = taxa`, tolerância de 1 centavo). Faixas conhecidas em `FAIXAS_TAXA` (`sales-data.ts`); fora delas aparece "Outra combinação". Convertidas e sem taxa exata ficam em linhas à parte; o total fecha com o card de Taxa Hotmart |
| Taxa efetiva por faixa de preço | Taxa ÷ faturamento por faixa de preço da oferta (vendas em reais com taxa exata) |
| Produtos na faixa de maior percentual | Vendas da faixa de maior percentual do período, por família (só aparece com mais de uma faixa) |
| Taxa Hotmart % | Taxa Hotmart ÷ faturamento (por meio de pagamento e por nº de parcelas no cartão) |
| Meios de pagamento | `payment_type` normalizado (`normalizePaymentMethod`); faturamento, taxa, outras comissões e líquido |
| Parcelado Hotmart | Vendas com meio "Parcelado Hotmart". No banco cada venda é uma parcela; `installments` é o tamanho do plano |
| Taxa no cartão | Taxa Hotmart ÷ faturamento por nº de parcelas (~9% em qualquer parcelamento) |
| Extrato | As 200 vendas mais recentes do período (a tela informa o total) |

## Cohorte (`/cohorte`)

Sempre todo o histórico (sem filtro de período): LTV e intervalo só fazem sentido com a vida inteira do cliente.
Mesmas vendas, mesmo faturamento (oferta) e mesmo líquido das outras telas; contas em `src/lib/cohorte-calc.ts`
(testes: `node --test src/lib/cohorte-calc.test.ts`).

| Indicador | Conta |
|---|---|
| Faturamento e líquido por mês | Soma por mês de `approved_at` (São Paulo). Meses sem venda entram zerados; o mês corrente aparece como parcial |
| Clientes únicos do mês | E-mails distintos dentro do mês (não somam entre meses) |
| LTV médio / mediano | Soma do faturamento de todas as vendas do cliente (e-mail), em todo o histórico; média e mediana entre clientes. Não usa `customers.total_spent_*`: aquilo soma o valor pago, com juros |
| LTV líquido médio | Idem com o líquido |
| Sem recompra / Com recompra | Cliente sem / com ao menos uma venda `is_recompra`. "Com ÷ sem" = razão dos LTVs médios |
| Clientes por produtos distintos | Nº de `product_id` distintos que o cliente comprou (1, 2, 3, 4, 5+). Repetir produto e parcelas não contam |
| Intervalo de recompra | Um valor por cliente com recompra: dias corridos (São Paulo) da 1ª compra até a primeira venda de recompra. Mediana, média, percentis 25 e 75 (interpolação linear) e faixas |
| Coortes de aquisição | Safra = mês (São Paulo) da 1ª compra do cliente. "Recompra em 60/90 dias" = % da safra cuja 1ª recompra veio em até 60/90 dias corridos da 1ª compra. Só aparece (senão "—") quando o último dia do mês da safra já tem 60/90 dias; "até hoje" não tem janela. LTV até hoje = faturamento médio por cliente da safra |
| Porta de entrada | Agrupa por família da 1ª compra. Recompra até hoje = ao menos uma venda `is_recompra`. Recompra em 90 dias = só entre clientes com 90+ dias desde a 1ª compra (a tela mostra "de N"). Ticket de entrada = faturamento médio da 1ª compra. Cliente cuja 1ª compra teve mais de uma família no mesmo instante fica fora (a tela informa quantos) |
| Jornadas | Família da 1ª compra → família da 1ª recompra, um caminho por cliente. Fora: cliente cuja 1ª compra ou 1ª recompra teve mais de uma família no mesmo instante (a tela informa quantos). Mesma família aparece quando a recompra é de outro produto dela (outra edição) |
| Concentração | Clientes ordenados por LTV: % do faturamento total no top 1/5/10/20/50% (nº de clientes = teto de n × %). Famílias: 10 maiores por faturamento, % e % acumulado |
| Família × edição | Vendas, faturamento, líquido e % do líquido por par família + `products.edition` |

## Performance (`/performance`)

Vendas por origem de tráfego. **Só atribuição de vendas:** cliques, impressões e gasto com anúncios não estão no
banco (ROAS e CPA exigiriam a API do Meta Ads). Faturamento e líquido seguem a convenção do dash (oferta, em reais).

| Indicador | Conta |
|---|---|
| Com rastreio | Vendas cujo `tracking_source` (sck) informa uma origem. Sem sck, `null-null-…`, `undefined|…` ou só um código solto (`||||DCI04`) contam como "Sem rastreio" |
| Canal | Origem do sck. `metaads`, `Facebook-Ads` e `Meta-ads` viram "Meta Ads"; `direct`, `HOTMART_*` têm nome próprio; as demais aparecem como vêm (`trafego`, `ig`, `instagram`, `grp-new`…) |
| Campanha / anúncio / posicionamento | Campos do sck, na posição de cada template (`src/lib/sck.ts`). Só entram vendas rastreadas que informam o campo; a tela mostra quantas não informam |
| Top 15 | Campanhas e anúncios mostram as 15 maiores por faturamento; o restante soma em "(outros)" |

Limite conhecido: no formato `Facebook-Ads` de 4 partes, conjunto e campanha vêm colados no campo conjunto
(o separador tem espaço e não divide). Nesses casos a campanha fica vazia e o texto aparece como conjunto.
