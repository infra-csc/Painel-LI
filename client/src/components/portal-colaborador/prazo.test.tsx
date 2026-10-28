// Prazos no portal do colaborador (28/10, Fase 3): "Confirme até", "Envie a
// nota até", o aviso calmo quando passou e o destaque do topo pelo prazo mais
// próximo.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { acaoDeHoje, fraseDoPrazo, situacaoDaPrestacao, textoCurtoDoPrazo } from "./formatos";
import { PrazoDoColaborador } from "./prazo";
import type { NotaEPagamentoDoPortal, PrazoDoPortal, PrestacaoDoPortal } from "./tipos";

const HOJE = "2026-11-05";
const prazo = (o: Partial<PrazoDoPortal>): PrazoDoPortal => ({ etapa: "confirmar_presenca", venceEm: "2026-11-06", situacao: "no_prazo", dias: 1, ...o });

function prestacao(id: string, extra: Partial<PrestacaoDoPortal> = {}): PrestacaoDoPortal {
  return {
    id, evento: { id: `ev-${id}`, nome: `Evento ${id}`, cidade: null, inicio: "2026-11-01", fim: "2026-11-03" },
    funcao: "Produtor", dias: [], ocorrencias: [], diasExtras: [], confirmacao: null, podeConfirmar: false, motivoNaoPodeConfirmar: null,
    checkoutFinalFeito: false, valoresOcultos: true, valores: null, ...extra,
  };
}
const comOc = { estado: "com_oc", podeEnviarNf: true } as NotaEPagamentoDoPortal;

describe("fraseDoPrazo", () => {
  it("no prazo, hoje e atrasado (calmo, com o porquê)", () => {
    expect(fraseDoPrazo(prazo({ venceEm: "2026-11-06" })).titulo).toBe("Confirme até sex, 06/11");
    expect(fraseDoPrazo(prazo({ etapa: "enviar_nf", situacao: "vence_hoje", dias: 0 })).titulo).toBe("Envie a nota até hoje");
    const atrasado = fraseDoPrazo(prazo({ etapa: "enviar_nf", venceEm: "2026-11-03", situacao: "atrasado", dias: 2 }));
    expect(atrasado).toMatchObject({ titulo: "O prazo para enviar a nota fiscal era 03/11.", atrasado: true });
    expect(atrasado.detalhe).toMatch(/assim que puder/);
  });

  it("complemento curto da pílula", () => {
    expect(textoCurtoDoPrazo(prazo({}))).toBe(" · até 06/11");
    expect(textoCurtoDoPrazo(prazo({ situacao: "vence_hoje", dias: 0 }))).toBe(" · até hoje");
    expect(textoCurtoDoPrazo(prazo({ situacao: "atrasado", dias: 1 }))).toBe(" · prazo passou");
    expect(situacaoDaPrestacao(prestacao("a", { podeConfirmar: true, prazo: prazo({ situacao: "atrasado", dias: 1 }) }), HOJE))
      .toEqual({ texto: "Falta confirmar os dias · prazo passou", tom: "atencao" });
    expect(situacaoDaPrestacao(prestacao("b", { notaEPagamento: comOc, prazo: prazo({ etapa: "enviar_nf" }) }), HOJE).texto).toBe("OC emitida · envie a nota · até 06/11");
  });
});

describe("destaque do topo pelo prazo mais próximo", () => {
  it("a confirmação atrasada passa à frente da nota que vence depois", () => {
    const nota = prestacao("nota", { notaEPagamento: comOc, prazo: prazo({ etapa: "enviar_nf", venceEm: "2026-11-09", dias: 4 }) });
    const confirmar = prestacao("conf", { podeConfirmar: true, prazo: prazo({ venceEm: "2026-11-03", situacao: "atrasado", dias: 2 }) });
    expect(acaoDeHoje([nota, confirmar], HOJE)).toMatchObject({ tipo: "confirmar", prestacao: { id: "conf" } });
  });

  it("sem prazo (servidor antigo), vale a ordem de antes: nota a enviar antes da confirmação", () => {
    const nota = prestacao("nota", { notaEPagamento: comOc });
    const confirmar = prestacao("conf", { podeConfirmar: true });
    expect(acaoDeHoje([confirmar, nota], HOJE)).toMatchObject({ tipo: "enviar_nf", prestacao: { id: "nota" } });
  });

  it("o check-in de hoje continua na frente de tudo", () => {
    const hoje = prestacao("hoje", { dias: [{ dia: HOJE, estado: "hoje_sem_checkin", entrada: null, saida: null, podeEntrar: true, podeSair: false }] });
    const confirmar = prestacao("conf", { podeConfirmar: true, prazo: prazo({ situacao: "atrasado", dias: 5 }) });
    expect(acaoDeHoje([confirmar, hoje], HOJE)?.tipo).toBe("entrada");
  });
});

describe("PrazoDoColaborador", () => {
  it("no prazo: uma linha; atrasado: aviso calmo (status, não alerta)", () => {
    const { rerender } = render(<PrazoDoColaborador prazo={prazo({})} />);
    expect(screen.getByTestId("prazo-do-colaborador")).toHaveTextContent("Confirme até sex, 06/11");
    rerender(<PrazoDoColaborador prazo={prazo({ venceEm: "2026-11-03", situacao: "atrasado", dias: 2 })} />);
    expect(screen.getByRole("status")).toHaveTextContent("O prazo para confirmar os seus dias era 03/11.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
