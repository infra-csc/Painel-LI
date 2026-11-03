-- Dias de carregamento da vaga (deck de Honorários, reunião 29/10): datas
-- YYYY-MM-DD, subconjunto dos dias de trabalho. O dia marcado tem janta mesmo
-- sem logística (shared/alimentacao.ts). Também roda no boot (server/ensure-schema.ts).
ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS dias_carregamento text[];
