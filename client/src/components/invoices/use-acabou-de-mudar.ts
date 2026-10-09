// Notas fiscais (08/10, redesenho): a linha que acabou de mudar de situação
// (nota enviada, aprovada, devolvida, check-in feito) acende por um instante —
// o resultado da ação aparece onde a pessoa estava olhando, não só no toast.
// Só apresentação: compara a situação de agora com a do render anterior.
import { useEffect, useRef, useState } from "react";

export function useAcabouDeMudar(situacao: string, duracaoMs = 1600): boolean {
  const anterior = useRef(situacao);
  const [acesa, setAcesa] = useState(false);
  useEffect(() => {
    if (anterior.current === situacao) return;
    anterior.current = situacao;
    setAcesa(true);
    const t = setTimeout(() => setAcesa(false), duracaoMs);
    return () => clearTimeout(t);
  }, [situacao, duracaoMs]);
  return acesa;
}
