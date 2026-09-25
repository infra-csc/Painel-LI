/**
 * Usuário de sistema (25/09) — a linha fixa de `users` que `team_inclusion_logs.user_id`
 * referencia quando uma vaga muda sem ator humano (server/storage/vagas.ts).
 *
 * Antes o literal 'system' era gravado e violava a FK para `users` que o
 * schema declara (em produção a FK nem existia — "FK latente" da auditoria
 * de 23/09). Inativo, status `approved` só para não aparecer na fila de
 * aprovação, e senha impossível (`!` não é hash bcrypt: `bcrypt.compare`
 * devolve false para qualquer entrada). Idempotente: `ON CONFLICT DO NOTHING`.
 *
 * Quem executa: server/ensure-schema.ts (todo boot, Neon) e
 * server/dev/pglite-schema.ts (testes e `dev:demo`). A migração
 * scripts/migrations/2026-09-25-integridade.sql tem o mesmo INSERT.
 */
import { USUARIO_SISTEMA } from "@shared/schema";

export { USUARIO_SISTEMA };

export const SQL_USUARIO_SISTEMA = `INSERT INTO users (id, email, password, name, role, status, is_active, must_change_password)
  VALUES ('${USUARIO_SISTEMA.id}', '${USUARIO_SISTEMA.email}', '!sem-login', '${USUARIO_SISTEMA.name}', '${USUARIO_SISTEMA.role}', 'approved', false, false)
  ON CONFLICT (id) DO NOTHING`;
