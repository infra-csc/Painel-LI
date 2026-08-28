/**
 * Migração — comentários gerais do evento (2026-08-28)
 *
 * Mural aberto do evento (pedido do dono): qualquer usuário autenticado
 * escreve; Validação e Histórico mostram. Tabela própria — não mexe em
 * events.observations (logística) nem em comments (por vaga).
 *
 * Idempotente. Rodar:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-28-comentarios-evento.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_comments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id),
      content text NOT NULL,
      created_at timestamp DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS event_comments_event_idx ON event_comments (event_id, created_at DESC)`);
  console.log("  + tabela event_comments");
  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
