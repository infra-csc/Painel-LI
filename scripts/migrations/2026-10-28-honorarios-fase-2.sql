-- 28/10/2026 — Módulo de Honorários, Fase 2 em modo MANUAL (etapas 4 a 7, sem
-- integração com o M4): o DP registra a OC (individual ou em lote), o
-- colaborador (ou a produção) envia a NF com a OC, o DP confere OC × NF × CNPJ,
-- "Lançar no M4" é o PROGRAMADO e o DP marca como PAGO. As selfies da presença
-- são apagadas do storage depois do prazo de guarda (presenca_retencao_dias,
-- padrão 365 dias após o pagamento).
--  - budget_actual: nº/valor/data da OC, quem/quando/origem
--    ('manual' | 'lote' | 'm4' — o importador futuro do M4 grava nos mesmos
--    campos), justificativa quando o CNPJ não tem contrato ativo; data do
--    pagamento, quem/quando, observação e o comprovante (anexo, opcional).
--  - invoices: nº, valor e CNPJ da NOTA (a conferência do DP).
--  - presencas: foto_expurgada_em (a selfie saiu do storage; os horários ficam).
-- O lock da rotina diária do expurgo e o liga/desliga são chaves de
-- system_settings (presenca_expurgo_ultimo_dia, presenca_expurgo_automatico):
-- nenhuma linha é necessária.
-- Aditiva e idempotente; tudo nulo, sem NOT NULL. Nenhuma coluna existente
-- muda. O server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_numero text;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_valor integer;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_data date;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_registrada_em timestamptz;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_registrada_por varchar;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_origem text;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS oc_justificativa text;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS pago_em date;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS pago_registrado_por varchar;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS pago_registrado_em timestamptz;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS pagamento_obs text;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS pagamento_comprovante_id text;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nf_numero text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nf_valor integer;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nf_cnpj text;

ALTER TABLE presencas ADD COLUMN IF NOT EXISTS foto_expurgada_em timestamptz;
