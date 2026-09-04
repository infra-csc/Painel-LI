/**
 * Micro-rótulos da Aprovação de Escala — UMA constante para o módulo inteiro.
 *
 * Existe porque o mesmo rótulo de seção ("A vaga hoje", "Recortes", os títulos
 * dos blocos do resumo) era escrito de quatro jeitos diferentes: 10px ou 11px,
 * slate-400 ou slate-500, tracking-wide ou 0.08em. Cada tela parecia de um
 * app. O padrão do design system é este, e é o mesmo dos `th` de tabela.
 */
export const SECTION = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

/**
 * Cabeçalho de coluna das quatro tabelas do módulo (fila, aguardando,
 * paradas e decididas) — o mesmo micro-rótulo, com o preenchimento da célula.
 */
export const TH = `px-2.5 py-2 text-left ${SECTION} whitespace-nowrap border-b border-slate-200`;

/**
 * Coluna de decisão grudada à direita: as tabelas rolam na horizontal em
 * telas médias e os botões de decidir eram a primeira coisa a sumir. Fundo
 * explícito (a linha zebrada por baixo não pode vazar) e uma sombra sutil
 * à esquerda para dizer que há conteúdo escondido atrás dela.
 */
export const STICKY_TH = "sticky right-0 z-10 bg-slate-50 shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)]";
export const STICKY_TD = "sticky right-0 z-10 shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)]";
