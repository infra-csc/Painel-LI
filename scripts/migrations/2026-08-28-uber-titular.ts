/**
 * Migração — titular do grupo de Uber (2026-08-28)
 *
 * As planilhas de roteirização da equipe têm a coluna TITULAR: quem chama o
 * carro e responde pela corrida. O sistema guardava os passageiros, mas não
 * quem responde. Decisão do dono: escolhido à mão entre os passageiros do
 * grupo — nada é sugerido automaticamente.
 *
 * Idempotente. Rodar:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-28-uber-titular.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  await pool.query(`ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS titular_collaborator_id varchar REFERENCES collaborators(id)`);
  console.log("  + uber_groups.titular_collaborator_id");
  await pool.end();
  console.log("\nMigração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
