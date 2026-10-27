/**
 * Busca do Espelho (28/10): sem acento/caixa, e espaço em branco não é filtro.
 */
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MirrorRow } from "@shared/operational-mirror-types";
import { useMirrorFilters } from "./use-mirror-filters";
import type { PendenciaDe } from "./mirror-shared";

const linha = (id: string, fullName: string) => ({
  teamInclusionId: id, collaborator: { id, fullName }, function: { name: "Kit", area: "Logística" }, accommodation: null,
}) as unknown as MirrorRow;

const ROWS = [linha("a", "JOSÉ DA SILVA"), linha("b", "Maria Souza")];
const pendenciaDe: PendenciaDe = () => ({ abertos: [], sugestao: false, ctx: {} } as unknown as ReturnType<PendenciaDe>);

describe("Espelho — busca (28/10)", () => {
  it('"jose" acha "JOSÉ DA SILVA"', () => {
    const { result } = renderHook(() => useMirrorFilters("ev1", ROWS, pendenciaDe));
    act(() => result.current.setSearchText("jose"));
    expect(result.current.filteredRows.map((r) => r.teamInclusionId)).toEqual(["a"]);
  });

  it("só espaços não conta como filtro ativo (o vazio não vira “Ninguém corresponde a esses filtros”)", () => {
    const { result } = renderHook(() => useMirrorFilters("ev1", ROWS, pendenciaDe));
    act(() => result.current.setSearchText("   "));
    expect(result.current.filteredRows).toHaveLength(2);
    expect(result.current.activeFilterCount).toBe(0);
    expect(result.current.filtrosAtivos).toEqual([]);
  });
});
