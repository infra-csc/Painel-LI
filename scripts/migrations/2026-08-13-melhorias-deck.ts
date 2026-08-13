/**
 * Migração — deck "Ações de melhoria APP LI" (2026-08-13)
 *
 * Aplica as colunas/tabelas novas no banco vivo (Neon). Todos os comandos são
 * aditivos e idempotentes (IF NOT EXISTS) — pode rodar mais de uma vez.
 *
 * Uso (no Replit, DATABASE_URL já está no ambiente):
 *   npx tsx scripts/migrations/2026-08-13-melhorias-deck.ts
 *
 * Convenção do projeto: schema muda via ALTER manual + espelho em
 * shared/schema.ts. NUNCA rodar db:push (ver .agents/memory/db-migrations.md).
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const statements: string[] = [
  // Slide 1 — quem criou o cadastro do colaborador
  `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS created_by varchar REFERENCES users(id)`,
  `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS created_by_name text`,

  // Slide 4 — flag "emite NF" por linha de escalação
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS emits_nf boolean NOT NULL DEFAULT true`,

  // Slide 6 — conta corrente Flash (alimentação/mobilidade por colaborador)
  `CREATE TABLE IF NOT EXISTS flash_movements (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    collaborator_id varchar NOT NULL REFERENCES collaborators(id),
    event_id varchar REFERENCES events(id),
    category text NOT NULL,
    type text NOT NULL,
    amount_cents integer NOT NULL,
    movement_date date NOT NULL,
    description text,
    created_by varchar REFERENCES users(id),
    created_by_name text,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS flash_movements_collaborator_idx ON flash_movements (collaborator_id, movement_date)`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definido no ambiente.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) {
    const label = sql.replace(/\s+/g, " ").slice(0, 80);
    process.stdout.write(`-> ${label}... `);
    await pool.query(sql);
    console.log("ok");
  }
  await pool.end();
  console.log("Migração concluída.");
}

main().catch((err) => {
  console.error("Falha na migração:", err);
  process.exit(1);
});
