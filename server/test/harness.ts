/**
 * Harness dos testes de rota (24/09).
 *
 * Sobe a aplicação REAL (server/app.ts → createApp) sobre um Postgres embutido
 * (PGlite, WASM — sem rede, sem DATABASE_URL) e oferece helpers para criar
 * usuário, evento, função, colaborador e vaga direto no banco, e para logar um
 * `supertest.agent` pelo caminho do SSO — o único que vale em produção.
 *
 * Como funciona o banco de teste:
 *  - `PAINEL_DB=pglite` é definido AQUI, antes de qualquer import de server/
 *    (por isso os módulos do servidor são carregados com `await import()`):
 *    server/db.ts lê a variável e troca o driver Neon pelo PGlite;
 *  - o schema é gerado em tempo de teste a partir de shared/schema.ts pela API
 *    do drizzle-kit (`generateDrizzleJson` + `generateMigration` contra um
 *    snapshot vazio) e aplicado statement a statement. Nada de SQL escrito à
 *    mão: se o schema mudar, o teste acompanha. `drizzle-kit/api` é carregado
 *    pela build CJS (`createRequire`) porque a build ESM do pacote tem
 *    `require` dinâmico de "fs" e quebra sob ESM;
 *  - as sequences (`event_sequence` etc.) e a tabela `session` não fazem parte
 *    do schema do Drizzle (são criadas por migração à mão em produção) e são
 *    criadas aqui antes do push. `server/ensure-schema.ts` NÃO roda.
 *
 * Sessão: MemoryStore do express-session (server/app.ts decide isso quando
 * PAINEL_DB=pglite). A tabela `session` existe só para
 * `destruirSessoesDoUsuario` (DELETE direto via pool.query) não falhar — o
 * efeito "usuário inativado → 401" vem do gate global, que relê o usuário.
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";

/** Agente do supertest com cookie jar (o que `request.agent(app)` devolve). */
export type TestAgent = request.Agent;

// ── Ambiente de teste — ANTES dos imports dinâmicos do servidor ─────────────
process.env.PAINEL_DB = "pglite";
process.env.SESSION_SECRET ||= "segredo-de-sessao-dos-testes";
process.env.SSO_SECRET ||= "segredo-de-sso-dos-testes";
// O CSRF aceita Origin = host da requisição OU host do Portal. O supertest manda
// Host 127.0.0.1:<porta aleatória>, então a allowlist vem do PORTAL_ORIGIN.
process.env.PORTAL_ORIGIN ||= "http://localhost";
process.env.PORTAL_API_TOKEN ||= "token-do-portal-nos-testes";

/** Origin que toda mutação dos testes envia (está na allowlist do CSRF). */
export const ORIGEM_PERMITIDA = "http://localhost";

export type Papel = "admin" | "production" | "function_area" | "purchasing" | "financial";

type ModuloDb = typeof import("../db");
type ModuloStorage = typeof import("../storage");
type ModuloSchema = typeof import("@shared/schema");
type ModuloApp = typeof import("../app");

export interface Contexto {
  app: Express;
  db: ModuloDb["db"];
  storage: ModuloStorage["storage"];
  schema: ModuloSchema;
}

let contexto: Promise<Contexto> | null = null;

/** Sequences que o schema referencia em `default nextval(...)` mas não declara. */
const SEQUENCES = ["event_sequence", "function_sequence", "collaborator_sequence", "inclusion_sequence", "log_sequence"];

/** Tabela do connect-pg-simple (node_modules/connect-pg-simple/table.sql, sem o WITH (OIDS) legado). */
const SQL_TABELA_SESSION = [
  `CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL)`,
  `ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE`,
  `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`,
];

