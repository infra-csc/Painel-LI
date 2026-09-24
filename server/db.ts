import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// ── Modo de teste: Postgres embutido (PGlite, WASM) ─────────────────────────
// Com PAINEL_DB=pglite (só os testes de rota em server/test/) o banco é um
// Postgres em memória, sem rede e sem DATABASE_URL. Fora disso NADA muda.
//
// Por que um proxy: `db` e `pool` são exports síncronos usados em todo o
// servidor, mas subir o PGlite é assíncrono (import dinâmico + WASM) e o
// driver `drizzle-orm/pglite` importa `@electric-sql/pglite` em runtime — uma
// devDependency, que em produção pode nem existir. Um import estático
// quebraria o boot; top-level await não passa no tsconfig (sem `target`). Então
// os dois pacotes só são carregados dentro de `inicializarBancoDeTeste()`, e
// até lá `db`/`pool` são proxies que apontam para a instância real. Em modo
// normal (Neon) o proxy não existe: os exports são os objetos de sempre.
const MODO_PGLITE = process.env.PAINEL_DB === "pglite";

/**
 * Adaptador mínimo do que o código usa de `pool` fora deste arquivo:
 * `pool.query(text, params)` (server/auth-guards.ts, server/ensure-schema.ts)
 * e o `pool` entregue ao connect-pg-simple — que em modo de teste não é usado
 * (server/app.ts troca o store por MemoryStore). PGlite.query devolve
 * `{ rows, fields, affectedRows }`, compatível com o que esses pontos leem.
 */
interface PoolMinimo {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface Conexao { pool: Pool; db: NeonDatabase<typeof schema> }

let conexaoDeTeste: Conexao | null = null;

/**
 * Sobe o Postgres embutido (só com PAINEL_DB=pglite). O harness dos testes
 * chama isto ANTES de criar o app ou tocar no storage. Idempotente.
 */
export async function inicializarBancoDeTeste(): Promise<void> {
  if (!MODO_PGLITE) throw new Error("inicializarBancoDeTeste só vale com PAINEL_DB=pglite");
  if (conexaoDeTeste) return;
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  await client.waitReady;
  const poolMinimo: PoolMinimo = {
    query: (text, params) => client.query(text, (params ?? []) as unknown[]),
  };
  // Os dois drivers são PgDatabase; só o tipo do resultado de `execute` difere
  // (ambos expõem `.rows`). Mantemos o tipo do Neon para o resto do servidor
  // não precisar de união de tipos por causa do modo de teste.
  conexaoDeTeste = {
    pool: poolMinimo as unknown as Pool,
    db: drizzlePglite({ client, schema }) as unknown as NeonDatabase<typeof schema>,
  };
}

/** Proxy que delega cada acesso ao objeto real — que só existe depois de `inicializarBancoDeTeste()`. */
function proxyDeTeste<T extends object>(obter: (c: Conexao) => T): T {
  const real = (): T => {
    if (!conexaoDeTeste) {
      throw new Error("Banco de teste não inicializado — chame inicializarBancoDeTeste() antes (server/test/harness.ts faz isso).");
    }
    return obter(conexaoDeTeste);
  };
  return new Proxy({} as T, {
    get(_alvo, prop) {
      const alvo = real();
      const valor = Reflect.get(alvo, prop);
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
    has(_alvo, prop) {
      return prop in real();
    },
  });
}

function criarNeon(): Conexao {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  // ── Pool dimensionado para o autoscale (23/09) ──────────────────────────────
  // O Replit autoscale sobe VÁRIAS instâncias deste processo sob carga, e cada
  // uma tem o seu pool. O Neon limita conexões por projeto; com o padrão do pg
  // (10 por pool, sem teto de espera) bastavam poucas instâncias para esgotar o
  // limite e todas passarem a falhar com "too many connections". Por isso:
  //  - max 8 por instância (N instâncias × 8 continua abaixo do limite do
  //    pooler, que multiplexa em milhares);
  //  - conexão ociosa fecha em 30 s (instância que escala para baixo devolve
  //    conexões rápido);
  //  - quem não conseguir conexão em 10 s recebe erro em vez de esperar para
  //    sempre (o request cai no tratador global como 500, não trava o worker).
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // statement_timeout de 15 s em toda conexão nova: uma consulta presa (lock,
  // plano ruim) é cancelada pelo servidor em vez de segurar uma das 8 conexões
  // até o fim dos tempos. Aplicado no evento `connect` porque o driver serverless
  // da Neon não expõe `options` de startup de forma confiável via pooler.
  pool.on('connect', (client) => {
    client.query("SET statement_timeout = '15s'").catch((err: Error) => {
      console.error('[DB] Não foi possível aplicar statement_timeout:', err.message);
    });
  });

  pool.on('error', (err) => {
    console.error('Database pool error (will reconnect):', err.message);
  });

  // O endpoint "-pooler" (PgBouncer da Neon) é o adequado para muitas instâncias
  // de curta duração; o endpoint direto tem limite baixo de conexões. Só avisa —
  // a URL é decisão de infraestrutura e não é alterada aqui.
  try {
    const host = new URL(process.env.DATABASE_URL).hostname;
    if (host.includes('neon.tech') && !host.includes('-pooler')) {
      console.warn(
        `[DB] AVISO: DATABASE_URL aponta para o endpoint direto (${host}). ` +
        `Com autoscale, prefira o endpoint "-pooler" da Neon para não esgotar conexões.`
      );
    }
  } catch {
    // URL fora do formato esperado: o próprio Pool vai reclamar ao conectar.
  }

  return { pool, db: drizzle({ client: pool, schema }) };
}

const conexao: Conexao = MODO_PGLITE
  ? { pool: proxyDeTeste((c) => c.pool), db: proxyDeTeste((c) => c.db) }
  : criarNeon();

export const pool: Pool = conexao.pool;
export const db: NeonDatabase<typeof schema> = conexao.db;
