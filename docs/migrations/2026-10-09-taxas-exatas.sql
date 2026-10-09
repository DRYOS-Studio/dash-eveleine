-- Decomposição exata do valor pago (fonte: API/webhook da Hotmart).
-- Identidade (vendas em BRL):  bruto = (bruto − preco_oferta) + taxa_hotmart_exata + outras_comissoes + liquido
-- (bruto − preco_oferta) = juros de parcelamento pagos pelo comprador: não é do produtor e não é exibido.
-- `bruto` continua sendo o valor PAGO pelo comprador; `preco_oferta` é a oferta sem juros.
-- `taxa_hotmart` (legado) = bruto − líquido e NÃO é mais usada pelo app.

alter table public.transactions
  add column if not exists moeda               text,
  add column if not exists preco_oferta        numeric(12,2),
  add column if not exists taxa_hotmart_exata  numeric(12,2),
  add column if not exists outras_comissoes    numeric(12,2),
  add column if not exists fonte_taxa          text;

comment on column public.transactions.moeda              is 'Moeda da compra (price.currency_code). Só BRL entra nos totais.';
comment on column public.transactions.preco_oferta       is 'Preço da oferta sem juros de parcelamento (hotmart_fee.base).';
comment on column public.transactions.taxa_hotmart_exata is 'Comissão da Hotmart (hotmart_fee.total / MARKETPLACE).';
comment on column public.transactions.outras_comissoes   is 'Comissões de terceiros (co-produtor, afiliado, add-on): soma das comissões − a da conta.';
comment on column public.transactions.fonte_taxa         is 'api | webhook. NULL = ainda sem decomposição.';
