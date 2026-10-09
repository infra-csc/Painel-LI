import { describe, it, expect } from "vitest";
import {
  cidadeDoEvento,
  cidadesDiferentes,
  conflitosDeViagem,
  cruzamentoDeJanelas,
  encadeamentoEntre,
  errosDeDataDaPassagem,
  estaoEncadeadas,
  janelaDaVaga,
  normalizarTrechosDaVaga,
  textoDaIndicacao,
  mensagemDeViagemCruzada,
  motivoDeDataImpossivel,
  seguidaPorPassagem,
  sugestaoDeTrechoDireto,
  trechosDaPassagem,
  viagensQueSeCruzam,
  vizinhasParaTrechoDireto,
  type VagaDaJanela,
} from "./janela-de-viagem";

// Caso real de produção (09/10): Alonso em Aracaju e depois em João Pessoa.
const aracaju = (extra: Partial<VagaDaJanela> = {}): VagaDaJanela => ({
  id: "v4045", inclusionNumber: 4045, eventId: "ev-aju", eventName: "Night Run Aracaju",
  eventLocation: "Orla de Atalaia, Aracaju - SE", collaboratorId: "alonso", status: "passagem_comprada", phase: "passagem",
  scheduleStartDate: "2026-10-22", scheduleEndDate: "2026-10-25",
  passagem: {
    id: "t1", actualDepartureDate: "2026-10-21", actualDepartureTime: "16:15",
    actualReturnDate: "2026-10-26", actualReturnTime: "03:50",
  },
  ...extra,
});
const joaoPessoa = (extra: Partial<VagaDaJanela> = {}): VagaDaJanela => ({
  id: "v4238", inclusionNumber: 4238, eventId: "ev-jpa", eventName: "Makai João Pessoa",
  eventLocation: "Praia de Tambaú, João Pessoa - PB", collaboratorId: "alonso", status: "passagem_comprada", phase: "passagem",
  scheduleStartDate: "2026-10-26", scheduleEndDate: "2026-11-02",
  passagem: { id: "t2", actualDepartureDate: "2026-10-25", actualDepartureTime: "21:25" },
  ...extra,
});

