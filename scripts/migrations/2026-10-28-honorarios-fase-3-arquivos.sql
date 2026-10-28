-- 28/10/2026 — Módulo de Honorários, Fase 3 (arquivos): o arquivo de COMPRA de
-- créditos Flash (tela Cartão Flash) e o arquivo de OC do M4 com prestadores +
-- Flash (tela Ordens de compra), os dois em LAYOUT PROVISÓRIO até os oficiais
-- chegarem (shared/formatos-de-arquivo.ts).
--  - flash_compras: o LOTE de compra — nº único, período, evento (opcional),
--    se incluiu os créditos manuais, status ('gerado' | 'pago' | 'cancelado'),
--    formato do arquivo, totais, a fotografia dos itens por colaborador (jsonb,
--    SEM CPF), quem gerou/quando, o pago à Flash e o cancelamento (motivo).
--  - flash_movements.compra_id: o lote em que o crédito entrou (nulo = "a
--    comprar"); o mesmo crédito não entra em dois lotes. Cancelar o lote zera.
-- Aditiva e idempotente; nenhuma coluna existente muda e nenhum dado é
-- alterado (todo crédito existente nasce "a comprar"). O server/ensure-schema.ts
-- também cria tudo no boot (o caminho normal é publicar); este arquivo é para
-- rodar à mão antes, se quiser. Este app NÃO tem db:push (docs/migracoes.md).
-- Espelho: shared/schema.ts.

CREATE TABLE IF NOT EXISTS flash_compras (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  event_id varchar REFERENCES events(id) ON DELETE SET NULL,
  inclui_manuais boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'gerado',
  formato text NOT NULL,
  colaboradores integer NOT NULL,
  lancamentos integer NOT NULL,
  total_alimentacao_cents integer NOT NULL,
  total_mobilidade_cents integer NOT NULL,
  total_cents integer NOT NULL,
  itens jsonb NOT NULL,
  gerado_por varchar,
  gerado_por_nome text,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  pago_em date,
  pago_registrado_por varchar,
  pago_registrado_em timestamptz,
  cancelado_em timestamptz,
  cancelado_por varchar,
  cancelado_por_nome text,
  motivo_cancelamento text
);
CREATE UNIQUE INDEX IF NOT EXISTS flash_compras_numero_uq ON flash_compras (numero);
CREATE INDEX IF NOT EXISTS flash_compras_gerado_em_idx ON flash_compras (gerado_em);

ALTER TABLE flash_movements ADD COLUMN IF NOT EXISTS compra_id varchar REFERENCES flash_compras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS flash_movements_compra_idx ON flash_movements (compra_id);
