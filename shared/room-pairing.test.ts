/**
 * Casos reais da planilha "CORRIDA VALE - ITABIRA MG 2026": lá a equipe divide
 * quarto mesmo com datas diferentes, e é isso que a regra precisa reproduzir.
 */
import { describe, it, expect } from "vitest";
import {
  sugerirQuartos, podemDividir, noitesEmComum, noitesEmComumDeTodos, observacaoDeDatas, ehCenotecnica,
  capacidadeDoQuarto, motivoDeLotacao, tipoPorOcupantes, type RoomCandidate, type RoomPairingConfig,
} from "./room-pairing";

const CFG: RoomPairingConfig = { allowTripleRoom: false, requireSameGenderForSharedRoom: true, sameFunctionPriority: true };
const HOTEL = "PREMIUM EXECUTIVE HOTEL";

const p = (o: Partial<RoomCandidate> & { collaboratorId: string }): RoomCandidate => ({
  checkIn: "2026-08-27", checkOut: "2026-08-31", hotelName: HOTEL,
  // Função neutra por padrão: cenotécnica tem regra própria de triplo (09/10)
  // e ganhou testes à parte.
  gender: null, functionId: "kit", functionName: "Kit", ...o,
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

  // Dono, 02/10 (print da aba Quartos): "deveria ser quinta com quinta e sexta
  // com sexta". Os quatro são homens de funções diferentes; antes saíam
  // Igor(sex)+Bruno(qui) e Renan(sex)+Leonardo(qui).
  it("datas iguais primeiro: quinta com quinta, sexta com sexta", () => {
    const base = { checkOut: "2026-11-08", gender: "male" };
    const igor = p({ collaboratorId: "igor", checkIn: "2026-11-06", functionId: "ativacao-sp", ...base });
    const bruno = p({ collaboratorId: "bruno", checkIn: "2026-11-05", functionId: "sup-ceno", ...base });
    const renan = p({ collaboratorId: "renan", checkIn: "2026-11-06", functionId: "dir-prova", ...base });
    const leonardo = p({ collaboratorId: "leonardo", checkIn: "2026-11-05", functionId: "producao", ...base });
    const quartos = sugerirQuartos([igor, bruno, renan, leonardo], CFG);
    const pares = quartos.map((q) => [...q.members].sort().join("+")).sort();
    expect(pares).toEqual(["bruno+leonardo", "igor+renan"]);
    expect(quartos.every((q) => !q.partialOverlap)).toBe(true);
  });

  it("datas iguais vencem a mesma função; sem par de mesma data, divide pelas noites em comum", () => {
    const a = p({ collaboratorId: "a", checkIn: "2026-11-06", checkOut: "2026-11-08", functionId: "kit", gender: "male" });
    const mesmaFuncaoOutraData = p({ collaboratorId: "b", checkIn: "2026-11-05", checkOut: "2026-11-08", functionId: "kit", gender: "male" });
    const mesmaData = p({ collaboratorId: "c", checkIn: "2026-11-06", checkOut: "2026-11-08", functionId: "percurso", gender: "male" });
    const quartos = sugerirQuartos([a, mesmaFuncaoOutraData, mesmaData], CFG);
    expect(quartos.find((q) => q.members.includes("a"))?.members.sort()).toEqual(["a", "c"]);
    expect(quartos.find((q) => q.members.includes("b"))?.roomType).toBe("single");
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

  it("noites em comum de um triplo são as que os TRÊS dividem", () => {
    const tres = [
      p({ collaboratorId: "a", checkIn: "2026-04-22", checkOut: "2026-04-26", gender: "male" }),
      p({ collaboratorId: "b", checkIn: "2026-04-22", checkOut: "2026-04-25", gender: "male" }),
      p({ collaboratorId: "c", checkIn: "2026-04-23", checkOut: "2026-04-26", gender: "male" }),
    ];
    const [q] = sugerirQuartos(tres, { ...CFG, allowTripleRoom: true });
    expect(q.roomType).toBe("triple");
    expect(q.sharedNights).toBe(2); // 23→25; o par a×b sozinho daria 3
    expect(noitesEmComumDeTodos(tres)).toBe(2);
  });
});

describe("observação de datas diferentes", () => {
  it("datas iguais não geram observação", () => {
    expect(observacaoDeDatas([{ checkIn: "2026-04-22", checkOut: "2026-04-26" }, { checkIn: "2026-04-22", checkOut: "2026-04-26" }])).toBeNull();
  });

  it("conta as noites que todos dividem", () => {
    expect(observacaoDeDatas([
      { checkIn: "2026-04-22", checkOut: "2026-04-27" },
      { checkIn: "2026-04-23", checkOut: "2026-04-26" },
    ])).toBe("Datas diferentes entre os ocupantes — 3 noites em comum. Confirme entrada/saída com o hotel.");
    expect(observacaoDeDatas([
      { checkIn: "2026-04-22", checkOut: "2026-04-24" },
      { checkIn: "2026-04-23", checkOut: "2026-04-24" },
    ])).toContain("1 noite em comum");
  });

  it("quarto individual não tem observação", () => {
    expect(observacaoDeDatas([{ checkIn: "2026-04-22", checkOut: "2026-04-26" }])).toBeNull();
  });
});

// Dono, 09/10 (Night Run 1ª Etapa Rio): "Cenotécnica pode ficar num quarto
// triplo." Cinco cenotécnicos de 22→26/04 viravam 2 duplos + 1 single.
describe("cenotécnica em quarto triplo", () => {
  const ceno = (id: string, o: Partial<RoomCandidate> = {}) => p({
    collaboratorId: id, checkIn: "2026-04-22", checkOut: "2026-04-26", gender: "male",
    functionId: "ceno", functionName: "Cenotécnica", ...o,
  });
  const tipos = (qs: ReturnType<typeof sugerirQuartos>) => qs.map((q) => q.members.length).sort((x, y) => y - x);

  it("reconhece a função sem acento e sem caixa; Sup Ceno não entra", () => {
    expect(ehCenotecnica("Cenotécnica")).toBe(true);
    expect(ehCenotecnica("CENOTECNICA - Montagem")).toBe(true);
    expect(ehCenotecnica("Sup Ceno")).toBe(false);
    expect(ehCenotecnica("Supervisor de Cenografia")).toBe(false);
    expect(ehCenotecnica(null)).toBe(false);
  });

  it("caso real: 5 cenotécnicos com as mesmas datas → 1 triplo + 1 duplo, sem single", () => {
    const qs = sugerirQuartos(["a", "b", "c", "d", "e"].map((id) => ceno(id)), CFG);
    expect(tipos(qs)).toEqual([3, 2]);
    expect(qs.map((q) => q.roomType).sort()).toEqual(["double", "triple"]);
    expect(qs.find((q) => q.roomType === "triple")?.partialOverlap).toBe(false);
  });

  it("3 → um triplo", () => {
    expect(tipos(sugerirQuartos(["a", "b", "c"].map((id) => ceno(id)), CFG))).toEqual([3]);
  });

  it("4 → dois duplos (não 3+1)", () => {
    expect(tipos(sugerirQuartos(["a", "b", "c", "d"].map((id) => ceno(id)), CFG))).toEqual([2, 2]);
  });

  it("6 → dois triplos; 7 → 3+2+2", () => {
    expect(tipos(sugerirQuartos(["a", "b", "c", "d", "e", "f"].map((id) => ceno(id)), CFG))).toEqual([3, 3]);
    expect(tipos(sugerirQuartos(["a", "b", "c", "d", "e", "f", "g"].map((id) => ceno(id)), CFG))).toEqual([3, 2, 2]);
  });

  it("triplo só se os TRÊS forem de cenotécnica (chave global desligada)", () => {
    const qs = sugerirQuartos([
      ceno("a"), ceno("b"),
      ceno("sup", { functionId: "sup-ceno", functionName: "Sup Ceno" }),
    ], CFG);
    expect(tipos(qs)).toEqual([2, 1]);
    expect(qs.find((q) => q.members.includes("sup"))?.roomType).toBe("single");
  });

  it("as outras regras seguem valendo: gênero e noites em comum", () => {
    const qs = sugerirQuartos([
      ceno("a"), ceno("b"),
      ceno("m", { gender: "female" }),
      ceno("longe", { checkIn: "2026-05-10", checkOut: "2026-05-12" }),
    ], CFG);
    expect(qs.find((q) => q.members.includes("a"))?.members.sort()).toEqual(["a", "b"]);
    expect(qs.find((q) => q.members.includes("m"))?.roomType).toBe("single");
    expect(qs.find((q) => q.members.includes("longe"))?.roomType).toBe("single");
  });

  it("com a chave global ligada, triplo continua valendo para todos", () => {
    const tres = ["a", "b", "c"].map((id) => p({ collaboratorId: id, gender: "male", functionName: "Produção" }));
    expect(sugerirQuartos(tres, { ...CFG, allowTripleRoom: true })[0].roomType).toBe("triple");
  });
});

describe("lotação no Mover", () => {
  it("tipo pelo número de ocupantes", () => {
    expect([1, 2, 3].map(tipoPorOcupantes)).toEqual(["single", "double", "triple"]);
  });

  it("até 2 sempre pode; 3 só cenotécnica (ou chave ligada); 4+ nunca", () => {
    expect(motivoDeLotacao(["Kit", "Produção"], false)).toBeNull();
    expect(motivoDeLotacao(["Cenotécnica", "Cenotécnica", "cenotecnica"], false)).toBeNull();
    expect(motivoDeLotacao(["Cenotécnica", "Cenotécnica", "Sup Ceno"], false)).toMatch(/cenotécnica/);
    expect(motivoDeLotacao(["Kit", "Kit", "Kit"], true)).toBeNull();
    expect(motivoDeLotacao(["Cenotécnica", "Cenotécnica", "Cenotécnica", "Cenotécnica"], true)).toBe("Um quarto comporta no máximo 3 pessoas.");
    expect(capacidadeDoQuarto(["Cenotécnica"], false)).toBe(3);
  });
});
