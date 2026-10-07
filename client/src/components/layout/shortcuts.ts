/** Atalhos globais da casca — a lista que o diálogo mostra e o rótulo do modificador. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** "⌘" no Mac, "Ctrl" no resto. */
export const MOD = IS_MAC ? "⌘" : "Ctrl";

/**
 * Junta o modificador com a tecla do jeito que cada plataforma escreve.
 * Use SEMPRE isto em texto (tooltip, aria-label): até 07/10 havia "⌘\" e
 * "⌘/" cravados no menu e no menu do usuário — no Windows apareciam como
 * uma tecla que o teclado não tem, e "{MOD}K" virava "CtrlK".
 */
export const combo = (key: string) => (IS_MAC ? `${MOD}${key}` : `${MOD}+${key}`);

/** As teclas de um atalho separadas, para desenhar uma `<kbd>` por tecla. */
export const teclas = (key: string) => [MOD, key];

export interface Atalho {
  /** Texto do atalho (para leitor de tela e tooltip): "Ctrl+K". */
  keys: string;
  /** Teclas separadas, uma `<kbd>` cada. */
  parts: string[];
  what: string;
  /** Agrupamento no diálogo de atalhos. */
  grupo: "Navegação" | "Menu" | "Geral";
}

export const SHORTCUTS: Atalho[] = [
  { keys: combo("K"), parts: teclas("K"), what: "Buscar uma tela ou um evento", grupo: "Navegação" },
  { keys: combo("\\"), parts: teclas("\\"), what: "Recolher ou abrir o menu", grupo: "Menu" },
  { keys: combo("."), parts: teclas("."), what: "Modo foco: esconder ou mostrar o menu", grupo: "Menu" },
  { keys: combo("/"), parts: teclas("/"), what: "Mostrar esta lista de atalhos", grupo: "Geral" },
  { keys: "Esc", parts: ["Esc"], what: "Fechar a busca, o painel aberto ou a gaveta", grupo: "Geral" },
];
