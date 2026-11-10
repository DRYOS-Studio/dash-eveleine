-- Documentação e estrutura opcional para auditoria de parcelas subsequentes do Parcelado Hotmart.
-- O dashboard calcula o isolamento de forma dinâmica em src/lib/sales-data.ts,
-- preservando 100% da receita em reais e isolando as parcelas de meses 2 a 12 dos tickets e contagens de novos clientes.

alter table public.transactions
  add column if not exists is_subsequent_installment boolean not null default false;

comment on column public.transactions.is_subsequent_installment is
  'true = parcela subsequente (mês 2 em diante) de um plano de Parcelado Hotmart do mesmo produto e cliente. false = compra integral ou 1ª parcela de adesão.';

-- Script de marcação retroativa no Postgres (opcional):
-- with ranked as (
--   select
--     transaction_code,
--     row_number() over (
--       partition by lower(trim(customer_email)), product_id
--       order by approved_at asc, transaction_code asc
--     ) as seq
--   from public.transactions
--   where plataforma = 'hotmart'
--     and status = 'APPROVED'
--     and (payment_type ilike '%parcelado%' or payment_type ilike '%installments%')
-- )
-- update public.transactions t
-- set is_subsequent_installment = (r.seq > 1)
-- from ranked r
-- where t.transaction_code = r.transaction_code;
