/**
 * Migração — carimbo "passagem EMITIDA" (2026-08-27)
 *
 * Regra do dono (26/08): quem compra precisa de um botão — individual ou em
 * lote — para dizer "o bilhete saiu". A partir do carimbo, a área não pede mais
 * ajuste naquela vaga; o preenchimento dos dados da passagem continua livre
 * (marca-se primeiro, preenche-se depois).
 *
 * Duas colunas em `tickets`, ambas opcionais e sem default: quem nunca marcar
 * segue exatamente como antes.
 *
 * Idempotente (IF NOT EXISTS). Rodar manualmente:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-27-passagem-emitida.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });

  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS emitted_at timestamp`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS emitted_by varchar REFERENCES users(id)`);
  console.log("  + tickets.emitted_at / emitted_by");

  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM tickets WHERE emitted_at IS NOT NULL`,
  );
  console.log(`  = passagens já marcadas como emitidas: ${rows[0].n}`);

  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
