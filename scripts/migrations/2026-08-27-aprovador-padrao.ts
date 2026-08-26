/**
 * Seed — Aprovador padrão da Validação de Escala (2026-08-27)
 *
 * Decisão do dono (27/08): "o aprovador da escala sempre será o Pedro Telles".
 * Em vez de depender de um vínculo em function_managers por função (que deixa
 * vagas paradas quando alguém cadastra uma função nova e esquece o aprovador),
 * o sistema passa a ter um APROVADOR PADRÃO global, guardado em system_settings
 * na chave `escala_aprovador_padrao` com value = users.id.
 *
 * O servidor usa essa chave como FALLBACK de permissão: quem não é aprovador
 * explícito da função, mas É o aprovador padrão, decide mesmo assim. Aprovador
 * específico por função continua valendo e tem precedência (cadastro pela aba
 * Validação de Escala, em Funções).
 *
 * Casamento tolerante a acento/caixa (normalização NFD em JS, não ILIKE), no
 * mesmo critério do seed 2026-08-20-escala-responsaveis: procura em `users` o
 * nome que contenha "pedro" E "telles" (em qualquer ordem).
 *
 * Idempotente e conservador:
 *   - achou EXATAMENTE um usuário  → INSERT ... ON CONFLICT (key) DO UPDATE;
 *   - a chave já aponta pra ele    → não escreve nada ("já configurado");
 *   - nenhum ou mais de um match   → AVISO e NADA é gravado (nunca falha).
 *
 * Não executar em deploy automático — rodar manualmente:
 *   DATABASE_URL=... npx tsx scripts/migrations/2026-08-27-aprovador-padrao.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { DEFAULT_APPROVER_SETTING_KEY } from "../../shared/scaling-validation-rules";
neonConfig.webSocketConstructor = ws;

/** Minúsculas + sem acento — "Telles" → "telles". */
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Todos os termos precisam aparecer no nome, em qualquer ordem. */
const APROVADOR_TERMS = ["pedro", "telles"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });

  const warn = (msg: string) => console.warn(`  AVISO: ${msg}`);
  const alvo = APROVADOR_TERMS.join(" ");

  // ---- Procura o usuário pelo nome ----------------------------------------
  const users = (await pool.query(`SELECT id, name, email FROM users`)).rows as
    { id: string; name: string | null; email: string | null }[];

  const matches = users.filter((u) => {
    const n = normalize(u.name ?? "");
    return APROVADOR_TERMS.every(t => n.includes(t));
  });

  if (matches.length === 0) {
    warn(`usuário "${alvo}" não encontrado — chave "${DEFAULT_APPROVER_SETTING_KEY}" NÃO foi gravada.`);
    warn(`cadastre o usuário e rode este script de novo (ou defina a chave manualmente).`);
    await pool.end();
    console.log("\nSeed concluído (nada a fazer).");
    return;
  }
  if (matches.length > 1) {
    warn(`usuário "${alvo}" é ambíguo (${matches.map(m => m.name).join(", ")}) — chave "${DEFAULT_APPROVER_SETTING_KEY}" NÃO foi gravada.`);
    warn(`desambigue os nomes em Usuários e rode este script de novo.`);
    await pool.end();
    console.log("\nSeed concluído (nada a fazer).");
    return;
  }

  const aprovador = matches[0];
  const nome = aprovador.name ?? aprovador.email ?? aprovador.id;

  // ---- Aplica (idempotente) ------------------------------------------------
  const atual = (await pool.query(
    `SELECT value FROM system_settings WHERE key = $1`,
    [DEFAULT_APPROVER_SETTING_KEY],
  )).rows[0] as { value: string } | undefined;

  if (atual?.value === aprovador.id) {
    console.log(`  = "${DEFAULT_APPROVER_SETTING_KEY}" já configurado com ${nome} — nada a fazer.`);
    await pool.end();
    console.log("\nSeed concluído.");
    return;
  }

  if (atual) {
    warn(`"${DEFAULT_APPROVER_SETTING_KEY}" apontava para outro id (${atual.value}) — será substituído por ${nome}.`);
  }

  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [DEFAULT_APPROVER_SETTING_KEY, aprovador.id],
  );
  console.log(`  + "${DEFAULT_APPROVER_SETTING_KEY}" = ${aprovador.id} (${nome})`);

  await pool.end();
  console.log("\nSeed concluído.");
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
