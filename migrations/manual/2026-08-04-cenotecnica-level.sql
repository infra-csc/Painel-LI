-- Nível do cenotécnico empreita: A (padrão) ou B
-- Pedido: slide 8 do deck "Ações de melhoria APP LI".
--
-- As tabelas de valor fechado separam FREELA LOCAL (A) de FREELA LOCAL (B), com
-- R$ 315,00 e R$ 250,00 por dia. Nada no sistema distinguia os dois: na prática
-- a diferença era digitada na diária, à mão. Conferido no banco — os dois
-- valores dominantes em cenotecnica local são R$ 150,00 (149 inclusões) e
-- R$ 200,00 (132 inclusões), ou seja, a prática dos dois níveis já existia sem
-- nome nem estrutura.
--
-- APLICAR ANTES OU JUNTO COM O DEPLOY. Sem a coluna, todo SELECT de
-- team_inclusions falha e derruba praticamente todas as telas.
--
-- NÃO usar "npm run db:push": o snapshot em migrations/meta está defasado.

BEGIN;

ALTER TABLE team_inclusions
  ADD COLUMN IF NOT EXISTS cenotecnica_level text;

COMMIT;

-- Escalações existentes ficam com o campo nulo e são tratadas como nível A, que
-- é o padrão. A escolha só aparece nas funções de cenotécnica; nas demais o
-- campo permanece nulo.

-- Conferência:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'team_inclusions' AND column_name = 'cenotecnica_level';
