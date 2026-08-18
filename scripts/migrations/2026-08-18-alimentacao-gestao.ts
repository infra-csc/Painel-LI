/**
 * Migração — alimentação por refeição para Key Account / Gerente. Idempotente.
 * Regra do usuário (18/08): "Executivo 40,00, Key/Gerente 44,00" — o
 * Executivo de Contas continua em "Demais" (R$ 40); Key Account e Gerente
 * passam a ter R$ 44 no almoço e no jantar (chaves alimentacao_*_gestao).
 *   npx tsx scripts/migrations/2026-08-18-alimentacao-gestao.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const statements: string[] = [
  `INSERT INTO system_settings (key, value) VALUES ('alimentacao_almoco_gestao', '4400') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('alimentacao_jantar_gestao', '4400') ON CONFLICT (key) DO NOTHING`,
];
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) { process.stdout.write(`-> ${sql.slice(0,72)}... `); await pool.query(sql); console.log("ok"); }
  await pool.end(); console.log("Migração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
