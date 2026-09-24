# Painel LI (Logística Interna) — notas para o Replit

Este arquivo é lido pelo agente do Replit. A documentação de verdade está em:

- `README.md` — como rodar, arquitetura, banco, segurança, testes.
- `docs/seguranca-e-permissoes.md` — modelo de autenticação (SSO do Portal Norte), papéis e matriz de permissões.
- `docs/financeiro-manual.md` — fluxo Planejado → Realizado → Comparativo → Nota Fiscal → Check-in.
- `docs/arquitetura.md` — camadas, máquina de estados da vaga, onde cada regra mora.
- `design_guidelines.md` — tokens, componentes do kit e regras de lint do design system.

## Regras que valem sempre

1. **Nunca rode `drizzle-kit push` / `db:push`.** Já apagou colunas e índices em produção. Mudanças de schema vão em `scripts/migrations/` (idempotentes) e são rodadas à mão pelo dono; depois espelhe em `shared/schema.ts`.
2. **Não versione `attached_assets/`.** A pasta está no `.gitignore` desde 23/09/2026 porque continha planilhas com CPF e RG de colaboradores. O logo do app fica em `client/src/assets/`.
3. **Segredos só nos Secrets do Replit**: `DATABASE_URL`, `SESSION_SECRET`, `SSO_SECRET`, `PORTAL_ORIGIN`, `PORTAL_API_TOKEN`, `MARATONA_API_TOKEN`. Em produção o boot aborta sem `SESSION_SECRET`/`SSO_SECRET`; sem `PORTAL_ORIGIN` o iframe do portal não carrega (CSP `frame-ancestors`).
4. **Regra de negócio que vale no navegador e no servidor mora em `shared/`** com teste. Exemplos: `vaga-status.ts` (status e transições da vaga), `conflito-de-agenda.ts`, `calculation-rules.ts`, `prestacao-rules.ts`.
5. **Textos e comentários em pt-BR.** Nada em inglês visível ao usuário.
6. **Cores, sombras e tamanhos só por token** (`bg-primary`, `bg-success-soft`, `shadow-2`, `text-2xs`). O ESLint avisa hex e fonte abaixo de 11px em `.tsx`.
7. Antes de publicar: `npm run check`, `npm run lint`, `npm test`, `npm run build` (o CI do GitHub roda os quatro).

## Deploy

Autoscale. Depois de um `git pull` no Shell do Replit, **Stop + Run** do workflow: o backend não tem hot reload e o client novo contra servidor velho mostra "Servidor desatualizado".
