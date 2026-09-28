/**
 * Store do express-rate-limit sobre o Postgres (25/09).
 *
 * O MemoryStore padrão conta por instância: com o autoscale subindo N
 * instâncias, um atacante ganhava N × 30 tentativas de login por janela e o
 * contador zerava a cada deploy. Aqui o contador vive na tabela `rate_limits`
 * (shared/schema.ts): chave = prefixo do limitador + chave do cliente (IP),
 * `hits` e `expira_em` (fim da janela). Um único UPSERT por request decide
 * tudo no banco — se a janela venceu, recomeça em 1; senão soma 1.
 *
 * Interface: `Store` de node_modules/express-rate-limit/dist/index.d.ts
 * (init/get/increment/decrement/resetKey/resetAll). Um limitador = uma
 * instância (a validação `unsharedStore` do pacote reclama se dois
 * limitadores partilharem o mesmo objeto), diferenciadas pelo `prefixo`.
 *
 * Falha do banco: o pacote responde 500 (passOnStoreError=false, padrão) —
 * fail-closed de propósito nas rotas de credencial. No modo PGlite (testes e
 * demo) funciona igual: a tabela faz parte do schema gerado.
 */
import type { ClientRateLimitInfo, IncrementResponse, Options, Store } from "express-rate-limit";
import { pool } from "./db";

interface LinhaDoContador { hits: number | string; expira_em: string | Date }

const LIMPAR_EXPIRADOS_A_CADA_MS = 10 * 60_000;

export class PostgresRateLimitStore implements Store {
  /** Chaves gravadas por este limitador ("login:", "reset:"...). */
  readonly prefix: string;
  /** false: o contador é compartilhado entre instâncias (é o ponto). */
  readonly localKeys = false;
  private windowMs = 60_000;
  private ultimaLimpeza = 0;

  constructor(prefixo: string) {
    this.prefix = `${prefixo}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private chave(key: string): string {
    return `${this.prefix}${key}`;
  }

  private static converter(linha: LinhaDoContador | undefined): ClientRateLimitInfo | undefined {
    if (!linha) return undefined;
    return { totalHits: Number(linha.hits), resetTime: new Date(linha.expira_em) };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const r = await pool.query(
      `SELECT hits, expira_em FROM rate_limits WHERE chave = $1 AND expira_em > now()`,
      [this.chave(key)],
    );
    return PostgresRateLimitStore.converter(r.rows[0] as LinhaDoContador | undefined);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const r = await pool.query(
      `INSERT INTO rate_limits (chave, hits, expira_em)
         VALUES ($1, 1, now() + ($2::int * interval '1 millisecond'))
       ON CONFLICT (chave) DO UPDATE SET
         hits = CASE WHEN rate_limits.expira_em <= now() THEN 1 ELSE rate_limits.hits + 1 END,
         expira_em = CASE WHEN rate_limits.expira_em <= now()
                          THEN now() + ($2::int * interval '1 millisecond')
                          ELSE rate_limits.expira_em END
       RETURNING hits, expira_em`,
      [this.chave(key), this.windowMs],
    );
    this.limparExpirados();
    const info = PostgresRateLimitStore.converter(r.rows[0] as LinhaDoContador | undefined);
    return info ?? { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
  }

  async decrement(key: string): Promise<void> {
    await pool.query(
      `UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE chave = $1`,
      [this.chave(key)],
    );
  }

  async resetKey(key: string): Promise<void> {
    await pool.query(`DELETE FROM rate_limits WHERE chave = $1`, [this.chave(key)]);
  }

  async resetAll(): Promise<void> {
    await pool.query(`DELETE FROM rate_limits WHERE chave LIKE $1`, [`${this.prefix}%`]);
  }

  /** Apaga janelas vencidas de vez em quando (no máximo 1× a cada 10 min por instância), fora do caminho do request. */
  private limparExpirados(): void {
    const agora = Date.now();
    if (agora - this.ultimaLimpeza < LIMPAR_EXPIRADOS_A_CADA_MS) return;
    this.ultimaLimpeza = agora;
    pool.query(`DELETE FROM rate_limits WHERE expira_em < now()`).catch((err: Error) => {
      console.error("[RateLimit] Não foi possível limpar contadores expirados:", err.message);
    });
  }
}

/** Uma instância por limitador — `prefixo` separa as chaves na tabela. */
export function criarStoreDeRateLimit(prefixo: string): PostgresRateLimitStore {
  return new PostgresRateLimitStore(prefixo);
}
