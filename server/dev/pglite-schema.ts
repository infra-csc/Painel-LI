/**
 * Schema do Postgres embutido (PGlite) gerado a partir de shared/schema.ts (25/09).
 *
 * Extraído de server/test/harness.ts para servir a dois consumidores:
 *  - os testes de rota (server/test/), que sobem a aplicação real sobre o
 *    PGlite a cada arquivo;
 *  - o modo demonstração (`npm run dev:demo` → server/dev/demo.ts), que sobe o
 *    app com o mesmo banco embutido e um seed realista, sem tocar em produção.
 *
 * Como funciona: a API do drizzle-kit (`generateDrizzleJson` + `generateMigration`
 * contra um snapshot vazio) produz o DDL do schema atual, aplicado statement a
 * statement. Nada de SQL escrito à mão: se shared/schema.ts mudar, os dois
 * consumidores acompanham. `drizzle-kit/api` é carregado pela build CJS
 * (`createRequire`) porque a build ESM do pacote tem `require` dinâmico de
 * "fs" e quebra sob ESM.
 *
 * O que o schema do Drizzle NÃO declara e é criado aqui antes do DDL:
 *  - as sequences (`event_sequence` etc.) referenciadas em `default nextval(...)`;
 *  - a tabela `session` do connect-pg-simple (o app usa MemoryStore no modo
 *    PGlite, mas `destruirSessoesDoUsuario` faz DELETE direto nela).
 *
 * `server/ensure-schema.ts` NÃO roda neste modo (ele mesmo se pula com
 * PAINEL_DB=pglite): o schema já vem completo daqui.
 *
 * Recebe `db` por parâmetro (em vez de importar server/db) porque quem chama
 * precisa definir PAINEL_DB=pglite ANTES de server/db.ts ser carregado.
 */
import { createRequire } from "module";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schemaPadrao from "@shared/schema";
import { SQL_USUARIO_SISTEMA } from "../usuario-sistema";

type BancoDrizzle = Pick<NeonDatabase<typeof schemaPadrao>, "execute">;

/** Sequences que o schema referencia em `default nextval(...)` mas não declara. */
export const SEQUENCES_DO_SCHEMA = [
  "event_sequence",
  "function_sequence",
  "collaborator_sequence",
  "inclusion_sequence",
  "log_sequence",
] as const;

/** Tabela do connect-pg-simple (node_modules/connect-pg-simple/table.sql, sem o WITH (OIDS) legado). */
export const SQL_TABELA_SESSION = [
  `CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL)`,
  `ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE`,
  `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`,
] as const;

/** Statements de DDL do schema atual (o que o drizzle-kit geraria contra um banco vazio). */
export async function gerarDdlDoSchema(schema: Record<string, unknown> = schemaPadrao): Promise<string[]> {
  const require = createRequire(import.meta.url);
  const { generateDrizzleJson, generateMigration } = require("drizzle-kit/api") as typeof import("drizzle-kit/api");
  const vazio = generateDrizzleJson({});
  const atual = generateDrizzleJson(schema);
  return generateMigration(vazio, atual);
}

/**
 * Cria sequences, tabelas/índices do schema e a tabela `session` num banco
 * PGlite recém-criado. Idempotente para as sequences e a `session`; o DDL do
 * schema pressupõe banco vazio (é assim que os dois consumidores o usam).
 */
export async function criarSchemaPglite(db: BancoDrizzle, schema: Record<string, unknown> = schemaPadrao): Promise<void> {
  for (const s of SEQUENCES_DO_SCHEMA) await db.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${s}`));
  for (const st of await gerarDdlDoSchema(schema)) await db.execute(sql.raw(st));
  for (const st of SQL_TABELA_SESSION) await db.execute(sql.raw(st));
  // Usuário fixo 'system' (FK de team_inclusion_logs.user_id) — como o ensure-schema faz no Neon.
  await db.execute(sql.raw(SQL_USUARIO_SISTEMA));
}
