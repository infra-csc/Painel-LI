/**
 * Migração — índices de performance (2026-08-28)
 *
 * Auditoria de performance mediu no banco de produção (pg_stat_user_tables)
 * milhares de seq scans em tabelas consultadas por coluna sem índice. Cada
 * índice aqui cobre um filtro REAL usado pelas rotas quentes:
 *
 * - team_inclusions(phase, deleted_at): toda tela da Escala filtra por fase.
 * - team_inclusions(suggestion_sent_at): fila da Sugestão.
 * - scaling_change_requests(team_inclusion_id): change-window por vaga (a
 *   rota roda a cada modal aberto na Escalação).
 * - scaling_change_requests(event_id, status) e (status): filas de aprovação.
 * - swap_requests(team_inclusion_id): 6.733 seq scans medidos em prod.
 * - scaling_function_managers(user_id): roleFor roda em cada request da Escala.
 * - system_logs(entity_type, entity_id) e (created_at DESC): Histórico.
 *
 * Só CREATE INDEX IF NOT EXISTS — nenhum dado muda. Idempotente. Rodar:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-28-indices-performance.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const INDICES: [string, string][] = [
  ["team_inclusions_phase_idx", "team_inclusions (phase, deleted_at)"],
  ["team_inclusions_suggestion_sent_idx", "team_inclusions (suggestion_sent_at)"],
  ["scaling_change_requests_inclusion_idx", "scaling_change_requests (team_inclusion_id)"],
  ["scaling_change_requests_event_status_idx", "scaling_change_requests (event_id, status)"],
  ["scaling_change_requests_status_idx", "scaling_change_requests (status)"],
  ["swap_requests_inclusion_idx", "swap_requests (team_inclusion_id)"],
  ["scaling_function_managers_user_idx", "scaling_function_managers (user_id)"],
  ["system_logs_entity_idx", "system_logs (entity_type, entity_id)"],
  ["system_logs_created_idx", "system_logs (created_at DESC)"],
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const [nome, alvo] of INDICES) {
    await pool.query(`CREATE INDEX IF NOT EXISTS ${nome} ON ${alvo}`);
    console.log(`  + ${nome} em ${alvo}`);
  }
  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
