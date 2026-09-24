# Segurança e Permissões — Painel LI

> Atualizado em 13/08/2026, quando a autenticação passou a ser **exigida no
> servidor** em todas as rotas da API. Antes disso a autorização vivia apenas
> no navegador e a identidade podia ser declarada pelo próprio cliente.
> Revisado em 23/09/2026 (Fase 1 de segurança do servidor): gate global com
> estado da conta, SSO obrigatório em produção, CSRF fail-closed, rotas de
> usuário e anexos endurecidas.

## Como a identidade é estabelecida

1. **SSO do Portal Norte (produção)** — o portal abre o app com
   `?portal_sso=<JWT>`. Um middleware valida a assinatura (`SSO_SECRET`), cria
   o usuário se ainda não existir, grava a sessão e redireciona para `/` com a
   URL limpa. O JWT precisa ter `iss=norte-portal`, algoritmo HS256, `exp`,
   `iat` e `email`, idade máxima de 10 min; não há mais fallback para "token
   legado sem issuer". Um token só cria sessão **uma vez** (anti-reuso por
   `jti`/hash, em memória por instância). `portal_return` só é aceito em
   `https` e para um host de `PORTAL_ORIGIN`. A lógica é única
   (`server/auth-guards.ts`) e serve ao middleware e a `GET /api/auth/sso`.
