# Segurança e Permissões — Painel LI

> Reescrito em 24/09/2026 a partir do código (`server/app.ts`,
> `server/auth-guards.ts`, `server/routes/_compartilhado.ts`, `shared/roles.ts`
> e os 26 routers + `_compartilhado.ts` em `server/routes/` + `server/scaling-validation.ts` +
> `server/simulation.ts`). Quando este documento e o código divergirem, **o
> código vale** — e o documento precisa ser corrigido. As divergências
> client × API do §4 foram reconferidas em 24/09 contra o client atual
> (commit `b998b8fc` e árvore de trabalho).
>
> Convenção de nomes na UI: `admin` = Administrador · `production` = Logística
> Interna · `purchasing` = Compras/Viagens · `function_area` = Área
> responsável por funções · `financial` = RH.

## 1. Modelo de autenticação

### 1.1 Cadeia de middlewares (`server/app.ts`, `createApp`)

A ordem importa — cada regra só enxerga o que a anterior deixou passar:

| # | Middleware | O que faz |
|---|---|---|
| 0 | Checagem de configuração | Em produção (`NODE_ENV=production` ou `modoSeguro`) **aborta o boot** sem `SESSION_SECRET`/`SSO_SECRET`. Em dev usa o fallback público com aviso. Avisa se `PORTAL_ORIGIN` ou `PORTAL_API_TOKEN` faltarem. |
| 1 | `trust proxy` + `compression` | Replit está atrás de proxy; gzip nas respostas. |
| 2 | Request-id e log | `X-Request-Id` (8 chars) em toda resposta; log de método/rota/status/duração com prefixo do `userId` — **nunca o corpo** (PII). |
| 3 | Headers de segurança | `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (o token de SSO viaja na query string), `Content-Security-Policy: frame-ancestors 'self' <PORTAL_ORIGIN…>`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, HSTS só em produção. **Sem** `X-Frame-Options` (não aceita lista de origens; quebraria o iframe do portal). |
| 4 | Sessão (`express-session` + `connect-pg-simple`) | Tabela `session`, `disableTouch: true`, cookie `sessionId` `httpOnly`, `Secure` + `SameSite=None` em produção (iframe cross-site), `Lax` em dev. `maxAge` **7 dias** absolutos. Testes (`PAINEL_DB=pglite`) usam MemoryStore. |
| 5 | `express.json({ limit: '2mb' })` | `express.urlencoded` foi **removido** (era o formato que um `<form>` de outro site consegue enviar). |
| 6 | Rate limit | `/api/auth/login`: 30 req / 15 min. `/api/auth/forgot-password` e `/reset-password`: 10 req / 1 h. Estado **em memória, por instância**. |
| 7 | SSO middleware | Intercepta `?portal_sso=<JWT>` antes do React; valida, cria sessão, redireciona para `/`. `not_approved` → `/auth?sso_error=not_approved`; token inválido → segue para o client tratar via `GET /api/auth/sso`. |
| 8 | **Gate global de `/api`** | Ver 1.3. |
| 9 | `simulationReadOnlyGuard` | Com `session.simulatedUserId`, toda mutação em `/api` responde **403**, exceto `POST /api/simulation/start|stop` e `POST /api/auth/logout`. |
| 10 | **CSRF fail-closed** | Ver 1.4. |
| 11 | `registerRoutes` | `protegerRotas` (asyncHandler em tudo), `etag` desligado, routers na ordem de `server/routes.ts`. |
| 12 | `tratadorGlobalDeErros` | multer → 413/415, zod → 400, Postgres 23503/23505 → 409, `HttpError` (inclusive `StorageHttpError` de `server/storage/_comum.ts`, que herda dela desde 24/09) → o status que a camada de dados escolheu, resto → 500 "Erro interno" (detalhe só no log). Nunca devolve `err.message` cru. |

### 1.2 SSO do Portal Norte (`server/auth-guards.ts`)

Único caminho de autenticação em produção. O portal abre o app com
`?portal_sso=<JWT>&portal_return=<URL>`.

- **Verificação (`verificarTokenSso`)**: `jwtVerify` com `issuer: "norte-portal"`,
  `algorithms: ["HS256"]`, `requiredClaims: ["exp", "iat", "email"]`,
  `maxTokenAge: "10m"`. Não há mais fallback "token legado sem issuer". Claim
  `app`, quando presente, precisa ser `painel-li` ou `logistica-interna`.
  `aud` não é exigido (o payload documentado não tem).
- **Anti-reuso**: um token cria sessão **uma vez**. Chave = `jti` ou sha256
  do token, guardada num `Map` **em memória, por instância** até o `exp`.
- **Conta (`usuarioDoSso`)**: inexistente → criada `approved`/ativa com o
  papel do token (`papelDoPortal`: tabela de aliases de `shared/roles.ts`,
  depois heurísticas por trecho; default `production`). Rejeitada, inativa ou
  `pending` → `not_approved` (o SSO nunca reverte decisão de admin). Nome é
  sincronizado com o token; papel do banco é preservado se válido, corrigido
  se for lixo.
- **Sessão (`iniciarSessao`)**: sempre `session.regenerate` (anti-fixação),
  grava `userId`, `user` (sem segredos), `ssoAuthenticated: true`, `lastSeen`
  e `portalReturnUrl` (só `https` e host de `PORTAL_ORIGIN` — senão vira
  redirecionador aberto).
- A rota `GET /api/auth/sso?token=` usa a **mesma** função (`autenticarPorSso`);
  só muda a resposta (JSON em vez de redirect).

**Login por senha** (`POST /api/auth/login`) responde **403 em produção**. Em
dev cria sessão com `ssoAuthenticated: false`, checa `status=approved` e
`isActive`, e devolve `{ mustChangePassword: true }` quando aplicável.
`POST /api/auth/register` não existe desde 17/08.

### 1.3 Gate global de `/api` (`server/app.ts`)

Comparação de path **em minúsculas** (o Express roteia case-insensitive —
`/API/x` casaria o handler e escaparia do gate). Prefixos públicos:
`/api/auth/`, `/api/integration/`, `/api/portal/`.

Para o resto, em ordem:

1. Sem `session.userId` → **401** (log `[AuthAudit] BLOQUEADO … bypass=SIM|nao`,
   detectando `_userId` no corpo).
2. Em produção, `ssoAuthenticated !== true` → **401** `{ requirePortal: true }`
   e a sessão é destruída. Vale para a API inteira, não só `/api/auth/me`.
3. `lastSeen` com mais de **12 h** → **401** "Sessão expirada por inatividade".
   `lastSeen` é regravado no máximo a cada 5 min.
4. Carrega o usuário (`carregarUsuario`: cache **60 s por instância**,
   invalidado pelas rotas que alteram usuário). Não existe → 401. `isActive ===
   false` ou `status !== 'approved'` → **401** + sessão destruída.
5. `mustChangePassword` → **403** `{ mustChangePassword: true }` para tudo,
   exceto `PATCH /api/users/<próprio id>` (troca da própria senha).
6. Guarda o usuário REAL em `req.user`.

`GET /api/auth/me` (fora do gate) repete as checagens de SSO e de conta por
conta própria e, com simulação ativa, devolve o usuário simulado + metadados.

Inativar/rejeitar uma conta chama `destruirSessoesDoUsuario` (DELETE em
`session` por `sess->>'userId'`), então a pessoa cai na hora, não ao fim dos 7
dias.

### 1.4 CSRF fail-closed

O cookie é `SameSite=None` em produção, logo o navegador o envia em qualquer
request cross-site. Para **toda mutação** em `/api` (POST/PUT/PATCH/DELETE):

1. **Content-Type** precisa ser `application/json` ou `multipart/form-data`.
   Sem header mas com corpo → **415**. Sem corpo (logout, `simulation/stop`)
   passa.
2. **Origin** precisa existir, ser uma URL válida, diferente de `"null"` e com
   host na allowlist = `X-Forwarded-Host`/`Host` da própria requisição +
   `hostsDoPortal()` (de `PORTAL_ORIGIN`). Sem `Origin`, só passa com
   `Sec-Fetch-Site: same-origin|none`. Caso contrário **403**.
3. Exceção: `Authorization: Bearer …` em `/api/integration/*` e
   `/api/portal/*` (server-to-server, sem cookie).

Se `PORTAL_ORIGIN` não estiver definido em produção, o iframe do portal não
carrega (`frame-ancestors 'self'`) **e** mutações originadas do portal podem
cair no 403 do CSRF.

### 1.5 Variáveis de ambiente (`.env.example`)

| Env | Uso | Se faltar |
|---|---|---|
| `DATABASE_URL` | Neon Postgres (usar endpoint `-pooler`) | não sobe |
| `SESSION_SECRET` | assina o cookie de sessão | prod: aborta; dev: fallback público versionado |
| `SSO_SECRET` | verifica o JWT do portal | prod: aborta; dev: herda `SESSION_SECRET` |
| `PORTAL_ORIGIN` | CSP `frame-ancestors`, allowlist do CSRF, `portal_return` (lista separada por vírgula) | prod: aviso; iframe não carrega |
| `PORTAL_API_TOKEN` | Bearer de `/api/portal/*` | aviso "DEPRECIADO"; `/api/portal/*` aceita `SSO_SECRET` |
| `MARATONA_API_TOKEN` | Bearer de `/api/integration/*` | rotas respondem **503** |
| `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` | Object Storage (anexos) | upload/download de anexo falha |
| `NODE_ENV=production` | liga `Secure`+`SameSite=None`, HSTS, SSO obrigatório, login por senha desligado | — |
| `PAINEL_DB=pglite` | testes: MemoryStore de sessão | — |

## 2. Autorização

### 2.1 Papéis e aliases (`shared/roles.ts`)

Papéis canônicos: `admin`, `production`, `function_area`, `purchasing`,
`financial`. O banco ainda tem aliases (`administrador`, `administrator`,
`logistica_interna`, `logistica`, `area_funcional`, `area_responsavel`,
`function_manager`, `compras`, `viagens`, `compras_viagens`, `purchase`,
`travel`, `financeiro`, `finance`). **Toda** comparação passa por
`normalizeRole` — no servidor e no client. Papel fora da tabela = sem papel
(`null`): `requireRoles` responde 403.

Grupos (`ROLE_GROUPS`): `cadastro` = admin, purchasing, production ·
`financeiro` = admin, financial · `logistica` = admin, purchasing, production.

### 2.2 Helpers do servidor (`server/routes/_compartilhado.ts`)

| Helper | Regra |
|---|---|
| `requireRoles(req, res, papéis)` | usuário **efetivo** (`effectiveUserId`: simulado ?? real); reutiliza `req.user` quando é o mesmo; papel normalizado tem de estar na lista, senão 403. |
| `requireFinanceUser` / `requireFinSession` / `requireFinWrite` | os três exigem `isFinanceRole` (admin ou financial). Desde 23/09 **leitura** do financeiro também exige papel. |
| `requireQualquerSessao` | só sessão (usado em `GET /api/payment-companies`). |
| `atorDaVaga` | usuário real da sessão para rotas que decidem a permissão por escopo. |
| `podeEditarVagaAsync` | admin/production/purchasing sempre; senão responsável da função em `function_managers` **(qualquer role)** ou `functions.userId` legado. |
| `ehAdminOuCompras` | decide trocas. |
| `podeMudarValorDaDiaria` (`server/vaga-guards.ts`) | admin ou financial. |
| `assertEventEditable` / `assertInclusionEventEditable` (`server/event-guard.ts`) | evento com `endDate` anterior a hoje (America/Sao_Paulo) → só **admin** age (403 `PAST_EVENT_BLOCK_MSG`). Vale para escalação, passagem, hospedagem, troca, espelho, Validação de Escala e `apply-defaults`. Não vale para Realizado/Comparativo/NF/Flash. |

Duas tabelas de "responsável" convivem e **não são a mesma coisa**:

- `function_managers` (Cadastros → Funções → responsáveis): dá poder de
  **editar/confirmar vaga e abrir troca** (`isUserFunctionManager`).
- `scaling_function_managers` (aba "Responsáveis da Escala", só admin): dá
  poder de **validar** (`role = validador`) e **decidir** (`role = aprovador`)
  na Validação de Escala e de **aprovar cenotécnica** (`isUserFunctionApprover`,
  usada em `approve-production`). O aprovador padrão
  (`system_settings.escala_aprovador_padrao`) decide em qualquer função.

## 3. Matriz de permissões

Legenda: ✅ permitido · ❌ 403 · 👁 leitura · 🔒 depende de escopo (ver
observação) · — não se aplica. "Qualquer sessão" = todos os cinco papéis.
Evento encerrado (🕓) = só admin, mesmo que a coluna diga ✅.

### 3.1 Autenticação e sessão (fora do gate)

| Ação | Rota | Quem | Observação |
|---|---|---|---|
| SSO por JSON | `GET /api/auth/sso?token=` | anônimo | mesma regra do middleware; 401/403/400 |
| Sair | `POST /api/auth/logout` | sessão | liberado mesmo em simulação |
| Sessão atual | `GET /api/auth/me` | sessão | prod exige SSO; devolve usuário simulado se houver |
| Login por senha | `POST /api/auth/login` | anônimo | **403 em produção**; rate limit |
| Esqueci a senha | `POST /api/auth/forgot-password` | anônimo | resposta sempre genérica; token guardado como sha256; envio de e-mail **não implementado** |
| Redefinir senha | `POST /api/auth/reset-password` | anônimo com token | mínimo 8; derruba as sessões do usuário |

### 3.2 Usuários (`server/routes/usuarios.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Criar usuário | `POST /api/users` | ✅ | ❌ | 🔒 | ❌ | 🔒 | RH/Compras só criam `production`/`function_area`; corpo `strict`; nasce `approved` |
| Listar usuários | `GET /api/users` | 👁 | 👁 | 👁 | ❌ | 👁 | sem `password`/`resetToken` |
| Editar usuário | `PATCH /api/users/:id` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | próprio: name, email, senha (com a atual); RH/Compras em terceiros: só name; admin em terceiros: name, email, role, status, area; **ninguém** muda o próprio role/status |
| Aprovar/rejeitar | `PATCH /api/users/:id/approval` | ✅ | ❌ | ❌ | ❌ | ❌ | não em si mesmo; rejeitar derruba sessões |
| Inativar/reativar | `PATCH /api/users/:id/toggle-active` | ✅ | ❌ | ❌ | ❌ | ❌ | não em si mesmo; inativar remove das funções e derruba sessões |
| Permissão de cenotécnica | `PATCH /api/users/:id/toggle-cenotecnica-approval` | ✅ | ❌ | ❌ | ❌ | ❌ | flag `canApproveCenotecnica` |
| Reset de senha por admin | `POST /api/users/:id/reset-password` | 🔒 | ❌ | ❌ | ❌ | ❌ | nunca contra **outro** admin; força `mustChangePassword` |
| Simular usuário | `POST /api/simulation/start` | ✅ | ❌ | ❌ | ❌ | ❌ | admin **real** da sessão; alvo ativo/aprovado; auditado |
| Sair da simulação | `POST /api/simulation/stop` | ✅ | — | — | — | — | qualquer sessão com simulação ativa |

### 3.3 Eventos (`eventos.ts`, `empresas-pagadoras.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Listar / com vagas | `GET /api/events`, `GET /api/events-with-inclusions` | 👁 | 👁 | 👁 | 👁 | 👁 | `?includeDeleted=true` |
| Criar evento | `POST /api/events` | ✅ | ✅ | ✅ | ❌ | ❌ | empresa pagadora do corpo é descartada |
| Editar evento | `PUT /api/events/:id` | ✅ | ✅ | ✅ | ❌ | ❌ | mudar pagadora sem ser financeiro → 403; `status: "excluído"` só admin; Compras pode **reativar** excluído |
| Empresa pagadora | `PATCH /api/events/:id/payment-company` | ✅ | ❌ | ❌ | ❌ | ✅ | nome + CNPJ obrigatórios |
| Excluir evento | `DELETE /api/events/:id` | ✅ | ❌ | ❌ | ❌ | ❌ | soft delete; **409** se houver vaga não cancelada |
| Mural do evento | `GET/POST /api/events/:id/comments` | ✅ | ✅ | ✅ | ✅ | ✅ | até 2000 chars; autoria da sessão |
| Empresas pagadoras: listar | `GET /api/payment-companies` | 👁 | 👁 | 👁 | 👁 | 👁 | catálogo sem custo |
| Empresas pagadoras: criar | `POST /api/payment-companies` | ✅ | ❌ | ✅ | ❌ | ✅ | — |
| Empresas pagadoras: excluir | `DELETE /api/payment-companies/:id` | ✅ | ❌ | ❌ | ❌ | ❌ | — |

### 3.4 Funções e responsáveis (`funcoes-e-responsaveis.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Listar funções (+managers) | `GET /api/functions`, `GET /api/function-collaborator-types`, `GET /api/functions/:id/users`, `GET /api/functions/:id/managers`, `GET /api/function-managers/all` | 👁 | 👁 | 👁 | 👁 | 👁 | cache 60 s |
| Minhas funções | `GET /api/functions/my-functions` | 👁 | 👁 | 👁 | 👁 | 👁 | do usuário efetivo (simulação) |
| Criar/editar/excluir função | `POST /api/functions`, `PATCH /api/functions/:id`, `DELETE /api/functions/:id` | ✅ | ✅ | ✅ | ❌ | ❌ | — |
| Vincular usuário à função | `POST /api/functions/:id/users`, `DELETE /api/functions/:functionId/users/:userId` | ✅ | ✅ | ✅ | 🔒 | 🔒 | function_area/financial só se forem responsáveis (`function_managers`) daquela função |
| Responsáveis da função (validador/aprovador) | `POST /api/functions/:id/managers`, `DELETE /api/functions/:functionId/managers/:userId` | ✅ | ✅ | ✅ | ❌ | ❌ | grava em `function_managers`; `role` default `validador` |
| Trocar papel do responsável | `PATCH /api/functions/:functionId/managers/:userId` | ✅ | ✅ | ✅ | ❌ | ❌ | `validador` ↔ `aprovador` |
| Responsáveis da **Escala**: listar | `GET /api/scaling-function-managers` | 👁 | 👁 | 👁 | 👁 | 👁 | tabela `scaling_function_managers` |
| Responsáveis da **Escala**: cadastrar/remover | `POST /api/scaling-function-managers`, `DELETE /api/scaling-function-managers/:functionId/:userId` | ✅ | ❌ | ❌ | ❌ | ❌ | permissão própria (decisão 26/08) |

### 3.5 Colaboradores (`colaboradores.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Listar | `GET /api/collaborators[?eventId=]` | 👁 | 👁 (projetado) | 👁 | 👁 (projetado) | 👁 | production e function_area **não recebem** CPF/RG, nascimento, telefone, endereço nem `documentAttachmentId`; `Cache-Control: no-store` |
| Criar / em lote | `POST /api/collaborators`, `POST /api/collaborators/bulk` | ✅ | ✅ | ✅ | ✅ | ❌ | function_area nasce **aprovado** (auto-aprovação); os demais `pendente`; 409 por documento duplicado |
| Editar (inclui aprovar/rejeitar via `status`) | `PATCH /api/collaborators/:id` | ✅ | ✅ | ✅ | ✅ | ❌ | `active`/`inactiveReason`/`createdBy` descartados; `approvedBy/At` vêm da sessão |
| Inativar | `POST /api/collaborators/:id/inactivate` | ✅ | ❌ | ✅ | ❌ | ❌ | motivo obrigatório |
| Reativar | `POST /api/collaborators/:id/reactivate` | ✅ | ❌ | ✅ | ❌ | ❌ | — |

### 3.6 Vagas / Escalação (`escalacao.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Listar vagas | `GET /api/team-inclusions` | 👁 | 👁 | 👁 | 🔒 | 👁 | sem recorte (`eventId`/`phase`/`status`) só admin/purchasing/production/financial; function_area recebe **400** sem recorte; `phase=sugestao` excluída por padrão |
| Uma vaga / histórico / logs | `GET /api/team-inclusions/:id`, `/:id/timeline`, `/:id/logs` | 👁 | 👁 | 👁 | 👁 | 👁 | — |
| Criar vaga (emergência) | `POST /api/team-inclusions` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | nasce `planejado/inclusao`; colaborador ativo/aprovado + conflito de agenda (409) |
| Criar em lote (grade) | `POST /api/team-inclusions/bulk` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | ≤ 500; transação |
| Editar vaga | `PATCH /api/team-inclusions/:id` | ✅🕓 | ✅🕓 | ✅🕓 | 🔒🕓 | 🔒🕓 | function_area e financial só se **responsável da função** (`function_managers`, qualquer role, ou `functions.userId`); status/fase recusados (400); `dailyValue` só admin/financial (403); trocar função só cadastro (vaga com colaborador só admin); troca direta de colaborador só em vaga não confirmada e sem logística viva (403); pedido de ajuste pendente → 409; vaga em Validação → 400 |
| Confirmar | `POST /api/team-inclusions/:id/confirm` | ✅🕓 | ✅🕓 | ✅🕓 | 🔒🕓 | 🔒🕓 | mesma permissão do PATCH; `podeConfirmar` (409); "Sai de" obrigatório; tipo de atendimento obrigatório; servidor decide status/fase |
| Cancelar | `POST /api/team-inclusions/:id/cancel` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | com passagem **emitida** só admin (403); 409 se já cancelada |
| Reativar cancelada | `PATCH /api/team-inclusions/:id/reactivate` | ✅ | ❌ | ❌ | ❌ | ❌ | → `reaberto`; 409 se não estiver cancelada |
| Excluir (soft) | `DELETE /api/team-inclusions/:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | vaga em Validação → 400 |
| Tipo de atendimento | `PATCH /api/team-inclusions/:id/atendimento-tipo` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ✅🕓 | função precisa ser de atendimento |
| Tipo de percurseiro | `PATCH /api/team-inclusions/:id/percurseiro-tipo` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ✅🕓 | — |
| Modalidade freela cenotécnica | `PATCH /api/team-inclusions/:id/ceno-freela-tipo` | ✅🕓 | ✅🕓 | ✅🕓 | 🔒🕓 | ✅🕓 | function_area só se responsável da função |
| Aprovar/reprovar cenotécnica (gestor) | `PATCH /api/team-inclusions/:id/approve-production`, `/reject-production` | ✅🕓 | 🔒🕓 | 🔒🕓 | 🔒🕓 | 🔒🕓 | admin **ou** `canApproveCenotecnica` **ou** `aprovador` da função em `scaling_function_managers`; status precisa ser `aguardando_producao` (409) |
| Dispensar do Uber | `PATCH /api/team-inclusions/:id/skip-uber` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | (em `espelho-operacional.ts`) |
| Correção admin de cenotécnicas | `POST /api/admin/fix-cenotecnica-statuses` | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| Migrar horários das observações | `POST /api/team-inclusions/migrate-flight-times` | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| Contador "aguardando gestor" | `GET /api/shell/aguardando-gestor` | 👁 | 👁 | 👁 | 👁 | 👁 | devolve `0` para quem não é admin nem `canApproveCenotecnica` (aprovador de escala **não** entra aqui) |

### 3.7 Validação de Escala (`server/scaling-validation.ts`)

Regra do dono (20/08): o **cadastro** manda. Validador = `scaling_function_managers.role = validador`;
aprovador = `role = aprovador`, o **aprovador padrão** (`system_settings.escala_aprovador_padrao`)
ou admin — **qualquer que seja o papel global**. Lotes nunca viram 403 inteiro:
a vaga sem permissão/estado entra em `skipped`.

| Ação | Rota | Quem | Observação |
|---|---|---|---|
| Enviar escala sugerida | `POST /api/scaling-suggestions/bulk` | admin, production 🕓 | ≤ 500 linhas; nasce `sugestao/sugestao_pendente` |
| Cancelar envio | `DELETE /api/scaling-suggestions?eventId=` | admin, production 🕓 | soft delete das não decididas; pedidos pendentes viram negados |
| Listar sugestões | `GET /api/scaling-suggestions[?eventId=]` | qualquer sessão | por linha: `canEdit` (admin ou validador), `canDecide` (admin, aprovador, padrão); sem `eventId` teto `ALL_EVENTS_ROW_LIMIT` (header `X-Scaling-Truncated`) |
| Validar (lote) | `POST /api/scaling-suggestions/validate` | admin ou **validador** da função | por vaga; evento encerrado → skipped |
| Aprovar / reprovar / devolver vaga validada | `PATCH /api/scaling-suggestions/:id/aprovar|reprovar|devolver` | admin, **aprovador** da função, aprovador padrão | reprovar/devolver exigem comentário; 409 se estado mudou |
| Aprovar em lote | `POST /api/scaling-suggestions/aprovar-lote` | idem | `ids` ou `inclusionIds` |
| Bypass (vaga nunca validada) | `PATCH /api/scaling-suggestions/:id/bypass-approve|bypass-reject` | idem | 403 antes de sondar estado |
| Abrir pedido (ajuste/inclusão/exclusão) | `POST /api/scaling-change-requests` | admin ou **validador** da função | janela de ajuste (`changeRequestWindow`: passagem emitida fecha) → 403 |
| Listar pedidos | `GET /api/scaling-change-requests` | qualquer sessão | admin/purchasing/production/financial/aprovador padrão veem tudo; demais veem só as funções em que são aprovador **ou** os próprios pedidos |
| Decidir pedido | `PATCH /api/scaling-change-requests/:id/approve|reajustar|negar` | admin, aprovador da função, aprovador padrão | 409 se já decidido |
| Limpar negadas | `POST /api/scaling-suggestions/limpar-negadas` | admin | soft delete só de `sugestao_negada` |
| Histórico do evento | `GET /api/scaling-suggestions/event-view` | qualquer sessão | leitura |
| Aprovador padrão | `GET /api/scaling-default-approver` | qualquer sessão | leitura |
| Pedidos pendentes por vaga | `GET /api/scaling-change-requests/pending-by-inclusion` | qualquer sessão | leitura |
| Janela de ajuste da vaga | `GET /api/team-inclusions/:id/change-window` | qualquer sessão | `canRequest` só para validador/admin |
| Prazos das etapas | `GET /api/escala/prazos` / `PUT /api/escala/prazos` | ler: qualquer sessão / gravar: **admin** | em `system_settings` |

### 3.8 Trocas de colaborador (`trocas.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Listar / por vaga | `GET /api/swap-requests[?status=&eventId=]`, `GET /api/swap-requests/inclusion/:id` | 👁 | 👁 | 👁 | 👁 | 👁 | — |
| Abrir (substituição/permuta/transferência) | `POST /api/swap-requests` | ✅🕓 | ✅🕓 | ✅🕓 | 🔒🕓 | 🔒🕓 | quem pode editar a vaga (`podeEditarVagaAsync`: cadastro ou responsável da função); "Sai de" obrigatório; 409 se já há pedido pendente em qualquer vaga envolvida |
| Aprovar | `PATCH /api/swap-requests/:id/approve` | ✅🕓 | ❌ | ✅🕓 | ❌ | ❌ | transação; revalida vaga/colaborador/agenda; passagem/hospedagem **não** são apagadas (`logisticaParaRevisar`) |
| Rejeitar | `PATCH /api/swap-requests/:id/reject` | ✅🕓 | ❌ | ✅🕓 | ❌ | ❌ | comentário obrigatório |
| Cancelar | `PATCH /api/swap-requests/:id/cancel` | ✅🕓 | 🔒 | ✅🕓 | 🔒 | 🔒 | admin/Compras **ou o solicitante** |

### 3.9 Passagens e hospedagem (`passagens.ts`, `hospedagem.ts`, `anexos.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Listar passagens / hospedagens | `GET /api/tickets[?eventId=]`, `GET /api/accommodations[?eventId=]` | 👁 | 👁 | 👁 | 👁 | 👁 | `no-store` (dados do passageiro) |
| Registrar / editar passagem | `POST /api/tickets`, `PATCH /api/tickets/:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | status da vaga **derivado** pelo servidor; `teamInclusionId` do PATCH ignorado |
| Marcar/desmarcar **emitida** (lote) | `POST /api/tickets/emitidas` | ✅🕓 | ❌ | ✅🕓 | ❌ | ❌ | ≤ 200 vagas; cria linha de passagem se não houver |
| Registrar / editar hospedagem | `POST /api/accommodations`, `PATCH /api/accommodations/:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | mover para outra vaga → 400 |
| Ler vouchers (PDF) | `POST /api/vouchers/ler` | ✅ | ✅ | ✅ | ❌ | ❌ | só interpretação; não grava |

### 3.10 Espelho operacional, quartos, Uber e custos extras (`espelho-operacional.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Ver espelho / exportar XLSX | `GET /api/events/:eventId/operational-mirror`, `…/export` | 👁 | 👁 | 👁 | 👁 | 👁 | — |
| Editar célula | `PATCH …/operational-mirror/rows/:rowId` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | datas travadas por pedido de ajuste pendente (409) |
| Recalcular sugestões | `POST …/recalculate-logistics-suggestions` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | — |
| Importar planilha (preview / aplicar) | `POST …/operational-mirror/import/preview`, `…/aplicar` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | preview não grava |
| Quartos: confirmar, separar, mover, editar | `POST /api/hotel-room-groups/:id/confirm`, `…/separar`, `POST /api/hotel-room-groups/mover`, `PATCH /api/hotel-room-groups/:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | destino no mesmo evento |
| Estadia por pessoa | `PATCH /api/hotel-room-group-members/:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | — |
| Uber: confirmar, reabrir, mover, editar | `POST /api/uber-groups/:id/confirm`, `…/reabrir`, `POST /api/uber-groups/mover`, `PATCH /api/uber-groups/:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | — |
| Custos extras | `POST /api/logistics-extra-costs`, `PATCH /:id`, `DELETE /:id` | ✅🕓 | ✅🕓 | ✅🕓 | ❌ | ❌ | DELETE físico, auditado com o registro |

### 3.11 Bagagem (`bagagem.ts`)

| Ação | Rota | admin | production | purchasing | function_area | financial |
|---|---|---|---|---|---|---|
| Tudo (listar, histórico, ajustar histórico, criar, editar, excluir) | `GET /api/baggage-requests`, `GET/PUT /api/baggage-history`, `POST /api/baggage-requests`, `PATCH /:id`, `DELETE /:id` | ✅ | ❌ | ✅ | ❌ | ❌ |

### 3.12 Comentários, anexos, logs

| Ação | Rota | admin | production | purchasing | function_area | financial | Observação |
|---|---|---|---|---|---|---|---|
| Comentários por vaga | `GET /api/comments/counts`, `GET /api/comments/:id`, `POST /api/comments`, `GET /api/all-comments` | ✅ | ✅ | ✅ | ✅ | ✅ | autoria da sessão |
| Observações do orçamento | `GET/POST /api/budget-notes`, `GET /api/budget-notes/by-event` | ✅ | ✅ | ✅ | ✅ | ✅ | qualquer sessão (chat de auditoria) |
| Enviar anexo | `POST /api/upload` | ✅ | ✅ | ✅ | ✅ | ✅ | magic number (PDF/PNG/JPG/XLSX/CSV), nome sanitizado, dono gravado; lote inteiro ou nada |
| Confirmar anexo | `POST /api/attachments/:id/confirm` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | só o **dono** (anexo antigo sem dono: quem confirma vira dono) |
| Metadados / download / view | `GET /api/attachments/:id`, `/download`, `/view` | ✅ | ✅ | ✅ | 🔒 | ✅ | `podeAcessarAnexo`: admin/purchasing/production/financial veem tudo; function_area só o que enviou e **nunca** documento (CPF/RG) de colaborador |
| URL assinada de upload | `POST /api/attachments/upload` | — | — | — | — | — | **410** (removida) |
| Logs do sistema | `GET /api/system-logs` | 👁 | ❌ | ❌ | ❌ | ❌ | paginado |
| Histórico por entidade | `GET /api/activity-logs`, `/by-event` | 👁 | ❌ | ❌ | ❌ | 👁 | Planejado/Realizado/Comparativo |

### 3.13 Financeiro (todas em `requireFin*`/`FINANCE_ROLES` = admin, financial)

| Ação | Rota | admin | financial | outros | Observação |
|---|---|---|---|---|---|
| Financeiro legado (valores por vaga) | `GET/POST /api/financial`, `PATCH /api/financial/:id` | ✅ | ✅ | ❌ | PATCH com allowlist `strict` |
| Valores por função: ler | `GET /api/function-values`, `/:functionId` | 👁 | 👁 | 👁 | qualquer sessão |
| Valores por função: escrever | `POST /api/function-values`, `PATCH /:id`, `POST /generate-defaults` | ✅ | ✅ | ❌ | — |
| Eventos com planejado | `GET /api/events-with-planned` | 👁 | 👁 | 👁 | qualquer sessão |
| Planejado: ler | `GET /api/budget-planned[?eventId=]`, `/:id` | 👁 | 👁 | ❌ | — |
| Planejado: criar/editar/excluir | `POST`, `PATCH /:id`, `DELETE /:id` | ✅ | ✅ | ❌ | `status`/`didNotAttend` só por rota dedicada |
| Planejado: não participou | `POST /api/budget-planned/:id/toggle-not-attended` | ✅ | ✅ | ❌ | — |
| Reaplicar valores padrão | `POST /api/budget-planned/apply-defaults?eventId=` | ✅ | ✅🕓 | ❌ | evento encerrado só admin |
| Realizado: ler | `GET /api/budget-actual[?eventId=]`, `/:id` | 👁 | 👁 | ❌ | — |
| Realizado: criar, duplicar, dividir, editar, excluir | `POST`, `POST /duplicate-from-planned/:eventId`, `POST /:id/duplicate`, `POST /:id/split`, `PATCH /:id`, `DELETE /:id` | ✅ | ✅ | ❌ | item em análise/aprovado só RH/admin ajusta (na prática todos que chegam aqui são RH/admin); aprovado não se exclui; NF vinculada bloqueia exclusão |
| Realizado: não participou | `POST /api/budget-actual/:id/toggle-not-attended` | ✅ | ✅ | ❌ | — |
| Enviar para revisão | `POST /api/budget-actual/send-for-review` | ✅ | ✅ | ❌ | UPDATE guardado por estado |
| Decisão do RH (lote) | `POST /api/budget-actual/rh-action` | ✅ | ✅ | ❌ | `aprovado`/`rejeitado`/`devolvido`; ≤ 500; só itens `sentForReview && pendente` |
| Comparativo: ler | `GET /api/budget-comparison[?eventId=]` | 👁 | 👁 | ❌ | — |
| Comparativo: criar, calcular, editar | `POST`, `POST /calculate/:eventId`, `PATCH /:id` | ✅ | ✅ | ❌ | decisão só por rota dedicada |
| Comparativo: aprovar / recusar / devolver | `POST /api/budget-comparison/:id/approve`, `/reject`, `/return` | ✅ | ✅ | ❌ | aprovar sincroniza o Flash; recusar/devolver estornam; recusar exige motivo; 409 por estado |
| NF: ler, enviar, reenviar | `GET /api/invoices[?eventId=]`, `POST /api/invoices`, `PATCH /api/invoices/:id` | ✅ | ✅ | ❌ | `attachmentUrl` só `/api/attachments/ATT-…/(view\|download)`; aprovada imutável; recusada terminal |
| NF: aprovar, devolver, recusar, check-in | `POST /api/invoices/:id/approve`, `/return`, `/reject`, `/checkin` | ✅ | ✅ | ❌ | histórico anexado no banco; **devolver exige `comment`** (400 sem, desde 24/09 — o colaborador precisa saber o que corrigir); check-in único |
| Flash: ler | `GET /api/flash-movements[?collaboratorId=]` | 👁 | 👁 | ❌ | — |
| Flash: lançar, crédito inicial, editar, excluir | `POST /api/flash-movements`, `POST /initial-credit`, `PATCH /:id`, `DELETE /:id` | ✅ | ✅ | ❌ | lançamentos automáticos (comparativo) → 409 |
| Configurações financeiras | `GET/PUT /api/system-settings` | ✅ | ✅ | ❌ | allowlist de chaves; percentuais 0–100 |

### 3.14 Integrações (Bearer, fora do gate e do CSRF)

| Ação | Rota | Autenticação | Observação |
|---|---|---|---|
| Maratona: colaboradores, eventos, participações | `GET /api/integration/employees`, `/events`, `/participations` | `Authorization: Bearer <MARATONA_API_TOKEN>` (comparação em tempo constante) | somente leitura; 503 sem a env; entrega CPF/telefone dos colaboradores |
| Portal Norte: listar/criar/editar/desativar usuário | `GET/POST /api/portal/users`, `PATCH/DELETE /api/portal/users/:email` | `Bearer <PORTAL_API_TOKEN>` (fallback **depreciado**: `SSO_SECRET`) | papel via `papelDoPortal`; desativar/rejeitar derruba sessões; resposta sem segredos |

**Total coberto:** ~197 rotas (6 auth + 9 usuários/simulação + 9 eventos + 17
funções + 6 colaboradores + 19 escalação + 20 Validação de Escala/prazos + 6
trocas + 7 passagens/hospedagem/vouchers + 19 espelho + 6 bagagem + 13
comentários/notas/anexos/logs + 43 financeiro + 7 integrações).

## 4. Client × API — estado das divergências

A auditoria de 23/09 encontrou sete pontos em que a tela mostrava um botão
que a API recusava com 403 ("botão a mais") ou escondia um que a API
aceitaria ("botão a menos"). **Todas as sete foram corrigidas no client em
24/09 (`b998b8fc`)** e reconferidas, uma a uma, no código listado abaixo.
Linhas são da árvore de trabalho de 24/09 e podem deslocar com edições
posteriores; o nome do símbolo é o que importa.

### 4.1 O padrão adotado: botão desabilitado com motivo

Em vez de esconder a ação de quem não pode executá-la, a tela agora **mostra
o botão desabilitado e explica por quê** num Tooltip. O componente é
`client/src/components/common/motivo-desabilitado.tsx` (`MotivoDesabilitado`):

- um botão `disabled` não dispara eventos de ponteiro, então o Radix Tooltip
  nunca abriria nele; quando `desabilitado` é verdadeiro o componente envolve
  o filho num `<span tabIndex={0}>` que recebe hover e foco de teclado e mostra
  o `motivo`; habilitado, o tooltip vai direto no botão (`asChild`);
- o `title` nativo foi abandonado nesses casos (não aparece no toque nem para
  leitor de tela); o `<span>` recebe `aria-label` com o motivo quando ele é
  texto;
- o motivo é sempre a regra da API em português ("Só administradores podem
  aprovar, inativar ou redefinir senha", "Só administradores e Compras podem
  inativar ou reativar", "Só administradores, Compras e Logística Interna
  alteram eventos").

Isso vale para as 46 ocorrências trocadas em `b998b8fc`, não só para as sete
abaixo. Quando a pessoa **nem deveria saber** que a ação existe (ex.: aba
"Responsáveis da Escala", simulação), a ação continua escondida.

### 4.2 Conferência ponto a ponto

| # | O que a auditoria apontou | Regra da API | Como está no client (24/09) | Estado |
|---|---|---|---|---|
| 1 | Compras e Logística viam inativar/reset de senha em Usuários | `toggle-active`, `approval`, `reset-password`: **só admin** | `role-utils.ts` `canManageUserAccounts` só `true` para `admin` (comentário "SÓ admin (23/09)"); `admin-users.tsx:141` lê a flag e nas linhas 503–575 aprovar, rejeitar, reativar, redefinir senha e desativar ficam dentro de `MotivoDesabilitado` com `SO_ADMIN` | ✅ igual à API |
| 2 | RH podia abrir "Novo evento"/editar | `POST /api/events`, `PUT /api/events/:id`: `CADASTRO_ROLES`; RH só `PATCH …/payment-company` | `events.tsx:465` `podeCadastrar = hasRole(admin, purchasing, production)`: "Novo evento" só renderiza com ela (617), e para RH o ícone da linha vira "Ver" (257–275, `podeEditar`); `event-modal.tsx:70` `podeEditarEvento` desabilita o salvar com motivo (384); `podeAlterarPagadora` (71, 300–346) = admin/financial, espelhando a rota da pagadora. `canAccessCadastros` continua `true` para RH **de propósito**: RH entra na tela para ver e trocar a empresa pagadora | ✅ igual à API |
| 3 | "Marcar como emitida" aparecia para Logística e RH | `POST /api/tickets/emitidas`: **admin + purchasing** | `use-tickets-data.ts:196` `isPurchasingRole = hasRole(admin, purchasing)`; `tickets.tsx:378` `podeEmitir` guarda a barra de lote (532) e o toggle da linha (`onToggleEmitida`, 593) | ✅ igual à API |
| 4 | Logística e Área de Função viam inativar/reativar colaborador | `inactivate`/`reactivate`: **admin + purchasing** | `collaborator-management.tsx:146` `canManage = hasRole(admin, purchasing)`; botões em `MotivoDesabilitado` com `SO_ADMIN_COMPRAS` (604–614). `canEditCollaborators` (que inclui production e function_area) segue valendo só para criar/editar, como a API | ✅ igual à API |
| 5 | Área de Função editava colaborador em vaga de função alheia | `PATCH /api/team-inclusions/:id`: `podeEditarVagaAsync` — function_area só se responsável em `function_managers` | `use-scaling-data.ts:279` `userFunctionIds` vem de `allFunctionManagers` filtrado pelo usuário; `canManageFunction` (336) libera admin/purchasing/production ou `userFunctionIds.has(functionId)`; `canEditCollaborator` (372) passa por `canManageFunction` antes de olhar passagem/hospedagem | ✅ igual à API (o fallback legado `functions.userId` da API não é considerado no client — no máximo um botão a menos para cadastro antigo) |
| 6 | Logística Interna não via "Confirmar" | `PATCH`/`/confirm` aceitam `production` sempre | `use-scaling-data.ts:338` inclui `production` em `canManageFunction`; `canConfirmEscalation` (342) delega para ela. O comentário registra o motivo ("antes `production` ficava de fora") | ✅ igual à API |
| 7 | Matriz legada `permissions.ts`: `scaling.production = 'view'` | production edita vaga | `permissions.ts:35` `scaling.production = 'edit'` com o comentário "espelha podeEditarVagaAsync (antes 'view')". `team_inclusion.function_area = 'none'` (27) foi mantido e **está certo**: essa feature é a grade de criação de vagas (`POST /api/team-inclusions`), que é `CADASTRO_ROLES` | ✅ igual à API |
| 8 | Registro: Logística vê a lista de usuários | `GET /api/users` aceita production | `canAccessAdminUsers` `true` para production | sem divergência, decisão consciente |

Mais estrito que a API **por decisão do dono** (não é divergência):
`canScaleFunction` em `use-scaling-data.ts` (atalho "Escalar alguém" na
linha só para admin e responsável da função — regra de 01/09; Compras troca
pelo registro).

Sem divergência encontrada (confirmado no código): criação de usuário
(`user-registration.tsx:106` → `canCreateUsers` = admin/RH/Compras, igual a
`POST /api/users`), trocas (`swap-review-panel`, `ticket-modal`,
`use-scaling-mutations` → admin/Compras), exclusão de evento (`events.tsx` →
`isAdmin`), prazos (`scaling-analytics.tsx` → `ehAdmin`), bagagem (`allowed` =
admin/Compras), Validação de Escala (`canEdit`/`canDecide` vêm do servidor por
linha), simulação (só admin), responsáveis da Escala (só admin), aprovação de
cenotécnica (`canApproveProductionFor` espelha admin/flag/aprovador),
exportação de colaboradores (admin/Compras/RH), empresa pagadora em
`system-settings.tsx` (excluir só admin), cancelar vaga (`use-vaga-acoes.ts`
→ `POST …/cancel`, sem `status` no corpo).

**Nenhuma divergência client × API permanece aberta em 24/09.**

## 5. Integridade dos dados (o que o servidor recusa além do papel)

- **Identidade só da sessão.** `_userId`/`_userRole` do corpo são descartados;
  `updatedBy`, `createdBy`, `approvedBy`, `reviewedBy`, `authorId` vêm de `req.user`.
- **Máquina de estados da vaga** (`shared/vaga-status.ts`): `status`/`phase`
  nunca vêm do corpo; transições passam por `podeTransitar` e são
  `UPDATE … WHERE status = esperado` (0 linhas → 409). Passagem/hospedagem
  derivam o status (`recalcularStatusDeLogistica`).
- **Validação de Escala**: toda transição por `nextSuggestionState`; UPDATE
  guardado por phase/status.
- **Trocas**: transação; pedido pendente único por vaga (UNIQUE parcial);
  decisão com `WHERE status = 'pendente'`; revalida vaga/colaborador/agenda.
- **Financeiro**: campos de fluxo (`rhStatus`, `sentForReview`, `status` de
  NF/comparativo, `approvedBy`, `checkinAt`…) só por rota dedicada; NF exige
  `enviada` para decidir, `aprovada` + data para check-in; comparativo decide
  por lista de status de origem; Flash automático intocável.
- **Anexos**: tipo por magic number; nome sanitizado por
  `sanitizarNomeDeArquivo` (`server/objectAcl.ts`): só o último segmento do
  caminho, sem caracteres de controle/aspas/`;<>`, até 120 chars, e **todas**
  as extensões removidas (`nota.pdf.exe` → `nota.pdf`, com a extensão vinda do
  tipo detectado, não do nome enviado); `CSP: sandbox` no download;
  `attachmentUrl` de NF só interno.
- **Constraints no banco** (ver `docs/migracoes.md`): UNIQUEs de planejado,
  comparativo, NF por prestação, troca pendente por vaga, e-mail
  case-insensitive; CHECKs `NOT VALID` de status/fase; FKs.

## 6. Pendências operacionais

### 6.1 Rotação de segredos

| Segredo | Situação | Ação |
|---|---|---|
| `SESSION_SECRET` | fallback público está versionado (`dev-session-secret-change-in-production`) | gerar 32 bytes novos (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), trocar nos Secrets, republicar. Todas as sessões caem (esperado). |
| `SSO_SECRET` | compartilhado com o Portal Norte; já foi usado também como Bearer de `/api/portal/*` | rotacionar **em conjunto** com o portal (JWT novo só valida com o segredo novo). |
| `PORTAL_API_TOKEN` | **não definido** — `/api/portal/*` ainda aceita `SSO_SECRET` (aviso "DEPRECIADO" no boot) | gerar, configurar nos Secrets e no portal; depois disso o fallback pode ser removido de `server/routes/portal.ts`. |
| `MARATONA_API_TOKEN` | em uso pela Maratona | rotacionar e atualizar a Maratona; até lá, 503 se a env sumir. |
| Senha do Neon (`DATABASE_URL`) | histórico do Git pode conter valores antigos | rotacionar no Neon, atualizar `DATABASE_URL` (endpoint `-pooler`). |

### 6.2 `PORTAL_ORIGIN`

Definir nos Secrets com a(s) origem(ns) exata(s) do portal
(`https://host[:porta]`, separadas por vírgula). Sem ela: iframe bloqueado
(`frame-ancestors 'self'`), `portal_return` sempre descartado, e mutações
disparadas de dentro do portal podem cair no 403 do CSRF.

### 6.3 Histórico do Git com PII

`attached_assets/` foi removido do rastreamento no commit `80fbd554` (23/09),
mas os arquivos continuam em **todos os commits anteriores** (CSV/XLSX de
colaboradores com CPF, dumps de tela). A pasta ainda existe no disco (839
arquivos, ignorada). Pendência: reescrever o histórico (`git filter-repo
--path attached_assets --invert-paths`), forçar o push, pedir a todos que
reclonem, e conferir se o repositório é público ou compartilhado. Fazer **depois**
da rotação de segredos (o histórico também pode conter `.env`/tokens).

### 6.4 Limitações por instância no autoscale

Estado em memória do processo, não compartilhado entre instâncias:

| Estado | Onde | Risco | Mitigação possível |
|---|---|---|---|
| Anti-reuso do JWT de SSO | `tokensUsados` em `auth-guards.ts` | o mesmo token cria uma segunda sessão se cair em outra instância dentro dos 10 min | tabela `sso_tokens_usados(jti, exp)` com `INSERT … ON CONFLICT DO NOTHING` |
| Cache de usuário (60 s) | `cacheDeUsuarios` | inativar/rejeitar demora até 60 s em outra instância (as sessões, porém, são apagadas no banco na hora) | aceitável; ou TTL menor |
| Rate limit de login/reset | `express-rate-limit` MemoryStore | limite efetivo = N × 30 | store em Postgres/Redis, ou aceitar (login por senha é dev-only) |
| Cache do aprovador padrão (30 s) | `scaling-validation.ts` | trocar o aprovador padrão leva até 30 s para valer em todas | aceitável |

Enquanto `Max Machines = 1` no Replit (ver `scripts/MIGRATION-INSTRUCTIONS.md`),
nada disso se manifesta.

### 6.5 Outras

- `POST /api/auth/forgot-password` gera o token mas **não envia e-mail**; o
  reset real é feito por admin (`POST /api/users/:id/reset-password`).
- `GET /api/integration/employees` entrega CPF/telefone de todos os
  colaboradores a quem tiver o Bearer — tratar `MARATONA_API_TOKEN` como
  segredo de alto valor.
- O `Referer` do token de SSO é protegido por `no-referrer`, mas o token ainda
  aparece em logs de proxy/CDN que registrem a query string.
