/**
 * Migração — horário de CHEGADA da volta na passagem (2026-08-27)
 *
 * O dono apontou no formulário: a ida tem "Chegada (ida)" — que alimenta a
 * regra de alimentação e a mobilidade —, mas a volta só tinha data e horário de
 * embarque. Sem a chegada da volta, a regra da tabela de mobilidade
 * "voo CHEGANDO das 20h às 5h → R$58" nunca era aplicada ao trecho de volta.
 *
 * Uma coluna opcional em `tickets`; passagens antigas seguem como estão (a
 * volta usa só o horário de partida, como sempre foi).
 *
 * Idempotente. Rodar manualmente:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-27-chegada-volta.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_arrival_time text`);
  console.log("  + tickets.return_arrival_time");
  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
