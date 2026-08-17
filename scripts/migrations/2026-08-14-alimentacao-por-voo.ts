/**
 * Migração — alimentação automatizada por voo. Idempotente.
 * - tickets.actual_arrival_time: horário de CHEGADA da ida (a regra de
 *   alimentação depende dele; a tabela só tinha horários de partida)
 * - 4 chaves flat de refeição (slide: Demais 40/40, Cenotécnica 35/35)
 *   npx tsx scripts/migrations/2026-08-14-alimentacao-por-voo.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const statements: string[] = [
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS actual_arrival_time text`,
  `INSERT INTO system_settings (key, value) VALUES ('alimentacao_almoco', '4000') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('alimentacao_jantar', '4000') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('alimentacao_almoco_ceno', '3500') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('alimentacao_jantar_ceno', '3500') ON CONFLICT (key) DO NOTHING`,
];
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) { process.stdout.write(`-> ${sql.slice(0,72)}... `); await pool.query(sql); console.log("ok"); }
  await pool.end(); console.log("Migração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