async function criarSchema(db: ModuloDb["db"], schema: ModuloSchema): Promise<void> {
  for (const s of SEQUENCES) await db.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${s}`));

  const require = createRequire(import.meta.url);
  const { generateDrizzleJson, generateMigration } = require("drizzle-kit/api") as typeof import("drizzle-kit/api");
  const vazio = generateDrizzleJson({});
  const atual = generateDrizzleJson(schema as unknown as Record<string, unknown>);
  const statements = await generateMigration(vazio, atual);
  for (const st of statements) await db.execute(sql.raw(st));

  for (const st of SQL_TABELA_SESSION) await db.execute(sql.raw(st));
}

/**
 * App + banco, criados UMA vez por arquivo de teste (o PGlite demora ~3 s para
 * subir; os testes usam dados próprios — e-mails, documentos e nomes únicos —
 * em vez de limpar o banco entre eles).
 */
export function criarApp(): Promise<Contexto> {
  if (!contexto) {
    contexto = (async () => {
      const [{ db, inicializarBancoDeTeste }, schema, { storage }, { createApp }] = await Promise.all([
        import("../db") as Promise<ModuloDb>,
        import("@shared/schema") as Promise<ModuloSchema>,
        import("../storage") as Promise<ModuloStorage>,
        import("../app") as Promise<ModuloApp>,
      ]);
      // `db`/`pool` de server/db.ts são proxies em modo PGlite: só funcionam
      // depois que o Postgres embutido subiu.
      await inicializarBancoDeTeste();
      await criarSchema(db, schema);
      // modoSeguro: as regras de produção (SSO obrigatório em toda a API, CSRF,
      // HSTS) valem mesmo com NODE_ENV=test. cookieSecure=false porque o
      // supertest fala http — com `Secure` o cookie de sessão nunca voltaria.
      const { app } = await createApp({ modoSeguro: true, cookieSecure: false });
      return { app, db, storage, schema };
    })();
  }
  return contexto;
}

// ── Dados únicos por teste ──────────────────────────────────────────────────
let contador = 0;
/** Sufixo único (por processo) para e-mails, documentos e nomes com UNIQUE. */
export function unico(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador}`;
}

// ── Usuários e sessão ───────────────────────────────────────────────────────
export interface UsuarioDeTeste {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Senha em claro (o banco guarda o hash bcrypt). */
  senha: string;
}

export async function criarUsuario(role: Papel, extras: Partial<{ status: string; isActive: boolean; name: string }> = {}): Promise<UsuarioDeTeste> {
  const { storage } = await criarApp();
  const senha = "Senha-forte-123";
  const email = `${role}.${unico()}@teste.local`;
  const name = extras.name ?? `Usuário ${role} ${unico()}`;
  const user = await storage.createUser({
    email,
    name,
    role,
    password: await bcrypt.hash(senha, 4), // custo baixo: é teste
    status: extras.status ?? "approved",
    isActive: extras.isActive ?? true,
    area: null,
  } as any);
  return { id: user.id, email: user.email, name: user.name, role: user.role, senha };
}

