-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Projeto: VinoMemo — Diário de Rótulos, Adega Virtual & Memórias
-- Banco de Dados: PostgreSQL 15+ (Supabase)
-- Descrição: Cria a tabela principal `public.wines`, índices de performance
--            (B-Tree e GIN para JSONB), trigger de auditoria e políticas RLS.
-- =============================================================================

begin;

-- 1. Tabela Principal (Modelo Híbrido Relacional + Documento JSONB)
create table if not exists public.wines (
  id text primary key,                                      -- Chave composta: {cellar_id}__{wine_id}
  cellar_id text not null default 'minha-adega-principal',  -- Identificador lógico de partição da adega
  name text not null,                                       -- Nome do rótulo
  type text,                                                -- Estilo (Tinto, Branco, Rosé, Espumante, etc.)
  grapes text,                                              -- Casta(s) / Uva(s)
  country text,                                             -- País de origem
  vintage text,                                             -- Ano da safra
  rating numeric(3,1),                                      -- Avaliação em estrelas (1.0 a 5.0)
  score10 numeric(3,1),                                     -- Pontuação pessoal (0.0 a 10.0)
  tasting_date text,                                        -- Data da degustação (YYYY-MM-DD)
  payload jsonb not null,                                   -- Documento completo (status, sensory, fotos Base64, notas)
  updated_at timestamptz not null default now()             -- Timestamp UTC da última mutação (usado para LWW Sync)
);

-- 2. Índices de Performance e Engenharia de Dados
create index if not exists idx_wines_cellar_id
  on public.wines (cellar_id);

create index if not exists idx_wines_cellar_updated
  on public.wines (cellar_id, updated_at desc);

create index if not exists idx_wines_payload_gin
  on public.wines using gin (payload);

-- 3. Trigger para atualização automática de `updated_at`
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wines_updated_at on public.wines;
create trigger trg_wines_updated_at
  before update on public.wines
  for each row
  execute function public.fn_set_updated_at();

-- 4. Row Level Security (RLS)
alter table public.wines enable row level security;

drop policy if exists "Acesso total aos rótulos da adega" on public.wines;
create policy "Acesso total aos rótulos da adega"
  on public.wines
  for all
  to anon, authenticated
  using (true)
  with check (true);

commit;
