/**
 * Largura útil de um container, medida de verdade (02/09).
 *
 * A troca tabela↔cartão não pode ser `media query`: o menu lateral compacto
 * muda a largura disponível para a lista SEM mudar a largura da janela. Uma
 * media query deixaria a tabela espremida com o menu aberto e sobrando espaço
 * com ele fechado — que é o defeito que esta medição resolve.
 */
import { useEffect, useRef, useState } from "react";

export function useLarguraUtil<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [largura, setLargura] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // `contentRect` já desconta o padding — é a largura que o conteúdo tem.
    const obs = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    obs.observe(el);
    setLargura(el.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, []);

  return { ref, largura };
}

/**
 * Abaixo disto a tabela não cabe sem espremer coluna.
 *
 * Medido sobre as oito colunas da lista de Passagens: com menos que isto, as
 * células de datas e sugestões passam a quebrar linha no meio de um horário.
 */
export const LARGURA_MINIMA_DA_TABELA = 1100;
