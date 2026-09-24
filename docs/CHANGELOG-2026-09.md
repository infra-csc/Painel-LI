# O que mudou em setembro/2026 — Painel LI

Resumo, para o dono, dos dois commits do code review de 23–24/09:

| Commit | Data | Tamanho | Assunto |
|---|---|---|---|
| `80fbd554` | 24/09 | 1.153 arquivos (a maioria é a remoção de `attached_assets/`) | Code review 23/09: segurança, integridade das vagas, design system, performance e testes |
| `b998b8fc` | 24/09 | 173 arquivos | Rodada 2: acessibilidade, permissões alinhadas à API, storage por domínio, 75 testes de rota, docs |

Detalhe técnico de cada regra: [`seguranca-e-permissoes.md`](seguranca-e-permissoes.md)
(autenticação e matriz de permissões), [`arquitetura.md`](arquitetura.md)
(onde cada coisa mora), [`migracoes.md`](migracoes.md) (banco).

## 1. O que muda para quem usa

- **Login por senha bloqueado em produção.** `POST /api/auth/login` responde
  403 quando `NODE_ENV=production`. O único caminho é o Portal Norte (SSO). Em
  produção, **toda** a API exige sessão vinda do SSO — uma sessão antiga criada
  por senha é destruída na primeira chamada.
- **Conta inativa ou rejeitada perde o acesso na hora.** Inativar/rejeitar
  apaga as sessões da pessoa no banco; ela cai no próximo clique, não ao fim
  dos 7 dias do cookie. Depois de 12 h sem usar, a sessão também expira.
- **Troca de senha obrigatória.** Quem tem `mustChangePassword` (senha
  redefinida por admin) só consegue trocar a própria senha; o resto da API
  responde 403 até isso acontecer. O app mostra a tela de troca por cima.
- **Devolver nota fiscal exige motivo.** `POST /api/invoices/:id/return` sem
  `comment` responde 400. Recusar comparativo já exigia motivo.
- **Logística Interna e Área de Função não veem CPF, RG, nascimento, telefone
  nem endereço** dos colaboradores (a listagem é projetada por papel) e não
  abrem o anexo de documento. A exportação XLSX de colaboradores continua só
  para admin, Compras e RH.
- **Botões desabilitados explicam o motivo.** Em vez de sumir, a ação que o
  seu papel não pode executar aparece desabilitada com um balão dizendo a
  regra ("Só administradores e Compras podem inativar ou reativar"). Funciona
  no teclado e no toque. Sete telas que antes mostravam um botão que a API
  recusava com 403 foram alinhadas: contas de usuário (aprovar, inativar,
  redefinir senha) só admin; criar/editar evento só admin, Compras e
  Logística (RH entra para trocar a empresa pagadora); "Marcar como emitida"
  só admin e Compras; inativar/reativar colaborador só admin e Compras; Área
  de Função só edita vaga das funções em que é responsável; Logística Interna
  voltou a ver o "Confirmar" da vaga.
- **Status da vaga não é mais editável no modal.** Só o servidor grava
  `status`/`phase` (`shared/vaga-status.ts`): confirmar, aprovar cenotécnica e
  registrar passagem/hospedagem movem a vaga sozinhos. Confirmar de novo uma
  vaga já confirmada não a regride.
- **Cancelar vaga é uma ação própria** (`POST /api/team-inclusions/:id/cancel`),
  com confirmação; reativar leva a vaga para `reaberto`. Vaga com passagem
  emitida só admin cancela.
- **Menu em caixa de frase e sem cores por grupo.** "Validação de escala",
  "Conta corrente Flash"; ícones lucide em cinza, item ativo destacado. A mesma
  string aparece no menu, na trilha do topo e no título da aba.
- **Modais de sucesso viraram avisos** (toast com título descritivo), sem
  precisar fechar uma janela para continuar. Modais caseiros viram Dialog com
  proteção contra descarte de alterações não salvas.
- **Evento em foco compartilhado no Financeiro**: escolher o evento em
  Planejado, Realizado, Comparativo, NF ou Flash mantém a escolha ao trocar de
  tela. **Filtros na URL**: filtro e aba ficam no endereço — dá para
  compartilhar o link e o F5 não perde nada.
- Outros: conflito de agenda e colaborador inativo são recusados pelo servidor
  (antes só a tela avisava); trocas de colaborador viram transação (passagem
  e hospedagem antigas ficam marcadas para revisão, não somem); DELETE de
  evento vira "excluído" (soft delete) e é recusado se houver vaga viva;
  erros chegam em português com título claro; falha de rede não vira "lista
  vazia".