/** JWT HS256 como o Portal Norte emite (issuer, iat, exp, email, jti). */
export async function tokenDoPortal(user: { email: string; name?: string }, opcoes: { secret?: string; role?: string } = {}): Promise<string> {
  const chave = new TextEncoder().encode(opcoes.secret ?? process.env.SSO_SECRET!);
  return new SignJWT({ email: user.email, name: user.name, role: opcoes.role, app: "painel-li" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("norte-portal")
    .setIssuedAt()
    .setExpirationTime("10m")
    .setJti(randomUUID())
    .sign(chave);
}

/**
 * Cria a sessão pelo caminho do SSO (`GET /?portal_sso=<jwt>`): em modo seguro
 * o login por senha responde 403 e o gate exige sessão nascida do SSO. O
 * cookie fica guardado no `agent`.
 */
export async function logarComo(agent: TestAgent, user: { email: string; name?: string }): Promise<void> {
  const token = await tokenDoPortal(user);
  const res = await agent.get(`/?portal_sso=${encodeURIComponent(token)}`);
  if (res.status !== 302 || res.headers.location !== "/") {
    throw new Error(`SSO de teste falhou: ${res.status} ${res.headers.location ?? ""} ${res.text?.slice(0, 200) ?? ""}`);
  }
}

/** Atalho: usuário novo com o papel + agente já logado. */
export async function agenteLogado(role: Papel): Promise<{ agent: TestAgent; user: UsuarioDeTeste }> {
  const { app } = await criarApp();
  const user = await criarUsuario(role);
  const agent = request.agent(app);
  await logarComo(agent, user);
  return { agent, user };
}

/**
 * Cabeçalhos que toda MUTAÇÃO precisa para passar pelo CSRF fail-closed:
 * Origin na allowlist + Content-Type JSON. Uso: `mutacao(agent.post(url))`.
 */
export function mutacao<T extends request.Test>(req: T): T {
  return req.set("Origin", ORIGEM_PERMITIDA).set("Content-Type", "application/json") as T;
}

// ── Dados de domínio (direto no banco, via storage) ─────────────────────────
type Evento = Awaited<ReturnType<ModuloStorage["storage"]["createEvent"]>>;
type Funcao = Awaited<ReturnType<ModuloStorage["storage"]["createFunction"]>>;
type Colaborador = Awaited<ReturnType<ModuloStorage["storage"]["createCollaborator"]>>;
type Vaga = Awaited<ReturnType<ModuloStorage["storage"]["createTeamInclusion"]>>;

/** Evento futuro (padrão) ou com as datas informadas. */
export async function criarEvento(overrides: Partial<{ name: string; startDate: string; endDate: string; location: string }> = {}): Promise<Evento> {
  const { storage } = await criarApp();
  return storage.createEvent({
    name: overrides.name ?? `Evento ${unico()}`,
    location: overrides.location ?? "São Paulo - SP",
    startDate: overrides.startDate ?? "2099-10-10",
    endDate: overrides.endDate ?? "2099-10-14",
    observations: null,
    paymentCompanyName: null,
    paymentCompanyCnpj: null,
  });
}

/** Função comum (nome sem "ceno", "atend" ou "percurs" — para não cair em regra especial). */
export async function criarFuncao(overrides: Partial<{ name: string; userId: string | null }> = {}): Promise<Funcao> {
  const { storage } = await criarApp();
  return storage.createFunction({
    name: overrides.name ?? `Montagem ${unico()}`,
    description: null,
    responsibleArea: null,
    costCenter: null,
    quantity: 1,
    userId: overrides.userId ?? null,
  });
}

export async function criarColaborador(overrides: Partial<{ fullName: string; active: boolean; status: string; city: string }> = {}): Promise<Colaborador> {
  const { storage } = await criarApp();
  const n = unico();
  return storage.createCollaborator({
    fullName: overrides.fullName ?? `Colaborador ${n}`,
    officialDocument: `doc-${n}`,
    documentType: "cpf",
    type: "freela",
    city: overrides.city ?? "Campinas - SP",
    status: overrides.status ?? "aprovado",
    active: overrides.active ?? true,
  } as any);
}

export interface OpcoesDaVaga {
  eventId?: string;
  functionId?: string;
  collaboratorId?: string | null;
  /** Usuário "responsável" gravado em team_inclusions.userId (coluna NOT NULL). */
  userId: string;
  status?: string;
  phase?: string;
  scheduleStartDate?: string;
  scheduleEndDate?: string;
  needsTicket?: boolean;
  city?: string | null;
}

/**
 * Vaga direto no banco. Padrão: `planejado`/`inclusao`, período 10–12/10/2099,
 * com passagem (para a confirmação levar a `escalado`, um status de confirmação
 * inequívoco) e "Sai de" preenchido (obrigatório para confirmar).
 */
export async function criarVaga(o: OpcoesDaVaga): Promise<Vaga> {
  const { storage } = await criarApp();
  const eventId = o.eventId ?? (await criarEvento()).id;
  const functionId = o.functionId ?? (await criarFuncao()).id;
  return storage.createTeamInclusion({
    eventId,
    functionId,
    collaboratorId: o.collaboratorId ?? null,
    userId: o.userId,
    status: o.status ?? "planejado",
    phase: o.phase ?? "inclusao",
    scheduleStartDate: o.scheduleStartDate ?? "2099-10-10",
    scheduleEndDate: o.scheduleEndDate ?? "2099-10-12",
    dailyRates: 3,
    needsTicket: o.needsTicket ?? true,
    needsAccommodation: false,
    city: o.city === undefined ? "Campinas - SP" : o.city,
  } as any);
}
