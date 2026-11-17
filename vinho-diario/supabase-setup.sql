-- =========================================================
-- VinoMemo — Script de Criação da Tabela no SUPABASE
-- Cole este código no "SQL Editor" do Supabase e clique em RUN
-- =========================================================

create table if not exists public.wines (
  id text primary key,
  cellar_id text not null default 'minha-adega-principal',
  name text not null,
  type text,
  grapes text,
  country text,
  vintage text,
  rating numeric(3,1),
  score10 numeric(3,1),
  tasting_date text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Índice para busca rápida pela sua adega
create index if not exists idx_wines_cellar_id on public.wines (cellar_id);

-- Habilita Row Level Security (RLS) com política de acesso via chave pública (anon)
alter table public.wines enable row level security;

drop policy if exists "Acesso total aos rótulos da adega" on public.wines;
create policy "Acesso total aos rótulos da adega"
  on public.wines
  for all
  to anon, authenticated
  using (true)
  with check (true);
