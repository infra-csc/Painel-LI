-- Estado compartilhado entre instâncias (Painel-LI, 25/09/2026).
--
-- O autoscale sobe N instâncias do servidor; dois controles de segurança
-- viviam num Map em memória e valiam só para a instância que atendeu:
--   1. anti-reuso do JWT do SSO (o mesmo token criava sessão de novo em
--      outra instância dentro dos 10 min de vida);
--   2. rate limit de login/redefinição de senha (N × 30 tentativas por janela,
--      contador zerado a cada deploy).
-- Agora ambos vivem em duas tabelas pequenas, sem FK, limpas pelo próprio
-- servidor (linhas com expira_em no passado). Só CREATE TABLE IF NOT EXISTS —
-- pode rodar em produção sem parada. Espelho: shared/schema.ts
-- (ssoTokensUsados, rateLimits). O servidor também as cria no boot
-- (server/ensure-schema.ts), então rodar à mão é opcional.
--
--   psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-estado-compartilhado.sql

CREATE TABLE IF NOT EXISTS sso_tokens_usados (
  jti        text PRIMARY KEY,
  expira_em  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  chave      text PRIMARY KEY,
  hits       integer NOT NULL DEFAULT 0,
  expira_em  timestamptz NOT NULL
);
