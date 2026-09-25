# Modo demonstração — `npm run dev:demo`

> Escrito em 25/09/2026. Código: `server/dev/demo.ts` (entrada),
> `server/dev/pglite-schema.ts` (schema), `server/dev/demo-seed.ts` (dados),
> `server/dev/demo-login.ts` (login automático), `.claude/launch.json`.

## 1. Para que serve

Subir o Painel-LI inteiro — API + telas (Vite dev) — **sem banco externo, sem
Portal Norte e sem tocar em produção**, com dados realistas o bastante para
conferir qualquer tela ao vivo, em qualquer papel. Tudo roda num Postgres
embutido (PGlite, WASM) **em memória**: parar o processo apaga o banco; subir
de novo recria exatamente o mesmo seed.

```bash
npm run dev:demo          # porta 5055
# ou, no Claude Code: preview "painel-li-demo" (.claude/launch.json)
```

Não precisa de `DATABASE_URL`, `SESSION_SECRET` nem `SSO_SECRET` — o script
define valores de demonstração. Funciona igual no Windows, no Linux e no
Replit (o ambiente é definido dentro de `server/dev/demo.ts`, não no script
do `package.json`).

## 2. Os seis logins

Abra no navegador (a sessão nasce como se viesse do SSO e redireciona para `/`):

| URL | Quem entra | Papel |
|---|---|---|
| `http://localhost:5055/__demo/entrar?papel=admin` | Helena Martins | admin |
| `http://localhost:5055/__demo/entrar?papel=production` | Rafael Nogueira | production (Logística Interna) |
| `http://localhost:5055/__demo/entrar?papel=purchasing` | Camila Duarte | purchasing (Compras e Viagens) |
| `http://localhost:5055/__demo/entrar?papel=function_area` | Bruno Cardoso | function_area (Comercial; validador da Escala) |
| `http://localhost:5055/__demo/entrar?papel=financial` | Patrícia Lemos | financial (RH) |
| `http://localhost:5055/__demo/entrar?papel=aprovador` | Marcos Vieira | production + **canApproveCenotecnica** + aprovador da Escala |

Para trocar de papel, basta abrir outra URL (a sessão é regenerada). Também
dá para entrar pela tela `/auth` com qualquer e-mail acima (`*@demo.local`) e
a senha `Demo@2026` — o login por senha só existe fora de produção.

## 3. O que o seed traz (determinístico)

Datas relativas a **hoje**, sempre caindo em sábado/domingo:

- **8 eventos**: Maratona Internacional de São Paulo (passado, `concluido`,
  prestação e NFs fechadas), Meia Maratona do Rio (passado, Realizado em
  análise pelo RH), Circuito das Estações BH (**em andamento**), Corrida
  Noturna de Curitiba (+2 semanas), Night Run Porto Alegre (+4), Maratona de
  Salvador (+6, em Validação de Escala), Track & Field Recife (+9, sugestões
  pendentes) e um evento **excluído** (Campinas).
- **150 vagas** cobrindo todos os status canônicos de `shared/vaga-status.ts`:
  `planejado`, `reaberto`, `escalacao`, `aguardando_producao` (cenotécnica,
  inclusive uma **empreita por empresa**), `escalado`, `passagem`,
  `passagem_comprada`, `hospedagem`, `hospedagem_comprada`,
  `hospedagem_passagem_comprada`, `aprovacao`, `aprovado`, `concluido`,
  `cancelado` e as cinco `sugestao_*` (com `validationNote` em parte delas).
- **12 funções** (Cenotécnica, Sup Ceno, Percurseiro, Key Account, Gerente de
  Contas, Executivo de Contas, Produtor, Ativação, Kit, Montagem, Atendimento,
  Fotografia) com valores padrão, responsáveis e aprovador da Escala.
- **60 colaboradores** (casa/freela/local, 12 cidades, 3 pendentes, 2 inativos).
- Passagens (ida/volta, conexão em BSB, emitidas), hospedagens, **4 trocas**
  (pendente, aprovada, rejeitada, permuta), **5 pedidos de ajuste** da Escala,
  grupos de Uber e quartos, Planejado/Realizado/Comparativo/NF/Flash para SP e
  Rio (Planejado pendente para BH), bagagem, comentários, mural do evento,
  histórico da vaga e `system_logs`.

Precisa de outro cenário? Edite `PLANOS` em `server/dev/demo-seed.ts` — cada
evento é uma lista de status, um por vaga. O teste
`server/test/demo-seed.test.ts` garante que todos os status canônicos continuam
representados.

## 4. Como funciona por dentro

1. `server/dev/demo.ts` define `PAINEL_DB=pglite`, `NODE_ENV=development`,
   `PAINEL_DEMO=1`, `PORT=5055` **antes** de importar qualquer módulo do
   servidor (server/db.ts lê `PAINEL_DB` no carregamento).
2. `inicializarBancoDeTeste()` sobe o PGlite; `criarSchemaPglite()` gera o DDL
   a partir de `shared/schema.ts` pela API do drizzle-kit (mesmo módulo que os
   testes de rota usam — `server/test/harness.ts` importa daqui).
3. `semearDemo()` grava os dados (PRNG com semente fixa).
4. `createApp()` monta a aplicação real; com `PAINEL_DEMO=1` e `NODE_ENV`
   diferente de `production`, `server/app.ts` registra `GET /__demo/entrar`.
   **Fora dessas duas condições a rota não existe** (teste: com
   `NODE_ENV=production` responde 404).
5. `setupVite()` liga o dev middleware do client, como no `npm run dev`.

`server/ensure-schema.ts` se pula sozinho no modo PGlite (o schema já vem
completo do passo 2). A sessão usa o MemoryStore do express-session (decisão
de `server/app.ts` para `PAINEL_DB=pglite`).

## 5. Limites

- Anexos (`/api/upload`, Object Storage) continuam apontando para o bucket
  configurado por variável de ambiente — na demo, sem credenciais, o upload
  falha como falharia em dev sem bucket.
- O Portal Norte não existe: `/api/portal/*` e a integração da Maratona
  aceitam o Bearer de demonstração definido em `server/dev/demo.ts`.
- É um banco novo a cada subida — nada do que você fizer na demo persiste.
