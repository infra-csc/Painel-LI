# Arquitetura do Painel LI

Atualizado em 25/09/2026, depois do code review completo (commits `80fbd554`,
`b998b8fc`, `d7647805` e `fa6763d4`). Este documento diz **onde cada coisa
mora e por quê**; o `README.md` diz como rodar; `docs/demo.md` explica o modo
demonstração.

## Camadas

```
client/src/pages              telas (uma por rota, carregadas sob demanda) — só composição
client/src/components         componentes por domínio (budget, rh, invoices, flash, settings,
                              operational-mirror, collaborators, calendar, scaling/*, scaling-validation/*,
                              forms/grid-team-inclusion, tables/team-inclusion) + kit em components/common
client/src/lib                cliente de API (queryClient, ApiError), permissões (role-utils), URL state,
                              evento em foco, leitura tolerante de jsonb (json-seguro)
client/src/hooks              auth, toast, trocas (useSwapRequests), ações de vaga (use-vaga-acoes),
                              dados do Financeiro (use-budget-*)
client/src/test               setup do projeto vitest "componentes": jsdom, useAuth mockado, renderComTudo
shared/                       REGRAS DE NEGÓCIO puras + schema Drizzle/Zod (usadas pelos dois lados)
server/index.ts               boot do processo: ensure-schema, createApp, Vite/estático, listen
server/app.ts                 FÁBRICA da aplicação (createApp): headers, sessão, SSO, gate global,
                              simulação, CSRF, rotas, tratador de erros — a mesma para produção,
                              testes e demo; registra /__demo/entrar só com PAINEL_DEMO=1 fora de produção
server/auth-guards.ts         req.user, cache de usuário, autenticação por SSO, anti-reuso do JWT
                              na tabela sso_tokens_usados (registrarUsoDoToken)
server/rate-limit-store.ts    Store do express-rate-limit na tabela rate_limits (um por limitador)
server/http.ts                HttpError, asyncHandler, protegerRotas, tratador global de erros,
                              serializarJsonNaBorda (jsonb → string JSON em res.json)
server/usuario-sistema.ts     INSERT idempotente do usuário fixo `system` (FK de team_inclusion_logs)
server/routes.ts              ORDEM de registro dos routers (a ordem define quem atende caminhos sobrepostos)
server/routes/                27 routers por domínio + _compartilhado.ts (papéis, auditoria, erros,
                              upload, guardas da vaga e do financeiro)
server/storage/               20 módulos de acesso a dados (19 domínios + _comum.ts); index.ts monta
                              o objeto `storage` com a mesma superfície do antigo storage.ts
server/scaling-validation.ts, simulation.ts, operational-mirror.ts, flash-credit.ts,
server/event-guard.ts, vaga-guards.ts, objectAcl.ts, objectStorage.ts
server/dev/                   modo demonstração: demo.ts (entrada de `npm run dev:demo`), pglite-schema.ts
                              (DDL gerado do drizzle — também usado pelos testes), demo-seed.ts, demo-login.ts
server/test/                  testes de rota HTTP: harness.ts (PGlite + supertest), setup.ts, *.test.ts
scripts/migrations            migrações idempotentes, rodadas à mão (runbook em docs/migracoes.md)
```

Routers em `server/routes/`: `auth`, `usuarios`, `eventos`,
`funcoes-e-responsaveis`, `colaboradores`, `escalacao`, `passagens`,
`hospedagem`, `espelho-operacional`, `financeiro-legado`, `comentarios`,
`anexos`, `logs`, `valores-por-funcao`, `orcamento-planejado`,
`orcamento-realizado`, `orcamento-comparativo`, `configuracoes`,
`notas-fiscais`, `empresas-pagadoras`, `flash`, `bagagem`,
`notas-e-historico`, `trocas`, `integracao-maratona`, `portal`,
`rh-controle` (novo em 25/09: `GET /api/rh/controle`, o cruzamento do Controle
RH pronto para a tela — regra pura em `shared/controle-rh.ts`). A Validação
de Escala e a simulação registram rotas a partir de `server/scaling-validation.ts`
e `server/simulation.ts`.

Módulos em `server/storage/`: `usuarios`, `eventos`, `funcoes`,
`responsaveis`, `colaboradores`, `vagas`, `vagas-historico`, `passagens`,
`hospedagem`, `financeiro-legado`, `comentarios`, `logs-do-sistema`,
`valores-por-funcao`, `orcamento`, `configuracoes`, `notas-fiscais`,
`empresas-pagadoras`, `flash`, `bagagem`, `validacao-de-escala`, mais
`_comum.ts` (`StorageHttpError`, que herda de `HttpError`, e helpers). Trocas,
espelho operacional, simulação, portal e crédito Flash consultam o banco
direto nos próprios módulos.

