# Painel LI (Logística Interna) — notas para o Replit

Este arquivo é lido pelo agente do Replit. A documentação de verdade está em:

- `README.md` — como rodar, arquitetura, banco, segurança, testes.
- `docs/seguranca-e-permissoes.md` — modelo de autenticação (SSO do Portal Norte), papéis e matriz de permissões.
- `docs/financeiro-manual.md` — fluxo Planejado → Realizado → Comparativo → Nota Fiscal → Check-in.
- `docs/arquitetura.md` — camadas, máquina de estados da vaga, onde cada regra mora.
- `docs/migracoes.md` — runbook de migrações (ordem dos scripts de 25/09 em §5.1).
- `docs/demo.md` — modo demonstração (`npm run dev:demo`), sem banco externo.
- `docs/CHANGELOG-2026-09.md` — o que mudou em cada rodada e a checklist de publicação (§5.2).
- `design_guidelines.md` — tokens, componentes do kit e regras de lint do design system.

## Ambiente

- **Node 22** (`modules = ["nodejs-22", …]` no `.replit`; o CI também roda em 22). Depois de um pull, `node -v` no Shell deve mostrar `v22.x` — vite 8 e drizzle-kit 0.31 não sobem em Node 20 antigo.
- **Modo demonstração**: `npm run dev:demo` sobe API + client sobre um Postgres em memória (PGlite) com seed realista e login por papel em `http://localhost:5055/__demo/entrar?papel=admin` (ou `production`, `purchasing`, `function_area`, `financial`, `aprovador`). Não usa `DATABASE_URL` nem toca em produção. A rota `/__demo/entrar` só é registrada com `PAINEL_DEMO=1` **e** `NODE_ENV` diferente de `production` — nunca defina `PAINEL_DEMO` nos Secrets.

## Regras que valem sempre

1. **Nunca rode `drizzle-kit push` / `db:push`.** Já apagou colunas e índices em produção. Mudanças de schema vão em `scripts/migrations/` (idempotentes) e são rodadas à mão pelo dono; depois espelhe em `shared/schema.ts`.
2. **Não versione `attached_assets/`.** A pasta está no `.gitignore` desde 23/09/2026 porque continha planilhas com CPF e RG de colaboradores. O logo do app fica em `client/src/assets/`.
3. **Segredos só nos Secrets do Replit**: `DATABASE_URL`, `SESSION_SECRET`, `SSO_SECRET`, `PORTAL_ORIGIN`, `PORTAL_API_TOKEN`, `MARATONA_API_TOKEN`. Em produção o boot aborta sem `SESSION_SECRET`/`SSO_SECRET`; sem `PORTAL_ORIGIN` o iframe do portal não carrega (CSP `frame-ancestors`).
4. **Regra de negócio que vale no navegador e no servidor mora em `shared/`** com teste. Exemplos: `vaga-status.ts` (status e transições da vaga), `conflito-de-agenda.ts`, `calculation-rules.ts`, `prestacao-rules.ts`.
5. **Textos e comentários em pt-BR.** Nada em inglês visível ao usuário.
6. **Cores, sombras e tamanhos só por token** (`bg-primary`, `bg-success-soft`, `shadow-2`, `text-2xs`). O ESLint avisa hex e fonte abaixo de 11px em `.tsx`.
7. Antes de publicar: `npm run check`, `npm run lint`, `npm test` (três projetos: unitários, componentes em jsdom e rotas sobre PGlite — 1.504 testes), `npm run build` (o CI do GitHub roda os quatro em Node 22).
8. **Migração de 25/09 antes do código**: `scripts/migrations/2026-09-25-jsonb.sql` precisa rodar em produção **antes** de publicar o código de 25/09 (o histórico da NF passa a ser `jsonb` com append atômico e falha enquanto a coluna for `text`). Ordem completa em `docs/migracoes.md` §5.1.

## Deploy

Autoscale, Node 22. Depois de um `git pull` no Shell do Replit, `npm install` e **Stop + Run** do workflow: o backend não tem hot reload e o client novo contra servidor velho mostra "Servidor desatualizado". Desde 25/09 o anti-reuso do JWT do SSO e o rate limit de login vivem em tabelas do Postgres (`sso_tokens_usados`, `rate_limits`, criadas pelo `ensure-schema` no boot), então valem para todas as instâncias; só o cache de usuário (60 s) e o do aprovador padrão (30 s) seguem por instância.
