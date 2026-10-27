-- 26/10/2026 — Módulo de Honorários, Fase 0 (parte B): cadastro de
-- contratos (CNPJ) e dados de pagamento do colaborador.
--  - contratos: um por CNPJ (UNIQUE, só os 14 dígitos), com razão social,
--    tipo (mei/empresa/empreiteira), vigência, anexo (Object Storage, ACL só
--    do DP), encerramento e `versao` (trava de edição concorrente);
--  - contratos_colaboradores: N:N contrato × colaborador (empreiteira atende
--    vários; um colaborador pode ter mais de um CNPJ); cascade nos dois lados;
--  - contratos_historico: o que aconteceu com cada contrato (frases prontas);
--  - colaboradores_pagamento: banco/agência/conta/PIX CIFRADOS (AES-256-GCM,
--    chave no Secret PAGAMENTO_CHAVE) + tipo de conta, tipo do PIX, titular e
--    e-mail. Tabela À PARTE de `collaborators` para nenhuma rota de
--    colaborador vazar estes campos;
--  - colaboradores_pagamento_alteracoes: cada mudança com antes/depois
--    MASCARADOS; mudança de conta/PIX fica pendente de conferência (sino do DP).
-- Regras em shared/contratos.ts, shared/pagamento.ts e
-- shared/importacao-contratos.ts.
-- Aditiva e idempotente. Nenhuma coluna existente muda. O
-- server/ensure-schema.ts também cria tudo no boot (o caminho normal é
-- publicar); este arquivo é para rodar à mão antes, se quiser. Este app NÃO
-- tem db:push (docs/migracoes.md). Espelho: shared/schema.ts.
CREATE TABLE IF NOT EXISTS contratos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL,
  razao_social text NOT NULL,
  nome_fantasia text,
  tipo text NOT NULL DEFAULT 'empresa',
  vigencia_inicio date,
  vigencia_fim date,
  observacao text,
  anexo_id text,
  anexo_nome text,
  encerrado_em timestamptz,
  encerrado_por varchar,
  encerrado_por_nome text,
  motivo_encerramento text,
  versao integer NOT NULL DEFAULT 1,
  criado_por varchar,
  criado_por_nome text,
  atualizado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contratos_cnpj_uq ON contratos (cnpj);

CREATE TABLE IF NOT EXISTS contratos_colaboradores (
  contrato_id varchar NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  collaborator_id varchar NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contrato_id, collaborator_id)
);
CREATE INDEX IF NOT EXISTS contratos_colaboradores_colaborador_idx ON contratos_colaboradores (collaborator_id);

CREATE TABLE IF NOT EXISTS contratos_historico (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id varchar NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhes jsonb NOT NULL,
  por varchar,
  por_nome text NOT NULL,
  em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_historico_contrato_idx ON contratos_historico (contrato_id, em);

CREATE TABLE IF NOT EXISTS colaboradores_pagamento (
  collaborator_id varchar PRIMARY KEY REFERENCES collaborators(id) ON DELETE CASCADE,
  banco_cifrado text,
  agencia_cifrada text,
  conta_cifrada text,
  pix_chave_cifrada text,
  tipo_conta text,
  pix_tipo text,
  titular text,
  email text,
  versao integer NOT NULL DEFAULT 1,
  atualizado_por varchar,
  atualizado_por_nome text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS colaboradores_pagamento_alteracoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id varchar NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
  campos jsonb NOT NULL,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL,
  muda_conta boolean NOT NULL DEFAULT false,
  por varchar,
  por_nome text NOT NULL,
  em timestamptz NOT NULL DEFAULT now(),
  conferido_em timestamptz,
  conferido_por varchar,
  conferido_por_nome text
);
CREATE INDEX IF NOT EXISTS colaboradores_pagamento_alteracoes_colaborador_idx ON colaboradores_pagamento_alteracoes (collaborator_id, em);
CREATE INDEX IF NOT EXISTS colaboradores_pagamento_alteracoes_pendentes_idx ON colaboradores_pagamento_alteracoes (em) WHERE muda_conta AND conferido_em IS NULL;