**Regra prática:** se uma regra precisa valer no navegador e no servidor, ela
mora em `shared/` com teste. O servidor é a autoridade; o client só antecipa a
resposta para o usuário não esperar um 409.

## Segurança em camadas (server/app.ts, `createApp`)

1. Headers: `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`,
   `Content-Security-Policy: frame-ancestors 'self' <PORTAL_ORIGIN>`, HSTS em produção.
   Sem `X-Frame-Options` porque o app roda em iframe do Portal Norte.
2. Sessão em Postgres (`connect-pg-simple`, `disableTouch`), cookie `httpOnly`,
   `Secure` + `SameSite=None` em produção, 7 dias com inatividade de 12 h.
3. SSO: `?portal_sso=<JWT HS256>` com `issuer`, `exp`, `iat`, `email`
   obrigatórios, `maxTokenAge` 10 min, anti-reuso por `jti` gravado na tabela
   `sso_tokens_usados` (compartilhada entre instâncias desde 25/09).
   `session.regenerate` antes de gravar. Em produção **só sessão de SSO**
   acessa a API. Rate limit de login/reset na tabela `rate_limits`.
4. Gate global de `/api`: exige sessão, carrega `req.user` (cache 60 s), nega
   conta inativa ou não aprovada, força troca de senha quando `mustChangePassword`.
5. CSRF fail-closed: mutação só com `Content-Type` JSON ou multipart e `Origin`
   na allowlist (hosts do app + `PORTAL_ORIGIN`). Rotas server-to-server usam
   `Authorization: Bearer` (`/api/integration`, `/api/portal`).
6. Autorização por papel dentro da rota (`requireRoles`, `ROLE_GROUPS` em
   `shared/roles.ts`) e por escopo (dono do anexo, responsável da função).
7. Toda rota passa por `asyncHandler`; uma promise rejeitada vira resposta de
   erro, nunca queda do processo. O tratador global traduz Zod, multer e códigos
   do Postgres (23503, 23505) para `{ message }` em pt-BR.

## Máquina de estados da vaga (`shared/vaga-status.ts`)

A vaga (`team_inclusions`) tem `status` e `phase`. **Só o servidor grava os
dois**: o cliente nunca manda `status`/`phase`; ele chama rotas de transição
(`/confirm`, `/cancel`, `/reactivate`, `/approve-production`, trocas) e o status
de logística é derivado quando passagem e hospedagem são gravadas.

```
planejado | reaberto | escalacao ──confirm──▶ escalado ──passagem──▶ passagem_comprada ─┐
                │                     │                                                 ├─▶ hospedagem_passagem_comprada ─▶ aprovado ─▶ concluido
                │ (cenotécnica)       └──────────hospedagem──▶ hospedagem_comprada ────┘
                └──▶ aguardando_producao ──aprova gestor──▶ escalado
                                        ──reprova────────▶ escalacao (vaga aberta)
qualquer ──cancel──▶ cancelado ──reactivate──▶ reaberto
sugestao_pendente ▶ sugestao_validada ▶ sugestao_aprovada ▶ planejado   (Validação de Escala)
```

- `podeConfirmar(status)`: só a partir de `planejado`, `reaberto`, `escalacao`
  (e legados). Confirmar de novo uma vaga confirmada **não regride** o status
  (esse bug gerou o incidente do `scripts/legado/fix-production-status.sql`).
- `podeTransitar(de, para)`: tabela `TRANSICOES`. `cancelado` só volta para
  `reaberto`; `*_comprada` nunca volta para `escalado`.
- `CONFIRMED_STATUSES`: a **única** lista de "vaga confirmada" (antes eram cinco).
- `faseParaStatus(status)`: mantém `phase` coerente com `status`.
- Status legados (`incluido`, `pendente`, `aguardando_passagem`…) só são lidos
  e rotulados; nunca gravados. O CHECK `NOT VALID` no banco documenta o domínio.

Transições no servidor seguem o padrão `UPDATE … WHERE id = $1 AND status =
<esperado> RETURNING` dentro de transação; zero linhas = 409 "o registro mudou".

## Outras regras compartilhadas

