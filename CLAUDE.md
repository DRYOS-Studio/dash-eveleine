# Partiu Empreender — dash de vendas (Hotmart)

## Convenção: informação errada é pior que informação nenhuma

- Número na tela = calculado do banco. Sem valor fixo no JSX ("~72%", "83,7%").
- Texto interpretativo (insight, callout) só se a afirmação sair dos dados; senão, não existe.
- Rótulo tem de descrever exatamente o que a conta mede. Se o rótulo promete mais, renomeie.
- Dado que não dá para medir aparece como `—`, nunca `0` nem estimativa.
- Mudou regra de cálculo → grep da frase antiga em `src/`, `README.md` e `docs/`.

## Fatos do banco (verificados em 2026-10-09)

- Todos os `transaction_code` começam com `HP`; o prefixo não identifica boleto/parcela.
- `transactions` só tem `APPROVED`: a importação não trouxe estornos.
- `payment_type` é misto: import grava `Pix`/`Cartão de Crédito`, webhook grava `PIX`/`CREDIT_CARD`.
  A tela normaliza em `normalizePaymentMethod`.
- `utm_*` estão vazios em 100% das vendas.
- `installments` do Parcelado Hotmart é o tamanho do plano (constante por comprador+produto); cada linha é uma parcela.
- Webhook só traz compra aprovada. Sem comissão PRODUCER o webhook rejeita (422): não existe líquido estimado.

## Recompra

Regra única (webhook, import e `scripts/recalc-customer-history.js`): 1ª compra de um produto por quem já
tinha comprado OUTRO produto em instante anterior. Rodar o script (dry-run por padrão) após mexer na regra.
Definições dos indicadores em `docs/indicadores.md`.
