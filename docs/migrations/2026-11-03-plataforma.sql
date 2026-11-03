-- Origem da venda (plataforma de checkout). Todas as linhas existentes são da Hotmart.
-- Vendas da Eduzz (base histórica de ex-alunas) entram com plataforma = 'eduzz'.
-- Dash, webhook e recálculo de recompra leem só plataforma = 'hotmart' (ver CLAUDE.md).

alter table public.transactions
  add column if not exists plataforma text not null default 'hotmart';

alter table public.transactions drop constraint if exists transactions_plataforma_check;
alter table public.transactions
  add constraint transactions_plataforma_check check (plataforma in ('hotmart', 'eduzz'));

comment on column public.transactions.plataforma is
  'Plataforma onde a venda foi feita: hotmart | eduzz. Linhas Eduzz: transaction_code = EDZ<fatura>, product_id = eduzz-<id>, fonte_taxa = eduzz_csv, sem decomposição de taxa.';