| Regra | Módulo | Quem usa |
|---|---|---|
| Conflito de agenda (sobreposição bloqueia; um dia em comum avisa) | `conflito-de-agenda.ts` | Escalação (client) e `/confirm`, PATCH, trocas (server) |
| Dias de trabalho e diárias a partir do período | `dias-de-trabalho.ts` | PATCH da vaga e Espelho |
| "Hoje" em São Paulo | `hoje-sp.ts` | tudo que compara datas com hoje |
| Diárias 2026, deflação, percurseiro, alimentação | `calculation-rules.ts`, `alimentacao.ts` | Planejado (client) e `apply-defaults` (server) |
| Fluxo de prestação de contas e NF | `prestacao-rules.ts` | Financeiro |
| Papéis, aliases legados, grupos | `roles.ts` | `requireRoles`, `hasRole` |
| Dia da prova (domingo do período) | `dia-da-prova.ts` | filtros e prazos |
| Prazos por etapa contados do evento | `prazos-da-escala.ts` | Análises |
| Função é de cenotécnica? (`TERMOS_CENOTECNICA`, `ehCenotecnica(nome, { incluiSupCeno })`) | `cenotecnica.ts` | `scaling-rules.ts` (gestor: inclui Sup Ceno) e `alimentacao.ts` (diárias/refeição: exclui Sup Ceno) |
| Cruzamento do Controle RH (prestação × planejado × NF × isenção) — os tipos são o contrato de `GET /api/rh/controle` | `controle-rh.ts` | `server/routes/rh-controle.ts` (server) e `components/rh/use-rh-control-data.ts` (client) |

## Client

- **Dados:** `lib/queryClient.ts` é o único caminho para a API. `ApiError`
  carrega `status`, `body` e uma `message` já legível; `apiErrorMessage` é o
  texto para toast. Falha de rede vira status 0 "Sem conexão". 401 redireciona
  para o login uma vez só. `queryClient.clear()` no login e no logout.
- **Uma chave, um formato:** cada recurso tem um hook (`useSwapRequests`,
  `useScalingData`…) e nunca dois `queryFn` para a mesma `queryKey`.
- **Estados:** `components/common/query-state.tsx` (`QueryState`, `QueryError`,
  `useQueriesState`). Falha de rede nunca vira "lista vazia".
- **Contexto:** evento em foco compartilhado (`lib/evento-em-foco`), filtros na
  URL (`lib/use-url-state`), proteção de descarte em modais
  (`lib/use-confirmar-descarte`).
- **Kit:** `PageHeader`, `StatusBadge` (dicionário semântico de tons),
  `ConfirmDialog`, `EmptyState`, `LoadingState`, `QueryError`. Tokens em
  `design_guidelines.md`.
- **Módulos por domínio (25/09):** cada tela grande virou uma pasta em
  `components/<dominio>/` com três tipos de arquivo — hooks de dados
  (`use-*-data.ts`, `use-*-mutations.ts`, `use-*-filters.ts`), utilidades
  puras com teste (`*-utils.ts`) e componentes de apresentação (linhas de
  lista em `memo`). A página em `pages/` só compõe. Exemplos: `budget/` (+
  `hooks/use-budget-*`), `rh/`, `invoices/`, `flash/`, `settings/`,
  `operational-mirror/`, `collaborators/`, `calendar/`,
  `scaling/{inclusion-details,split-vaga,scaling-page}`,
  `scaling-validation/{suggestion-page,validation-page,event-view,grid-utils,suggestions-list}`,
  `forms/grid-team-inclusion/`, `tables/team-inclusion/`.
- **jsonb na borda:** o servidor devolve as colunas jsonb (`history`,
  `rhAdjustedFields`, `changesLog`, `proposedChanges`, `previousData`/`newData`)
  como **string JSON**, como sempre foi; `lib/json-seguro.ts` (`lerJson`)
  aceita string ou objeto, para o dia em que a borda deixar de serializar.

## Banco

- Dinheiro em centavos inteiros; datas de negócio como `date`; data/hora como
  `timestamptz` (desde 25/09 — os valores já eram UTC; a migração só
  explicita o fuso); JSON como `jsonb` com tipo TS explícito no schema
  (`$type<…>()`); percentual (`variance_percent`) como `numeric(8,2)`; horas
  "HH:MM" em `text` com CHECK de formato; booleanos `NOT NULL` com default;
  `created_at/updated_at` `NOT NULL DEFAULT now()`.
- Usuário fixo `system` (`USUARIO_SISTEMA` em `shared/schema.ts`, inativo,
  senha impossível) para `team_inclusion_logs.user_id` quando a vaga muda sem
  ator humano — antes o literal `'system'` violava a FK.
- Tabelas de estado compartilhado, sem FK e limpas pelo servidor:
  `sso_tokens_usados(jti, expira_em)` e `rate_limits(chave, hits, expira_em)`.
- Índices e UNIQUEs declarados em `shared/schema.ts` **e** criados por
  `scripts/migrations/2026-09-23-indices-e-constraints.ts` (com `CONCURRENTLY`).
- Soft delete: `team_inclusions.deleted_at`; eventos com `status = 'excluído'`.
  Toda listagem operacional filtra os dois.