2. **Login por e-mail e senha (somente desenvolvimento)** —
   `POST /api/auth/login`. Em produção responde **403** ("Em produção o acesso
   é pelo Portal Norte").

Em ambos os casos o resultado é o mesmo: um **cookie de sessão** (`sessionId`,
`httpOnly`, `Secure` + `SameSite=None` em produção por causa do iframe do
portal). A sessão é guardada no Postgres (tabela `session`) e é sempre criada
com `session.regenerate` (fixação de sessão). Expira em 7 dias ou após 12 h
sem uso.

> **A identidade vem exclusivamente da sessão.** Nenhuma rota aceita `_userId`,
> `_userRole` ou qualquer campo de identidade vindo do corpo da requisição.

## Autenticação: bloqueio global

`server/index.ts` tem um middleware que responde **401** para qualquer rota
`/api` sem sessão. Desde 23/09 ele também carrega o usuário da sessão (cache
de 60 s por instância, invalidado pelas rotas que alteram usuário) e:

- nega **401** e destrói a sessão se a conta está inativa ou não aprovada;
- em produção, nega **401** (`requirePortal: true`) para sessão que não veio
  do SSO — vale para a API inteira, não só para `/api/auth/me`;
- nega **401** após 12 h de inatividade (`lastSeen`, gravado no máximo a cada
  5 min);
- com `mustChangePassword`, responde **403** `{ mustChangePassword: true }`
  para tudo que não seja `/api/auth/*` ou a troca da própria senha
  (`PATCH /api/users/:id` do próprio usuário);
- guarda o usuário real em `req.user` (os guards de rota o reutilizam).

Prefixos públicos (únicos):

| Prefixo | Por quê |
|---|---|
| `/api/auth/` | login (só dev), logout, recuperação de senha, `/me`, `/sso` — **não há registro público** |
| `/api/integration/` | API consumida pela Maratona — autenticada por Bearer `MARATONA_API_TOKEN` |
| `/api/portal/` | chamadas server-to-server do Portal Norte — Bearer `PORTAL_API_TOKEN` (cai em `SSO_SECRET` com aviso de depreciação) |

Requisições bloqueadas são registradas como
`[AuthAudit] BLOQUEADO <método> <rota>` para facilitar o diagnóstico caso
alguma tela legítima passe a falhar. Todo request recebe `X-Request-Id`, que
aparece no log ao lado do prefixo do `userId`.

## CSRF (fail-closed desde 23/09)

O cookie é `SameSite=None` em produção, então o navegador o envia em requests
iniciados por qualquer site. Para toda mutação em `/api` (POST/PUT/PATCH/
DELETE) o servidor exige:

1. `Content-Type: application/json` ou `multipart/form-data` (upload). Um
   `<form method=post>` de outro site só produz urlencoded/text — recusado com
   **415**. `express.urlencoded` foi removido. Requests sem corpo (logout)
   passam sem Content-Type.
2. Header `Origin` presente, válido, diferente de `null` e com host na
   allowlist (hosts do próprio app + `PORTAL_ORIGIN`). Sem `Origin`, só passa
   com `Sec-Fetch-Site: same-origin|none`. Caso contrário **403**.

Exceção: `Authorization: Bearer` em `/api/integration` e `/api/portal`
(server-to-server, sem cookie).

Headers de resposta: `Content-Security-Policy: frame-ancestors 'self'
<PORTAL_ORIGIN>` (X-Frame-Options não é usado: quebraria o iframe do portal),
`Strict-Transport-Security` em produção, `Permissions-Policy`, `nosniff` e
`Referrer-Policy: no-referrer`.

No cliente, um 401 em qualquer tela interna leva o usuário para
`/auth?sessao=expirada`, que exibe "Sessão expirada" em vez de um erro genérico.

## Autorização: papéis

Os papéis canônicos são `admin`, `production`, `function_area`, `purchasing` e
`financial`. O banco contém papéis legados (`administrador`, `financeiro`,
`compras`, `logistica`, …) — por isso **toda comparação passa por
`normalizeRole`** (`shared/roles.ts`), fonte única usada pelo client e pelo
servidor. Comparar a string crua fazia um usuário com papel legado ver o botão
na tela e receber 403 da API.

### Grupos de autorização (`shared/roles.ts` → `ROLE_GROUPS`)

| Grupo | Papéis | Usado em |
|---|---|---|
| `cadastro` | admin, purchasing, production | funções, colaboradores, eventos, escalação |
| `financeiro` | admin, financial | valores por função, custos, decisões do RH, NF, Flash |
| `logistica` | admin, purchasing, production | passagens, hospedagem, grupos de transporte, custos extras |

No servidor, `requireRoles(req, res, GRUPO)` aplica o grupo; nas rotas de
decisão financeira há também `requireFinanceUser`.

### Ações e quem pode executá-las

| Ação | Papéis | Onde é verificado |
|---|---|---|
| Criar/editar/excluir função | cadastro | servidor + UI |
| Criar/editar colaborador | cadastro + function_area | servidor + UI |
| Inativar/reativar colaborador | admin, purchasing | servidor (motivo obrigatório) |
| Criar/excluir escalação | cadastro | servidor + UI |
| Passagens, hospedagem, custos extras | logistica | servidor + UI |
| Valores por função e Valores Padrão | financeiro | servidor + UI |
| Aprovar/devolver/recusar prestação | financeiro | servidor + UI |
| Aprovar/devolver/recusar NF, check-in | financeiro | servidor + UI |
| Lançar/excluir na Conta Corrente Flash | financeiro | servidor + UI |
| Excluir empresa pagadora | admin | servidor |
| Criar/editar evento | cadastro (empresa pagadora só financeiro) | servidor + UI |
| Excluir evento (soft delete; 409 se houver vagas ativas) | admin | servidor |
| Ler planejado/realizado/comparativo/Flash/configurações/NF/financeiro | financeiro | servidor + UI |
| Ler histórico de atividade (`/api/activity-logs*`) | financeiro | servidor |
| Ler logs do sistema (`/api/system-logs`) | admin | servidor |
| Enviar anexo (`POST /api/upload`) | cadastro + financeiro + function_area | servidor |
| Ver/baixar anexo | dono, ou cadastro/RH/admin; documento de colaborador só cadastro/RH/admin | servidor |
| Listar colaboradores | cadastro + RH + function_area (Logística e Área de Função **sem** CPF/RG, nascimento, telefone, endereço e anexo do documento) | servidor |

### Rotas de usuário (23/09)

| Rota | Quem | Regras |
|---|---|---|
| `POST /api/users` | admin, RH, Compras | corpo estrito (email, name, password?, role, area); RH/Compras só criam `production`/`function_area`; e-mail em minúsculas |
| `GET /api/users` | admin, RH, Compras, Logística | resposta sem `password`/`resetToken` |
| `PATCH /api/users/:id` | próprio usuário: name, email, senha (com a atual); RH/Compras em terceiros: name; admin: name, email, role, status, area | ninguém muda o próprio role/status; e-mail de terceiros só admin |
| `PATCH /api/users/:id/approval` | admin | `userApprovalSchema` estrito; não pode ser em si mesmo; rejeitar derruba as sessões |
| `PATCH /api/users/:id/toggle-active` | admin | não em si mesmo; inativar remove das funções e derruba as sessões |
| `PATCH /api/users/:id/toggle-cenotecnica-approval` | admin | — |
| `POST /api/users/:id/reset-password` | admin | nunca contra outro admin; mínimo 8; `mustChangePassword: true` |
| `POST /api/auth/forgot-password` / `reset-password` | anônimo (rate limit) | token guardado como sha256; resposta sempre genérica; mínimo 8 |

Toda resposta que devolve usuário passa por `semSegredos` (`server/auth-guards.ts`).

> A UI esconde o que o usuário não pode fazer, mas **a decisão que vale é a do
> servidor**. Esconder botão não é controle de acesso.

## Integridade dos dados (o que o servidor recusa)

Além de quem pode agir, o servidor valida **o que faz sentido**:

- **Máquina de estados** — aprovar NF exige status `enviada`; check-in exige
  `aprovada`, sem check-in anterior e com data de pagamento; a decisão do RH só
  atinge itens realmente enviados e pendentes; item aprovado não é editável,
  divisível nem excluível.
- **Allowlist + zod** nos PATCHes — campos de fluxo (`status`, `rhStatus`,
  `sentForReview`, `approvedBy`, `checkinAt`…) só mudam pelas rotas dedicadas.
  **Feito (23/09):** "um POST não consegue criar um registro já aprovado"
  vale também para escalação, trocas e espelho — o corpo de
  `POST /api/team-inclusions` (e `/bulk`) não carrega `status`/`phase`/
  `previousStatus`/`approvedByProduction`/`deletedAt` (`insertTeamInclusionSchema`
  os omite e o servidor grava `planejado`/`inclusao`); o PATCH recusa
  status/fase (rotas dedicadas: `/confirm`, `/cancel`, `/reactivate`,
  `/approve-production`), a compra de passagem/hospedagem é DERIVADA pelo
  servidor ao registrar a passagem/hospedagem, e toda transição é um
  `UPDATE … WHERE status = esperado` (409 se outra decisão chegou antes).
  Trocas: abertura só por cadastro/responsável da função, decisão com
  `WHERE status = pendente` e revalidação de vaga/colaborador/agenda.
- **Anexos** — tipo conferido pelos primeiros bytes (PDF, PNG, JPG, XLSX,
  CSV), nome sanitizado, dono gravado no objeto; download com Content-Type da
  allowlist (senão octet-stream + attachment), `CSP: sandbox; default-src
  'none'` e `nosniff`. `attachmentUrl` de NF só aceita
  `/api/attachments/ATT-…/(view|download)`.
- **Erros** — o tratador global (`server/http.ts`) nunca devolve `err.message`
  cru: multer → 413/415, zod → 400, FK/unique do Postgres → 409, o resto 500
  "Erro interno" (detalhe só no log, com o `X-Request-Id`).
- **Constraints no banco** — unicidade de planejado por colaborador+função+
  evento, um comparativo por evento, uma NF por prestação; FKs para NF↔realizado
  e para filhos de divisão; CHECKs nos status.

## Rotação de segredos

`SESSION_SECRET` e `SSO_SECRET` têm valor padrão **versionado neste
repositório**. Em produção o boot **aborta** se não estiverem definidos; em
desenvolvimento cai no padrão público com aviso. Ver `.env.example`.

Envs novas em 23/09: `PORTAL_ORIGIN` (iframe/CSRF/`portal_return`) e
`PORTAL_API_TOKEN` (Bearer de `/api/portal/*`, separado do segredo do JWT).

**Pendências conhecidas de rotação:** `SESSION_SECRET`, `SSO_SECRET`,
`MARATONA_API_TOKEN` e a senha do banco. Definir `PORTAL_API_TOKEN` no portal
e nos Secrets para tirar o fallback para `SSO_SECRET`.
