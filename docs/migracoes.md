# Migrações de banco — runbook

> Escrito em 24/09/2026 a partir de `scripts/migrations/*`, `server/ensure-schema.ts`,
> `scripts/check-schema-drift.ts`, `drizzle.config.ts` e `migrations/`.
> Índice cronológico dos scripts: [`scripts/migrations/README.md`](../scripts/migrations/README.md).

## 1. Regras de ouro

1. **Nunca `npm run db:push`** (nem `drizzle-kit push`). O script nem existe
   mais no `package.json` — de propósito.
2. Desenvolvimento e produção são **bancos diferentes**. Migração rodada só no
   dev não chega ao ar; o sintoma em produção é um "Dados inválidos" genérico
   (foi assim que `tickets.return_arrival_time` sumiu em 28/08).
3. Toda mudança de schema = **script idempotente em `scripts/migrations/`** +
   **espelho em `shared/schema.ts`**. Um sem o outro é bug.
4. Antes e depois de rodar em produção:
   `DATABASE_URL="<prod>" npx tsx scripts/check-schema-drift.ts`.

## 2. Por que não há `db:push`

- O `push` sincroniza o banco com o schema **do checkout que o executa**. Em
  28/08 e 31/08 ele foi rodado de um checkout antigo apontando para produção
  e **apagou** colunas e tabelas mais novas (`tickets.return_arrival_time`,
  `event_comments`, as cinco colunas da roteirização). `server/ensure-schema.ts`
  existe por causa disso.
- Ele produz diffs falso-positivos na tabela `session` (criada pelo
  `connect-pg-simple`, não pelo Drizzle) e em defaults de timestamp, e chega a
  propor *recriar* colunas — perda de dados.
- Índices/UNIQUEs criados por script com `CONCURRENTLY`, CHECKs `NOT VALID` e
  FKs `NOT VALID` não têm equivalente no `push`; ele os derrubaria ou recriaria
  com lock.
- O snapshot em `migrations/0000_sad_living_tribunal.sql` + `migrations/meta`
  é de **13/08** e não reproduz o banco atual. **O banco vivo é a fonte de
  verdade**, espelhada em `shared/schema.ts`.

## 3. Como escrever uma migração

### 3.1 Nome e cabeçalho

`scripts/migrations/AAAA-MM-DD-assunto.ts` (ou `.sql` para DDL puramente
aditivo). O cabeçalho é a documentação: o que muda, por quê, se é DDL ou
dados, se é idempotente, e a linha de execução. O `README.md` da pasta é gerado
a partir desses cabeçalhos.

### 3.2 Padrão `.ts` (o de `2026-09-23-indices-e-constraints.ts`)

