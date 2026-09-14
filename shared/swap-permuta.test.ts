import { describe, it, expect } from "vitest";
import { periodosSeSobrepoem, rotuloDaVaga, trocaNaVisaoDaVaga, type TrocaCrua } from "./swap-permuta";

describe("permuta de colaboradores (14/09)", () => {
  it("mesmo fim de semana se sobrepõe; semanas diferentes não; sem datas não", () => {
    const sabDom = { scheduleStartDate: "2026-09-26", scheduleEndDate: "2026-09-27" };
    expect(periodosSeSobrepoem(sabDom, { scheduleStartDate: "2026-09-25", scheduleEndDate: "2026-09-26" })).toBe(true);
    expect(periodosSeSobrepoem(sabDom, { scheduleStartDate: "2026-09-27", scheduleEndDate: "2026-09-28" })).toBe(true);
    expect(periodosSeSobrepoem(sabDom, { scheduleStartDate: "2026-10-03", scheduleEndDate: "2026-10-04" })).toBe(false);
    expect(periodosSeSobrepoem(sabDom, { scheduleStartDate: null, scheduleEndDate: null })).toBe(false);
  });

  it("rótulo da vaga", () => {
    expect(rotuloDaVaga(12, "Circuitinho Salvador")).toBe("vaga #12 · Circuitinho Salvador");
    expect(rotuloDaVaga(null, null)).toBe("vaga #?");
  });

  const permuta: TrocaCrua = {
    id: "s1", team_inclusion_id: "X", paired_inclusion_id: "Y", swap_kind: "permuta",
    current_collaborator_name: "Ana", new_collaborator_name: "Bia",
    new_city: "Salvador - BA", paired_new_city: "São Paulo - SP",
    inclusion_number: 10, event_name: "Evento X", paired_inclusion_number: 20, paired_event_name: "Evento Y",
    status: "pendente",
  };

  it("na vaga do pedido: Ana sai, Bia chega vinda de Salvador, Ana vai para a vaga #20", () => {
    const t = trocaNaVisaoDaVaga(permuta, "X");
    expect(t.currentCollaboratorName).toBe("Ana");
    expect(t.newCollaboratorName).toBe("Bia");
    expect(t.newCity).toBe("Salvador - BA");
    expect(t.permutaCom).toBe("vaga #20 · Evento Y");
    expect(t.saiDeOutro).toBe("São Paulo - SP");
    expect(t.transferencia).toBe(false);
  });

  it("na vaga pareada os papéis se invertem", () => {
    const t = trocaNaVisaoDaVaga(permuta, "Y");
    expect(t.currentCollaboratorName).toBe("Bia");
    expect(t.newCollaboratorName).toBe("Ana");
    expect(t.newCity).toBe("São Paulo - SP");
    expect(t.permutaCom).toBe("vaga #10 · Evento X");
    expect(t.saiDeOutro).toBe("Salvador - BA");
  });

  it("troca simples não vira permuta nem transferência", () => {
    const t = trocaNaVisaoDaVaga({ ...permuta, swap_kind: "substituicao", paired_inclusion_id: null }, "X");
    expect(t.permutaCom).toBeNull();
    expect(t.saiDeOutro).toBeNull();
    expect(t.transferencia).toBe(false);
    expect(t.outraVaga).toBeNull();
  });
});

describe("transferência para vaga aberta (14/09)", () => {
  const transferencia: TrocaCrua = {
    id: "t1", team_inclusion_id: "X", paired_inclusion_id: "Y", swap_kind: "transferencia",
    current_collaborator_name: null, new_collaborator_name: "Gleicy",
    new_city: "Salvador - BA", paired_new_city: null,
    inclusion_number: 10, event_name: "Evento X", paired_inclusion_number: 30, paired_event_name: "Evento Y",
    status: "pendente",
  };

  it("na vaga aberta (destino): Gleicy chega, vinda da vaga #30, saindo de Salvador", () => {
    const t = trocaNaVisaoDaVaga(transferencia, "X");
    expect(t.transferencia).toBe(true);
    expect(t.currentCollaboratorName).toBeNull();
    expect(t.newCollaboratorName).toBe("Gleicy");
    expect(t.newCity).toBe("Salvador - BA");
    expect(t.outraVaga).toBe("vaga #30 · Evento Y");
    expect(t.permutaCom).toBeNull();
  });

  it("na vaga de origem: Gleicy sai e ninguém chega", () => {
    const t = trocaNaVisaoDaVaga(transferencia, "Y");
    expect(t.currentCollaboratorName).toBe("Gleicy");
    expect(t.newCollaboratorName).toBeNull();
    expect(t.newCity).toBeNull();
    expect(t.outraVaga).toBe("vaga #10 · Evento X");
  });
});
