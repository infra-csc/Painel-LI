/**
 * Regra e textos do "Descartar alterações?" (23/09) — parte pura, testável em
 * node. O hook com o diálogo (Radix AlertDialog) mora em `use-confirmar-descarte.tsx`.
 */
export const TEXTOS_DO_DESCARTE = {
  titulo: "Descartar alterações?",
  descricao: "Você tem alterações não salvas.",
  continuar: "Continuar editando",
  descartar: "Descartar",
} as const;

export type DecisaoDeFechamento = "fechar" | "perguntar" | "ignorar";

/**
 * Salvando → ignora o pedido (o formulário não pode sumir no meio do envio);
 * sujo → pergunta; senão → fecha direto.
 */
export function decidirFechamento(sujo: boolean, salvando = false): DecisaoDeFechamento {
  if (salvando) return "ignorar";
  return sujo ? "perguntar" : "fechar";
}
