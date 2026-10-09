import { describe, it, expect } from "vitest";
import { FILTRO_EXCLUSAO } from "@shared/log-auditoria";
import {
  PREFIXO_PESSOA_PELO_NOME, dataHoraCompleta, gruposDeAcoes, horaBr, opcoesDePessoas, parametroDaPessoa, rotuloDoDia,
} from "./auditoria-utils";

const ids = () => gruposDeAcoes().flatMap((g) => g.opcoes.map((o) => o.id));

describe("filtro de ação do Log de auditoria (08/10)", () => {
  it("as 12 ações do histórico da vaga (nunca gravadas em system_logs) saíram do filtro", () => {
    const todas = ids();
    for (const k of ["created", "deleted", "status_changed", "city_changed", "collaborator_changed", "daily_rates_changed",
      "daily_value_changed", "dates_changed", "travel_dates_changed", "work_days_changed", "observations_changed", "note"]) {
      expect(todas).not.toContain(k);
    }
    expect(gruposDeAcoes().some((g) => g.titulo === "Histórico da vaga")).toBe(false);
  });

  it("“Exclusão” filtra pelo valor que inclui as exclusões gravadas como alteração", () => {
    const exclusao = gruposDeAcoes().flatMap((g) => g.opcoes).filter((o) => o.nome === "Exclusão");
    expect(exclusao).toEqual([{ id: FILTRO_EXCLUSAO, nome: "Exclusão" }]);
    expect(ids()).not.toContain("delete");
    expect(ids()).toContain("update");
  });
});

describe("fuso de São Paulo em hora, data e agrupamento (08/10)", () => {
  // 02:30 UTC de 09/10 = 23:30 de 08/10 em São Paulo.
  const iso = "2026-10-09T02:30:00.000Z";

  it("hora e data completa no fuso da operação", () => {
    expect(horaBr(iso)).toBe("23:30");
    expect(dataHoraCompleta(iso)).toBe("08/10/2026 às 23:30:00");
  });

  it("o dia do agrupamento é o de São Paulo (Hoje/Ontem também)", () => {
    const agora = new Date("2026-10-09T12:00:00.000Z"); // 09/10, 09h em SP
    expect(rotuloDoDia(iso, agora)).toMatchObject({ chave: "2026-10-08", principal: "Ontem" });
    expect(rotuloDoDia("2026-10-09T03:30:00.000Z", agora)).toMatchObject({ chave: "2026-10-09", principal: "Hoje" });
    expect(rotuloDoDia("2026-10-01T15:00:00.000Z", agora)).toMatchObject({ chave: "2026-10-01", principal: "01/10/2026" });
  });
});

describe("pessoas do filtro: sem cadastro e sistema (08/10)", () => {
  const usuarios = [{ id: "u1", name: "Ana Souza" }];

  it("acrescenta quem só aparece no log, filtrável pelo nome gravado", () => {
    const opcoes = opcoesDePessoas(usuarios, [
      { userId: "u1", userName: "Ana Souza" },
      { userId: null, userName: "Sistema" },
      { userId: "removido", userName: "BRUNO LIMA" },
    ]);
    expect(opcoes).toEqual([
      { id: "u1", name: "Ana Souza" },
      { id: `${PREFIXO_PESSOA_PELO_NOME}BRUNO LIMA`, name: "Bruno Lima (sem cadastro)" },
      { id: `${PREFIXO_PESSOA_PELO_NOME}Sistema`, name: "Sistema" },
    ]);
  });

  it("parâmetro: id → userId; nome → userName; todos → nada", () => {
    expect(parametroDaPessoa("u1")).toEqual({ chave: "userId", valor: "u1" });
    expect(parametroDaPessoa(`${PREFIXO_PESSOA_PELO_NOME}Sistema`)).toEqual({ chave: "userName", valor: "Sistema" });
    expect(parametroDaPessoa("all")).toBeNull();
  });
});
