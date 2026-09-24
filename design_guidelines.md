# Guia de design do Painel LI

Reescrito em 23/09/2026 a partir do que o código **realmente** usa. O guia
anterior pedia botão h-10, menu de 256px e toast no topo; nada disso existia.
Regra: este arquivo descreve o sistema em vigor e o ESLint garante que ele não
regrida (`npm run lint`).

## 1. Tokens (client/src/index.css → tailwind.config.ts)

| Uso | Classe | Valor claro |
|---|---|---|
| Marca / ação primária | `bg-primary text-primary-foreground hover:bg-primary-hover` | #0033CC / #0029A3 |
| Destaque suave da marca | `bg-brand-soft text-primary` | #EEF2FF |
| Superfícies | `bg-background`, `bg-card`, `bg-surface-muted` (cabeçalho de tabela) | #F7F8FB, #FFF, #F8FAFC |
| Texto | `text-foreground`, `text-muted-foreground` | — |
| Bordas | `border-border`, `border-input` | — |
| **Semânticos** (estado, não tela) | `bg-success-soft text-success`, `bg-warning-soft text-warning`, `bg-info-soft text-info`, `bg-danger-soft text-danger`, `bg-neutral-soft text-neutral`; ponto/ícone com `bg-*-strong` | — |
| Elevação | `shadow-1` (linha), `shadow-2` (popover, card em foco), `shadow-3` (modal) | uma cor de sombra só |
| Raio | `rounded-md` (6) controles, `rounded-lg` (8) cards e inputs, `rounded-xl` (12) modais e popovers, `rounded-full` pílulas | `--radius: 8px` |

**Proibido em `.tsx`:** cor hex, `rgba(`, `style={{}}` para cor, `text-[10px]`
ou menor, `rounded-[Npx]`, sombras arbitrárias. Se faltar um token, crie-o no
`index.css` e exponha no `tailwind.config.ts`.

### Significado das cores

- **warning** — pendente, aguardando alguém, em análise, vaga aberta.
- **primary** — ação sua, em andamento, selecionado.
- **success** — escalado, aprovado, concluído, comprado, ativo.
- **danger** — negado, rejeitado, bloqueio, erro, atrasado.
- **neutral** — cancelado, inativo, encerrado.
- **info** — informação sem juízo (origem, tipo).

Nunca use cor para diferenciar telas ou módulos (o menu não é um arco-íris).

## 2. Tipografia

Fonte Inter. Escala do Tailwind mais `text-2xs` (11px), o **mínimo legível**:

| Papel | Classe |
|---|---|
| Rótulo miúdo / metadado | `text-2xs` (11px), `uppercase tracking-[0.06em]` só quando é um rótulo de seção |
| Corpo denso (tabelas, pílulas) | `text-xs` (12px) |
| Corpo | `text-sm` (14px) |
| Subtítulo de página | `text-sm text-muted-foreground` (≤ 90 caracteres) |
| Título de página (h1) | `text-lg font-bold` (18px) — sempre via `PageHeader` |
| Título de modal | `text-base font-semibold` |

Contraste: texto de 11–12px nunca em `slate-300/400`; use `text-muted-foreground`.

## 3. Layout

- Menu lateral de **248px**; em `< 1024px` vira gaveta.
- Gutter da página: `--page-gutter` (16 / 24 / 32px por breakpoint) definido no
  `MainLayout`. Barras de contexto usam `-mx-[var(--page-gutter)]`.
- Barras fixas: `sticky top-[var(--sticky-top)] z-30`. Nunca `top-0`, nunca
  `z-25` (não existe), nunca `z-50` fora de modais.
- Tabelas largas ficam em contêiner com `overflow-x-auto`; a página nunca rola
  na horizontal. Em `< 768px`, tabelas operacionais têm modo cartão.
- Alvo mínimo de toque **24px**; botões `h-9` (default) e `h-8` (sm).

## 4. Kit (client/src/components/common)

| Componente | Quando | Nunca |
|---|---|---|
| `PageHeader` (`variant="default" | "bar"`) | toda página: título, subtítulo curto, ações, contexto (seletor de evento), abas | h1 manual |
| `StatusBadge` / `StatusDaVagaBadge` | qualquer status | CSS `.status-*`, pílula própria |
| `ConfirmDialog` | ações destrutivas ou irreversíveis (tone `danger`) e confirmações | `window.confirm`, Dialog caseiro |
| `QueryState` / `QueryError` / `useQueriesState` | toda tela com dados: loading, vazio com orientação, erro com "Tentar de novo" | erro virando lista vazia |
| `EmptyState` | lista vazia: diga o que fazer e ofereça a ação | texto solto "Nenhum item" |
| `LoadingState` | carregando (esqueleto quando a forma é conhecida) | texto "Carregando..." |
| Toast (`useToast`) | resultado de ação: título descritivo ("Escalação confirmada"), `variant="success" | "destructive"`, ação "Desfazer" quando fizer sentido | modal "Sucesso" com OK; título "Erro"/"Sucesso" |
| `useConfirmarDescarte` | modal com formulário sujo | fechar e perder o que foi digitado |

Modais: Radix `Dialog`/`AlertDialog` sempre (Esc, foco preso, `aria`). Larguras:
`max-w-md` (formulário curto), `max-w-2xl` (formulário), `max-w-5xl` (grade).
Rodapé: **Cancelar → Confirmar**, confirmar com spinner e `disabled` durante o envio.

## 5. Texto

- Caixa de frase em botões e títulos: "Novo evento", "Salvar alterações".
- Um nome por conceito: **vaga** (linha da escalação), **escalação** (a tela
  e a ação de confirmar), **pedido** (Validação de Escala), **troca**.
- Recusa: "Negada" (sugestão/pedido), "Rejeitada" (troca). Vaga é feminina:
  "Cancelada". Pedido: "Cancelado".
- Erros dizem o que aconteceu e o que fazer, sem código HTTP nem inglês.
- Nada de "Pelotão".

## 6. Acessibilidade mínima

`lang="pt-BR"`; skip link; um `h1` por página; ícones decorativos com
`aria-hidden`; botão só com ícone tem `aria-label`; combobox via `cmdk`
(teclado completo); foco visível (`focus-visible:ring-2 ring-ring`); zoom
liberado (sem `maximum-scale`); `prefers-reduced-motion` respeitado em animações.

## 7. Ícones

Só `lucide-react`, tamanho `h-4 w-4` em botões e `h-5 w-5` em títulos. Material
Symbols está sendo removido.