describe("janela de viagem — caso Alonso (Aracaju → João Pessoa)", () => {
  it("sem encadear: a ida de 25/10 21:25 cruza a volta de 26/10 03:50 → bloqueia", () => {
    const { bloqueia, avisos } = conflitosDeViagem(joaoPessoa(), [aracaju()]);
    expect(avisos).toHaveLength(0);
    expect(bloqueia).toHaveLength(1);
    expect(bloqueia[0].outra.id).toBe("v4045");
    expect(bloqueia[0].outraVemAntes).toBe(true);
  });

  it("a frase do bloqueio diz onde a pessoa está, até quando e o que fazer", () => {
    const [c] = conflitosDeViagem(joaoPessoa(), [aracaju()]).bloqueia;
    expect(mensagemDeViagemCruzada("ALONSO SILVA", c)).toBe(
      "Alonso já está em Aracaju até 26/10 03:50 (#4045 · Night Run Aracaju). Esta ida 25/10 21:25 cruza com essa viagem. Se Alonso vai direto de Aracaju, registre como trecho direto.",
    );
  });

  it("encadeado por Compras (ida de JPA sai da vaga de Aracaju): não conflita", () => {
    const jp = joaoPessoa({ passagem: { actualDepartureDate: "2026-10-25", actualDepartureTime: "21:25", idaVemDeInclusionId: "v4045" } });
    const aj = aracaju();
    expect(estaoEncadeadas(jp, aj)).toBe(true);
    const e = encadeamentoEntre(jp, aj)!;
    expect(e.anterior.id).toBe("v4045");
    expect(e.seguinte.id).toBe("v4238");
    expect(e.fonte).toBe("passagem");
    expect(conflitosDeViagem(jp, [aj])).toEqual({ bloqueia: [], avisos: [] });
    expect(conflitosDeViagem(aj, [jp])).toEqual({ bloqueia: [], avisos: [] });
    expect(seguidaPorPassagem(aj, [jp])?.id).toBe("v4238");
  });

  it("encadeada: a janela da anterior termina na partida do trecho direto", () => {
    const jp = joaoPessoa({ passagem: { actualDepartureDate: "2026-10-25", actualDepartureTime: "21:25", idaVemDeInclusionId: "v4045" } });
    expect(janelaDaVaga(aracaju(), jp).fim).toEqual({ dia: "2026-10-25", hora: "21:25", fonte: "passagem" });
    expect(janelaDaVaga(jp).inicio).toEqual({ dia: "2026-10-25", hora: "21:25", fonte: "passagem" });
  });

  it("encadeada com a seguinte, a anterior ainda conflita com uma TERCEIRA vaga", () => {
    const jp = joaoPessoa({ passagem: { actualDepartureDate: "2026-10-25", actualDepartureTime: "21:25", idaVemDeInclusionId: "v4045" } });
    const terceira: VagaDaJanela = {
      id: "v9", inclusionNumber: 9, eventId: "ev-rec", eventLocation: "Recife - PE", collaboratorId: "alonso", status: "confirmado",
      scheduleStartDate: "2026-10-23", scheduleEndDate: "2026-10-24",
    };
    const { bloqueia } = conflitosDeViagem(aracaju(), [jp, terceira]);
    expect(bloqueia.map((c) => c.outra.id)).toEqual(["v9"]);
  });

  it("indicação da logística (vaga A 'segue para o evento de B') também encadeia, enquanto não há ida comprada em B", () => {
    const aj = aracaju({ voltaSegueParaEventoId: "ev-jpa", passagem: { actualDepartureDate: "2026-10-21", actualDepartureTime: "16:15" } });
    const jp = joaoPessoa({ passagem: null, flightDepartureDate: "2026-10-25" });
    const e = encadeamentoEntre(aj, jp);
    expect(e?.fonte).toBe("indicacao");
    expect(e?.anterior.id).toBe("v4045");
    // Indicação do outro lado ("vem direto de Aracaju") vale igual.
    expect(encadeamentoEntre(aracaju({ passagem: null }), joaoPessoa({ passagem: null, idaVemDoEventoId: "ev-aju" }))?.fonte).toBe("indicacao");
  });

  it("com a ida de B COMPRADA sem sair de A, vale a passagem: a indicação não encadeia mais", () => {
    const aj = aracaju({ voltaSegueParaEventoId: "ev-jpa" });
    expect(estaoEncadeadas(aj, joaoPessoa())).toBe(false);
    expect(conflitosDeViagem(joaoPessoa(), [aj]).bloqueia).toHaveLength(1);
  });

  it("outro colaborador ou mesmo evento nunca encadeia", () => {
    expect(estaoEncadeadas(aracaju({ voltaSegueParaEventoId: "ev-jpa" }), joaoPessoa({ passagem: null, collaboratorId: "outra" }))).toBe(false);
    expect(estaoEncadeadas(aracaju({ voltaSegueParaEventoId: "ev-aju" }), aracaju({ id: "outra" }))).toBe(false);
  });
});

