-- 30/10/2026 — Painéis › Atividade recente: as últimas mudanças de TODAS as
-- vagas, por data (GET /api/paineis/atividade). Também sobe pelo
-- server/ensure-schema.ts no boot (o caminho normal é publicar); este arquivo é
-- para rodar à mão antes, se quiser. Este app NÃO tem db:push (docs/migracoes.md).
CREATE INDEX IF NOT EXISTS team_inclusion_logs_created_idx ON team_inclusion_logs (created_at DESC);