## 2. O que muda para quem opera (Replit)

1. **Secrets obrigatórios**: `SESSION_SECRET` e `SSO_SECRET` — sem eles o boot
   **aborta** em produção. Gerar com
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. **`PORTAL_ORIGIN`** (origem exata do portal, `https://host`, várias
   separadas por vírgula). **Sem ela o iframe do portal não carrega**
   (`Content-Security-Policy: frame-ancestors 'self'`), o `portal_return` é
   descartado e mutações vindas do portal podem cair no 403 do CSRF.
3. **`PORTAL_API_TOKEN`** (Bearer das rotas `/api/portal/*`). Enquanto não
   existir, o app aceita `SSO_SECRET` nesse header e avisa "DEPRECIADO" no
   boot. Definir no Painel e no portal.
4. **Rodar a migração de índices e constraints** (uma vez, em produção):
   `DATABASE_URL="<prod>" npx tsx scripts/migrations/2026-09-23-indices-e-constraints.ts`.
   Cria índices com `CONCURRENTLY`, UNIQUEs (só se não houver duplicata — o
   script imprime e pula), CHECKs `NOT VALID` de status/fase e FKs. Antes e
   depois: `npx tsx scripts/check-schema-drift.ts`. **`npm run db:push` não
   existe mais** — de propósito (ver `docs/migracoes.md`).
5. **Stop + Run** do workflow depois do `git pull` no Shell: o backend não tem
   hot reload; client novo contra servidor velho mostra "Servidor
   desatualizado".
6. **Rotacionar segredos**: `SESSION_SECRET` (o fallback de dev está
   versionado e é público), `SSO_SECRET` (em conjunto com o portal),
   `MARATONA_API_TOKEN` (avisar a Maratona) e a senha do Neon
   (`DATABASE_URL`, endpoint `-pooler`). Todas as sessões caem — esperado.
7. **Reescrever o histórico do Git**: `attached_assets/` (CSV/XLSX com CPF e
   RG de colaboradores, dumps de tela) saiu do rastreamento em `80fbd554`, mas
   continua em todos os commits anteriores. Depois da rotação:
   `git filter-repo --path attached_assets --invert-paths`, push forçado, todo
   mundo reclona. Conferir se o repositório é público ou compartilhado.
8. Manter **Max Machines = 1** enquanto o anti-reuso do JWT, o cache de usuário
   e o rate limit forem em memória por instância.
9. Antes de publicar: `npm run check`, `npm run lint`, `npm test`,
   `npm run test:rotas`, `npm run build` — o CI do GitHub roda os mesmos.

## 3. O que muda para quem desenvolve

- **`shared/vaga-status.ts`**: máquina de estados da vaga (única lista de
  confirmadas, `podeConfirmar`, `podeTransitar`, `faseParaStatus`). O client
  nunca manda `status`/`phase`; transições são `UPDATE … WHERE status =
  esperado` (0 linhas = 409). Também novos em `shared/`: `budget-engine.ts`
  (fórmula do Planejado), `conflito-de-agenda.ts`, `dias-de-trabalho.ts`,
  `hoje-sp.ts`.
- **Rotas por domínio**: `server/routes.ts` (6.600 linhas) virou 26 routers em
  `server/routes/<dominio>.ts` + `_compartilhado.ts` (papéis, auditoria,
  erros, upload, guardas). `routes.ts` só define a ordem de registro. Toda
  rota passa por `asyncHandler`; o tratador global traduz Zod, multer e
  Postgres para `{ message }` em pt-BR.
- **Storage por domínio**: `server/storage.ts` (classe de 133 métodos) virou
  20 módulos de funções em `server/storage/` (19 domínios + `_comum.ts`);
  `storage/index.ts` monta o objeto `storage` com a mesma superfície, então os
  imports não mudaram. `StorageHttpError` herda de `HttpError`.
- **App factory**: `server/app.ts` (`createApp`) monta headers, sessão, SSO,
  gate global, simulação, CSRF, rotas e tratador de erros; `server/index.ts`
  só faz o boot. Os testes usam a mesma fábrica.
- **`npm run test:rotas`**: 75 cenários HTTP em `server/test/` sobre PGlite
  (Postgres em WASM, sem rede), schema gerado do `shared/schema.ts` pelo
  drizzle-kit, login pelo caminho do SSO. Projeto vitest separado
  (`vitest.config.ts`: warm-up em `setup.ts`, 3 workers, `retry: 0`). 1.302
  testes no total.