describe("cruzamento de janelas", () => {
  const m = (dia: string, hora: string | null = null) => ({ dia, hora, fonte: hora ? "passagem" as const : "sugestao" as const });

  it("volta 10:00 × ida 18:00 no mesmo dia: não cruza", () => {
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20", "08:00"), fim: m("2026-10-25", "10:00") }, { inicio: m("2026-10-25", "18:00"), fim: m("2026-10-30", "12:00") })).toBeNull();
  });

  it("encostar no minuto não cruza; um minuto a mais cruza", () => {
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20", "08:00"), fim: m("2026-10-25", "18:00") }, { inicio: m("2026-10-25", "18:00"), fim: m("2026-10-30", "12:00") })).toBeNull();
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20", "08:00"), fim: m("2026-10-25", "18:01") }, { inicio: m("2026-10-25", "18:00"), fim: m("2026-10-30", "12:00") })?.nivel).toBe("bloqueia");
  });

  it("sem horário: 1 dia em comum é aviso, 2 ou mais bloqueia", () => {
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20"), fim: m("2026-10-25") }, { inicio: m("2026-10-25"), fim: m("2026-10-30") })?.nivel).toBe("aviso");
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20"), fim: m("2026-10-26") }, { inicio: m("2026-10-25"), fim: m("2026-10-30") })?.nivel).toBe("bloqueia");
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20"), fim: m("2026-10-24") }, { inicio: m("2026-10-25"), fim: m("2026-10-30") })).toBeNull();
  });

  it("hora de um lado só: conta dias (volta 10:00 × ida no mesmo dia sem hora = aviso)", () => {
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-20", "08:00"), fim: m("2026-10-25", "10:00") }, { inicio: m("2026-10-25"), fim: m("2026-10-30") })?.nivel).toBe("aviso");
  });

  it("janela com fim antes do início (data impossível) não acusa conflito — vira pendência de data", () => {
    expect(cruzamentoDeJanelas({ inicio: m("2026-10-25"), fim: m("2026-10-20") }, { inicio: m("2026-10-19"), fim: m("2026-10-30") })).toBeNull();
  });
});

describe("janela sem passagem e fontes", () => {
  it("sem passagem: usa as datas sugeridas (dia inteiro) e, sem elas, a escala", () => {
    const v: VagaDaJanela = { id: "x", eventId: "e", scheduleStartDate: "2026-10-22", scheduleEndDate: "2026-10-25", flightDepartureDate: "2026-10-21" };
    expect(janelaDaVaga(v)).toEqual({ inicio: { dia: "2026-10-21", hora: null, fonte: "sugestao" }, fim: { dia: "2026-10-25", hora: null, fonte: "escala" } });
  });

  it("chegada da volta depois da meia-noite passa para o dia seguinte", () => {
    const v: VagaDaJanela = { id: "x", eventId: "e", passagem: { actualReturnDate: "2026-10-25", actualReturnTime: "23:10", returnArrivalTime: "01:20" } };
    expect(janelaDaVaga(v).fim).toEqual({ dia: "2026-10-26", hora: "01:20", fonte: "passagem" });
  });

  it("duas vagas sem passagem com sugestões que dividem 1 dia: aviso", () => {
    const a: VagaDaJanela = { id: "a", eventId: "e1", collaboratorId: "c", status: "confirmado", scheduleStartDate: "2026-10-22", scheduleEndDate: "2026-10-25", flightReturnDate: "2026-10-26" };
    const b: VagaDaJanela = { id: "b", eventId: "e2", collaboratorId: "c", status: "confirmado", scheduleStartDate: "2026-10-27", scheduleEndDate: "2026-10-30", flightDepartureDate: "2026-10-26" };
    const r = conflitosDeViagem(b, [a]);
    expect(r.bloqueia).toHaveLength(0);
    expect(r.avisos).toHaveLength(1);
  });

  it("vaga cancelada, excluída ou não confirmada não entra", () => {
    const base = aracaju();
    for (const extra of [{ status: "cancelado" }, { deletedAt: new Date() }, { status: "planejado" }]) {
      expect(conflitosDeViagem(joaoPessoa(), [{ ...base, ...extra }]).bloqueia).toHaveLength(0);
    }
  });
});

describe("pares que se cruzam (Pendências)", () => {
  it("lista o par uma vez só e deixa de fora o encadeado", () => {
    expect(viagensQueSeCruzam([aracaju(), joaoPessoa()])).toHaveLength(1);
    const jp = joaoPessoa({ passagem: { actualDepartureDate: "2026-10-25", actualDepartureTime: "21:25", idaVemDeInclusionId: "v4045" } });
    expect(viagensQueSeCruzam([aracaju(), jp])).toHaveLength(0);
  });
});

