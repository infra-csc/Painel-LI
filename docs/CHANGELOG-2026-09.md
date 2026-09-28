# O que mudou em setembro/2026 — Painel LI

Resumo, para o dono, dos commits do code review de 23–25/09:

| Commit | Data | Tamanho | Assunto |
|---|---|---|---|
| `80fbd554` | 24/09 | 1.153 arquivos (a maioria é a remoção de `attached_assets/`) | Code review 23/09: segurança, integridade das vagas, design system, performance e testes |
| `b998b8fc` | 24/09 | 173 arquivos | Rodada 2: acessibilidade, permissões alinhadas à API, storage por domínio, 75 testes de rota, docs |
| `d7647805` | 24/09 | — | Rodada 3: tipagem sem `any`, observação opcional na validação, docs e lint estrito |
| `ed306f20` | 24/09 | — | Dependências: drizzle-orm 0.45, vite 8, Node 22 no Replit e no CI |
| `fa6763d4` | 25/09 | 366 arquivos | Rodada 4: modo demonstração, páginas modularizadas, testes de componente, tipos do banco, estado compartilhado — ver [§5](#5-rodada-4-2509--fa6763d4) |

Detalhe técnico de cada regra: [`seguranca-e-permissoes.md`](seguranca-e-permissoes.md)
(autenticação e matriz de permissões), [`arquitetura.md`](arquitetura.md)
(onde cada coisa mora), [`migracoes.md`](migracoes.md) (banco),
[`demo.md`](demo.md) (modo demonstração).

> As seções 1–4 descrevem as rodadas 1–2 (24/09) e continuam válidas; o que a
> rodada 4 mudou por cima delas está em §5 e marcado nas decisões pendentes.

## 1. O que muda para quem usa

- **Login por senha bloqueado em produção.** `POST /api/auth/login` responde
  403 quando `NODE_ENV=production`. O único caminho é o Portal Norte (SSO). Em
  produção, **toda** a API exige sessão vinda do SSO — uma sessão antiga criada
  por senha é destruída na primeira chamada.
- **Conta inativa ou rejeitada perde o acesso na hora.** Inativar/rejeitar
  apaga as sessões da pessoa no banco; ela cai no próximo clique, não ao fim
  dos 7 dias do cookie. Depois de 12 h sem usar, a sessão também expira.
- **Troca de senha obrigatória.** Quem tem `mustChangePassword` (senha
  redefinida por admin) só consegue trocar a própria senha; o resto da API
  responde 403 até isso acontecer. O app mostra a tela de troca por cima.
- **Devolver nota fiscal exige motivo.** `POST /api/invoices/:id/return` sem
  `comment` responde 400. Recusar comparativo já exigia motivo.
- **Logística Interna e Área de Função não veem CPF, RG, nascimento, telefone
  nem endereço** dos colaboradores (a listagem é projetada por papel) e não
  abrem o anexo de documento. A exportação XLSX de colaboradores continua só
  para admin, Compras e RH.
- **Botões desabilitados explicam o motivo.** Em vez de sumir, a ação que o
  seu papel não pode executar aparece desabilitada com um balão dizendo a
  regra ("Só administradores e Compras podem inativar ou reativar"). Funciona
  no teclado e no toque. Sete telas que antes mostravam um botão que a API
  recusava com 403 foram alinhadas: contas de usuário (aprovar, inativar,
  redefinir senha) só admin; criar/editar evento só admin, Compras e
  Logística (RH entra para trocar a empresa pagadora); "Marcar como emitida"
  só admin e Compras; inativar/reativar colaborador só admin e Compras; Área
  de Função só edita vaga das funções em que é responsável; Logística Interna
  voltou a ver o "Confirmar" da vaga.
- **Status da vaga não é mais editável no modal.** Só o servidor grava
  `status`/`phase` (`shared/vaga-status.ts`): confirmar, aprovar cenotécnica e
  registrar passagem/hospedagem movem a vaga sozinhos. Confirmar de novo uma
  vaga já confirmada não a regride.
- **Cancelar vaga é uma ação própria** (`POST /api/team-inclusions/:id/cancel`),
  com confirmação; reativar leva a vaga para `reaberto`. Vaga com passagem
  emitida só admin cancela.
- **Menu em caixa de frase e sem cores por grupo.** "Validação de escala",
  "Conta corrente Flash"; ícones lucide em cinza, item ativo destacado. A mesma
  string aparece no menu, na trilha do topo e no título da aba.
- **Modais de sucesso viraram avisos** (toast com título descritivo), sem
  precisar fechar uma janela para continuar. Modais caseiros viram Dialog com
  proteção contra descarte de alterações não salvas.
- **Evento em foco compartilhado no Financeiro**: escolher o evento em
  Planejado, Realizado, Comparativo, NF ou Flash mantém a escolha ao trocar de
  tela. **Filtros na URL**: filtro e aba ficam no endereço — dá para
  compartilhar o link e o F5 não perde nada.
- Outros: conflito de agenda e colaborador inativo são recusados pelo servidor
  (antes só a tela avisava); trocas de colaborador viram transação (passagem
  e hospedagem antigas ficam marcadas para revisão, não somem); DELETE de
  evento vira "excluído" (soft delete) e é recusado se houver vaga viva;
  erros chegam em português com título claro; falha de rede não vira "lista
  vazia".

## 2. O que muda para quem opera (Replit)

1. **Secrets obrigatórios**: `SESSION_SECRET` e `SSO_SECRET` — sem eles o boot
   **aborta** em produção. Gerar com
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. **`PORTAL_ORIGIN`** (origem exata do portal, `https://host`, várias
   separadas por vírgula). **Sem ela o iframe do portal não carrega**
   (`Content-Security-Policy: frame-ancestors 'self'`), o `portal_return` é
   descartado e mutações vindas do portal podem cair no 403 do CSRF.
3. **`PORTAL_API_TOKEN`** (Bearer das rotas `/api/portal/*`). Enquanto não
   existir, o app aceita `SSO_SECRET` nesse header e avisa "DEPRECIADO" no
   boot. Definir no Painel e no portal.
4. **Rodar a migração de índices e constraints** (uma vez, em produção):
   `DATABASE_URL="<prod>" npx tsx scripts/migrations/2026-09-23-indices-e-constraints.ts`.
   Cria índices com `CONCURRENTLY`, UNIQUEs (só se não houver duplicata — o
   script imprime e pula), CHECKs `NOT VALID` de status/fase e FKs. Antes e
   depois: `npx tsx scripts/check-schema-drift.ts`. **`npm run db:push` não
   existe mais** — de propósito (ver `docs/migracoes.md`).
5. **Stop + Run** do workflow depois do `git pull` no Shell: o backend não tem
   hot reload; client novo contra servidor velho mostra "Servidor
   desatualizado".
6. **Rotacionar segredos**: `SESSION_SECRET` (o fallback de dev está
   versionado e é público), `SSO_SECRET` (em conjunto com o portal),
   `MARATONA_API_TOKEN` (avisar a Maratona) e a senha do Neon
   (`DATABASE_URL`, endpoint `-pooler`). Todas as sessões caem — esperado.
7. **Reescrever o histórico do Git**: `attached_assets/` (CSV/XLSX com CPF e
   RG de colaboradores, dumps de tela) saiu do rastreamento em `80fbd554`, mas
   continua em todos os commits anteriores. Depois da rotação:
   `git filter-repo --path attached_assets --invert-paths`, push forçado, todo
   mundo reclona. Conferir se o repositório é público ou compartilhado.
8. Manter **Max Machines = 1** enquanto o anti-reuso do JWT, o cache de usuário
   e o rate limit forem em memória por instância.
9. Antes de publicar: `npm run check`, `npm run lint`, `npm test`,
   `npm run test:rotas`, `npm run build` — o CI do GitHub roda os mesmos.

## 3. O que muda para quem desenvolve

- **`shared/vaga-status.ts`**: máquina de estados da vaga (única lista de
  confirmadas, `podeConfirmar`, `podeTransitar`, `faseParaStatus`). O client
  nunca manda `status`/`phase`; transições são `UPDATE … WHERE status =
  esperado` (0 linhas = 409). Também novos em `shared/`: `budget-engine.ts`
  (fórmula do Planejado), `conflito-de-agenda.ts`, `dias-de-trabalho.ts`,
  `hoje-sp.ts`.
- **Rotas por domínio**: `server/routes.ts` (6.600 linhas) virou 26 routers em
  `server/routes/<dominio>.ts` + `_compartilhado.ts` (papéis, auditoria,
  erros, upload, guardas). `routes.ts` só define a ordem de registro. Toda
  rota passa por `asyncHandler`; o tratador global traduz Zod, multer e
  Postgres para `{ message }` em pt-BR.
- **Storage por domínio**: `server/storage.ts` (classe de 133 métodos) virou
  20 módulos de funções em `server/storage/` (19 domínios + `_comum.ts`);
  `storage/index.ts` monta o objeto `storage` com a mesma superfície, então os
  imports não mudaram. `StorageHttpError` herda de `HttpError`.
- **App factory**: `server/app.ts` (`createApp`) monta headers, sessão, SSO,
  gate global, simulação, CSRF, rotas e tratador de erros; `server/index.ts`
  só faz o boot. Os testes usam a mesma fábrica.
- **`npm run test:rotas`**: 75 cenários HTTP em `server/test/` sobre PGlite
  (Postgres em WASM, sem rede), schema gerado do `shared/schema.ts` pelo
  drizzle-kit, login pelo caminho do SSO. Projeto vitest separado
  (`vitest.config.ts`: warm-up em `setup.ts`, 3 workers, `retry: 0`). 1.302
  testes no total.
- **ESLint 9** (`eslint.config.js`; `npm run lint` bloqueia erros, avisos são
  a dívida do design system; `lint:strict` para zero avisos) e **CI**
  (`.github/workflows/ci.yml`: tipos, lint, testes, testes de rota, build,
  `npm audit --audit-level=critical`).
- **Tokens do design system**: cores só por token semântico (0 hex no client,
  0 fontes < 11 px, Material Symbols removido); kit em `components/common`
  (`PageHeader`, `StatusBadge`, `ConfirmDialog`, `QueryState`, `EmptyState`,
  `MotivoDesabilitado`, `RequiredMark`, `virtual-rows`); zod em pt-BR
  (`lib/zod-pt-br.ts`). 29 dependências e 31 componentes órfãos removidos;
  bundle de entrada 69% menor, telas carregadas por rota.
- Client: `ApiError`/`apiErrorMessage` únicos (`lib/api-error.ts`), hook
  único de trocas (`hooks/use-swap-requests.ts`), ações de vaga em
  `hooks/use-vaga-acoes.ts`, evento em foco (`lib/evento-em-foco`), filtros
  na URL (`lib/use-url-state`), proteção de descarte
  (`lib/use-confirmar-descarte`).
- Docs: `docs/seguranca-e-permissoes.md` (matriz de ~197 rotas),
  `docs/arquitetura.md`, `docs/migracoes.md`, `scripts/migrations/README.md`,
  `design_guidelines.md`, `README.md`, `replit.md`.

## 4. Decisões pendentes do dono

> Estado em 25/09: o item 1 foi **parcialmente resolvido** pela rodada 4 (uma
> lista única de termos em `shared/cenotecnica.ts`; resta decidir se vira
> configuração) e o item 3 **foi feito** em `ed306f20`. Os itens 2 e 4
> continuam abertos. Ver §5.4.

1. **O que é "cenotécnica"?** Existem duas definições que não concordam:
   - `shared/scaling-rules.ts` `isCenotecnicaFunctionName` — nome contém
     "cenotecnica", "cenotécnica" ou "sup ceno". Decide se a vaga vai para
     aprovação do gestor (`aguardando_producao`) e quem pode aprovar.
   - `shared/alimentacao.ts` `isCenotecnicaFunction` — nome contém "ceno",
     **exceto** "Sup Ceno" (regra 17–18/08: supervisor de cenotécnica é
     produtor). Decide diária e valores de refeição.
   Consequências hoje: "Sup Ceno" precisa de aprovação do gestor mas recebe
   alimentação de "demais"; um nome como "Cenografia" cai na regra de
   alimentação de cenotécnica sem passar pela aprovação. Decidir se são dois
   conceitos (aprovação × valores) e nomeá-los assim, ou uma lista única.
2. **Recusar um comparativo já aprovado apaga os créditos do Flash.**
   `POST /api/budget-comparison/:id/reject` e `/return` aceitam comparativo
   `aprovado` e chamam `reverseFlashFromComparison`, que **deleta** os
   lançamentos automáticos do evento (não lança débito). Se o colaborador já
   gastou o crédito, o extrato some sem contrapartida. Alternativas: só
   permitir de `pendente`/`devolvido`, ou estornar por débito com histórico.
3. **Versões major de `drizzle-orm`/`drizzle-kit` e `vite`.** O projeto está
   em `drizzle-orm ^0.39`, `drizzle-kit ^0.30` e `vite ^5.4`; as majors
   seguintes ficaram fora da rodada porque mudam API e exigem passada completa
   nas telas e nos testes de rota (que usam a API do drizzle-kit para gerar o
   schema). Decidir quando abrir essa janela.
4. Já registradas em `seguranca-e-permissoes.md` §6: rotação de segredos,
   `PORTAL_ORIGIN`, histórico do Git, e-mail de "esqueci a senha" (não
   implementado; o reset real é por admin).


## 24/09 — dependências (commit de merge após d7647805)

- `drizzle-orm` 0.39 → 0.45, `drizzle-kit` 0.30 → 0.31, `vite` 5 → 8, `@vitejs/plugin-react` 4 → 6, `esbuild` 0.25 → 0.28. Nenhum ajuste de código; build do client 3× mais rápido.
- `npm audit`: 0 vulnerabilidades altas em runtime (resta `picomatch` via Tailwind 3, dev; `uuid` via google-cloud, moderada).
- **Exige Node 20.19+**: o `.replit` passou de `nodejs-20` para `nodejs-22` e o CI roda em Node 22. Depois do pull, confirme `node -v` no Shell do Replit antes do primeiro build.
- `drizzle-zod` ficou em 0.7 de propósito: a 0.8 emite schemas do zod v4 e o app é zod v3 (migrar os dois juntos, depois).

## 5. Rodada 4 (25/09 — `fa6763d4`)

Modo demonstração, páginas modularizadas, testes de componente, tipos do
banco e estado compartilhado entre instâncias. Ordem de publicação em §5.2 —
**há uma migração que precisa rodar ANTES do código subir**.

### 5.1 O que muda para quem usa

- **Nada muda de propósito nas telas.** A rodada dividiu as páginas grandes em
  módulos (Planejado, Realizado, Comparativo, NF, Flash, Configurações,
  Espelho operacional, Escalação, Validação de Escala, Colaboradores,
  Calendário) sem alterar comportamento — e ganhou 133 testes de componente
  para garantir isso no kit compartilhado.
- **Controle RH mais rápido.** A tela deixa de baixar quatro tabelas inteiras
  (todas as vagas, planejados, realizados e notas) e cruzá-las no navegador;
  o servidor devolve as linhas prontas em `GET /api/rh/controle` (9 consultas
  viraram 2 idas). Os contadores dos cards e a barra "Progresso geral" agora
  valem para o recorte inteiro mesmo com um filtro de status ativo.
- **Cenotécnica: uma regra só para os nomes.** Funções cujo nome contém
  "ceno" ou "cenotécnica" agora **passam pela aprovação do gestor** (antes só
  "cenotécnica"/"sup ceno" passavam — um nome como "Ceno Local" pulava a
  aprovação). Alimentação e diárias continuam tratando "Sup Ceno" como
  produtor (regra do dono de 17–18/08). Detalhe em `shared/cenotecnica.ts`.
- **Combobox de evento** com padrão WAI-ARIA completo (teclado, leitor de
  tela) e mais 4 correções de acessibilidade no kit.
- **Correções**: o filtro de mês/semana do Calendário voltou a aceitar a data
  vinda da URL (`/^(\d{4})-(\d{2})$/` — a regex tinha perdido a barra de
  escape e nunca casava) e o primeiro nome do colaborador voltou a ser cortado
  no espaço (`split(/\s+/)`, mesmo defeito).
- **Histórico da NF não perde decisões simultâneas**: o append no banco é
  atômico (`history || $1::jsonb`) em vez de ler-alterar-regravar.

### 5.2 O que muda para quem opera (Replit) — checklist de publicação

Ordem completa, do zero ao teste por papel. Os itens 1–3 e 6–8 vêm das rodadas
anteriores e continuam valendo se ainda não foram feitos.

1. **Secrets** (aba Secrets do Replit): `DATABASE_URL` (endpoint `-pooler`),
   `SESSION_SECRET`, `SSO_SECRET` (sem os dois o boot **aborta** em produção),
   `PORTAL_ORIGIN` (origem exata do portal; sem ela o iframe não carrega),
   `PORTAL_API_TOKEN` (Bearer de `/api/portal/*`; definir no portal também),
   `MARATONA_API_TOKEN`. **Nunca** definir `PAINEL_DEMO` em produção — a rota
   de login automático só é registrada fora de produção, mas a variável não
   tem o que fazer lá.
2. **Node 22**: o `.replit` já pede `nodejs-22` e o CI roda em 22 (vite 8 e
   drizzle-kit 0.31 exigem Node ≥ 20.19). Depois do pull, `node -v` no Shell
   deve mostrar `v22.x`. Se mostrar 20, o Replit ainda não recarregou os
   módulos do `.replit`: Stop, recarregar a aba, Run.
3. **`git pull`** no Shell do Replit e `npm install` (o lockfile mudou).
4. **Migrações, nesta ordem** (todas idempotentes; runbook em
   [`migracoes.md`](migracoes.md) §4 e §5.1). Antes de tudo:
   `DATABASE_URL="<prod>" npx tsx scripts/check-schema-drift.ts`.
   1. Pendentes de 23/09, se ainda não rodaram:
      `npx tsx scripts/migrations/2026-09-23-indices-e-constraints.ts`
      (resolver duplicatas listadas e repetir) e os blocos de
      `2026-09-23-status-fora-do-dominio.sql`.
   2. `psql "$DATABASE_URL" -f scripts/migrations/2026-09-24-observacao-da-validacao.sql`
      (só `ADD COLUMN`; o `ensure-schema` também repõe).
   3. `psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-estado-compartilhado.sql`
      — tabelas `sso_tokens_usados` e `rate_limits`. O boot também as cria;
      rodar à mão serve para não depender do primeiro boot **e** porque o
      login por SSO passa a gravar nela na primeira requisição.
   4. **`2026-09-25-jsonb.sql` — ANTES de publicar o código.** Rodar o bloco 0
      (JSON inválido; esperado vazio), corrigir o que aparecer, depois o
      script inteiro. Motivo: as decisões da NF (aprovar, devolver, recusar,
      check-in, reenviar) fazem `history = history || $1::jsonb` e **falham
      com 500 enquanto `invoices.history` for `text`**. O resto do código
      funciona nos dois estados. Fora do pico (`system_logs` é reescrita).
5. **Publicar** (Publish) e **Stop + Run** do workflow: o backend não tem hot
   reload; client novo contra servidor velho mostra "Servidor desatualizado".
   Conferir no log do boot: nenhum `[estrutura] falhou`, aviso do usuário
   `system` criado (uma vez) e **nenhuma** linha `[Demo]`.
6. **Depois de publicar**, fora do pico:
   1. `psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-timestamptz.sql`
      — ler o bloco 0: `SHOW timezone` deve ser `UTC` e o último `created_at`
      deve estar perto de `agora_utc`; se estiver ~3 h atrás, trocar `fuso`
      para `'America/Sao_Paulo'` no bloco 1. Tabela ocupada é listada no fim:
      repetir.
   2. `psql "$DATABASE_URL" -f scripts/migrations/2026-09-25-integridade.sql`
      — ler os diagnósticos (horas fora de "HH:MM", `user_id` órfão em
      `team_inclusion_logs`), aplicar as limpezas comentadas um caso por vez,
      rodar. CHECKs e FK entram `NOT VALID`.
   3. `VALIDATE CONSTRAINT` (lista pronta no bloco 6 do script e em
      `migracoes.md` §4.1) quando os diagnósticos voltarem vazios.
   4. `npx tsx scripts/check-schema-drift.ts` para fechar:
      "OK — banco alinhado com o schema."
7. **Testar por papel** em produção, via Portal: admin (Usuários, Logs),
   Logística Interna (Escalação → confirmar uma vaga, Espelho), Compras
   (Passagens → marcar emitida, Bagagem), Área de Função (Validação de Escala →
   validar), RH (Controle RH com e sem filtro de status, Planejado, NF →
   devolver com motivo — é o caminho que exige o jsonb). Antes de produção, o
   mesmo roteiro cabe no modo demonstração local (`npm run dev:demo`, seis
   logins em [`demo.md`](demo.md)).
8. Pendências que continuam da rodada 1: rotacionar segredos, reescrever o
   histórico do Git (`attached_assets/`), `Max Machines` pode passar de 1 no
   que depende de anti-reuso do JWT e rate limit (agora no Postgres) — o cache
   de usuário (60 s) e o do aprovador padrão (30 s) seguem por instância e
   são aceitáveis.
9. Antes de qualquer publicação: `npm run check`, `npm run lint`, `npm test`
   (os três projetos: 1.504 testes), `npm run build` — o CI do GitHub roda os
   mesmos em Node 22.

### 5.3 O que muda para quem desenvolve

- **Modo demonstração** — `npm run dev:demo` (porta 5055; preview
  `painel-li-demo` em `.claude/launch.json`). `server/dev/demo.ts` define
  `PAINEL_DB=pglite`, `NODE_ENV=development`, `PAINEL_DEMO=1` **antes** de
  importar o servidor, sobe um Postgres embutido (PGlite, WASM, em memória),
  gera o schema de `shared/schema.ts` pelo drizzle-kit
  (`server/dev/pglite-schema.ts`, o mesmo que os testes de rota usam), semeia
  `server/dev/demo-seed.ts` (6 usuários, 12 funções, 60 colaboradores, 8
  eventos, 150 vagas em todos os status canônicos, financeiro completo para 2
  eventos — determinístico, datas relativas a hoje) e liga o Vite. Login
  automático `GET /__demo/entrar?papel=admin|production|purchasing|function_area|financial|aprovador`
  cria a sessão como o SSO criaria; `server/app.ts` só registra a rota com
  `PAINEL_DEMO=1` **e** `NODE_ENV !== "production"` (teste: em produção → 404).
  Senha de todos: `Demo@2026`. Doc: [`demo.md`](demo.md).
- **Estado por instância → Postgres.** Anti-reuso do JWT do SSO em
  `sso_tokens_usados` (`registrarUsoDoToken` em `server/auth-guards.ts`:
  `INSERT … ON CONFLICT (jti) DO NOTHING RETURNING`; zero linhas = reuso) e
  contadores do `express-rate-limit` em `rate_limits`
  (`server/rate-limit-store.ts`, `PostgresRateLimitStore`: um UPSERT por
  request decide reinício ou soma; um store por limitador com prefixo
  `login:`/`reset:`; falha do banco → 500, fail-closed). Ambos limpam linhas
  vencidas no máximo 1× a cada 10 min, fora do caminho do request.
- **`GET /api/rh/controle?eventId=&status=`** (`server/routes/rh-controle.ts`,
  papel financeiro). Contrato em `shared/controle-rh.ts` (`montarControleRh`,
  função pura com 204 linhas de teste): `{ itens: LinhaDoControleRh[],
  contadores: { status, nf, rhAction, totalParaProgresso }, funcoes, geradoEm }`.
  Cada linha traz `id` (`pl-<planejado>` ou `ti-<vaga>`), `status` (um dos
  seis `StatusDaPrestacao`), `responsavelAtual`, `lastActivityDate`, `event`,
  colaborador/função, `teamInclusion`, `planned`, `actual` (linha completa do
  Realizado), `invoice`, `emiteNf`, `nfElegivel`, `rhPrecisaAgir`. `status`
  filtra só `itens` (seis status + `rh_action`, `col_action`, `nf_andamento`,
  `concluidos`); `contadores` e `funcoes` valem para o recorte inteiro. Com
  `eventId` inexistente → 404; filtro inválido → 400. O client
  (`components/rh/use-rh-control-data.ts`) invalida a chave nas mutações do
  Financeiro.
- **`shared/cenotecnica.ts`**: `TERMOS_CENOTECNICA = ["cenotecnica", "ceno"]`
  (sem caixa e sem acento), `ehCenotecnica(nome, { incluiSupCeno })`.
  `isCenotecnicaFunctionName` (fluxo do gestor) usa `incluiSupCeno: true`;
  `isCenotecnicaFunction` (alimentação) usa `false`. Os dois wrappers antigos
  continuam existindo; mudou o resultado do gestor para nomes com "ceno" solto.
- **Tipos do banco** (`shared/schema.ts` + `scripts/migrations/2026-09-25-*.sql`):
  `jsonb` em `scaling_change_requests.proposed_changes`, `invoices.history`
  (`NOT NULL DEFAULT '[]'`), `budget_actual.rh_adjusted_fields`,
  `budget_comparison.changes_log`, `system_logs.previous_data/new_data`;
  `timestamptz` em toda coluna de data/hora; `numeric(8,2)` em
  `variance_percent`; CHECK "HH:MM" nas 9 colunas de hora; usuário fixo
  `system` (`USUARIO_SISTEMA` no schema, `server/usuario-sistema.ts`) para a
  FK de `team_inclusion_logs.user_id`; `created_at/updated_at` e 9 booleanos
  `NOT NULL`. **A API não muda para o client**: `res.json` usa o replacer
  `serializarJsonNaBorda` (`server/http.ts`, chaves em
  `CHAVES_JSON_SERIALIZADAS_NA_BORDA`) que devolve as colunas jsonb como
  string JSON, como antes; o client lê pelos dois formatos com `lerJson`
  (`client/src/lib/json-seguro.ts`). Quando o client passar a ler objetos,
  basta tirar a chave do Set.
- **Client modularizado** (hooks de dados separados da apresentação, linhas
  de lista em `memo`): `components/budget` (Planejado 4.271 → 332 linhas na
  página; `hooks/use-budget-*`: queries, filters, draft, engine, edit-modal,
  planned/actual/comparison actions e data), `components/rh`,
  `components/invoices`, `components/flash`, `components/settings`,
  `components/operational-mirror` (Espelho 2.892 → 247), `components/collaborators`,
  `components/calendar`, `components/scaling/{inclusion-details,split-vaga,scaling-page}`,
  `components/scaling-validation/{suggestion-page,validation-page,event-view,grid-utils,suggestions-list}`,
  `components/forms/grid-team-inclusion`, `components/tables/team-inclusion`.
  Páginas em `pages/` são só composição (a maior, `events.tsx`, tem 770 linhas
  e ficou fora desta rodada).
- **Três projetos vitest** (`vitest.config.ts`): `unitarios` (`*.test.ts` de
  `shared/`, `client/src/`, `server/` fora de `server/test/`), `componentes`
  (`client/src/**/*.test.tsx` em jsdom + Testing Library, `setup.ts`
  em `client/src/test/` mocka `useAuth`, `renderComTudo` monta React Query,
  Tooltip, Router em memória e Toaster; 10 s de timeout; só o kit — `common/`,
  `ui/`, `layout/`, `lib/`, `hooks/` — tem teste de componente, telas não) e
  `rotas` (`server/test/`, PGlite, 3 workers). Total **1.504 testes**, 114 de
  rota HTTP (`demo-seed.test.ts` cobre seed, `/__demo/entrar`, anti-reuso,
  rate limit e `/api/rh/controle`; `tipos-do-banco.test.ts` cobre jsonb/
  timestamptz), 133 de componente.
- `.replit` em `nodejs-22`; CI em Node 22.

### 5.4 Decisões pendentes do dono (estado em 25/09)

1. **Cenotécnica virar configuração?** A lista de termos agora é uma só
   (`shared/cenotecnica.ts`) e a única diferença entre gestor e alimentação é
   o tratamento de "Sup Ceno". Resta decidir se isso vira chave em Valores
   Padrão / `system_settings` (lista de funções por id em vez de casar por
   nome) — até lá a regra mora no código.
2. **Recusar comparativo aprovado apaga os créditos do Flash** — igual a §4.2,
   sem mudança.
3. **Client lendo jsonb como objeto.** Hoje a borda serializa como string para
   não mudar nada nas telas. Decidir quando trocar (tirar as chaves de
   `CHAVES_JSON_SERIALIZADAS_NA_BORDA` e remover o `lerJson` para string) —
   sem urgência.
4. **`Max Machines` > 1 no Replit** agora é tecnicamente possível (anti-reuso
   e rate limit no banco); só o cache de usuário (60 s) e o do aprovador
   padrão (30 s) ficam por instância. Decidir se vale o custo.
5. Continuam de §4/§6 de `seguranca-e-permissoes.md`: rotação de segredos,
   `PORTAL_ORIGIN`, histórico do Git, e-mail de "esqueci a senha".


## 6. Rodada 5 (28/09 — `6c1757ee` e o commit seguinte)

### 6.1 O que muda para quem usa
- **Passagens — leitura de voucher:** vouchers da LATAM em que o nome do aeroporto vem na mesma linha da data e a sigla ("(MCZ)") cai sozinha na linha de baixo voltam a ser lidos com ida e volta (era o "PDF não está lendo mais": o leitor perdia os dois trechos de Maceió e devolvia uma ida de Guarulhos a Congonhas, sem volta). Quando um PDF de fato não abre, o log do servidor registra a causa exata.
- **Escalação com evento passado:** ao marcar um evento que já aconteceu com o recorte "Futuros" ligado, a lista vazia explica o motivo e oferece "Mostrar as N vagas" (troca o recorte para "Todos"). A lógica dos recortes não mudou; o Exportar continua disponível assim que a lista tem linhas.
- **Menu lateral:** 288 px de largura, nomes inteiros numa linha só, ícones com a cor do grupo, estrela de favorito só ao passar o mouse e barra de rolagem fina.
- **Histórico da passagem e da hospedagem:** toda ação aparece em português ("Sugestão aprovada", "Troca solicitada", "Passagem emitida"…). Antes, ações fora de uma lista curta saíam cruas ("suggestion_approved").
- **Passagens mais leve:** a tabela só desenha as linhas à vista (rolagem própria, cabeçalho fixo) e a busca deixa de travar a digitação enquanto a lista e os contadores dos filtros recalculam. Compras e produção não recebem mais um erro 403 escondido a cada abertura da tela (a leitura dos valores padrão é só admin/RH).
- **Cinco defeitos que os testes novos revelaram, corrigidos:** (1) Hospedagem: Esc ou clique fora com rascunho alterado pergunta "Descartar alterações?" em vez de perder o que foi digitado; (2) Registrar pelos vouchers: fechar com leituras ainda não registradas também pergunta; (3) Controle RH: o botão de expandir a prestação é o chevron (com `aria-expanded`), e a linha deixa de ser um "botão" com botões dentro; (4) Notas fiscais: "Anexe o arquivo da nota fiscal." aparece embaixo do botão de anexo (e some ao escolher o arquivo), não só no toast; (5) Inclusão em grade → Colar Excel: o rótulo "Cole os dados aqui:" está ligado ao campo.
- **Tabelas de cadastro num só componente:** Eventos, Funções, Usuários, Colaboradores, Log de auditoria, Valores por função, Empresas pagadoras, Lançamentos Flash, Bagagem e a lista do Calendário usam o mesmo `DataTable` (cabeçalho, ordenação, seleção, vazio, carregando, cartões no celular). Diferenças visuais mínimas: cabeçalho em `bg-surface-muted` e espaçamento por densidade.

### 6.2 O que muda para quem opera
- Nada além da checklist da §5.2. **Atenção ao `git pull` no Replit:** se o workspace tiver alterações locais, o pull cria conflito e o Vite mostra `Encountered diff marker` em todas as telas. Antes de puxar, descarte o que não for para ficar (`git status`, depois `git checkout -- .` ou `git stash`) e, se o conflito já aconteceu, `git fetch origin && git reset --hard origin/main`.
- Se usuários relatarem "não consegui abrir este PDF", procure no log do Replit a linha `[voucher] falha ao abrir o PDF`.

### 6.3 O que muda para quem desenvolve
- `npm run test:e2e`: 40 cenários Playwright sobre o modo demonstração (servidor próprio na 5058; passo no CI com upload do relatório em falha). O `playwright.config.ts` grava `PORT` no ambiente antes de subir o servidor.
- `server/vite.ts` não faz mais `process.exit` em erro de console do navegador (o Vite 8 encaminha o console e derrubava o dev server).
- `server/dev/pglite-schema.ts` limpa o `Array.prototype` depois de usar `drizzle-kit/api` (senão o pdf.js recusa qualquer PDF no demo e nos testes).
- `.gitattributes` com LF: acabam os avisos de CRLF em todo commit no Windows.
- `shared/voucher-parse.ts`: `juntarLinhasQuebradas` cobre a sigla numa linha própria (antes ou depois da data); `LINHA_TRECHO` aceita sigla sem nome. Testes com as duas ordens de extração.
- `shared/inclusion-timeline.ts`: `rotuloDaAcao(action)` é o ÚNICO lugar que traduz a chave de uma ação do log (`LOG[action].titulo`, senão snake_case → palavras traduzidas). Nenhum componente deve manter o próprio mapa de rótulos; `accommodation-modal-shared.ts` só guarda os ícones.
- `tickets-table.tsx` virtualiza com `useLinhasVirtuaisNaJanela` (novo em `common/virtual-rows.tsx`, sobre o `useWindowVirtualizer` do TanStack): a tabela tem altura natural e a página rola como sempre. A primeira versão usava `useLinhasVirtuais` numa caixa de altura fixa e ficou "estranha" (a página rolava por fora, a caixa por dentro e sobrava um vazio embaixo). `TicketRow` é `forwardRef` e recebe `data-index`. Atenção ao conferir: o painel do navegador do Claude não entrega eventos de scroll ao React; verificar rolagem virtual com Playwright (`checa-scroll`) ou num navegador comum. `pages/tickets.tsx` passa `useDeferredValue(filters)` para o hook de dados e para os contadores dos popovers — a barra de filtros continua com o valor imediato.
- `components/common/data-table.tsx` (+ 14 testes): o componente único de tabela — colunas declaradas (`papel` principal/secundária/ações/oculta monta o cartão padrão no celular), `sort`/`onSort` com `aria-sort`, `selectable`, `rowRender` para linhas memoizadas, `cardMode`/`cardRender`, `virtual`. Não filtra nem pagina: a tela é dona da lista. Ficam fora, por decisão: Escalação (virtualizada e com célula própria), Espelho operacional, tabela de inclusões, grade editável de funções, prévia de importação e relatórios de bagagem.
- `pages/events.tsx` 778 → 121 linhas; `components/events/` (`use-events-data`, `use-events-filters` com a URL, KPIs, barra de filtros, tabela, lista/cartão, calendários, vazio, ações da linha).
- Testes de componente de domínio: 15 arquivos novos (linha e diálogo da inclusão, linha da Escalação, rodapé dos detalhes, diálogo de validação, badges das sugestões, aguardando aprovação, linha e vouchers de Passagens, modal de Hospedagem, cartão de prestação do RH, NF, cartão e linha do Planejado, grade de funções) sobre `test/fixtures-dominio.ts`, `test/orcamento-fixture.ts` (passa pelo `calcularPlanejadoDaVaga` real) e `test/query-client-api.ts`. Sem `data-testid` novo: consultas por papel e rótulo.
- `client/src/test/setup.ts` chama `limparToasts()` (novo em `hooks/use-toast.ts`) depois de cada teste: os toasts vivem em memória de módulo, sobrevivem ao `cleanup` e um toast antigo é uma camada do Radix acima do modal — o Esc do Dialog passa a ser ignorado (foi o que fez dois testes de descarte falharem só quando o arquivo rodava inteiro).
- `tickets-work-queue.tsx` e `rh-summary.tsx` sem `style={{ color }}`: cor por classe (`text-warning`, `text-danger-strong`…) via mapa `TONE_CLASS`.

## 7. 29/09 — responder ao aprovador sem mudar a vaga

### 7.1 O que muda para quem usa
- **Validação de escala:** quem recebe a vaga de volta (pedido negado, vaga reprovada ou devolvida) e só quer responder ao aprovador ("aprovado pelo Henrique") abria "Pedir ajuste" e travava em "Nada foi alterado". Agora, se nada mudou na vaga, o aviso explica e oferece **"Validar a vaga com este motivo como observação"**: o pedido de ajuste fecha, a confirmação de validação abre com o motivo já escrito na observação, e a vaga segue para o aprovador com a resposta. Pedido de ajuste vazio continua não existindo — a regra do dono não mudou; só o caminho ficou à vista.

### 7.2 O que muda para quem opera
- Nada. Sem migração; Pull + Stop/Run.

### 7.3 O que muda para quem desenvolve
- `AdjustRequestDialog` ganhou `onValidarEmVez?(motivo)`; a página da Validação só passa a função para vaga em `sugestao_pendente` (no modal da Escalação não aparece). `openValidateConfirm(ids, notaInicial?)`.
- `adjust-request-dialog.test.tsx` (2 testes). Semente do demo: vagas da Validação passam a ter `workDays` (como na vida real), senão o formulário de ajuste nunca chegava à checagem de "nada mudou".

