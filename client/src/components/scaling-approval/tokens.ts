/**
 * Micro-rótulos e peças de estilo da Aprovação de Escala — UMA constante para
 * o módulo inteiro.
 *
 * Existe porque o mesmo rótulo de seção ("A vaga hoje", "Recortes", os títulos
 * dos blocos do resumo) era escrito de quatro jeitos diferentes: 10px ou 11px,
 * slate-400 ou slate-500, tracking-wide ou 0.08em. Cada tela parecia de um
 * app. O padrão do design system é este, e é o mesmo dos `th` de tabela.
 *
 * 07/10 (redesenho): as tabelas do módulo viram cartões abaixo de 1280px pelo
 * CSS (`.apr-tabela`, bloco `apr-` do index.css) — a MESMA marcação nas duas
 * formas, sem uma segunda lista escondida. Os cabeçalhos passaram para caixa
 * de frase (o desenho das tabelas da Validação e da Escalação).
 */
export const SECTION = "text-2xs font-bold uppercase tracking-wide text-muted-foreground";

/**
 * Cabeçalho de coluna das tabelas do módulo (fila, aguardando, paradas):
 * caixa de frase, 12px, cinza — o mesmo da Validação.
 */
export const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

/**
 * Até 06/10 a coluna de decisão grudava à direita porque as tabelas rolavam de
 * lado. Com larguras fixas e o cartão abaixo de `xl`, nada rola mais — as
 * constantes ficam vazias para quem ainda as importa.
 */
export const STICKY_TH = "";
export const STICKY_TD = "";

/** Botão-ícone da linha: sem borda até o hover (a coluna não vira uma grade de caixinhas). */
export const ICONE_DA_LINHA = "val-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

/**
 * "Aprovar" da linha — o contorno verde do "Validar" da Validação e do
 * "Confirmar" da Escalação; cheio só no hover. Vinte botões verdes cheios, um
 * por linha, competiam entre si pelo primeiro olhar.
 */
export const APROVAR_DA_LINHA = "val-alvo inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-success/35 bg-success-soft px-2.5 text-xs font-semibold text-success transition-colors hover:border-success hover:bg-success hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Moldura de cartão das listas (sombra de 1px, a mesma da Validação). */
export const MOLDURA = "rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]";

/** Botão claro sobre a barra escura de lote. */
export const SOBRE_ESCURO = "val-alvo h-8 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white/90 hover:bg-white/15 hover:text-white disabled:border-white/10 disabled:text-white/40";
