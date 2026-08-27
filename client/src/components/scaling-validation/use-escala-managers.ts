import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FunctionWithManagers } from "./types";
import type { User } from "@shared/schema";

/**
 * Responsáveis do MÓDULO DE ESCALA por função (validador / aprovador).
 *
 * Vem da tabela PRÓPRIA (`/api/scaling-function-managers`), separada da lista
 * clássica de responsáveis da função — decisão do dono (27/08), depois de a
 * lista da Escala ter tirado gente da lista de Produção. As telas da Escala
 * usam este hook; a tela de Funções continua com a lista clássica.
 */
export interface EscalaManagerRow {
  functionId: string;
  userId: string;
  role: "validador" | "aprovador";
}

export function useEscalaManagers(functions: FunctionWithManagers[] | undefined, users?: User[]) {
  const { data: rows } = useQuery<EscalaManagerRow[]>({ queryKey: ["/api/scaling-function-managers"] });

  return useMemo(() => {
    const nomePorUsuario = new Map((users ?? []).map((u) => [u.id, u.name || u.email]));
    const porFuncao = new Map<string, { userId: string; userName: string; role: "validador" | "aprovador" }[]>();
    for (const r of rows ?? []) {
      const lista = porFuncao.get(r.functionId) ?? [];
      lista.push({ userId: r.userId, userName: nomePorUsuario.get(r.userId) ?? "", role: r.role });
      porFuncao.set(r.functionId, lista);
    }
    /** As funções com `managers` do cadastro da Escala (não o clássico). */
    const comManagers: FunctionWithManagers[] = (functions ?? []).map((f) => ({
      ...f,
      managers: porFuncao.get(f.id) ?? [],
    }));
    return { rows: rows ?? [], porFuncao, functions: comManagers };
  }, [rows, functions, users]);
}
