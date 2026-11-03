/**
 * Conferência automática (deck de 29/10): a decisão pura. Cada caso parte de
 * uma prestação que qualifica e muda UMA coisa — o motivo tem que aparecer.
 */
import { describe, expect, it } from "vitest";
import { CONFERENCIA_AUTOMATICA, conferirSemDivergencia, ehConferenciaAutomatica, ROTULO_DO_MOTIVO_DA_CONFERENCIA, type EntradaDaConferencia, type MotivoDaConferencia } from "./conferencia-automatica";

const DIAS = ["2099-10-10", "2099-10-11", "2099-10-12"];
const VALORES = {
  dailyQuantity: 3, dailyValue: 10_000, costAssistance: 0, weekdayLunch: 1_000, weekdayDinner: 1_000, weekendLunch: 500, weekendDinner: 500,
  mobility: 5_800, mobilityIda: 2_900, mobilityVolta: 2_900, transport: 0, totalValue: 38_800,
};
const VAGA = { eventId: "e1", collaboratorId: "c1", functionId: "f1", collaboratorType: "freela" };

function entrada(mudar: {
  prestacao?: Partial<EntradaDaConferencia["prestacao"]>;
  planejado?: Partial<NonNullable<EntradaDaConferencia["planejado"]>>;
  resto?: Partial<EntradaDaConferencia>;
} = {}): EntradaDaConferencia {
  return {
    prestacao: { ...VALORES, ...VAGA, plannedId: "p1", sentForReview: true, rhStatus: "pendente", horasExtras: "0", valorHorasExtras: 0, workedDays: null, ...mudar.prestacao },
    planejado: { ...VALORES, ...VAGA, status: "pre_aprovado", didNotAttend: false, diasMeiaExtra: null, ...mudar.planejado },
    evento: { startDate: DIAS[0], endDate: DIAS[2], status: "ativo" },
    inclusao: { scheduleStartDate: DIAS[0], scheduleEndDate: DIAS[2] },
    dataDeCorte: "2026-11-01",
    temDivisoes: false,
    ocorrencias: [],
    presencas: DIAS.map((dia) => ({ dia, checkinEm: `${dia}T12:00:00Z`, checkoutEm: `${dia}T21:00:00Z` })),
    confirmacao: { contestacao: null, diasConfirmados: DIAS },
    ...mudar.resto,
  };
}

const motivos = (m: Parameters<typeof entrada>[0]) => conferirSemDivergencia(entrada(m)).motivos;

