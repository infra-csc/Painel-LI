/**
 * Validação de escala (28/10): o número de "Minhas pendentes" é o que a lista
 * mostra ao clicar nele (minhas funções + aguardando validação), e a busca
 * ignora acento.
 *
 * Caso: admin que também é validador cadastrado de UMA função. O número
 * contava as pendentes de TODAS (admin valida tudo), e o clique listava só as
 * da função dele.
 */
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { criarWrapper } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { funcaoFake, sugestaoFake } from "@/test/fixtures-dominio";
import { SUGGESTIONS_QUERY_KEY } from "@/components/scaling-validation/types";
import { KPI_MATCH } from "./validation-shared";
import { useValidationData } from "./use-validation-data";

const ADMIN = usuarioFake({ id: "u-admin", role: "admin" });
const KIT = funcaoFake({ id: "fn-kit", name: "Kit" });
const HID = funcaoFake({ id: "fn-hid", name: "Hidratação" });

function montar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const base = { eventId: "ev1", canEdit: true, pendingRequest: null, status: "sugestao_pendente", phase: "sugestao" };
  queryClient.setQueryData([SUGGESTIONS_QUERY_KEY, "validacao", "__todos__"], {
    rows: [
      sugestaoFake({ ...base, id: "s1", inclusionNumber: 1, functionId: KIT.id }),
      sugestaoFake({ ...base, id: "s2", inclusionNumber: 2, functionId: HID.id }),
      sugestaoFake({ ...base, id: "s3", inclusionNumber: 3, functionId: HID.id }),
    ],
    truncated: false,
  });
  queryClient.setQueryData(["/api/functions"], [KIT, HID]);
  queryClient.setQueryData(["/api/scaling-function-managers"], [{ functionId: KIT.id, userId: ADMIN.id, role: "validador" }]);
  queryClient.setQueryData(["/api/events"], []);
  queryClient.setQueryData(["/api/users"], [ADMIN]);
  const { Wrapper } = criarWrapper({ user: ADMIN, queryClient });
  return renderHook(() => useValidationData({ user: ADMIN, eventId: "", sanitize: () => {} }), { wrapper: Wrapper }).result;
}

describe("Validação — Minhas pendentes e busca (28/10)", () => {
  it('"Minhas pendentes" conta o que o clique lista', () => {
    const r = montar();
    // O clique do cartão liga "Só as minhas funções" + "Aguardando validação".
    act(() => { r.current.setOnlyMine(true); r.current.setKpiFiltro("pendentes"); });
    const listadas = r.current.filteredRows.filter(KPI_MATCH.pendentes);
    expect(listadas.map((x) => x.id)).toEqual(["s1"]);
    expect(r.current.counts.minhas).toBe(listadas.length);
  });

  it('busca sem acento: "hidratacao" acha "Hidratação"', () => {
    const r = montar();
    act(() => r.current.setSearch("hidratacao"));
    expect(r.current.filteredRows.map((x) => x.id)).toEqual(["s2", "s3"]);
  });
});