describe("trecho direto: vizinhas e sugestão", () => {
  it("cidade do evento sai do fim do local, sem a UF", () => {
    expect(cidadeDoEvento("Orla de Atalaia, Aracaju - SE")).toBe("Aracaju");
    expect(cidadeDoEvento("João Pessoa/PB")).toBe("João Pessoa");
    expect(cidadesDiferentes("Ibirapuera, São Paulo - SP", "sao paulo")).toBe(false);
    expect(cidadesDiferentes("Aracaju - SE", "")).toBe(false);
  });

  it("sugere ir direto da vaga anterior em outra cidade que termina até 3 dias antes", () => {
    const jp = joaoPessoa({ passagem: null });
    const s = sugestaoDeTrechoDireto(jp, [aracaju()]);
    expect(s?.vaga.id).toBe("v4045");
    expect(s?.cidade).toBe("Aracaju");
    expect(s?.dia).toBe("2026-10-25");
    expect(s?.lado).toBe("anterior");
    // E o inverso, na anterior: "segue para João Pessoa em 26/10".
    const [seg] = vizinhasParaTrechoDireto(aracaju(), [jp]);
    expect(seg).toMatchObject({ lado: "seguinte", cidade: "João Pessoa", dia: "2026-10-26" });
  });

  it("não sugere quando termina mais de 3 dias antes, na mesma cidade ou já encadeada", () => {
    expect(sugestaoDeTrechoDireto(joaoPessoa({ passagem: null, scheduleStartDate: "2026-10-30" }), [aracaju()])).toBeNull();
    expect(sugestaoDeTrechoDireto(joaoPessoa({ passagem: null, eventLocation: "Aracaju - SE" }), [aracaju()])).toBeNull();
    expect(sugestaoDeTrechoDireto(joaoPessoa({ passagem: { idaVemDeInclusionId: "v4045" } }), [aracaju()])).toBeNull();
  });

  it("a indicação da logística escolhe entre duas anteriores", () => {
    const outra = aracaju({ id: "v1", eventId: "ev-rec", eventLocation: "Recife - PE", scheduleEndDate: "2026-10-25" });
    const jp = joaoPessoa({ passagem: null, idaVemDoEventoId: "ev-aju" });
    expect(sugestaoDeTrechoDireto(jp, [outra, aracaju()])?.vaga.id).toBe("v4045");
  });
});

describe("pernas da passagem e datas impossíveis", () => {
  it("só ida, só volta e ida e volta saem dos campos preenchidos", () => {
    expect(trechosDaPassagem({ actualDepartureDate: "2026-10-25" })).toBe("so_ida");
    expect(trechosDaPassagem({ actualReturnDate: "2026-10-25" })).toBe("so_volta");
    expect(trechosDaPassagem(aracaju().passagem)).toBe("ida_e_volta");
    expect(trechosDaPassagem({})).toBeNull();
  });

  it("volta antes da ida e anos fora de 2024…hoje+2 são recusados", () => {
    const hoje = "2026-10-09";
    expect(errosDeDataDaPassagem({ actualDepartureDate: "2026-10-25", actualReturnDate: "2026-10-20" }, hoje).actualReturnDate).toMatch(/não pode ser antes da ida/);
    expect(errosDeDataDaPassagem({ actualDepartureDate: "2026-10-25", actualDepartureTime: "18:00", actualReturnDate: "2026-10-25", actualReturnTime: "10:00" }, hoje).actualReturnTime).toMatch(/mesmo dia/);
    expect(errosDeDataDaPassagem({ actualDepartureDate: "0002-10-25" }, hoje).actualDepartureDate).toMatch(/ano 2 /);
    expect(errosDeDataDaPassagem({ actualReturnDate: "+72026-10-25" }, hoje).actualReturnDate).toMatch(/72026/);
    expect(errosDeDataDaPassagem({ actualDepartureDate: "2028-12-31", actualReturnDate: "2029-01-02" }, hoje).actualReturnDate).toMatch(/entre 2024 e 2028/);
    expect(errosDeDataDaPassagem(aracaju().passagem!, hoje)).toEqual({});
    // Só ida ou só volta é passagem normal.
    expect(errosDeDataDaPassagem({ actualDepartureDate: "2026-10-25" }, hoje)).toEqual({});
  });

  it("motivo curto para a Pendências", () => {
    expect(motivoDeDataImpossivel({ actualDepartureDate: "2026-10-25", actualReturnDate: "2026-10-20" }, "2026-10-09")).toBe("Data da volta antes da ida");
    expect(motivoDeDataImpossivel({ actualDepartureDate: "0002-10-25" }, "2026-10-09")).toBe("Ano impossível na ida (2)");
    expect(motivoDeDataImpossivel({ actualDepartureDate: "2026-10-25" }, "2026-10-09")).toBeNull();
  });
});

