// Funções puras do Controle RH ligadas ao endpoint agregado (25/09): a URL da
// consulta, a tradução do filtro da tela e o denominador do progresso — o
// único número dos cards que o servidor ainda não manda em `contadores`.
import { describe, it, expect } from "vitest";
import type { PrestacaoItem } from "./prestacao-types";
import { CHAVE_CONTROLE_RH, contarParaProgresso, statusParaServidor, urlDoControleRh } from "./prestacao-utils";

type LinhaMinima = Pick<PrestacaoItem, "status" | "emiteNf" | "invoice" | "planned" | "actual">;

function linha(p: Partial<LinhaMinima> = {}): LinhaMinima {
  return { status: "aprovada_faturamento", emiteNf: true, invoice: null, planned: null, actual: null, ...p };
}
const nota = (status: string) => ({ status } as NonNullable<PrestacaoItem["invoice"]>);
const planejado = (didNotAttend: boolean) => ({ didNotAttend } as NonNullable<PrestacaoItem["planned"]>);
const realizado = (didNotAttend: boolean) => ({ didNotAttend } as NonNullable<PrestacaoItem["actual"]>);

describe("urlDoControleRh", () => {
  it("sem evento nem status é a chave pura", () => {
    expect(urlDoControleRh(null, undefined)).toBe(CHAVE_CONTROLE_RH);
    expect(CHAVE_CONTROLE_RH).toBe("/api/rh/controle");
  });

  it("monta eventId e status como query string (escapando o id)", () => {
    expect(urlDoControleRh("ev 1", undefined)).toBe("/api/rh/controle?eventId=ev+1");
    expect(urlDoControleRh(null, "rh_action")).toBe("/api/rh/controle?status=rh_action");
    expect(urlDoControleRh("ev1", "concluidos")).toBe("/api/rh/controle?eventId=ev1&status=concluidos");
  });
});

describe("statusParaServidor", () => {
  it("'all' vira ausência de filtro; os seis status e os quatro cards passam como estão", () => {
    expect(statusParaServidor("all")).toBeUndefined();
    for (const s of ["planejamento_pendente", "aguardando_prestacao", "prestacao_recebida", "devolvida_para_ajuste", "aprovada_faturamento", "recusada", "rh_action", "col_action", "nf_andamento", "concluidos"] as const) {
      expect(statusParaServidor(s)).toBe(s);
    }
  });
});

describe("contarParaProgresso — denominador da barra 'Progresso geral'", () => {
  it("conta quem ainda pode chegar ao check-in", () => {
    expect(contarParaProgresso([linha(), linha({ status: "aguardando_prestacao" }), linha({ status: "prestacao_recebida", invoice: nota("enviada") })])).toBe(3);
  });

  it("exclui recusados, quem não emite NF e NF recusada (terminal)", () => {
    expect(contarParaProgresso([
      linha({ status: "recusada" }),
      linha({ emiteNf: false }),
      linha({ invoice: nota("recusada") }),
      linha({ invoice: nota("devolvida") }), // devolvida NÃO é terminal → conta
    ])).toBe(1);
  });

  it("exclui 'não compareceu' marcado no Planejado OU no Realizado", () => {
    expect(contarParaProgresso([
      linha({ planned: planejado(true) }),
      linha({ actual: realizado(true) }),
      linha({ planned: planejado(false), actual: realizado(false) }),
    ])).toBe(1);
  });

  it("lista vazia → 0 (a página então mostra 0% sem dividir por zero)", () => {
    expect(contarParaProgresso([])).toBe(0);
  });
});
