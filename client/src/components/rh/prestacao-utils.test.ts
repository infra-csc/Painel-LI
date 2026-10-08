// Funções puras do Controle RH ligadas ao endpoint agregado (25/09): a URL da
// consulta, a tradução do filtro da tela e o denominador do progresso — o
// único número dos cards que o servidor ainda não manda em `contadores`.
import { describe, it, expect } from "vitest";
import type { PrestacaoItem } from "./prestacao-types";
import { CHAVE_CONTROLE_RH, contarParaProgresso, periodoDoEvento, prazoDaLinha, statusParaServidor, tomDaLinha, urlDoControleRh } from "./prestacao-utils";

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

// Redesenho 08/10: o prazo da linha e o tom do filete viraram funções puras
// (eram um IIFE na linha e `getLeftBorderStyle`) — mesmas regras de antes.
describe("prazoDaLinha", () => {
  const agora = new Date(2026, 9, 8, 15, 0); // 08/10/2026
  const evento = (startDate: string, endDate: string) => ({ id: "e", eventNumber: 1, name: "E", location: "", startDate, endDate, status: "planejado" });
  const base = (p: Partial<PrestacaoItem>) => ({ status: "planejamento_pendente", lastActivityDate: null, event: evento("2026-11-01", "2026-11-02"), ...p } as PrestacaoItem);

  it("aprovada para faturamento não tem prazo", () => {
    expect(prazoDaLinha(base({ status: "aprovada_faturamento" }), agora)).toBeNull();
  });
  it("do RH: evento encerrado vira alerta de perigo; começando em até 14 dias, atenção", () => {
    expect(prazoDaLinha(base({ event: evento("2026-09-11", "2026-09-12") }), agora)).toEqual({ texto: "Evento encerrado há 26 dias", tom: "perigo", alerta: true });
    expect(prazoDaLinha(base({ event: evento("2026-10-09", "2026-10-11") }), agora)).toEqual({ texto: "Evento em 1 dia", tom: "atencao", alerta: true });
    expect(prazoDaLinha(base({ event: evento("2026-10-07", "2026-10-09") }), agora)?.texto).toBe("Evento em andamento");
  });
  it("fora do RH: parado há mais de 30 dias é alerta", () => {
    const antigo = new Date(agora.getTime() - 40 * 864e5).toISOString();
    expect(prazoDaLinha(base({ status: "aguardando_prestacao", lastActivityDate: antigo }))).toMatchObject({ tom: "perigo", alerta: true });
  });
});

describe("tomDaLinha", () => {
  it("aprovados pelo status da nota; recusados em vermelho; o resto pelo tempo parado", () => {
    const ap = { status: "aprovada_faturamento", actual: {}, lastActivityDate: null } as unknown as PrestacaoItem;
    expect(tomDaLinha(ap, nota("aprovada"))).toBe("nf-aprovada");
    expect(tomDaLinha(ap, undefined)).toBe("nf-pendente");
    expect(tomDaLinha({ status: "recusada" } as PrestacaoItem, undefined)).toBe("recusada");
    const dias = (n: number) => ({ status: "aguardando_prestacao", lastActivityDate: new Date(Date.now() - n * 864e5).toISOString() } as PrestacaoItem);
    expect(tomDaLinha(dias(40), undefined)).toBe("atrasada");
    expect(tomDaLinha(dias(10), undefined)).toBe("parada");
    expect(tomDaLinha(dias(2), undefined)).toBe("recente");
  });

  it("quem NÃO emite NF não ganha o filete âmbar de 'nota pendente' (08/10)", () => {
    const semNf = { status: "aprovada_faturamento", actual: {}, emiteNf: false, lastActivityDate: null } as unknown as PrestacaoItem;
    expect(tomDaLinha(semNf, undefined)).toBe("sem-nf");
    // Se mesmo assim houver nota, vale a situação dela (a mesma ordem do selo).
    expect(tomDaLinha(semNf, nota("devolvida"))).toBe("nf-pendente");
    expect(tomDaLinha(semNf, nota("aprovada"))).toBe("nf-aprovada");
    const emite = { ...semNf, emiteNf: true } as PrestacaoItem;
    expect(tomDaLinha(emite, undefined)).toBe("nf-pendente");
  });
});

describe("periodoDoEvento", () => {
  it("um dia ou intervalo, com o ano do fim", () => {
    expect(periodoDoEvento({ startDate: "2026-09-11", endDate: "2026-09-12" })).toBe("11/09 – 12/09/2026");
    expect(periodoDoEvento({ startDate: "2026-09-11", endDate: "2026-09-11" })).toBe("11/09/2026");
    expect(periodoDoEvento({ startDate: null, endDate: null })).toBe("");
  });
});
