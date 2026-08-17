/**
 * Migração — Histórico de bagagens pré-sistema (2026-08-17)
 *
 * Importa as contagens reais de bagagem por colaborador × CIA extraídas do
 * app antigo "Controle de Bagagem" (HTML standalone): 30 passageiros, 59
 * bagagens. Sem evento/valor/data na origem — só a contagem consolidada, que
 * a tela soma na visão "Por colaborador" com selo de histórico.
 *
 * Resolução do colaborador: CPF (official/secondary) e, em último caso, nome
 * normalizado. Três nomes vinham truncados na origem e têm alias manual com o
 * CPF confirmado na lista de funcionários do mesmo arquivo.
 *
 * Idempotente: CREATE IF NOT EXISTS + UPSERT por (collaborator_id, cia).
 * Uso: DATABASE_URL=... npx tsx scripts/migrations/2026-08-17-bagagem-historico.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// nome na origem -> CPF confirmado (nomes truncados/typos no seed antigo)
const CPF_ALIASES: Record<string, string> = {
  "FERNANDA TOUSSAINT NASCIMENTO LIM": "17031248710", // Fernanda Toussaint Nascimento Lima
  "Jamerson Rodrigues": "35816863843",                // Jamerson Rodrigues da Silva
  "RAPHAEL SCHIABEL TELLE": "32113718855",            // Raphael Schiabel Telles
};

// Extraído do HTML (SEED_PASSENGERS + merge de CPFs), só quem tem bagagem.
const HISTORICO: { nome: string; cpf: string | null; azul: number; gol: number; tam: number; outros: number }[] = [
  { nome: "ALEX APARECIDO DA ROCHA", cpf: "22156536805", azul: 0, gol: 0, tam: 1, outros: 0 },
  { nome: "ALINE CANDIDO DA SILVA", cpf: "43706599813", azul: 1, gol: 0, tam: 1, outros: 0 },
  { nome: "ANA CLAUDIA MOTTA", cpf: "40641559801", azul: 0, gol: 0, tam: 1, outros: 0 },
  { nome: "ANDERSON QUEIROZ ANDREOTTI", cpf: "24866004851", azul: 0, gol: 0, tam: 2, outros: 0 },
  { nome: "BRUNO DA SILVA CORDEIRO", cpf: "34920606842", azul: 0, gol: 0, tam: 2, outros: 0 },
  { nome: "ERICK RAMOS DA SILVa", cpf: "54952929876", azul: 0, gol: 1, tam: 0, outros: 0 },
  { nome: "Felipe Gotlib Rodrigues Gonçalves", cpf: "46467421876", azul: 1, gol: 0, tam: 0, outros: 0 },
  { nome: "FERNANDA TOUSSAINT NASCIMENTO LIM", cpf: null, azul: 0, gol: 0, tam: 1, outros: 0 },
  { nome: "GABRIEL NASCIMENTO MENEZES", cpf: "45589964890", azul: 2, gol: 1, tam: 0, outros: 0 },
  { nome: "GLEICY KELLY MOREIRA CALIXTO", cpf: "42584048884", azul: 1, gol: 0, tam: 1, outros: 0 },
  { nome: "Jamerson Rodrigues", cpf: null, azul: 0, gol: 1, tam: 0, outros: 0 },
  { nome: "JOAO MARCOS NASCIMENTO LEITE", cpf: "06765767533", azul: 0, gol: 2, tam: 0, outros: 0 },
  { nome: "JOAQUIM FRANCISCO SANTOS NETO", cpf: "32876625890", azul: 1, gol: 0, tam: 2, outros: 0 },
  { nome: "Jose Renato Albuquerque De Souza", cpf: "34735716874", azul: 2, gol: 0, tam: 0, outros: 0 },
  { nome: "LEONARDO APARECIDO ALMEIDA OLIVEIRA", cpf: "47256967810", azul: 2, gol: 0, tam: 0, outros: 0 },
  { nome: "LUCAS VICENZO DA SILVA PROENÇA", cpf: "35488452826", azul: 0, gol: 0, tam: 2, outros: 0 },
  { nome: "Luciano Do Nascimento", cpf: null, azul: 0, gol: 0, tam: 1, outros: 0 },
  { nome: "Manoel Carlos Ferreira Alves", cpf: "22632132878", azul: 0, gol: 0, tam: 1, outros: 0 },
  { nome: "Matheus chaddad Barreiro da Cunha", cpf: "41008192856", azul: 2, gol: 0, tam: 0, outros: 0 },
  { nome: "MATHEUS DA SILVA CORDEIRO", cpf: "48193325893", azul: 0, gol: 2, tam: 0, outros: 0 },
  { nome: "MAURICIO TIAGO PINTO VIDAL", cpf: "11601658745", azul: 0, gol: 2, tam: 0, outros: 0 },
  { nome: "NAIARA DAIANE SOUZA", cpf: "01641283602", azul: 2, gol: 0, tam: 0, outros: 0 },
  { nome: "PAULO ROBERTO DA SILVA", cpf: "32756306878", azul: 2, gol: 0, tam: 0, outros: 0 },
  { nome: "RAFAEL BISPO DA SILVA", cpf: "45771823864", azul: 0, gol: 0, tam: 1, outros: 0 },
  { nome: "RAPHAEL SCHIABEL TELLE", cpf: null, azul: 0, gol: 1, tam: 0, outros: 0 },
  { nome: "RENAN MOTA", cpf: "38458511800", azul: 2, gol: 0, tam: 2, outros: 0 },
  { nome: "RODRIGO MILANI CAZELOTO", cpf: "46221635861", azul: 0, gol: 0, tam: 2, outros: 0 },
  { nome: "ROGERIO DA SILVA", cpf: "31223732894", azul: 2, gol: 0, tam: 0, outros: 0 },
  { nome: "RUBEM ISMAEL VASQUES", cpf: "39147168862", azul: 2, gol: 3, tam: 2, outros: 0 },
  { nome: "WELINGTON JEREMIAS DE OLIVEIRA", cpf: "21745168885", azul: 2, gol: 0, tam: 0, outros: 0 },
];

const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
const norm = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });

  // 1) Estrutura (idempotente)
  await pool.query(`CREATE TABLE IF NOT EXISTS baggage_history (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    collaborator_id varchar NOT NULL REFERENCES collaborators(id),
    cia text NOT NULL,
    quantity integer NOT NULL,
    source_name text,
    imported_at timestamp DEFAULT now()
  )`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE baggage_history ADD CONSTRAINT baggage_history_quantity_chk CHECK (quantity >= 1);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS baggage_history_collab_cia_uq
    ON baggage_history (collaborator_id, cia)`);
  console.log("Estrutura ok.");

  // 2) Índices de colaboradores para resolução
  const { rows } = await pool.query(
    `SELECT id, full_name, official_document, document_type, secondary_document, secondary_document_type FROM collaborators`
  );
  const byCpf = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const c of rows) {
    const cpf = c.document_type === "cpf" ? digits(c.official_document)
      : c.secondary_document_type === "cpf" ? digits(c.secondary_document) : "";
    if (cpf.length === 11 && !byCpf.has(cpf)) byCpf.set(cpf, c);
    const n = norm(c.full_name);
    if (n && !byName.has(n)) byName.set(n, c);
  }

  // 3) UPSERT por colaborador × CIA
  let linhas = 0, bagagens = 0;
  const faltas: string[] = [];
  for (const e of HISTORICO) {
    const cpf = digits(e.cpf) || digits(CPF_ALIASES[e.nome]);
    const collab = (cpf.length === 11 ? byCpf.get(cpf) : undefined) ?? byName.get(norm(e.nome));
    if (!collab) { faltas.push(e.nome); continue; }
    const pares: [string, number][] = [["Azul", e.azul], ["Gol", e.gol], ["TAM", e.tam], ["Outros", e.outros]];
    for (const [cia, qtd] of pares) {
      if (qtd < 1) continue;
      await pool.query(
        `INSERT INTO baggage_history (collaborator_id, cia, quantity, source_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (collaborator_id, cia) DO UPDATE
           SET quantity = EXCLUDED.quantity, source_name = EXCLUDED.source_name`,
        [collab.id, cia, qtd, e.nome]
      );
      linhas++; bagagens += qtd;
      console.log(`  ${e.nome} -> ${collab.full_name}: ${cia} × ${qtd}`);
    }
  }
  await pool.end();
  console.log(`\nImportado: ${linhas} linhas, ${bagagens} bagagens.`);
  if (faltas.length) {
    console.log(`SEM correspondência (${faltas.length}): ${faltas.join("; ")}`);
    process.exit(2);
  }
}

main().catch((err) => { console.error("Falha na migração:", err); process.exit(1); });
