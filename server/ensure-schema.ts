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
  // 31/08 — as cinco colunas da roteirização editável. Foram criadas por
  // migração e sumiram no mesmo dia, pelo mesmo motivo descrito no topo deste
  // arquivo: um db:push de checkout antigo. Aqui elas voltam a cada boot.
  {
    descricao: "uber_groups.suggested_time (horário calculado, separado do ajuste à mão)",
    sql: `ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS suggested_time text`,
  },
  {
    descricao: "uber_groups.manual_time (horário ajustado à mão — o que o recálculo preserva)",
    sql: `ALTER TABLE uber_groups ADD COLUMN IF NOT EXISTS manual_time text`,
  },
  {
    descricao: "team_inclusions.skip_uber (dispensado da roteirização)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS skip_uber boolean NOT NULL DEFAULT false`,
  },
  {
    descricao: "hotel_room_group_members.check_in_date (estadia por pessoa)",
    sql: `ALTER TABLE hotel_room_group_members ADD COLUMN IF NOT EXISTS check_in_date date`,
  },
  {
    descricao: "hotel_room_group_members.check_out_date (estadia por pessoa)",
    sql: `ALTER TABLE hotel_room_group_members ADD COLUMN IF NOT EXISTS check_out_date date`,
  },
  // 10/09 — empreita por EMPRESA na vaga de cenotécnica (nome, pessoas, valor
  // em centavos). O `select` explícito do storage lista estas colunas: sem
  // elas, toda a listagem de inclusões cai. Nulas e aditivas — seguras em prod.
  {
    descricao: "team_inclusions.empreita_empresa (empresa que fornece a equipe)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_empresa text`,
  },
  {
    descricao: "team_inclusions.empreita_pessoas (quantidade — só informativa)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_pessoas integer`,
  },
  {
    descricao: "team_inclusions.empreita_valor (valor fechado, em centavos)",
    sql: `ALTER TABLE team_inclusions ADD COLUMN IF NOT EXISTS empreita_valor integer`,
  },
  // 14/09 — "Sai de" do novo colaborador na troca. O POST grava a coluna e as
  // listagens fazem `SELECT sr.*`: sem ela, pedir troca cai.
  {
    descricao: "swap_requests.new_city (de onde o novo colaborador sai)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS new_city text`,
  },
  // 14/09 — permuta de colaboradores: tipo da troca, a outra vaga e o "Sai de"
  // de quem vai para ela. O POST grava as três e as listagens as leem.
  {
    descricao: "swap_requests.swap_kind (substituicao | permuta)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS swap_kind text NOT NULL DEFAULT 'substituicao'`,
  },
  {
    descricao: "swap_requests.paired_inclusion_id (a outra vaga da permuta)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS paired_inclusion_id varchar`,
  },
  {
    descricao: "swap_requests.paired_new_city (de onde sai quem vai para a outra vaga)",
    sql: `ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS paired_new_city text`,
  },
  // 22/09 — endereço do colaborador (opcional). O GET de colaboradores lê todas
  // as colunas do schema: sem estas, a lista inteira quebraria.
  {
    descricao: "collaborators.address_street (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_street text`,
  },
  {
    descricao: "collaborators.address_number (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_number text`,
  },
  {
    descricao: "collaborators.address_complement (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_complement text`,
  },
  {
    descricao: "collaborators.address_zip (endereço, opcional)",
    sql: `ALTER TABLE collaborators ADD COLUMN IF NOT EXISTS address_zip text`,
  },
];

/**
 * Nunca derruba o servidor: um passo que falhe (permissão, banco em migração)
 * é registrado e a subida continua — o app pode funcionar sem parte disto,
 * mas não pode ficar fora do ar por causa daqui.
 *
 * 24/09: `ALTER TABLE … ADD COLUMN IF NOT EXISTS` pega lock ACCESS EXCLUSIVE
 * ANTES de descobrir que a coluna já existe. Com deploy autoscale, cada
 * instância nova fazia isso em tabelas quentes (team_inclusions, tickets…) com
 * tráfego ativo: um SELECT longo na fila e todas as queries seguintes atrás do
 * ALTER. Agora: (1) consulta o catálogo primeiro e só roda o DDL que falta;
 * (2) o DDL roda com lock_timeout de 2 s — se a tabela estiver ocupada, desiste
 * e tenta no próximo boot em vez de travar produção.
 */
const RE_COLUNA = /ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/i;
const RE_TABELA = /CREATE TABLE IF NOT EXISTS (\w+)/i;
const RE_INDICE = /CREATE INDEX IF NOT EXISTS (\w+)/i;

async function jaExiste(sql: string): Promise<boolean> {
  const col = sql.match(RE_COLUNA);
  if (col) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
      [col[1], col[2]],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const tab = sql.match(RE_TABELA);
  if (tab) {
    const r = await pool.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = current_schema() AND tablename = $1`,
      [tab[1]],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const idx = sql.match(RE_INDICE);
  if (idx) {
    const r = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`,
      [idx[1]],
    );
    return (r.rowCount ?? 0) > 0;
  }
  return false;
}

export async function garantirEstrutura(): Promise<void> {
  const faltando: Passo[] = [];
  for (const passo of PASSOS) {
    try {
      if (!(await jaExiste(passo.sql))) faltando.push(passo);
    } catch (erro) {
      console.error(`[estrutura] não consegui checar: ${passo.descricao} —`, erro instanceof Error ? erro.message : erro);
    }
  }
  if (faltando.length === 0) return;
  console.warn(`[estrutura] ${faltando.length} estrutura(s) ausente(s) — repondo (um db:push antigo apagou?)`);
  for (const passo of faltando) {
    const client = await pool.connect();
    try {
      await client.query(`SET lock_timeout = '2s'`);
      await client.query(passo.sql);
      console.warn(`[estrutura] reposto: ${passo.descricao}`);
    } catch (erro) {
      console.error(`[estrutura] falhou: ${passo.descricao} —`, erro instanceof Error ? erro.message : erro);
    } finally {
      client.release();
    }
  }
}
