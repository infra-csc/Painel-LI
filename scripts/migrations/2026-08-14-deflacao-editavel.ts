/**
 * Migração — fatores de deflação editáveis (percentuais inteiros). Idempotente.
 *   npx tsx scripts/migrations/2026-08-14-deflacao-editavel.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const statements: string[] = [
  `INSERT INTO system_settings (key, value) VALUES ('deflacao_fator_ate_4', '100') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('deflacao_fator_5_8', '90') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('deflacao_fator_9_mais', '80') ON CONFLICT (key) DO NOTHING`,
];
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) { process.stdout.write(`-> ${sql.slice(0,70)}... `); const r = await pool.query(sql); console.log("ok" + (r.rowCount != null ? ` (${r.rowCount})` : "")); }
  await pool.end(); console.log("Migração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
