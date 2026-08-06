-- Faixa de valor da função (rate_level): A/B ou Tipo 1/Tipo 2
-- Pedido: slides 8 e 10 do deck "Ações de melhoria APP LI".
--
-- Duas funções precisam de mais de um valor e a estrutura é idêntica:
--
--   cenotécnica (slide 8)  — FREELA LOCAL (A) R$ 315,00/dia · (B) R$ 250,00/dia
--   percurseiro (slide 10) — tipo 1 R$ 1.129,26 · tipo 2 R$ 1.266,67
--
-- Por isso um campo só, e não um por função. O rótulo exibido muda conforme a
-- função (Nível A/B ou Tipo 1/2); o dado é o mesmo.
--
-- Conferido no banco antes de decidir: em "cenotecnica local" os dois valores
-- de diária dominantes são R$ 150,00 (149 inclusões) e R$ 200,00 (132), ou seja,
-- a prática das duas faixas já existia — digitada à mão, sem nome nem
-- estrutura. Em "percurso", a diária casa está R$ 1.129,76, praticamente o total
-- do motoqueiro tipo 1 do slide 10, o que indica que o pacote fechado foi
-- colocado no campo de diária.
--
-- APLICAR ANTES OU JUNTO COM O DEPLOY. Sem a coluna, todo SELECT de
-- team_inclusions falha e derruba praticamente todas as telas.
--
-- NÃO usar "npm run db:push": o snapshot em migrations/meta está defasado.

BEGIN;

ALTER TABLE team_inclusions
  ADD COLUMN IF NOT EXISTS rate_level text;

COMMIT;

-- Escalações existentes ficam com o campo nulo e valem como faixa "a", que é o
-- padrão. A escolha só aparece nas funções que têm mais de uma faixa; nas
-- demais o campo permanece nulo.

-- Conferência:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'team_inclusions' AND column_name = 'rate_level';
