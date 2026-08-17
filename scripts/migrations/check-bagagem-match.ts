/**
 * Conferência (SOMENTE LEITURA) — casa os passageiros do histórico de bagagem
 * extraído do HTML com os colaboradores de produção, por CPF e por nome.
 * Uso: DATABASE_URL=... npx tsx scripts/migrations/check-bagagem-match.ts <json>
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "fs";

neonConfig.webSocketConstructor = ws;

const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
const norm = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const entries = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT id, full_name, official_document, document_type, secondary_document, secondary_document_type, active
     FROM collaborators`
  );
  await pool.end();

  const byCpf = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const c of rows) {
    const cpf =
      c.document_type === "cpf" ? digits(c.official_document)
      : c.secondary_document_type === "cpf" ? digits(c.secondary_document)
      : "";
    if (cpf.length === 11 && !byCpf.has(cpf)) byCpf.set(cpf, c);
    const n = norm(c.full_name);
    if (n && !byName.has(n)) byName.set(n, c);
  }

  let porCpf = 0, porNome = 0;
  const semMatch: string[] = [];
  for (const e of entries) {
    const cpf = digits(e.cpf);
    let match = cpf.length === 11 ? byCpf.get(cpf) : undefined;
    let via = "cpf";
    if (!match) { match = byName.get(norm(e.nome)); via = "nome"; }
    if (match) {
      via === "cpf" ? porCpf++ : porNome++;
      console.log(`OK   [${via}]  ${e.nome}  ->  ${match.full_name} (${match.id.slice(0, 8)}…, ${match.active ? "ativo" : "inativo"})`);
    } else {
      semMatch.push(e.nome);
      console.log(`FALTA        ${e.nome}  (cpf: ${e.cpf ?? "—"})`);
    }
  }
  console.log(`\nResumo: ${porCpf} por CPF, ${porNome} por nome, ${semMatch.length} sem correspondência de ${entries.length}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
