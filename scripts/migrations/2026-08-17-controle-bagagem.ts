/**
 * Migração — Controle de Bagagem (2026-08-17)
 *
 * Cria a tabela baggage_requests (solicitações de bagagem por colaborador e
 * evento) com FKs, CHECKs de domínio (valor >= 0, quantidade >= 1) e índices
 * nas colunas de filtro. Dinheiro em centavos; exclusão é soft delete
 * (deleted_at/deleted_by).
 *
 * Todos os comandos são aditivos e idempotentes — pode rodar mais de uma vez.
 * Uso (Replit): npx tsx scripts/migrations/2026-08-17-controle-bagagem.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS baggage_requests (
     id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
     event_id varchar NOT NULL REFERENCES events(id),
     collaborator_id varchar NOT NULL REFERENCES collaborators(id),
     loc text NOT NULL,
     cia text NOT NULL,
     value_cents integer NOT NULL,
     os text NOT NULL,
     quantity integer NOT NULL DEFAULT 1,
     agency text NOT NULL,
     request_date date NOT NULL,
     boarding_date date NOT NULL,
     notes text,
     created_by varchar REFERENCES users(id),
     created_by_name text,
     created_at timestamp DEFAULT now(),
     deleted_at timestamp,
     deleted_by varchar
   )`,

  // ── Domínio dos valores ──
  `DO $$ BEGIN
     ALTER TABLE baggage_requests ADD CONSTRAINT baggage_requests_value_cents_chk
       CHECK (value_cents >= 0);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE baggage_requests ADD CONSTRAINT baggage_requests_quantity_chk
       CHECK (quantity >= 1);
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // ── Índices nas colunas de filtro ──
  `CREATE INDEX IF NOT EXISTS baggage_requests_event_idx ON baggage_requests (event_id)`,
  `CREATE INDEX IF NOT EXISTS baggage_requests_collaborator_idx ON baggage_requests (collaborator_id)`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definido no ambiente.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) {
    const label = sql.replace(/\s+/g, " ").slice(0, 90);
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
