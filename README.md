# Painel LI

Sistema de gestão de produção de eventos da CSC do Esporte: escalação de
equipe, logística (passagens e hospedagem) e o fluxo financeiro completo de
prestação de contas — do orçamento planejado ao check-in do pagamento.

O acesso em produção é feito pelo **Portal Norte** (SSO com conta Microsoft);
o app roda dentro de um iframe do portal.

## Como rodar

Exige **Node 22** (vite 8 e drizzle-kit 0.31 pedem ≥ 20.19; o `.replit` e o
CI usam 22).

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, SESSION_SECRET, SSO_SECRET e PORTAL_ORIGIN
npm run dev            # sobe API + client em http://localhost:5000
```

Sem banco, sem Portal e sem tocar em produção — **modo demonstração**:

```bash
npm run dev:demo       # Postgres embutido (PGlite) + seed realista, em http://localhost:5055
# entrar como: http://localhost:5055/__demo/entrar?papel=admin   (ou production, purchasing,
#              function_area, financial, aprovador) — detalhes em docs/demo.md
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor Express + Vite em modo desenvolvimento (precisa de `DATABASE_URL`) |
| `npm run dev:demo` | Aplicação completa sobre um Postgres em memória com dados de demonstração e login por papel (`docs/demo.md`) |
| `npm run build` | Build de produção (client em `dist/public`, server em `dist`) |
| `npm start` | Roda o build de produção |
| `npm run check` | Type-check do projeto inteiro (`tsc`) |
| `npm test` | Os três projetos do vitest: `unitarios`, `componentes` (jsdom) e `rotas` (PGlite) — 1.504 testes |
| `npm run test:rotas` | Só os 114 testes de rota HTTP (`server/test/`) |
| `npm run lint` | ESLint: erros bloqueiam; avisos são a dívida do design system |

O CI (`.github/workflows/ci.yml`, Node 22) roda tipos, lint, os três projetos de teste, build e `npm audit` em todo push.

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
- [`docs/demo.md`](docs/demo.md) — modo demonstração (`npm run dev:demo`): os seis logins e o que o seed traz
- [`docs/CHANGELOG-2026-09.md`](docs/CHANGELOG-2026-09.md) — o que mudou em cada rodada de setembro e a checklist de publicação
- [`docs/financeiro-manual.md`](docs/financeiro-manual.md) — passo a passo do fluxo financeiro por tela
- [`design_guidelines.md`](design_guidelines.md) — tokens, componentes e regras visuais do client

O diretório `shared/` é o que mantém client e servidor coerentes:

- `schema.ts` — tabelas Drizzle (jsonb, timestamptz, numeric tipados) e schemas Zod de inserção
- `roles.ts` — papéis canônicos, aliases legados e grupos de autorização
- `vaga-status.ts` — máquina de estados da vaga (só o servidor grava status/fase)
- `prestacao-rules.ts` — elegibilidade de NF e transições do fluxo financeiro
- `calculation-rules.ts` — tabelas de diárias 2026 e a régua de deflação
- `cenotecnica.ts` — uma lista só de termos para "função de cenotécnica" (gestor inclui Sup Ceno; alimentação não)
- `controle-rh.ts` — cruzamento do Controle RH; os tipos são o contrato de `GET /api/rh/controle`

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

`npm test` roda o vitest com **três projetos** (`vitest.config.ts`; 1.504
testes em 25/09):

- **`unitarios`** — regras puras de `shared/` (status e transições da vaga,
  conflito de agenda, diárias e deflação, papéis, cenotécnica, Controle RH,
  prestação de contas, parse de voucher), módulos puros do client (filtros,
  relatórios, formulários, `*-utils.ts` dos módulos por domínio) e as funções
  puras do servidor (espelho, Flash). Ficam ao lado do código, como `*.test.ts`.
- **`componentes`** (133) — `client/src/**/*.test.tsx` em jsdom + Testing
  Library, com os providers reais e o `useAuth` mockado (`client/src/test/`:
  `setup.ts`, `render.tsx` → `renderComTudo`, `auth-mock.ts`, `fixtures.ts`).
  Só o kit compartilhado (`common/`, `ui/`, `layout/`, `lib/`, `hooks/`).
- **`rotas`** (114; `npm run test:rotas`) — a aplicação real sobre um Postgres
  embutido (PGlite, sem rede), schema gerado de `shared/schema.ts`, login pelo
  caminho do SSO. Cobre gate global, CSRF, papéis, máquina de estados, tipos do
  banco (jsonb/timestamptz), seed e login do modo demonstração, anti-reuso do
  JWT e rate limit no banco, `GET /api/rh/controle`.

Para conferir uma tela ao vivo antes de publicar, use o modo demonstração
(`npm run dev:demo`, `docs/demo.md`); a checklist de publicação está em
`docs/CHANGELOG-2026-09.md` §5.2.
