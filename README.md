# Painel LI

Sistema de gestão de produção de eventos da CSC do Esporte: escalação de
equipe, logística (passagens e hospedagem) e o fluxo financeiro completo de
prestação de contas — do orçamento planejado ao check-in do pagamento.

O acesso em produção é feito pelo **Portal Norte** (SSO com conta Microsoft);
o app roda dentro de um iframe do portal.

## Como rodar

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, SESSION_SECRET e SSO_SECRET
npm run dev            # sobe API + client em http://localhost:5000
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor Express + Vite em modo desenvolvimento |
| `npm run build` | Build de produção (client em `dist/public`, server em `dist`) |
| `npm start` | Roda o build de produção |
| `npm run check` | Type-check do projeto inteiro (`tsc`) |
| `npm test` | Suíte de testes (vitest) |

> **Nunca rode `npm run db:push`.** O schema é aplicado por scripts de migração
> manuais — ver "Banco de dados" abaixo.

## Arquitetura

```
client/src     React 18 + wouter + TanStack Query + Tailwind/shadcn
server/        Express + Drizzle ORM (Neon Postgres serverless)
shared/        Schema Drizzle/Zod + regras de negócio puras (usadas pelos dois)
docs/          Manual do módulo financeiro e modelo de segurança
scripts/       Migrações manuais e utilitários de dados
```

O diretório `shared/` é o que mantém client e servidor coerentes:

- `schema.ts` — tabelas Drizzle e schemas Zod de inserção
- `roles.ts` — papéis canônicos, aliases legados e grupos de autorização
- `prestacao-rules.ts` — elegibilidade de NF e transições do fluxo financeiro
- `calculation-rules.ts` — tabelas de diárias 2026 e a régua de deflação

Regra prática: **se uma regra precisa valer no navegador e no servidor, ela
mora em `shared/`** — foi a duplicação dessas regras que fez os contadores de
uma tela divergirem da lista de outra.

## Segurança

Toda rota `/api` exige sessão (exceto `/api/auth/`, `/api/integration/` e
`/api/portal/`), a identidade vem **somente** do cookie de sessão, e as ações
sensíveis exigem papel verificado no servidor.

Detalhes, matriz de permissões e pendências de rotação de segredos:
[`docs/seguranca-e-permissoes.md`](docs/seguranca-e-permissoes.md).

## Banco de dados

Postgres (Neon serverless). O schema vive em `shared/schema.ts` e as mudanças
são aplicadas por **scripts manuais e idempotentes** em `scripts/migrations/`:

```bash
DATABASE_URL='...' npx tsx scripts/migrations/<arquivo>.ts
```

Por quê e não `drizzle-kit push`: o `db:push` produz diffs falso-positivos na
tabela `session` e em defaults de timestamp, e chega a oferecer recriação de
colunas — risco de perda de dados. O snapshot em `migrations/0000_*.sql` está
desatualizado e não reproduz o banco atual; **o banco vivo é a fonte de
verdade**, espelhada em `shared/schema.ts`.

Ao adicionar um campo: escreva o `ALTER TABLE ... IF NOT EXISTS` num script
novo, rode contra o banco e espelhe a coluna em `shared/schema.ts`.

## Fluxo financeiro

Escalação → **Planejado** (RH) → **Realizado** (responsável de função) →
**Comparativo** (RH decide) → **Nota Fiscal** → **Check-in** financeiro.

A NF é liberada com o envio do Realizado; devolução ou recusa pausa a nota até
o reenvio. Passo a passo por tela em
[`docs/financeiro-manual.md`](docs/financeiro-manual.md).

## Testes

`npm test` roda a suíte do vitest, concentrada nas regras puras de `shared/`
(cálculo de diárias com deflação, papéis e autorização, transições do fluxo de
prestação, parsing monetário pt-BR). Testes ficam ao lado do código, como
`*.test.ts`.
