/**
 * Casos reais da planilha "CORRIDA VALE - ITABIRA MG 2026": lá a equipe divide
 * quarto mesmo com datas diferentes, e é isso que a regra precisa reproduzir.
 */
import { describe, it, expect } from "vitest";
import { sugerirQuartos, podemDividir, noitesEmComum, type RoomCandidate, type RoomPairingConfig } from "./room-pairing";

const CFG: RoomPairingConfig = { allowTripleRoom: false, requireSameGenderForSharedRoom: true, sameFunctionPriority: true };
const HOTEL = "PREMIUM EXECUTIVE HOTEL";

const p = (o: Partial<RoomCandidate> & { collaboratorId: string }): RoomCandidate => ({
  checkIn: "2026-08-27", checkOut: "2026-08-31", hotelName: HOTEL,
  gender: null, functionId: "cenotecnica", functionName: "cenotecnica", ...o,
});

describe("noites em comum", () => {
  it("períodos iguais contam todas as noites", () => {
    expect(noitesEmComum(p({ collaboratorId: "a" }), p({ collaboratorId: "b" }))).toBe(4);
  });

  it("caso Jobert × Daniel: 26→31 e 29→31 dividem 2 noites", () => {
    const jobert = p({ collaboratorId: "jobert", checkIn: "2026-08-26", checkOut: "2026-08-31" });
    const daniel = p({ collaboratorId: "daniel", checkIn: "2026-08-29", checkOut: "2026-08-31" });
    expect(noitesEmComum(jobert, daniel)).toBe(2);
  });

  it("períodos que não se tocam não dividem nada", () => {
    const a = p({ collaboratorId: "a", checkIn: "2026-08-20", checkOut: "2026-08-22" });
    const b = p({ collaboratorId: "b", checkIn: "2026-08-25", checkOut: "2026-08-27" });
    expect(noitesEmComum(a, b)).toBe(0);
    expect(podemDividir(a, b, CFG)).toBe(false);
  });

  it("quem sai no dia em que o outro entra não divide noite nenhuma", () => {
    const a = p({ collaboratorId: "a", checkIn: "2026-08-25", checkOut: "2026-08-27" });
    const b = p({ collaboratorId: "b", checkIn: "2026-08-27", checkOut: "2026-08-29" });
    expect(noitesEmComum(a, b)).toBe(0);
  });
});

describe("regra de gênero", () => {
  it("com gênero nos dois lados, ninguém divide com outro gênero", () => {
    const h = p({ collaboratorId: "h", gender: "male" });
    const m = p({ collaboratorId: "m", gender: "female" });
    expect(podemDividir(h, m, CFG)).toBe(false);
  });

  it("mesmo gênero divide", () => {
    expect(podemDividir(p({ collaboratorId: "h1", gender: "male" }), p({ collaboratorId: "h2", gender: "male" }), CFG)).toBe(true);
  });

  it("sem gênero cadastrado, divide só com a MESMA função (decisão do dono)", () => {
    const a = p({ collaboratorId: "a", gender: null, functionId: "kit" });
    const mesma = p({ collaboratorId: "b", gender: null, functionId: "kit" });
    const outra = p({ collaboratorId: "c", gender: null, functionId: "percurso" });
    expect(podemDividir(a, mesma, CFG)).toBe(true);
    expect(podemDividir(a, outra, CFG)).toBe(false);
  });
});

describe("montagem dos quartos", () => {
  it("hotéis diferentes nunca dividem", () => {
    const a = p({ collaboratorId: "a", hotelName: "Hotel A" });
    const b = p({ collaboratorId: "b", hotelName: "Hotel B" });
    expect(sugerirQuartos([a, b], CFG).every((q) => q.roomType === "single")).toBe(true);
  });

  it("caso Naiara × Ana: datas diferentes agora viram UM duplo", () => {
    const naiara = p({ collaboratorId: "naiara", checkIn: "2026-08-28", checkOut: "2026-08-31", functionId: "ativacao" });
    const ana = p({ collaboratorId: "ana", checkIn: "2026-08-27", checkOut: "2026-08-31", functionId: "ativacao" });
    const [quarto] = sugerirQuartos([naiara, ana], CFG);
    expect(quarto.roomType).toBe("double");
    expect(quarto.members).toEqual(["naiara", "ana"]);
    // o quarto fica ocupado do primeiro check-in ao último check-out
    expect(quarto.checkIn).toBe("2026-08-27");
    expect(quarto.checkOut).toBe("2026-08-31");
    expect(quarto.sharedNights).toBe(3);
    expect(quarto.partialOverlap).toBe(true);
  });

  it("prioriza quem é da mesma função", () => {
    const a = p({ collaboratorId: "a", functionId: "kit" });
    const outraFuncao = p({ collaboratorId: "b", functionId: "kit", gender: "male" });
    const mesmaFuncao = p({ collaboratorId: "c", functionId: "kit" });
    const [quarto] = sugerirQuartos([a, outraFuncao, mesmaFuncao], CFG);
    expect(quarto.members).toContain("a");
    expect(quarto.roomType).toBe("double");
  });

  it("quem sobra fica em individual, sem virar erro", () => {
    const sozinho = p({ collaboratorId: "so", checkIn: "2026-01-01", checkOut: "2026-01-02" });
    const quartos = sugerirQuartos([sozinho], CFG);
    expect(quartos).toHaveLength(1);
    expect(quartos[0].roomType).toBe("single");
    expect(quartos[0].sharedNights).toBe(1);
    expect(quartos[0].partialOverlap).toBe(false);
  });

  it("triplo só quando liberado", () => {
    const tres = ["a", "b", "c"].map((id) => p({ collaboratorId: id, gender: "male" }));
    expect(sugerirQuartos(tres, CFG)[0].roomType).toBe("double");
    const [triplo] = sugerirQuartos(tres, { ...CFG, allowTripleRoom: true });
    expect(triplo.roomType).toBe("triple");
    expect(triplo.members).toHaveLength(3);
  });

  it("ninguém entra em dois quartos", () => {
    const pessoas = ["a", "b", "c", "d", "e"].map((id) => p({ collaboratorId: id, gender: "female" }));
    const quartos = sugerirQuartos(pessoas, CFG);
    const todos = quartos.flatMap((q) => q.members);
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos).toHaveLength(5);
  });
});
