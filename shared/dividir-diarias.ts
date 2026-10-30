/**
 * Dividir escalação (30/10) — o que fica com o TITULAR quando parte dos dias
 * passa a outro colaborador. Antes o servidor gravava "dias que ficam × diária
 * média", e isso:
 *   - dava diária ao colaborador de casa em dia útil (casa só recebe no fds);
 *   - deixava no titular o ½/dobra do dia que saiu (estava dentro da média);
 *   - perdia centavos no arredondamento da média.
 * Agora o subtotal das diárias se reparte dia a dia pela regra
 * (`valoresDosDiasDoSubtotal`) e o titular fica só com o valor dos dias que
 * continuam com ele — com o ½ e a dobra DESSES dias.
 */
import { DEFLATION_FACTORS_DEFAULT, regraDiariaPorTipo, type DeflationFactors } from "./calculation-rules";
import { valoresDosDiasDoSubtotal } from "./meia-diaria";
import { ehFimDeSemana } from "./presenca";

export interface DiariasQueFicam {
  subtotalCents: number;
  /** Dias com diária que ficam + 1 por dobra que fica (a mesma conta do Realizado). */
  dailyQuantity: number;
  /** Subtotal ÷ quantidade (só para exibir; o total usa o subtotal exato). */
  dailyValue: number;
  diasMeiaExtra: string[] | null;
  diasDobra: string[] | null;
}

export function diariasQueFicam(a: {
  /** Subtotal das diárias gravado (com os ½ e as dobras dentro). */
  subtotalCents: number;
  /** Os dias da prestação ANTES de dividir. */
  dias: readonly string[];
  /** Os dias que continuam com o titular. */
  ficam: readonly string[];
  diasMeiaExtra?: readonly (string | null | undefined)[] | null;
  diasDobra?: readonly (string | null | undefined)[] | null;
  collaboratorType?: string | null;
  nomeDaFuncao?: string | null;
  fatores?: DeflationFactors | null;
}): DiariasQueFicam {
  const regra = regraDiariaPorTipo(a.collaboratorType, a.nomeDaFuncao);
  const temDiaria = (d: string) => regra === "todos" || (regra === "fds" && ehFimDeSemana(d));
  const dias = Array.from(new Set(a.dias.map((d) => String(d).slice(0, 10)))).sort();
  const ficam = new Set(a.ficam.map((d) => String(d).slice(0, 10)));
  const porDia = valoresDosDiasDoSubtotal({
    subtotalCents: a.subtotalCents,
    diasComDiaria: dias.filter(temDiaria),
    diasMeiaExtra: a.diasMeiaExtra,
    diasDobra: a.diasDobra,
    fatores: a.fatores === undefined ? DEFLATION_FACTORS_DEFAULT : a.fatores,
  });
  const queFicam = porDia.dias.filter((d) => ficam.has(d.dia));
  const subtotalCents = queFicam.reduce((s, d) => s + d.valorCents, 0);
  const dobras = queFicam.filter((d) => d.dobraCents > 0).map((d) => d.dia);
  const meias = queFicam.filter((d) => d.meiaCents > 0).map((d) => d.dia);
  const dailyQuantity = queFicam.filter((d) => d.baseCents > 0).length + dobras.length;
  return {
    subtotalCents,
    dailyQuantity,
    dailyValue: dailyQuantity > 0 ? Math.round(subtotalCents / dailyQuantity) : 0,
    diasMeiaExtra: meias.length ? meias : null,
    diasDobra: dobras.length ? dobras : null,
  };
}