describe("conferirSemDivergencia", () => {
  it("igual ao planejado: conferência automática, sem motivos", () => {
    expect(conferirSemDivergencia(entrada())).toEqual({ automatica: true, motivos: [], camposDiferentes: [] });
  });

  it("os dias gravados iguais aos da escala também qualificam (em qualquer ordem)", () => {
    expect(motivos({ prestacao: { workedDays: [...DIAS].reverse() } })).toEqual([]);
  });

  it("ida e volta nulas em linha antiga não são divergência", () => {
    expect(motivos({ planejado: { mobilityIda: null, mobilityVolta: null } })).toEqual([]);
  });

  it("½ diária igual à do Planejado não é divergência", () => {
    expect(motivos({ prestacao: { diasMeiaExtra: [DIAS[1]] }, planejado: { diasMeiaExtra: [DIAS[1]] } })).toEqual([]);
  });

  it("sem evento de data de fim: fica no fluxo novo, mas sem dia nenhum vai ao DP", () => {
    expect(motivos({ resto: { evento: { startDate: DIAS[0], endDate: null, status: "ativo" }, inclusao: null, presencas: [], confirmacao: { diasConfirmados: [] } } })).toEqual(["dias_diferentes"]);
  });

  it.each([
    "dailyQuantity", "dailyValue", "costAssistance", "weekdayLunch", "weekdayDinner", "weekendLunch", "weekendDinner", "mobility", "transport", "totalValue",
  ] as const)("campo de valor diferente: %s", (campo) => {
    const r = conferirSemDivergencia(entrada({ prestacao: { [campo]: 123_456 } }));
    expect(r.automatica).toBe(false);
    expect(r.motivos).toContain("valor_diferente");
    expect(r.camposDiferentes).toContain(campo);
  });

  it("ida/volta que não fecham (o caso Lucas: total zerado, ida e volta gravadas) divergem", () => {
    const r = conferirSemDivergencia(entrada({
      prestacao: { mobility: 0, mobilityIda: 2_900, mobilityVolta: 2_900 },
      planejado: { mobility: 0, mobilityIda: 0, mobilityVolta: 0 },
    }));
    expect(r.camposDiferentes).toEqual(expect.arrayContaining(["mobilityIda", "mobilityVolta"]));
  });

  const CASOS: [string, MotivoDaConferencia, Parameters<typeof entrada>[0]][] = [
    ["ainda não enviada", "fora_da_analise", { prestacao: { sentForReview: false } }],
    ["já aprovada (idempotente)", "fora_da_analise", { prestacao: { rhStatus: "aprovado" } }],
    ["sem colaborador", "sem_colaborador", { prestacao: { collaboratorId: null }, planejado: { collaboratorId: null } }],
    ["sem plannedId", "sem_planejado", { prestacao: { plannedId: null } }],
    ["Planejado não encontrado", "sem_planejado", { resto: { planejado: null } }],
    ["Planejado sem pré-aprovação", "sem_pre_aprovacao", { planejado: { status: "pendente" } }],
    ["não participou no Realizado", "nao_participou", { prestacao: { didNotAttend: true } }],
    ["não participou no Planejado", "nao_participou", { planejado: { didNotAttend: true } }],
    ["outro colaborador", "outra_vaga", { prestacao: { collaboratorId: "c2" } }],
    ["outra função", "outra_vaga", { prestacao: { functionId: "f2" } }],
    ["outro tipo", "outra_vaga", { prestacao: { collaboratorType: "casa" } }],
    ["outro evento", "outra_vaga", { prestacao: { eventId: "e2" } }],
    ["filho de divisão", "divisao", { prestacao: { splitParentId: "a0" } }],
    ["pai de divisão", "divisao", { resto: { temDivisoes: true } }],
    ["reenviada", "ja_passou_pelo_dp", { prestacao: { resubmitted: true } }],
    ["com decisão anterior do DP", "ja_passou_pelo_dp", { prestacao: { rhActionAt: "2099-10-13T12:00:00Z" } }],
    ["ajustada pelo DP", "ajustada_pelo_dp", { prestacao: { rhAdjusted: true } }],
    ["evento não encontrado", "evento_indisponivel", { resto: { evento: null } }],
    ["evento cancelado", "evento_indisponivel", { resto: { evento: { startDate: DIAS[0], endDate: DIAS[2], status: "cancelado" } } }],
    ["evento legado", "evento_legado", { resto: { evento: { startDate: "2019-01-01", endDate: "2019-01-03", status: "ativo" } } }],
    ["valor zerado nos dois lados", "sem_valor", { prestacao: { totalValue: 0 }, planejado: { totalValue: 0 } }],
    ["um dia a menos", "dias_diferentes", { prestacao: { workedDays: DIAS.slice(0, 2) } }],
    ["um dia a mais", "dias_diferentes", { prestacao: { workedDays: [...DIAS, "2099-10-13"] } }],
    ["½ a mais", "meia_diaria_diferente", { prestacao: { diasMeiaExtra: [DIAS[0]] } }],
    ["½ a menos", "meia_diaria_diferente", { planejado: { diasMeiaExtra: [DIAS[0]] } }],
    ["dobra de turno", "dobra_de_turno", { prestacao: { diasDobra: [DIAS[0]] } }],
    ["falta", "ocorrencia_ativa", { resto: { ocorrencias: [{ tipo: "falta", dia: DIAS[0] }] } }],
    ["substituição", "ocorrencia_ativa", { resto: { ocorrencias: [{ tipo: "substituicao", dia: DIAS[0] }] } }],
    ["horas extras lançadas", "ocorrencia_ativa", { resto: { ocorrencias: [{ tipo: "horas_extras", dia: DIAS[0] }] } }],
    ["diária extra", "ocorrencia_ativa", { resto: { ocorrencias: [{ tipo: "diaria_extra", dia: "2099-10-13" }] } }],
    ["horas extras na prestação", "horas_extras", { prestacao: { horasExtras: "1.50" } }],
    ["valor de horas extras", "horas_extras", { prestacao: { valorHorasExtras: 500 } }],
    ["ajuste do produtor", "ajuste_do_produtor", { prestacao: { ajusteProdutorPct: "5.00" } }],
    ["justificativa escrita no Realizado", "justificativa_para_o_dp", { prestacao: { changeReason: "Saiu mais cedo" } }],
    ["dia sem check-in (enviar antes do evento)", "presenca_incompleta", { resto: { presencas: [] } }],
    ["sem confirmação", "sem_confirmacao", { resto: { confirmacao: null } }],
    ["contestada", "contestada", { resto: { confirmacao: { contestacao: "Faltou um dia", diasConfirmados: DIAS } } }],
    ["confirmou menos dias", "dias_confirmados_diferentes", { resto: { confirmacao: { diasConfirmados: DIAS.slice(0, 2) } } }],
  ];

  it.each(CASOS)("%s → vai ao DP (%s)", (_nome, motivo, mudar) => {
    const r = conferirSemDivergencia(entrada(mudar));
    expect(r.automatica).toBe(false);
    expect(r.motivos).toContain(motivo);
  });

  it("devolve TODOS os motivos, e cada motivo tem rótulo", () => {
    const r = conferirSemDivergencia(entrada({ prestacao: { resubmitted: true, totalValue: 1 }, resto: { temDivisoes: true, confirmacao: null } }));
    expect(r.motivos).toEqual(expect.arrayContaining(["divisao", "ja_passou_pelo_dp", "valor_diferente", "sem_confirmacao"]));
    for (const m of r.motivos) expect(ROTULO_DO_MOTIVO_DA_CONFERENCIA[m]).toBeTruthy();
  });

  it("ocorrência removida não conta (e o dia volta a pedir presença)", () => {
    expect(motivos({ resto: { ocorrencias: [{ tipo: "falta", dia: DIAS[0], removidoEm: "2099-10-13T12:00:00Z" }] } })).toEqual([]);
  });

  it("o motivo escrito pelo check-out final não é justificativa para o DP", () => {
    expect(motivos({ prestacao: { changeReason: "Check-out final da presença por Ana", checkoutFinalEm: "2099-10-13T12:00:00Z" } })).toEqual([]);
  });
});

describe("ehConferenciaAutomatica", () => {
  const auto = { rhStatus: "aprovado", rhComment: CONFERENCIA_AUTOMATICA, rhActionBy: null };

  it("aprovada, com a marca e sem autor", () => {
    expect(ehConferenciaAutomatica(auto)).toBe(true);
  });

  it("o mesmo texto escrito por uma pessoa do DP não é a conferência automática", () => {
    expect(ehConferenciaAutomatica({ ...auto, rhActionBy: "u1" })).toBe(false);
  });

  it("aprovada sem autor e sem a marca (linha antiga) não é", () => {
    expect(ehConferenciaAutomatica({ ...auto, rhComment: null })).toBe(false);
  });

  it("fora de aprovado não é", () => {
    expect(ehConferenciaAutomatica({ ...auto, rhStatus: "pendente" })).toBe(false);
    expect(ehConferenciaAutomatica(null)).toBe(false);
  });
});