- Migrações: idempotentes, rodadas pelo dono com `DATABASE_URL=… npx tsx` ou
  `psql -f`. `server/ensure-schema.ts` repõe no boot as colunas que um
  `db:push` antigo apagou, as duas tabelas de estado compartilhado e o usuário
  `system`; é rede de segurança, não mecanismo de migração. **A migração de
  jsonb precisa rodar antes do código de 25/09 subir** (o append do histórico
  da NF exige a coluna jsonb) — ordem em `docs/migracoes.md` §5.1.
- Testes e demo geram o schema inteiro do Drizzle num PGlite
  (`server/dev/pglite-schema.ts`); nesse modo o `ensure-schema` se pula.

## Testes

`npm test` roda o vitest com **três projetos** (`vitest.config.ts`) — 1.504
testes em 25/09:

- **`unitarios`** — regras puras de `shared/` (status e transições da vaga,
  conflito de agenda, diárias, alimentação, cenotécnica, Controle RH,
  prestação de contas…), do client (`*.test.ts` em `lib/` e nos módulos por
  domínio) e do servidor (espelho, Flash, guardas). Co-locados como `*.test.ts`
  ao lado do código; milhares por segundo.
- **`componentes`** (133 testes) — `client/src/**/*.test.tsx` em **jsdom** com
  Testing Library e `user-event`. `client/src/test/setup.ts` liga os matchers
  do jest-dom, o `cleanup`, os polyfills que o Radix/TanStack precisam
  (`matchMedia`, `ResizeObserver`, `IntersectionObserver`, captura de
  ponteiro) e o **`useAuth` mockado** (`auth-mock.ts`); `render.tsx` expõe
  `renderComTudo({ user })` com os providers reais (React Query, Tooltip,
  Router em memória, Toaster) e `esperarToast`; `fixtures.ts` tem
  `usuarioFake`, `mockarFetch`, `respostaJson`. Só o kit compartilhado —
  `common/`, `ui/`, `layout/`, `lib/`, `hooks/` — tem teste de componente;
  telas não. Timeout 10 s, `retry: 0`.
- **`rotas`** (`npm run test:rotas`, `server/test/`, 114 testes) — sobe a
  aplicação **real** (`createApp` de `server/app.ts`) sobre um Postgres
  embutido (**PGlite**, WASM: sem rede, sem `DATABASE_URL`). O schema é gerado
  em tempo de teste a partir de `shared/schema.ts` pela API do drizzle-kit
  (`server/dev/pglite-schema.ts` — se o schema mudar, o teste acompanha);
  `harness.ts` cria usuário/evento/função/colaborador/vaga direto no banco e
  loga um `supertest.agent` pelo caminho do SSO — o único que vale em
  produção. Exercita gate global, CSRF, papéis e máquina de estados pelo HTTP,
  como o client faz. Cada arquivo tem o próprio worker e o próprio PGlite
  (nada vaza entre arquivos); `setup.ts` faz o warm-up do banco antes do
  primeiro teste; 3 workers e `retry: 0` de propósito. Arquivos: financeiro,
  NF, usuários/eventos, anexos, espelho/logística, validação de escala,
  `tipos-do-banco` (jsonb/timestamptz na leitura e na escrita) e `demo-seed`
  (seed, `/__demo/entrar` e seu 404 em produção, anti-reuso do JWT no banco,
  store de rate limit, `/api/rh/controle`).

O CI (`.github/workflows/ci.yml`, Node 22) roda tipos, lint (só erros), os
três projetos de teste, build e `npm audit --audit-level=critical` em todo
push.

## Modo demonstração

`npm run dev:demo` (`server/dev/demo.ts`) sobe a aplicação completa sobre o
mesmo PGlite dos testes, com seed determinístico
(`server/dev/demo-seed.ts`) e login automático por papel em
`GET /__demo/entrar?papel=…` (`server/dev/demo-login.ts`). A rota só existe
com `PAINEL_DEMO=1` **e** `NODE_ENV !== "production"` — a decisão mora num
lugar só, `server/app.ts`. Detalhes, os seis logins e o que o seed traz:
`docs/demo.md`.

## Deploy

Replit autoscale, Node 22. Desde 25/09 o anti-reuso do JWT de SSO e o rate
limit de login vivem no Postgres (`sso_tokens_usados`, `rate_limits`) e valem
para todas as instâncias. Continuam por instância, e aceitáveis: cache de
usuário (60 s, invalidado pelas rotas que alteram usuário) e cache do
aprovador padrão (30 s). Pool do Neon com `max 8`, `statement_timeout` 15 s;
usar o endpoint `-pooler` na `DATABASE_URL`.
