/**
 * Nome de uma função a partir do cache de /api/functions (03/11: o de/para do
 * pedido de ajuste guarda só o id). Os formatadores do de/para não são hooks;
 * quem mostra o pedido garante a lista com `useFuncoesDoCatalogo`.
 */
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export interface FuncaoDoCatalogo { id: string; name: string }

export const CHAVE_DAS_FUNCOES = ["/api/functions"] as const;

export function useFuncoesDoCatalogo() {
  return useQuery<FuncaoDoCatalogo[]>({ queryKey: CHAVE_DAS_FUNCOES });
}

export function nomeDaFuncaoNoCache(id: unknown): string {
  const lista = queryClient.getQueryData<FuncaoDoCatalogo[]>(CHAVE_DAS_FUNCOES);
  return lista?.find((f) => f.id === id)?.name ?? "outra função";
}
