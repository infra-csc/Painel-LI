# Painel LI

Sistema de gestão de produção de eventos da CSC do Esporte: escalação de
equipe, logística (passagens e hospedagem) e o fluxo financeiro completo de
prestação de contas — do orçamento planejado ao check-in do pagamento.

O acesso em produção é feito pelo **Portal Norte** (SSO com conta Microsoft);
o app roda dentro de um iframe do portal.

## Como rodar

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, SESSION_SECRET, SSO_SECRET e PORTAL_ORIGIN
npm run dev            # sobe API + client em http://localhost:5000
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor Express + Vite em modo desenvolvimento |
| `npm run build` | Build de produção (client em `dist/public`, server em `dist`) |
| `npm start` | Roda o build de produção |
| `npm run check` | Type-check do projeto inteiro (`tsc`) |
| `npm test` | Suíte de testes (vitest) |
| `npm run lint` | ESLint: erros bloqueiam; avisos são a dívida do design system |

O CI (`.github/workflows/ci.yml`) roda tipos, lint, testes, build e `npm audit` em todo push.

> **Nunca rode `npm run db:push`.** O schema é aplicado por scripts de migração
> manuais — ver "Banco de dados" abaixo.

## Arquitetura

```
client/src     React 18 + wouter + TanStack Query + Tailwind/shadcn
server/        Express + Drizzle ORM (Neon Postgres serverless)
shared/        Schema Drizzle/Zod + regras de negócio puras (usadas pelos dois)
docs/          Arquitetura, segurança/permissões, migrações e manual do financeiro
scripts/       Migrações manuais e utilitários de dados
```

Documentação:

- [`docs/arquitetura.md`](docs/arquitetura.md) — onde cada coisa mora e por quê (camadas, máquina de estados da vaga, regras compartilhadas)
- [`docs/seguranca-e-permissoes.md`](docs/seguranca-e-permissoes.md) — autenticação, matriz de permissões por rota e pendências operacionais
- [`docs/migracoes.md`](docs/migracoes.md) — runbook de migrações de banco
- [`docs/financeiro-manual.md`](docs/financeiro-manual.md) — passo a passo do fluxo financeiro por tela
- [`design_guidelines.md`](design_guidelines.md) — tokens, componentes e regras visuais do client

O diretório `shared/` é o que mantém client e servidor coerentes:

- `schema.ts` — tabelas Drizzle e schemas Zod de inserção
- `roles.ts` — papéis canônicos, aliases legados e grupos de autorização
- `prestacao-rules.ts` — elegibilidade de NF e transições do fluxo financeiro
- `calculation-rules.ts` — tabelas de diárias 2026 e a régua de deflação

Regra prática: **se uma regra precisa valer no navegador e no servidor, ela
mora em `shared/`** — foi a duplicação dessas regras que fez os contadores de
uma tela divergirem da lista de outra.

## Segurança

Modelo em camadas (headers, sessão em Postgres, SSO com JWT estrito, gate global
com `req.user`, CSRF fail-closed, autorização por papel e escopo, `asyncHandler`
em toda rota). Detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).

Toda rota `/api` exige sessão (exceto `/api/auth/`, `/api/integration/` e
`/api/portal/`), a identidade vem **somente** do cookie de sessão, e as ações
sensíveis exigem papel verificado no servidor.

Detalhes, matriz de permissões e pendências de rotação de segredos:
[`docs/seguranca-e-permissoes.md`](docs/seguranca-e-permissoes.md).

## Banco de dados

Postgres (Neon serverless). O schema vive em `shared/schema.ts` e as mudanças
são aplicadas por **scripts manuais e idempotentes** em `scripts/migrations/`
— nunca por `drizzle-kit push` (um push de checkout antigo já apagou colunas
de produção duas vezes):

```bash
DATABASE_URL='...' npx tsx scripts/check-schema-drift.ts        # antes
DATABASE_URL='...' npx tsx scripts/migrations/<arquivo>.ts      # a migração
DATABASE_URL='...' npx tsx scripts/check-schema-drift.ts        # depois
```

Desenvolvimento e produção são **bancos diferentes**; o banco vivo é a fonte
de verdade, espelhada em `shared/schema.ts`. `server/ensure-schema.ts` repõe
no boot só o que o app não sobrevive sem — é rede de segurança, não migração.

Runbook completo (como escrever um script, `CONCURRENTLY`/`NOT VALID`, ordem do
que está pendente, baseline com `pg_dump`, proposta de `drizzle-kit generate`):
[`docs/migracoes.md`](docs/migracoes.md). Índice cronológico dos scripts:
[`scripts/migrations/README.md`](scripts/migrations/README.md).

## Fluxo financeiro

Escalação → **Planejado** (RH) → **Realizado** (responsável de função) →
**Comparativo** (RH decide) → **Nota Fiscal** → **Check-in** financeiro.

A NF é liberada com o envio do Realizado; devolução ou recusa pausa a nota até
o reenvio. Passo a passo por tela em
[`docs/financeiro-manual.md`](docs/financeiro-manual.md).

## Testes

`npm test` roda o vitest: regras puras de `shared/` (status e transições da vaga,
conflito de agenda, diárias e deflação, papéis, prestação de contas, parse de
voucher), módulos puros do client (filtros, relatórios, formulários) e as funções
puras do servidor (espelho, Flash). Testes ficam ao lado do código, como
`*.test.ts`. Cenários manuais por deploy: seção 12 do relatório de auditoria
de 23/09 (link em `docs/arquitetura.md`).
