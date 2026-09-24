import { describe, it, expect } from "vitest";
import { conflitosDoColaborador, ocupaAgenda, tipoDeConflitoDeAgenda } from "./conflito-de-agenda";

const vaga = (ini: string, fim: string) => ({ scheduleStartDate: ini, scheduleEndDate: fim });

// Testes movidos de client/src/components/scaling/conflito-agenda.test.ts (23/09);
// o arquivo do cliente continua passando pelo re-export.
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

describe("ocupaAgenda", () => {
  it("confirmadas (e legados de confirmação) ocupam; salvas, canceladas, sugestões e excluídas não", () => {
    expect(ocupaAgenda({ status: "escalado" })).toBe(true);
    expect(ocupaAgenda({ status: "hospedagem_passagem_comprada" })).toBe(true);
    expect(ocupaAgenda({ status: "confirmado" })).toBe(true);
    expect(ocupaAgenda({ status: "planejado" })).toBe(false);
    expect(ocupaAgenda({ status: "reaberto" })).toBe(false);
    expect(ocupaAgenda({ status: "cancelado" })).toBe(false);
    expect(ocupaAgenda({ status: "sugestao_pendente" })).toBe(false);
    expect(ocupaAgenda({ status: "escalado", phase: "sugestao" })).toBe(false);
    expect(ocupaAgenda({ status: "escalado", deletedAt: new Date() })).toBe(false);
    expect(ocupaAgenda({ status: "escalado", deletedAt: "2026-09-01T00:00:00Z" })).toBe(false);
  });
});

describe("conflitosDoColaborador", () => {
  const alvo = { id: "A", status: "planejado", ...vaga("2026-09-17", "2026-09-20") };

  it("separa bloqueios (2+ dias) de avisos (1 dia)", () => {
    const bloqueio = { id: "B", status: "escalado", ...vaga("2026-09-19", "2026-09-22") };
    const aviso = { id: "C", status: "passagem_comprada", ...vaga("2026-09-20", "2026-09-22") };
    const longe = { id: "D", status: "escalado", ...vaga("2026-09-25", "2026-09-27") };
    const r = conflitosDoColaborador(alvo, [bloqueio, aviso, longe]);
    expect(r.bloqueia).toEqual([bloqueio]);
    expect(r.avisos).toEqual([aviso]);
  });

  it("ignora a própria vaga (mesmo id ou mesma referência)", () => {
    const copia = { ...alvo, status: "escalado" };
    const r = conflitosDoColaborador(alvo, [alvo, copia]);
    expect(r.bloqueia).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("ignora excluídas, canceladas, sugestões e vagas só salvas", () => {
    const outras = [
      { id: "B", status: "escalado", deletedAt: new Date(), ...vaga("2026-09-17", "2026-09-20") },
      { id: "C", status: "cancelado", ...vaga("2026-09-17", "2026-09-20") },
      { id: "D", status: "sugestao_validada", phase: "sugestao", ...vaga("2026-09-17", "2026-09-20") },
      { id: "E", status: "planejado", ...vaga("2026-09-17", "2026-09-20") },
    ];
    const r = conflitosDoColaborador(alvo, outras);
    expect(r.bloqueia).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("a própria vaga não é filtrada por status (é a que está sendo confirmada)", () => {
    const outra = { id: "B", status: "aprovado", ...vaga("2026-09-18", "2026-09-19") };
    expect(conflitosDoColaborador({ id: "A", status: "reaberto", ...vaga("2026-09-17", "2026-09-20") }, [outra]).bloqueia).toEqual([outra]);
  });
});
