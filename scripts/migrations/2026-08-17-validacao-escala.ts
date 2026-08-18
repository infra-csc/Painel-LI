/**
 * Migração — Validação de Escala (2026-08-17)
 *
 * Etapa ANTES da Inclusão de Equipe: a escala nasce como sugestão da logística
 * (team_inclusions com phase 'sugestao'), cada área valida a parte dela e um
 * aprovador central decide pedidos de ajuste / inclusão / exclusão.
 *
 *  - function_managers.role ('validador' | 'aprovador', default 'validador');
 *  - team_inclusions: transport_mode_ida/volta (+CHECK), suggestion_sent_at,
 *    validated_at, validated_by;
 *  - scaling_change_requests (pedidos; modelada sobre swap_requests) + índices.
 *
 * NÃO cria CHECK em team_inclusions.status/phase: o banco tem valores legados
 * além dos listados no comentário do schema (ex.: phase 'aprovado', status
 * 'aguardando_producao'/'escalado' vindos de shared/scaling-rules.ts), então
 * uma CHECK aqui poderia falhar ou travar registros históricos. Os valores da
 * fase 'sugestao' são validados na aplicação (shared/scaling-validation-rules.ts).
 *
 * Aditiva e idempotente (IF NOT EXISTS / duplicate_object). Não executar em
 * deploy automático — rodar manualmente:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-17-validacao-escala.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const addCheck = (table: string, name: string, expr: string) => `DO $$ BEGIN
     ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expr});
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

const statements: string[] = [
  // ---- function_managers.role -------------------------------------------
  `ALTER TABLE function_managers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'validador'`,
  addCheck("function_managers", "function_managers_role_chk", `role IN ('validador','aprovador')`),

  // ---- team_inclusions: campos da sugestão --------------------------------
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS transport_mode_ida text`,
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS transport_mode_volta text`,
  addCheck("team_inclusions", "team_inclusions_transport_mode_ida_chk",
    `transport_mode_ida IS NULL OR transport_mode_ida IN ('aereo','onibus','van','carro','transfer')`),
  addCheck("team_inclusions", "team_inclusions_transport_mode_volta_chk",
    `transport_mode_volta IS NULL OR transport_mode_volta IN ('aereo','onibus','van','carro','transfer')`),
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS suggestion_sent_at timestamp`,
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS validated_at timestamp`,
  `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS validated_by varchar REFERENCES users(id)`,
  // (sem CHECK em status/phase — ver cabeçalho)

  // ---- scaling_change_requests -------------------------------------------
  `CREATE TABLE IF NOT EXISTS scaling_change_requests (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    team_inclusion_id varchar REFERENCES team_inclusions(id) ON DELETE CASCADE, -- null quando request_type = 'inclusao'
    event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    function_id varchar NOT NULL REFERENCES functions(id),
    area text,
    request_type text NOT NULL,
    requested_by varchar NOT NULL REFERENCES users(id),
    requested_by_name text NOT NULL,
    proposed_changes text, -- JSON string versionado { v: 1, ... }
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pendente',
    review_comment text,
    reviewed_by varchar REFERENCES users(id),
    reviewed_by_name text,
    reviewed_at timestamp,
    resolved_inclusion_id varchar REFERENCES team_inclusions(id),
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,
  addCheck("scaling_change_requests", "scaling_change_requests_type_chk",
    `request_type IN ('ajuste','inclusao','exclusao')`),
  addCheck("scaling_change_requests", "scaling_change_requests_status_chk",
    `status IN ('pendente','aprovado','reajustado','negado','reenviado_validacao')`),
  // pedido de inclusão não referencia vaga; ajuste/exclusão precisam de vaga
  addCheck("scaling_change_requests", "scaling_change_requests_inclusion_ref_chk",
    `(request_type = 'inclusao' AND team_inclusion_id IS NULL) OR (request_type <> 'inclusao' AND team_inclusion_id IS NOT NULL)`),
  `CREATE INDEX IF NOT EXISTS scaling_change_requests_event_idx ON scaling_change_requests (event_id)`,
  `CREATE INDEX IF NOT EXISTS scaling_change_requests_status_idx ON scaling_change_requests (status)`,
  `CREATE INDEX IF NOT EXISTS scaling_change_requests_inclusion_idx ON scaling_change_requests (team_inclusion_id)`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  for (const sql of statements) {
    process.stdout.write(`-> ${sql.replace(/\s+/g, " ").slice(0, 90)}... `);
    const r = await pool.query(sql);
    console.log("ok" + (r.rowCount != null ? ` (${r.rowCount})` : ""));
  }
  await pool.end();
  console.log("Migração concluída.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
