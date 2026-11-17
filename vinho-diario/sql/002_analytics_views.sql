-- =============================================================================
-- Migration: 002_analytics_views.sql
-- Projeto: VinoMemo — Camada Analítica (Data Mart Views)
-- Descrição: Views analíticas desnormalizando campos JSONB para consumo direto
--            em ferramentas de BI (Looker Studio, Metabase, Power BI) ou SQL.
-- =============================================================================

begin;

-- 1. View de Estoque da Adega Virtual (apenas garrafas em casa: status = 'cellar')
create or replace view public.vw_cellar_inventory as
select
  id,
  cellar_id,
  payload->>'id' as wine_id,
  name,
  type,
  grapes,
  country,
  vintage,
  coalesce((payload->>'quantity')::int, 1) as quantity,
  payload->>'cellarObs' as observation,
  updated_at
from public.wines
where coalesce(payload->>'status', 'tasted') = 'cellar';

-- 2. View Analítica de Vinhos Degustados e Avaliados (status = 'tasted')
create or replace view public.vw_tasted_analytics as
select
  id,
  cellar_id,
  payload->>'id' as wine_id,
  name,
  type,
  grapes,
  country,
  vintage,
  rating,
  score10,
  coalesce((payload->>'rebuy')::boolean, false) as would_rebuy,
  tasting_date,
  payload->>'location' as tasting_location,
  payload->>'companions' as companions,
  payload->>'occasion' as occasion,
  payload->>'pairing' as food_pairing,
  payload->>'notes' as review_notes,
  coalesce((payload->'sensory'->>'body')::numeric, 3) as sensory_body,
  coalesce((payload->'sensory'->>'tannin')::numeric, 3) as sensory_tannin,
  coalesce((payload->'sensory'->>'acidity')::numeric, 3) as sensory_acidity,
  coalesce((payload->'sensory'->>'sweetness')::numeric, 1) as sensory_sweetness,
  (payload->>'memoryPhoto' is not null and payload->>'memoryPhoto' <> '') as has_memory_photo,
  updated_at
from public.wines
where coalesce(payload->>'status', 'tasted') <> 'cellar';

-- 3. View Agregada de Perfil Enófilo por Adega, País e Estilo
create or replace view public.vw_palate_profile_summary as
select
  cellar_id,
  type,
  country,
  count(*) as total_wines_tasted,
  round(avg(rating), 2) as avg_star_rating,
  round(avg(score10), 2) as avg_score_10,
  round(avg(sensory_body), 2) as avg_body,
  round(avg(sensory_tannin), 2) as avg_tannin,
  round(avg(sensory_acidity), 2) as avg_acidity,
  round(avg(sensory_sweetness), 2) as avg_sweetness,
  sum(case when would_rebuy then 1 else 0 end) as favorites_count
from public.vw_tasted_analytics
group by cellar_id, type, country;

commit;
