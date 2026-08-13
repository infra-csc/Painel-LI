# Segurança e Permissões — Painel LI

> Atualizado em 13/08/2026, quando a autenticação passou a ser **exigida no
> servidor** em todas as rotas da API. Antes disso a autorização vivia apenas
> no navegador e a identidade podia ser declarada pelo próprio cliente.

## Como a identidade é estabelecida

1. **SSO do Portal Norte (produção)** — o portal abre o app com
   `?portal_sso=<JWT>`. Um middleware valida a assinatura (`SSO_SECRET`), cria
   o usuário se ainda não existir, grava a sessão e redireciona para `/` com a
   URL limpa.
2. **Login por e-mail e senha (desenvolvimento)** — `POST /api/auth/login`.

Em ambos os casos o resultado é o mesmo: um **cookie de sessão** (`sessionId`,
`httpOnly`, `Secure` + `SameSite=None` em produção por causa do iframe do
portal). A sessão é guardada no Postgres (tabela `session`).

> **A identidade vem exclusivamente da sessão.** Nenhuma rota aceita `_userId`,
> `_userRole` ou qualquer campo de identidade vindo do corpo da requisição.

## Autenticação: bloqueio global

`server/index.ts` tem um middleware que responde **401** para qualquer rota
`/api` sem sessão. Prefixos públicos (únicos):

| Prefixo | Por quê |
|---|---|
| `/api/auth/` | login, logout, registro, recuperação de senha, `/me`, `/sso` |
| `/api/integration/` | API consumida pela Maratona — autenticada por Bearer token próprio |
| `/api/portal/` | chamadas server-to-server do Portal Norte — Bearer `SSO_SECRET` |

Requisições bloqueadas são registradas como
`[AuthAudit] BLOQUEADO <método> <rota>` para facilitar o diagnóstico caso
alguma tela legítima passe a falhar.

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
  Um POST não consegue criar um registro "já aprovado".
- **Constraints no banco** — unicidade de planejado por colaborador+função+
  evento, um comparativo por evento, uma NF por prestação; FKs para NF↔realizado
  e para filhos de divisão; CHECKs nos status.

## Rotação de segredos

`SESSION_SECRET` e `SSO_SECRET` têm valor padrão **versionado neste
repositório**. Se não forem definidos nos Secrets, qualquer pessoa consegue
forjar um token de SSO com papel `admin`. O boot registra um aviso quando isso
acontece. Ver `.env.example`.

**Pendências conhecidas de rotação:** `SESSION_SECRET`, `SSO_SECRET`,
`MARATONA_API_TOKEN` e a senha do banco.
