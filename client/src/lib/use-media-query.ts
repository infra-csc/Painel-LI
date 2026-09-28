/**
 * Media query como estado React (25/09).
 *
 * Para trocar tabela ↔ cartão quando a decisão é da LARGURA DA JANELA (celular),
 * como o guia pede em `< 768px`. Quando o que importa é a largura útil de um
 * contêiner (menu compacto muda o espaço sem mudar a janela), use
 * `useLarguraUtil`, em components/common.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

/** `true` abaixo do breakpoint `md` do Tailwind (768px): a faixa do modo cartão. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
