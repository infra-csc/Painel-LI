# Arquitetura do Painel LI

Atualizado em 23/09/2026, depois do code review completo. Este documento diz
**onde cada coisa mora e por quê**; o `README.md` diz como rodar.

## Camadas

```
client/src/pages          telas (uma por rota, carregadas sob demanda)
client/src/components     componentes por domínio + kit em components/common
client/src/lib            cliente de API (queryClient, ApiError), permissões, URL state
client/src/hooks          auth, toast, trocas (useSwapRequests)
shared/                   REGRAS DE NEGÓCIO puras + schema Drizzle/Zod (usadas pelos dois lados)
server/index.ts           boot: segurança (sessão, CSRF, headers), SSO, gate global
server/auth-guards.ts     req.user, cache de usuário, autenticação por SSO
server/http.ts            asyncHandler, protegerRotas, tratador global de erros
server/routes.ts          rotas HTTP (em migração para um router por domínio)
server/storage.ts         acesso a dados (Drizzle)
server/scaling-validation.ts, operational-mirror.ts, flash-credit.ts, event-guard.ts
scripts/migrations        migrações idempotentes, rodadas à mão
```

**Regra prática:** se uma regra precisa valer no navegador e no servidor, ela
mora em `shared/` com teste. O servidor é a autoridade; o client só antecipa a
resposta para o usuário não esperar um 409.

## Segurança em camadas (server/index.ts)

1. Headers: `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`,
   `Content-Security-Policy: frame-ancestors 'self' <PORTAL_ORIGIN>`, HSTS em produção.
   Sem `X-Frame-Options` porque o app roda em iframe do Portal Norte.
2. Sessão em Postgres (`connect-pg-simple`, `disableTouch`), cookie `httpOnly`,
   `Secure` + `SameSite=None` em produção, 7 dias com inatividade de 12 h.
3. SSO: `?portal_sso=<JWT HS256>` com `issuer`, `exp`, `iat`, `email`
   obrigatórios, `maxTokenAge` 10 min, anti-reuso por `jti`. `session.regenerate`
   antes de gravar. Em produção **só sessão de SSO** acessa a API.
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

## Banco

- Dinheiro em centavos inteiros; datas de negócio como `date`.
- Índices e UNIQUEs declarados em `shared/schema.ts` **e** criados por
  `scripts/migrations/2026-09-23-indices-e-constraints.ts` (com `CONCURRENTLY`).
- Soft delete: `team_inclusions.deleted_at`; eventos com `status = 'excluído'`.
  Toda listagem operacional filtra os dois.
- Migrações: idempotentes, rodadas pelo dono com `DATABASE_URL=… npx tsx`.
  `server/ensure-schema.ts` repõe no boot as colunas que um `db:push` antigo
  apagou; é rede de segurança, não mecanismo de migração.

## Deploy

Replit autoscale. Estado em processo (rate limit, cache de usuário, anti-reuso
de JWT) é por instância: aceitável para o volume atual, documentado como
limitação. Pool do Neon com `max 8`, `statement_timeout` 15 s; usar o endpoint
`-pooler` na `DATABASE_URL`.
