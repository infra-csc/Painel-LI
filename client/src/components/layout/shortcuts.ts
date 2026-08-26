/** Atalhos globais da casca — a lista que o diálogo mostra e o rótulo do modificador. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** "⌘" no Mac, "Ctrl" no resto. */
export const MOD = IS_MAC ? "⌘" : "Ctrl";

/** Junta o modificador com a tecla do jeito que cada plataforma escreve. */
export const combo = (key: string) => (IS_MAC ? `${MOD}${key}` : `${MOD}+${key}`);

export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: combo("K"), what: "Abrir a busca de telas e eventos" },
  { keys: combo("\\"), what: "Alternar entre menu expandido e compacto" },
  { keys: combo("."), what: "Modo foco — esconde o menu" },
  { keys: combo("/"), what: "Mostrar esta lista de atalhos" },
  { keys: "Esc", what: "Fechar a busca, o menu aberto ou a gaveta" },
];
