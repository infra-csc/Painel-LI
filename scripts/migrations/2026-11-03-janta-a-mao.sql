-- Janta lançada à mão no Planejado (revisão de 03/11). Também roda no boot.
ALTER TABLE budget_planned ADD COLUMN IF NOT EXISTS janta_a_mao_semana integer;
ALTER TABLE budget_planned ADD COLUMN IF NOT EXISTS janta_a_mao_fds integer;
