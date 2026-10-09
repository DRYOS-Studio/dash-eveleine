# Partiu Empreender — dash de vendas (Hotmart)

## Convenção: informação errada é pior que informação nenhuma

- Número na tela = calculado do banco. Sem valor fixo no JSX ("~72%", "83,7%").
- Texto interpretativo (insight, callout) só se a afirmação sair dos dados; senão, não existe.
- Rótulo tem de descrever exatamente o que a conta mede. Se o rótulo promete mais, renomeie.
- Dado que não dá para medir aparece como `—`, nunca `0` nem estimativa.
- Mudou regra de cálculo → grep da frase antiga em `src/`, `README.md` e `docs/`.

## Fatos do banco (verificados em 2026-10-09)

- Todos os `transaction_code` começam com `HP`; o prefixo não identifica boleto/parcela.
- `transactions.status` é `APPROVED`, exceto vendas que a API mostrou como reembolsadas/contestadas (o backfill reconcilia). O dash lê só `APPROVED`.
- `payment_type` é misto: import grava `Pix`/`Cartão de Crédito`, webhook grava `PIX`/`CREDIT_CARD`.
  A tela normaliza em `normalizePaymentMethod`.
- `utm_*` estão vazios em 100% das vendas.
- `installments` do Parcelado Hotmart é o tamanho do plano (constante por comprador+produto); cada linha é uma parcela.
- Webhook só traz compra aprovada. Sem comissão PRODUCER o webhook rejeita (422): não existe líquido estimado.

## Taxas (fonte: API/webhook da Hotmart)

- `bruto` = valor PAGO pelo comprador (com juros de parcelamento). Os juros não são do produtor e NÃO são exibidos.
- Dash usa `preco_oferta` como faturamento e `taxa_hotmart_exata` como taxa. `taxa_hotmart` (bruto − líquido) é legado e não deve ser exibida: mistura juros, comissões de terceiros e taxa.
- Identidade (vendas BRL): `bruto = (bruto − preco_oferta) + taxa_hotmart_exata + outras_comissoes + liquido`.
- A taxa é `oferta × % + fixo` com faixas que mudam no tempo (vistas em 2026-10-09: 9,9%+R$1 em 2024; 8,4%+R$1 desde 2025-06; 8,9%+R$1 desde 2026-09; 20% sem fixo nas ofertas ≤ R$ 10).
  Média ~9,3% da oferta; parcelar não altera a taxa. Co-produção reduz o líquido (`outras_comissoes`), não a taxa.
- O banco não guarda o percentual: o `/financeiro` classifica a faixa pelos valores (`FAIXAS_TAXA` em `sales-data.ts`). Nova combinação da Hotmart aparece como "Outra combinação" — adicionar a faixa na lista.
- Vendas em moeda estrangeira entram convertidas para BRL (`fonte_taxa = 'api_fx'`, valores já em BRL; a moeda original fica em `moeda`).
  Líquido = valor recebido em reais do relatório de vendas (CSV) da Hotmart — não existe na API. Estrangeiras sem isso ficam fora, com aviso.
  Para converter novas: exportar o CSV de vendas e rodar `scripts/backfill-foreign-sales.js <csv>` (dry-run por padrão).
- Vendas sem decomposição exata aparecem em aviso na tela.
- Rodar `scripts/backfill-hotmart-fees.js` (dry-run por padrão) periodicamente; o webhook já grava as vendas novas.

## Recompra

Regra única (webhook, import e `scripts/recalc-customer-history.js`): 1ª compra de um produto por quem já
tinha comprado OUTRO produto em instante anterior. Rodar o script (dry-run por padrão) após mexer na regra.
Definições dos indicadores em `docs/indicadores.md`.

## Pendências

Reembolsos, chargebacks e contestações ainda não aparecem no dash. Detalhes e passos em `docs/pendencias.md`.
