/**
 * Qual vaga o detalhe da Aprovação mostra, e para onde ele vai depois (23/10).
 *
 * A vaga vem da LISTA da aba (a mesma linha da tabela, com os filtros dela):
 * nada é buscado ao abrir. Enquanto a vaga está na lista, o detalhe mostra a
 * versão mais nova dela (a lista se atualiza depois de cada decisão); quando
 * ela sai (decidida, filtrada), fica a última versão vista — o modal nunca
 * esvazia no meio da leitura.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useDetalheDaVaga<T extends { id: string }>(lista: readonly T[]) {
  /** Última versão vista da vaga aberta (o modal mostra isto se ela sair da lista). */
  const [vaga, setVaga] = useState<T | null>(null);
  /** Aberto × fechado à parte da vaga: fechando, o conteúdo fica até o fim da animação. */
  const [aberto, setAberto] = useState(false);
  /** Posição da vaga na última lista em que ela estava — para achar a "próxima" se a lista já andou. */
  const ultimoIndice = useRef(-1);

  const indice = vaga ? lista.findIndex((r) => r.id === vaga.id) : -1;
  const atual = vaga ? (indice >= 0 ? lista[indice] : vaga) : null;
  useEffect(() => { if (indice >= 0) ultimoIndice.current = indice; }, [indice]);

  const abrir = useCallback((r: T) => { setVaga(r); setAberto(true); }, []);
  const fechar = useCallback(() => setAberto(false), []);

  /**
   * Depois de decidir (pelo detalhe OU pela linha): se a vaga aberta está
   * entre as decididas, o detalhe segue para a próxima da lista (as decididas
   * puladas) ou, se era a última, para a anterior; sem nenhuma, fecha.
   *
   * Quem chama é a função que esperou a mutação — com a lista do momento do
   * clique (a decidida ainda dentro) ou, se a lista já veio nova do servidor,
   * com a vaga fora dela: aí a próxima é a que ocupou o lugar dela.
   */
  const depoisDeDecidir = (ids: readonly string[]) => {
    if (!aberto || !vaga || !ids.includes(vaga.id)) return;
    const fora = new Set(ids);
    let proxima: T | undefined;
    if (indice >= 0) {
      proxima = lista.slice(indice + 1).find((r) => !fora.has(r.id))
        ?? lista.slice(0, indice).reverse().find((r) => !fora.has(r.id));
    } else {
      const restantes = lista.filter((r) => !fora.has(r.id));
      proxima = restantes[Math.min(Math.max(ultimoIndice.current, 0), restantes.length - 1)];
    }
    if (proxima) abrir(proxima);
    else fechar();
  };

  return { vaga: atual, aberto, lista, abrir, fechar, depoisDeDecidir };
}

export type DetalheDaVaga<T extends { id: string }> = ReturnType<typeof useDetalheDaVaga<T>>;