- **ESLint 9** (`eslint.config.js`; `npm run lint` bloqueia erros, avisos são
  a dívida do design system; `lint:strict` para zero avisos) e **CI**
  (`.github/workflows/ci.yml`: tipos, lint, testes, testes de rota, build,
  `npm audit --audit-level=critical`).
- **Tokens do design system**: cores só por token semântico (0 hex no client,
  0 fontes < 11 px, Material Symbols removido); kit em `components/common`
  (`PageHeader`, `StatusBadge`, `ConfirmDialog`, `QueryState`, `EmptyState`,
  `MotivoDesabilitado`, `RequiredMark`, `virtual-rows`); zod em pt-BR
  (`lib/zod-pt-br.ts`). 29 dependências e 31 componentes órfãos removidos;
  bundle de entrada 69% menor, telas carregadas por rota.
- Client: `ApiError`/`apiErrorMessage` únicos (`lib/api-error.ts`), hook
  único de trocas (`hooks/use-swap-requests.ts`), ações de vaga em
  `hooks/use-vaga-acoes.ts`, evento em foco (`lib/evento-em-foco`), filtros
  na URL (`lib/use-url-state`), proteção de descarte
  (`lib/use-confirmar-descarte`).
- Docs: `docs/seguranca-e-permissoes.md` (matriz de ~197 rotas),
  `docs/arquitetura.md`, `docs/migracoes.md`, `scripts/migrations/README.md`,
  `design_guidelines.md`, `README.md`, `replit.md`.

## 4. Decisões pendentes do dono

1. **O que é "cenotécnica"?** Existem duas definições que não concordam:
   - `shared/scaling-rules.ts` `isCenotecnicaFunctionName` — nome contém
     "cenotecnica", "cenotécnica" ou "sup ceno". Decide se a vaga vai para
     aprovação do gestor (`aguardando_producao`) e quem pode aprovar.
   - `shared/alimentacao.ts` `isCenotecnicaFunction` — nome contém "ceno",
     **exceto** "Sup Ceno" (regra 17–18/08: supervisor de cenotécnica é
     produtor). Decide diária e valores de refeição.
   Consequências hoje: "Sup Ceno" precisa de aprovação do gestor mas recebe
   alimentação de "demais"; um nome como "Cenografia" cai na regra de
   alimentação de cenotécnica sem passar pela aprovação. Decidir se são dois
   conceitos (aprovação × valores) e nomeá-los assim, ou uma lista única.
2. **Recusar um comparativo já aprovado apaga os créditos do Flash.**
   `POST /api/budget-comparison/:id/reject` e `/return` aceitam comparativo
   `aprovado` e chamam `reverseFlashFromComparison`, que **deleta** os
   lançamentos automáticos do evento (não lança débito). Se o colaborador já
   gastou o crédito, o extrato some sem contrapartida. Alternativas: só
   permitir de `pendente`/`devolvido`, ou estornar por débito com histórico.
3. **Versões major de `drizzle-orm`/`drizzle-kit` e `vite`.** O projeto está
   em `drizzle-orm ^0.39`, `drizzle-kit ^0.30` e `vite ^5.4`; as majors
   seguintes ficaram fora da rodada porque mudam API e exigem passada completa
   nas telas e nos testes de rota (que usam a API do drizzle-kit para gerar o
   schema). Decidir quando abrir essa janela.
4. Já registradas em `seguranca-e-permissoes.md` §6: rotação de segredos,
   `PORTAL_ORIGIN`, histórico do Git, e-mail de "esqueci a senha" (não
   implementado; o reset real é por admin).


## 24/09 — dependências (commit de merge após d7647805)

- `drizzle-orm` 0.39 → 0.45, `drizzle-kit` 0.30 → 0.31, `vite` 5 → 8, `@vitejs/plugin-react` 4 → 6, `esbuild` 0.25 → 0.28. Nenhum ajuste de código; build do client 3× mais rápido.
- `npm audit`: 0 vulnerabilidades altas em runtime (resta `picomatch` via Tailwind 3, dev; `uuid` via google-cloud, moderada).
- **Exige Node 20.19+**: o `.replit` passou de `nodejs-20` para `nodejs-22` e o CI roda em Node 22. Depois do pull, confirme `node -v` no Shell do Replit antes do primeiro build.
- `drizzle-zod` ficou em 0.7 de propósito: a 0.8 emite schemas do zod v4 e o app é zod v3 (migrar os dois juntos, depois).
