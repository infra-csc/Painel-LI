import { describe, expect, it } from "vitest";
import { ETAPAS_DA_TRILHA, contarNaTrilha, posicaoNaTrilha } from "./trilha-honorarios";

describe("ETAPAS_DA_TRILHA (slide 8)", () => {
  it("é o caminho do slide, na ordem, com OC e pagamento marcados como indisponíveis", () => {
    expect(ETAPAS_DA_TRILHA.map((e) => e.rotulo)).toEqual([
      "Previsto", "Pré-aprovado", "Em evento", "Confirmado", "Validado", "OC emitida", "NF enviada", "NF lançada no M4", "Pago",
    ]);
    expect(ETAPAS_DA_TRILHA.filter((e) => !e.disponivel).map((e) => e.id)).toEqual(["oc_emitida", "pago"]);
  });
});

describe("posicaoNaTrilha", () => {
  it("só a vaga: Previsto, esperando a pré-aprovação do DP", () => {
    const p = posicaoNaTrilha({});
    expect(p.etapa).toBe("previsto");
    expect(p.proxima).toBe("pre_aprovado");
    expect(p.estados.pre_aprovado).toBe("atual");
    expect(p.estados.oc_emitida).toBe("em_breve");
    expect(p.estados.pago).toBe("em_breve");
    expect(p.aguardando).toMatch(/pré-aprovação do DP/);
  });

  it("planejado pré-aprovado (ou o nome antigo aprovado_rh), sem prestação: falta liberar para a Produção", () => {
    for (const status of ["pre_aprovado", "aprovado_rh"]) {
      const p = posicaoNaTrilha({ planejado: { status } });
      expect(p.etapa).toBe("pre_aprovado");
      expect(p.proxima).toBe("em_evento");
    }
  });

  it("prestação existente conta a pré-aprovação como feita (o que foi enviado antes dela existir não volta)", () => {
    const p = posicaoNaTrilha({ planejado: { status: "pendente" }, realizado: { sentForReview: false, rhStatus: "pendente" } });
    expect(p.etapa).toBe("em_evento");
    expect(p.estados.pre_aprovado).toBe("feita");
    expect(p.proxima).toBe("confirmado");
  });

  it("enviada para análise: Confirmado, esperando a conferência do DP", () => {
    const p = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "pendente" } });
    expect(p.etapa).toBe("confirmado");
    expect(p.proxima).toBe("validado");
    expect(p.aguardando).toMatch(/conferência do DP/);
  });

  it("validada pelo DP: pula a OC (em breve) e espera a NF", () => {
    const p = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "aprovado" } });
    expect(p.etapa).toBe("validado");
    expect(p.proxima).toBe("nf_enviada");
    expect(p.estados.oc_emitida).toBe("em_breve");
  });

  it("NF enviada, aprovada e lançada no M4 (check-in)", () => {
    const base = { realizado: { sentForReview: true, rhStatus: "aprovado" } };
    expect(posicaoNaTrilha({ ...base, nota: { status: "enviada" } }).etapa).toBe("nf_enviada");
    const aprovada = posicaoNaTrilha({ ...base, nota: { status: "aprovada" } });
    expect(aprovada.etapa).toBe("nf_enviada");
    expect(aprovada.aguardando).toMatch(/lançamento no M4/);
    const lancada = posicaoNaTrilha({ ...base, nota: { status: "aprovada", checkinAt: "2026-11-10T12:00:00Z" } });
    expect(lancada.etapa).toBe("nf_lancada");
    expect(lancada.proxima).toBeNull();
    expect(lancada.estados.pago).toBe("em_breve");
  });

  it("NF enviada antes da validação: a nota aparece feita, mas o registro continua em Confirmado", () => {
    const p = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "pendente" }, nota: { status: "enviada" } });
    expect(p.etapa).toBe("confirmado");
    expect(p.estados.nf_enviada).toBe("feita");
    expect(p.estados.validado).toBe("atual");
  });

  it("desvios: devolvido volta para quem corrige; recusado e não participou encerram", () => {
    const devolvido = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "devolvido" } });
    expect(devolvido.desvio).toBe("devolvido");
    expect(devolvido.etapa).toBe("em_evento");
    expect(devolvido.proxima).toBe("confirmado");

    const recusado = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "rejeitado" } });
    expect(recusado.desvio).toBe("recusado");
    expect(recusado.proxima).toBeNull();

    const nfDevolvida = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "aprovado" }, nota: { status: "devolvida" } });
    expect(nfDevolvida.desvio).toBe("devolvido");
    expect(nfDevolvida.proxima).toBe("nf_enviada");

    const ausente = posicaoNaTrilha({ planejado: { status: "pre_aprovado", didNotAttend: true } });
    expect(ausente.desvio).toBe("nao_participou");
    expect(ausente.proxima).toBeNull();
  });

  it("não emite NF: as etapas da nota não se aplicam e Validado encerra", () => {
    const p = posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "aprovado" }, emiteNf: false });
    expect(p.naoEmiteNf).toBe(true);
    expect(p.estados.nf_enviada).toBe("nao_se_aplica");
    expect(p.estados.nf_lancada).toBe("nao_se_aplica");
    expect(p.proxima).toBeNull();
    expect(p.aguardando).toMatch(/não emite NF/);
  });

  it("legado concluído fora do fluxo", () => {
    const p = posicaoNaTrilha({ concluidoForaDoFluxo: true });
    expect(p.desvio).toBe("concluido_fora_do_fluxo");
    expect(p.proxima).toBeNull();
  });
});

describe("contarNaTrilha", () => {
  it("conta cada registro na etapa em que está e nos desvios", () => {
    const c = contarNaTrilha([
      posicaoNaTrilha({}),
      posicaoNaTrilha({ planejado: { status: "pre_aprovado" } }),
      posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "devolvido" } }),
      posicaoNaTrilha({ realizado: { sentForReview: true, rhStatus: "aprovado" } }),
    ]);
    expect(c.total).toBe(4);
    expect(c.porEtapa).toMatchObject({ previsto: 1, pre_aprovado: 1, em_evento: 1, validado: 1, oc_emitida: 0, pago: 0 });
    expect(c.porDesvio.devolvido).toBe(1);
  });
});
