/** Migração — tarifas freela editáveis (slide). Idempotente. */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const statements = [
  `INSERT INTO system_settings (key, value) VALUES ('freela_diaria_local', '46500') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('freela_diaria_viagem', '54000') ON CONFLICT (key) DO NOTHING`,
  `INSERT INTO system_settings (key, value) VALUES ('freela_diaria_dir_prova', '82000') ON CONFLICT (key) DO NOTHING`,
];
(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) { process.stdout.write(`-> ${sql.slice(0,66)}... `); await pool.query(sql); console.log("ok"); }
  await pool.end(); console.log("Migração concluída.");
})().catch((e) => { console.error("Falha:", e); process.exit(1); });
