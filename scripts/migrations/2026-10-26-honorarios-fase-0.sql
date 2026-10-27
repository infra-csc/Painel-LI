-- 26/10/2026 — Módulo de Honorários, Fase 0 (decisões do dono de 26/10 sobre
-- a reunião DP + Desenvolvimento de 21–22/10).
--  - events.ocultar_valores_colaborador: "não exibir valores" ao colaborador,
--    por evento, ligado até a OC (padrão LIGADO — eventos existentes ficam
--    ligados). Só o DP muda, no cabeçalho do evento da Pré-aprovação de
--    valores. Passa a valer na Fase 1 (portal do colaborador).
--  - honorarios_legado_concluidos: "Concluir em lote" do legado no Painel de
--    honorários (eventos que terminam antes da data de corte, 01/11/2026,
--    guardada em system_settings.honorarios_data_corte). Uma linha por
--    registro concluído fora do fluxo, com motivo, quem e quando. Nada da
--    prestação/nota/planejado muda nem é apagado.
--  - A pré-aprovação do DP usa colunas que JÁ existem em budget_planned
--    (status = 'pre_aprovado', approved_by, approved_at): sem DDL.
-- Aditiva e idempotente. Nenhuma coluna existente muda. O
-- server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.
ALTER TABLE events ADD COLUMN IF NOT EXISTS ocultar_valores_colaborador boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS honorarios_legado_concluidos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id text NOT NULL,
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  por_id varchar NOT NULL,
  por_nome text NOT NULL,
  em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS honorarios_legado_concluidos_linha_uq ON honorarios_legado_concluidos (linha_id);
CREATE INDEX IF NOT EXISTS honorarios_legado_concluidos_evento_idx ON honorarios_legado_concluidos (event_id);

-- 27/10 — budget_planned.team_inclusion_id: a vaga da linha do Planejado. Duas
-- vagas SEM colaborador na mesma função não têm chave colaborador|função única
-- e se desencontravam (casavam com a mesma linha). Nula em linha antiga: a
-- primeira pré-aprovação/envio da tela grava (shared/casamento-do-planejado.ts).
-- Vaga apagada → a coluna volta a nula (a linha do Planejado fica).
ALTER TABLE budget_planned ADD COLUMN IF NOT EXISTS team_inclusion_id varchar REFERENCES team_inclusions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS budget_planned_team_inclusion_idx ON budget_planned (team_inclusion_id);
