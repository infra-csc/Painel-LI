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
  });

  it("na vaga pareada os papéis se invertem", () => {
    const t = trocaNaVisaoDaVaga(permuta, "Y");
    expect(t.currentCollaboratorName).toBe("Bia");
    expect(t.newCollaboratorName).toBe("Ana");
    expect(t.newCity).toBe("São Paulo - SP");
    expect(t.permutaCom).toBe("vaga #10 · Evento X");
    expect(t.saiDeOutro).toBe("Salvador - BA");
  });

  it("troca simples não vira permuta", () => {
    const t = trocaNaVisaoDaVaga({ ...permuta, swap_kind: "substituicao", paired_inclusion_id: null }, "X");
    expect(t.permutaCom).toBeNull();
    expect(t.saiDeOutro).toBeNull();
  });
});