```ts
/**
 * Migração — <assunto> (<data>)
 * O que faz e por quê. DDL/dados. Idempotente: sim/não.
 *   DATABASE_URL=... npx tsx scripts/migrations/AAAA-MM-DD-assunto.ts
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL não definido."); process.exit(1); }
  const pool = new Pool({ connectionString: url });
  const q = (sql: string, params?: unknown[]) => pool.query(sql, params);

  // 1) DDL aditivo — IF NOT EXISTS, um comando por statement
  await q(`ALTER TABLE x ADD COLUMN IF NOT EXISTS y text`);

  // 2) Índice sem travar a tabela — fora de transação; derrubar índice
  //    INVÁLIDO de mesmo nome antes (uma criação interrompida deixa um)
  await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS x_y_idx ON x (y)`);

  // 3) UNIQUE — checar duplicatas ANTES; se houver, imprimir e PULAR
  const dup = await q(`SELECT y, count(*) FROM x GROUP BY y HAVING count(*) > 1`);
  if (dup.rowCount) { console.table(dup.rows); } else {
    await q(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS x_y_uq ON x (y)`);
  }

  // 4) CHECK / FK — NOT VALID (só linhas novas); VALIDATE é passo separado
  await q(`DO $$ BEGIN
    ALTER TABLE x ADD CONSTRAINT x_y_chk CHECK (y IN ('a','b')) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  // 5) Dados — UPDATE restrito ao caso conhecido, com RETURNING/rowCount no log
  await pool.end();
}
main().catch((e) => { console.error("Falha:", e); process.exit(1); });
```

Regras que o padrão encarna:

| Regra | Por quê |
|---|---|
| **Idempotente**: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DO $$ … EXCEPTION WHEN duplicate_object`, `pg_constraint`/`pg_indexes` antes de criar | pode rodar duas vezes (dev e prod; ou de novo após falha parcial) sem erro |
| **Aditivo**: nunca `DROP COLUMN`, nunca `ALTER TYPE` destrutivo | o app antigo pode ainda estar no ar durante o deploy |
| `CREATE INDEX CONCURRENTLY`, um por statement, **fora de transação** | não trava a tabela; `CONCURRENTLY` não roda dentro de `BEGIN` |
| Índice inválido de mesmo nome é derrubado antes (`pg_index.indisvalid = false`) | `IF NOT EXISTS` pularia o índice quebrado para sempre |
| UNIQUE só depois da **checagem de duplicatas**; com duplicata, imprime e pula | limpeza é decisão do dono, não do script |
| CHECK e FK entram `NOT VALID` | valem para linhas novas/alteradas sem varrer (e sem travar) a tabela |
| `SET lock_timeout` curto quando o DDL precisa de `ACCESS EXCLUSIVE` (`ALTER TABLE … ADD COLUMN`) | com tráfego, um ALTER na fila bloqueia todo mundo atrás dele (ver `ensure-schema.ts`) |
| Migração de **dados** em UPDATE restrito ao caso, com contagem antes/depois | reversível na leitura do log; nunca "UPDATE tudo" |
| Log legível (`+ criado`, `= já existia`, `! pulado`, `x falhou`) e resumo de pendências no fim | quem roda em produção precisa saber o que ficou faltando |
| Não roda no deploy nem no boot | o dono decide o momento |

### 3.3 Padrão `.sql`

Para DDL trivialmente aditivo (`ADD COLUMN IF NOT EXISTS`), um `.sql` com
comentário no topo basta — ver `2026-09-22-colaborador-endereco.sql`. Rodar
com `psql "$DATABASE_URL" -f scripts/migrations/arquivo.sql` (ou colar no
SQL editor do Neon). Diagnósticos/limpezas que exigem conferência humana
também são `.sql`, com os `UPDATE` **comentados** (padrão de
`2026-09-23-status-fora-do-dominio.sql`).

### 3.4 Espelho em `shared/schema.ts`

Coluna nova → campo novo na `pgTable`. Índice/UNIQUE/CHECK → terceiro
argumento da `pgTable` (é o que impede um `drizzle-kit` futuro de "derrubar
o que não conhece"). Coluna que o `storage` lista em `select` explícito **quebra
toda a listagem** se faltar no banco — por isso as mais críticas também estão
em `server/ensure-schema.ts`.

## 4. Como rodar em produção

```bash
# 1) drift antes (só leitura)
DATABASE_URL="postgresql://…-pooler…" npx tsx scripts/check-schema-drift.ts

# 2) a migração
DATABASE_URL="postgresql://…-pooler…" npx tsx scripts/migrations/AAAA-MM-DD-assunto.ts
#    ou, para .sql:
psql "$DATABASE_URL" -f scripts/migrations/AAAA-MM-DD-assunto.sql

# 3) drift depois — esperado: "OK — banco alinhado com o schema."
DATABASE_URL="postgresql://…-pooler…" npx tsx scripts/check-schema-drift.ts
```

- A connection string de produção está na aba Database → Production do
  Replit. Use o endpoint `-pooler`.
- Rodar **fora do horário de operação** quando houver `ALTER TABLE` em
  tabela quente (`team_inclusions`, `tickets`, `accommodations`).
- Scripts com `CONCURRENTLY` levam mais tempo; não interromper. Se
  interromper, rodar de novo (o script derruba o índice inválido).
- Saída "Migração concluída COM PENDÊNCIAS": ler a lista, resolver
  (duplicatas, órfãos) e rodar de novo — é idempotente.
- Depois: republicar o app (Publish) se a migração acompanha código novo, e
  reiniciar mesmo sem código novo quando o `ensure-schema` tiver avisado algo
  no boot anterior.

### 4.1 `NOT VALID` → `VALIDATE CONSTRAINT`

Constraints entram `NOT VALID` para não travar. Quando as linhas antigas
estiverem limpas:

```sql
ALTER TABLE team_inclusions VALIDATE CONSTRAINT team_inclusions_status_chk;
ALTER TABLE team_inclusions VALIDATE CONSTRAINT team_inclusions_phase_chk;
ALTER TABLE swap_requests   VALIDATE CONSTRAINT swap_requests_status_chk;
ALTER TABLE swap_requests   VALIDATE CONSTRAINT swap_requests_paired_inclusion_fk;
ALTER TABLE invoices        VALIDATE CONSTRAINT invoices_checkin_by_fk;
ALTER TABLE budget_notes    VALIDATE CONSTRAINT budget_notes_author_fk;
```

`VALIDATE` pega só `SHARE UPDATE EXCLUSIVE` (não bloqueia leitura/escrita
normal) e falha com a primeira linha que viola — corrija e repita.

### 4.2 Checagem de duplicatas antes de UNIQUE

O script de 23/09 já imprime os grupos duplicados de cada UNIQUE e pula o
índice. Para decidir a limpeza, as consultas estão no próprio script (campo
`duplicatas`). Regra: **nunca** apagar linha de produção pelo script; o dono
escolhe qual fica e roda o `UPDATE`/`DELETE` à mão, depois reexecuta a
migração.

## 5. O que está pendente agora (ordem recomendada)

1. **`2026-09-23-indices-e-constraints.ts`** contra produção. Ler o relatório:
   índices únicos pulados (duplicatas) e a contagem de status/fase fora do
   domínio.
2. Resolver as duplicatas que ele listar (`users.email` case-insensitive,
   `function_values.function_id`, trocas/pedidos pendentes em dobro,
   `budget_actual.planned_id` raiz) e rodar o script de novo até "Migração
   concluída".
3. **`2026-09-23-status-fora-do-dominio.sql`**: rodar os blocos de
   **diagnóstico** (1, 1b, 1c); conferir contagens; descomentar e executar um
   `UPDATE` por vez (2a–2e), conferindo o `UPDATE n` contra o diagnóstico.
   Só quando 1b voltar vazio, executar o bloco 3 (troca o CHECK "com legados"
   pelo canônico).
4. **`VALIDATE CONSTRAINT`** (§4.1) nos CHECKs e nas três FKs `NOT VALID`.
   Órfãos das FKs (`swap_requests.paired_inclusion_id`, `invoices.checkin_by`,
   `budget_notes.author_id`) aparecem no relatório do passo 1.
5. `check-schema-drift.ts` para fechar.

Fora dessa fila e sem urgência: `2026-08-20-escala-responsaveis.ts` e
`2026-08-27-aprovador-padrao.ts` são **seeds** (só se a produção ainda não os
tiver); `2026-08-17-bagagem-historico.ts` importa dados históricos uma vez.

## 6. Baseline com `pg_dump --schema-only`

Antes de qualquer mudança de mecanismo, gerar um retrato do banco vivo:

```bash
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges \
  --exclude-table=session \
  > migrations/baseline-$(date +%F).sql
```

- `--exclude-table=session`: tabela do `connect-pg-simple`, não é do Drizzle.
- Guardar no repositório: é o único artefato que reproduz produção do zero
  (o `0000_*.sql` de 13/08 não reproduz).
- Comparar com `shared/schema.ts` **à mão** para achar o que o
  `check-schema-drift` não vê (ver §7).

## 7. Proposta: migrar para `drizzle-kit generate` + `migrate`

`drizzle.config.ts` já aponta `schema: ./shared/schema.ts`, `out: ./migrations`.
O fluxo alvo:

```bash
npx drizzle-kit generate --name assunto   # gera migrations/NNNN_assunto.sql a partir do diff do schema
# revisar o SQL gerado (obrigatório), ajustar CONCURRENTLY / NOT VALID à mão
npx drizzle-kit migrate                   # aplica o que falta, registra em __drizzle_migrations
```

O que precisa ser verdade **antes** de ligar isso:

1. **`shared/schema.ts` espelhando 100 % o banco** — colunas, tipos, defaults,
   NOT NULL, índices, UNIQUEs, CHECKs e FKs. Hoje só as colunas são conferidas.
2. **`scripts/check-schema-drift.ts` compara apenas nomes de tabela e
   coluna** (lê `information_schema.columns` e `getTableConfig().columns`). Ele
   não vê tipo, nullability, default, índice, constraint nem tabelas que existem
   no banco e não no schema. Para o passo 1 é preciso o baseline do §6 e uma
   conferência de `pg_indexes`/`pg_constraint` contra o terceiro argumento de
   cada `pgTable` — ou estender o script para isso.
3. Regenerar `migrations/meta/0000_snapshot.json` a partir do banco real
   (`drizzle-kit introspect` num diretório separado, comparar, substituir) e
   marcar o baseline como já aplicado na tabela `__drizzle_migrations` de
   produção — senão o `migrate` tentaria recriar tudo.
4. Aceitar que `generate` não emite `CONCURRENTLY` nem `NOT VALID`: o SQL
   gerado é revisado e editado à mão antes de entrar no repositório.
5. Definir quem roda `migrate` e quando (continua sendo o dono, à mão, com
   `DATABASE_URL` de produção — não o deploy).
6. Manter `server/ensure-schema.ts` até o primeiro ciclo completo dar certo.

Enquanto os itens 1–3 não estiverem prontos, o mecanismo atual (scripts
idempotentes + espelho manual) é o correto.

## 8. `server/ensure-schema.ts` — rede de segurança no boot

- Roda em `server/index.ts` **antes** de aceitar tráfego.
- Contém só o que a aplicação **não sobrevive sem** (colunas lidas por
  `select` explícito do storage, `event_comments`, colunas de roteirização e
  de empreita/permuta/endereço) — as que um `db:push` antigo já apagou.
- Desde 24/09: (1) consulta `information_schema.columns` / `pg_tables` /
  `pg_indexes` **antes** e só executa o DDL que falta — `ADD COLUMN IF NOT
  EXISTS` pega `ACCESS EXCLUSIVE` antes de descobrir que a coluna existe, e no
  autoscale cada instância nova fazia isso em tabela quente; (2) o DDL roda com
  `SET lock_timeout = '2s'` — tabela ocupada → desiste, loga e tenta no
  próximo boot.
- Nunca derruba o servidor: passo que falhar é logado (`[estrutura] falhou`)
  e a subida continua.
- **Não é mecanismo de migração**: não registra o que rodou, não migra dados,
  não cria índices de performance. Toda estrutura que entra aqui **também**
  precisa existir em `scripts/migrations/` (registro) e em `shared/schema.ts`.

## 9. Ferramentas relacionadas

| Script | Para quê |
|---|---|
| `scripts/check-schema-drift.ts` | tabelas/colunas de `shared/schema.ts` que faltam no banco (só nomes) |
| `scripts/export-data.ts` / `import-data.ts` | cópia de dados dev → prod (ver `scripts/MIGRATION-INSTRUCTIONS.md`; a dica "rode `db:push`" daquele guia está **obsoleta**) |
| `scripts/legado/fix-production-status.sql`, `identificar-registros-afetados.sql` | incidente do reconfirmar que regredia `passagem_comprada`; referência histórica |
| `scripts/migrations/check-bagagem-match.ts` | conferência (só leitura) do seed de bagagem |
