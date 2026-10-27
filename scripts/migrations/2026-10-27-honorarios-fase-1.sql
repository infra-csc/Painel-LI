-- 27/10/2026 — Módulo de Honorários, Fase 1: presença no evento e portal do
-- colaborador (ata de 22/10: "cada colaborador acessa o app com CPF e senha";
-- "check-in e check-out diários com selfie, horário e localização"; "o
-- produtor responsável faz o check-out final e submete ao DP").
--  - colaboradores_acesso: senha (bcrypt), código de primeiro acesso (hash,
--    72 h, uso único), bloqueio após 5 erros, aceite do termo LGPD.
--  - presencas: uma linha por prestação × dia (entrada/saída, selfie no
--    Object Storage, localização, quem registrou). UNIQUE (actual_id, dia).
--  - presenca_ocorrencias: falta, diária extra, horas extras, substituição
--    (remoção lógica).
--  - presenca_confirmacoes: confirmação final do colaborador (dias, valor
--    visto, CNPJ, contestação). UNIQUE actual_id.
--  - budget_actual: CNPJ/razão social do emissor, valor calculado, ajuste do
--    produtor em %, horas extras e o valor delas, quem/quando do check-out final.
-- As configurações novas (presenca_selfie_obrigatoria, presenca_localizacao,
-- hora_extra_divisor, produtor_ajuste_max_pct, presenca_termo_texto,
-- presenca_termo_versao, presenca_retencao_dias) têm padrão no código
-- (shared/presenca.ts): nenhuma linha em system_settings é necessária.
-- Aditiva e idempotente. Nenhuma coluna existente muda. O
-- server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.

ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS cnpj_emissor text;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS razao_social_emissor text;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS valor_calculado integer;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS ajuste_produtor_pct numeric(7,2);
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS horas_extras numeric(6,2) NOT NULL DEFAULT 0;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS valor_horas_extras integer NOT NULL DEFAULT 0;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS checkout_final_em timestamptz;
ALTER TABLE budget_actual ADD COLUMN IF NOT EXISTS checkout_final_por varchar;

CREATE TABLE IF NOT EXISTS colaboradores_acesso (
  collaborator_id varchar PRIMARY KEY REFERENCES collaborators(id) ON DELETE CASCADE,
  senha_hash text,
  codigo_hash text,
  codigo_expira_em timestamptz,
  codigo_gerado_por varchar,
  tentativas_falhas integer NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  termo_versao_aceita text,
  termo_aceito_em timestamptz,
  termo_aceito_ip text,
  ultimo_acesso_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presencas (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_id varchar NOT NULL REFERENCES budget_actual(id) ON DELETE CASCADE,
  event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  collaborator_id varchar NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
  dia date NOT NULL,
  checkin_em timestamptz,
  checkin_foto_id text,
  checkin_lat numeric(9,6),
  checkin_lng numeric(9,6),
  checkin_precisao_m integer,
  checkin_por text,
  checkin_user_id varchar,
  checkout_em timestamptz,
  checkout_foto_id text,
  checkout_lat numeric(9,6),
  checkout_lng numeric(9,6),
  checkout_precisao_m integer,
  checkout_por text,
  checkout_user_id varchar,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS presencas_actual_dia_uq ON presencas (actual_id, dia);
CREATE INDEX IF NOT EXISTS presencas_evento_dia_idx ON presencas (event_id, dia);
CREATE INDEX IF NOT EXISTS presencas_colaborador_idx ON presencas (collaborator_id);

CREATE TABLE IF NOT EXISTS presenca_ocorrencias (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_id varchar NOT NULL REFERENCES budget_actual(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  dia date,
  horas numeric(5,2),
  substituto_collaborator_id varchar REFERENCES collaborators(id) ON DELETE SET NULL,
  observacao text,
  criado_por varchar NOT NULL,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz,
  removido_por varchar
);
CREATE INDEX IF NOT EXISTS presenca_ocorrencias_actual_idx ON presenca_ocorrencias (actual_id);

CREATE TABLE IF NOT EXISTS presenca_confirmacoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_id varchar NOT NULL REFERENCES budget_actual(id) ON DELETE CASCADE,
  confirmado_por text NOT NULL,
  user_id varchar,
  collaborator_id varchar NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
  dias_confirmados text[] NOT NULL,
  valor_visto integer,
  cnpj text,
  razao_social text,
  contrato_id varchar REFERENCES contratos(id) ON DELETE SET NULL,
  contestacao text,
  confirmado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS presenca_confirmacoes_actual_uq ON presenca_confirmacoes (actual_id);
