import { describe, it, expect } from "vitest";
import { tipoDeConflitoDeAgenda } from "./scaling-utils";

const vaga = (ini: string, fim: string) => ({ scheduleStartDate: ini, scheduleEndDate: fim });

describe("conflito de agenda do colaborador (18/09)", () => {
  it("um termina no dia em que o outro começa: só aviso (duas viagens no mesmo dia)", () => {
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-17", "2026-09-20"), vaga("2026-09-20", "2026-09-22"))).toBe("mesmo_dia");
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-20", "2026-09-22"), vaga("2026-09-17", "2026-09-20"))).toBe("mesmo_dia");
  });

  it("as duas no mesmo dia único: só aviso", () => {
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-20", "2026-09-20"), vaga("2026-09-20", "2026-09-20"))).toBe("mesmo_dia");
  });

  it("dois dias ou mais em comum: sobreposição (bloqueia)", () => {
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-17", "2026-09-20"), vaga("2026-09-19", "2026-09-22"))).toBe("sobreposicao");
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-17", "2026-09-25"), vaga("2026-09-19", "2026-09-20"))).toBe("sobreposicao");
  });

  it("sem dia em comum ou sem datas: nenhum conflito", () => {
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-17", "2026-09-19"), vaga("2026-09-20", "2026-09-22"))).toBeNull();
    expect(tipoDeConflitoDeAgenda({ scheduleStartDate: null, scheduleEndDate: null }, vaga("2026-09-20", "2026-09-22"))).toBeNull();
  });

  it("aceita data com horário (ISO) e objeto Date", () => {
    expect(tipoDeConflitoDeAgenda(vaga("2026-09-17T00:00:00.000Z", "2026-09-20T00:00:00.000Z"), vaga("2026-09-20", "2026-09-21"))).toBe("mesmo_dia");
    expect(tipoDeConflitoDeAgenda(
      { scheduleStartDate: new Date("2026-09-17T12:00:00Z"), scheduleEndDate: new Date("2026-09-20T12:00:00Z") },
      vaga("2026-09-19", "2026-09-21"),
    )).toBe("sobreposicao");
  });
});
