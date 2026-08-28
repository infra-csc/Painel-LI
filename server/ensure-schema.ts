/**
 * Estrutura mínima garantida na subida do servidor (28/08).
 *
 * Por que isto existe: neste projeto o `db:push` do Drizzle já foi executado a
 * partir de um checkout ANTIGO do código apontando para o banco de produção.
 * O push sincroniza o banco com o schema que ele enxerga, então tudo o que era
 * mais novo que aquele checkout foi APAGADO — a coluna `tickets.return_arrival_time`
 * e a tabela `event_comments` sumiram duas vezes no mesmo dia. Para o usuário
 * isso aparecia como "Dados inválidos" ao registrar passagem, sem nenhuma pista
 * de que a causa era o banco.
 *
 * Cada comando aqui é idempotente (IF NOT EXISTS) e barato. Rodando a cada
 * boot, um push destrutivo é desfeito no próximo restart em vez de virar um
 * chamado de suporte.
 *
 * ISTO NÃO SUBSTITUI as migrações de `scripts/migrations/` — que continuam
 * sendo o registro do que mudou e o lugar de migração de DADOS. Aqui entram só
 * as estruturas que a aplicação NÃO consegue viver sem.
 */
import { pool } from "./db";

interface Passo { descricao: string; sql: string }

const PASSOS: Passo[] = [
  {
    descricao: "tickets.return_arrival_time (chegada da volta — mobilidade 20h–5h)",
    sql: `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_arrival_time text`,
  },
  {
    descricao: "tabela event_comments (mural do evento)",
    sql: `CREATE TABLE IF NOT EXISTS event_comments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id),
      content text NOT NULL,
      created_at timestamp DEFAULT now()
    )`,
  },
  {
    descricao: "índice de comentários por evento",
    sql: `CREATE INDEX IF NOT EXISTS event_comments_event_idx ON event_comments (event_id, created_at DESC)`,
  },
];

/**
 * Nunca derruba o servidor: um passo que falhe (permissão, banco em migração)
 * é registrado e a subida continua — o app pode funcionar sem parte disto,
 * mas não pode ficar fora do ar por causa daqui.
 */
export async function garantirEstrutura(): Promise<void> {
  for (const passo of PASSOS) {
    try {
      await pool.query(passo.sql);
    } catch (erro) {
      console.error(`[estrutura] falhou: ${passo.descricao} —`, erro instanceof Error ? erro.message : erro);
    }
  }
}
