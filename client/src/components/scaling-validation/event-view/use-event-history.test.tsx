/**
 * Histórico da escala — busca da Lista (28/10): o campo promete
 * "Função, #ID, área ou observação", mas "#12" não achava a vaga 12 (o "#"
 * entrava na comparação com o número) e "hidratacao" não achava "Hidratação".
 */
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { criarWrapper } from "@/test/render";
import { usuarioFake } from "@/test/fixtures";
import { funcaoFake, vagaFake } from "@/test/fixtures-dominio";
import { APPROVAL_QUERY_KEYS } from "@/components/scaling-approval/types";
import { useEventHistory } from "./use-event-history";

const HID = funcaoFake({ id: "fn-hid", name: "Hidratação" });
const KIT = funcaoFake({ id: "fn-kit", name: "Kit" });

function montar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const sug = { phase: "sugestao", status: "sugestao_pendente", eventId: "ev1", area: "", observations: "" };
  queryClient.setQueryData([APPROVAL_QUERY_KEYS.eventView, ""], {
    suggestions: [
      vagaFake({ ...sug, id: "s12", inclusionNumber: 12, functionId: HID.id }),
      vagaFake({ ...sug, id: "s34", inclusionNumber: 34, functionId: KIT.id }),
    ],
    inclusions: [], requests: [], truncated: false, eventCount: 1,
  });
  queryClient.setQueryData(["/api/events"], []);
  queryClient.setQueryData(["/api/functions"], [HID, KIT]);
  const { Wrapper } = criarWrapper({ user: usuarioFake({ role: "admin" }), queryClient });
  return renderHook(() => useEventHistory({ eventId: "", sanitize: () => {}, effectiveTab: "lista", tab: "lista", setTab: () => {} }), { wrapper: Wrapper }).result;
}

describe("Histórico — busca da Lista (28/10)", () => {
  it('"#12" acha a vaga 12', () => {
    const r = montar();
    act(() => r.current.setSearch("#12"));
    expect(r.current.filteredRows.map((x) => x.id)).toEqual(["s12"]);
  });

  it('"hidratacao" acha "Hidratação"', () => {
    const r = montar();
    act(() => r.current.setSearch("hidratacao"));
    expect(r.current.filteredRows.map((x) => x.id)).toEqual(["s12"]);
  });
});