describe("indicação na vaga (normalizarTrechosDaVaga)", () => {
  it("segue direto para outro evento = só ida, sem os campos da volta", () => {
    const r = normalizarTrechosDaVaga({ voltaSegueParaEventoId: "ev-jpa", flightReturnDate: "2026-10-26", transportModeVolta: "aereo", flightReturnSuggestedTime: "8h" }, "ev-aju");
    expect(r.erro).toBeUndefined();
    expect(r.valor).toMatchObject({ trechosSugeridos: "so_ida", voltaSegueParaEventoId: "ev-jpa", flightReturnDate: null, transportModeVolta: null, flightReturnSuggestedTime: null });
  });

  it("vem direto de outro evento mantém a ida (ela é o trecho direto)", () => {
    const r = normalizarTrechosDaVaga({ idaVemDoEventoId: "ev-aju", flightDepartureDate: "2026-10-25", transportModeIda: "aereo" }, "ev-jpa");
    expect(r.valor).toMatchObject({ trechosSugeridos: null, idaVemDoEventoId: "ev-aju", flightDepartureDate: "2026-10-25", transportModeIda: "aereo" });
  });

  it("só volta limpa a ida; ida e volta vira null; próprio evento é erro", () => {
    expect(normalizarTrechosDaVaga({ trechosSugeridos: "so_volta", idaVemDoEventoId: "x", flightDepartureDate: "2026-10-25" }).valor)
      .toMatchObject({ trechosSugeridos: "so_volta", idaVemDoEventoId: null, flightDepartureDate: null });
    expect(normalizarTrechosDaVaga({ trechosSugeridos: "ida_e_volta" }).valor.trechosSugeridos).toBeNull();
    expect(normalizarTrechosDaVaga({ idaVemDoEventoId: "ev-1" }, "ev-1").erro).toMatch(/próprio evento/);
    expect(normalizarTrechosDaVaga({ trechosSugeridos: "so_volta", voltaSegueParaEventoId: "ev-2" }, "ev-1").erro).toMatch(/Só volta/);
  });

  it("texto da indicação para Compras", () => {
    const nome = (id: string) => ({ "ev-aju": "Night Run Aracaju" } as Record<string, string>)[id];
    expect(textoDaIndicacao({ idaVemDoEventoId: "ev-aju" }, nome)).toEqual(["vem direto de Night Run Aracaju"]);
    expect(textoDaIndicacao({ trechosSugeridos: "so_ida" }, nome)).toEqual(["só ida (sem volta)"]);
  });
});

describe("Pendências só lista passagens que se cruzam", () => {
  it("sem passagem de um lado não entra (a sugestão de trecho direto resolve na fila)", () => {
    expect(viagensQueSeCruzam([aracaju(), joaoPessoa({ passagem: null, flightDepartureDate: "2026-10-25" })])).toHaveLength(0);
  });
});
