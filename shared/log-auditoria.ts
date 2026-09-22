/**
 * Log de auditoria em português de gente (dono, 18/09: "os logs de auditoria
 * não estão muito claros, revise para deixar 10/10").
 *
 * Antes cada registro dizia "Campos alterados: id, inclusionNumber, eventId,
 * functionId…" — nome técnico, sem antes/depois, com ids no lugar de nomes, e
 * toda edição acusava "createdAt" como alterado. Aqui cada registro vira:
 *   - uma FRASE: "excluiu o evento “Girl Power Brasília - 2026”";
 *   - um CONTEXTO: evento · função · colaborador, quando é uma vaga;
 *   - as MUDANÇAS campo a campo, com rótulo e valor legíveis (antes → depois);
 *   - os DADOS de uma criação, sem os campos técnicos.
 *
 * É lógica pura, lida a partir de previousData/newData — então vale também
 * para os registros antigos, sem migrar nada. O servidor usa os mesmos
 * rótulos para gravar o resumo curto (details).
 */
import { SUGESTAO_STATUS_LABELS, TRANSPORT_MODE_LABELS } from "./scaling-validation-rules";
import { ATENDIMENTO_TIPOS } from "./atendimento";
import { CENO_FREELA_TIPO_LABELS } from "./cenotecnica-empreita";

// ─── Módulos (entity_type) ───────────────────────────────────────────────────

export interface Modulo { rotulo: string; substantivo: string; artigo: "o" | "a" | "os" | "as" }

export const MODULOS: Record<string, Modulo> = {
  team_inclusion: { rotulo: "Vagas (Escala)", substantivo: "vaga", artigo: "a" },
  ticket: { rotulo: "Passagens", substantivo: "passagem", artigo: "a" },
  accommodation: { rotulo: "Hospedagens", substantivo: "hospedagem", artigo: "a" },
  event: { rotulo: "Eventos", substantivo: "evento", artigo: "o" },
  comment: { rotulo: "Comentários de vaga", substantivo: "comentário", artigo: "o" },
  event_comment: { rotulo: "Comentários de evento", substantivo: "comentário no evento", artigo: "o" },
  scaling_change_request: { rotulo: "Pedidos de escala", substantivo: "pedido de escala", artigo: "o" },
  scaling_function_manager: { rotulo: "Responsáveis por função", substantivo: "responsável de função", artigo: "o" },
  swap_request: { rotulo: "Trocas de colaborador", substantivo: "troca de colaborador", artigo: "a" },
  user: { rotulo: "Usuários", substantivo: "usuário", artigo: "o" },
  function: { rotulo: "Funções", substantivo: "função", artigo: "a" },
  collaborator: { rotulo: "Colaboradores", substantivo: "colaborador", artigo: "o" },
  budget_planned: { rotulo: "Planejado", substantivo: "planejado", artigo: "o" },
  budget_actual: { rotulo: "Prestação de contas", substantivo: "prestação de contas", artigo: "a" },
  budget_comparison: { rotulo: "Comparativo", substantivo: "comparativo", artigo: "o" },
  financial: { rotulo: "Financeiro", substantivo: "lançamento financeiro", artigo: "o" },
  baggage_history: { rotulo: "Controle de bagagem", substantivo: "registro de bagagem", artigo: "o" },
  baggage_request: { rotulo: "Pedidos de bagagem", substantivo: "pedido de bagagem", artigo: "o" },
  system_settings: { rotulo: "Configurações", substantivo: "configurações do sistema", artigo: "as" },
};

/** Tipo que ainda não tem nome: nunca mostrar o código (dono, 18/09: "nada em inglês"). */
export const moduloDe = (entityType: string): Modulo =>
  MODULOS[entityType] ?? { rotulo: "Outro registro", substantivo: "registro", artigo: "o" };

// ─── Ações ───────────────────────────────────────────────────────────────────

export type TomDaAcao = "criar" | "alterar" | "excluir" | "aprovar" | "recusar" | "enviar" | "neutro";

export interface Acao { rotulo: string; verbo: string; tom: TomDaAcao }

export const ACOES: Record<string, Acao> = {
  create: { rotulo: "Criação", verbo: "criou", tom: "criar" },
  update: { rotulo: "Alteração", verbo: "alterou", tom: "alterar" },
  delete: { rotulo: "Exclusão", verbo: "excluiu", tom: "excluir" },
  login: { rotulo: "Entrada no sistema", verbo: "entrou no sistema", tom: "neutro" },
  logout: { rotulo: "Saída do sistema", verbo: "saiu do sistema", tom: "neutro" },
  approve: { rotulo: "Aprovação", verbo: "aprovou", tom: "aprovar" },
  reject: { rotulo: "Recusa", verbo: "recusou", tom: "recusar" },
  confirm: { rotulo: "Escalação confirmada", verbo: "confirmou a escalação d", tom: "aprovar" },
  approve_production: { rotulo: "Aprovação do gestor", verbo: "aprovou (gestor da cenotécnica)", tom: "aprovar" },
  reject_production: { rotulo: "Reprovação do gestor", verbo: "reprovou (gestor da cenotécnica)", tom: "recusar" },
  suggestion_sent: { rotulo: "Sugestão enviada", verbo: "enviou para validação", tom: "enviar" },
  suggestion_validated: { rotulo: "Validação da área", verbo: "validou", tom: "aprovar" },
  suggestion_approved: { rotulo: "Sugestão aprovada", verbo: "aprovou a sugestão d", tom: "aprovar" },
  suggestion_returned: { rotulo: "Sugestão devolvida", verbo: "devolveu para ajuste", tom: "recusar" },
  suggestion_bypass_reject: { rotulo: "Sugestão negada", verbo: "negou", tom: "recusar" },
  suggestion_send_canceled: { rotulo: "Envio cancelado", verbo: "cancelou o envio d", tom: "neutro" },
  change_request_approved: { rotulo: "Pedido de escala aprovado", verbo: "aprovou o pedido d", tom: "aprovar" },
  change_request_reajustar: { rotulo: "Pedido devolvido para reajuste", verbo: "devolveu para reajuste o pedido d", tom: "recusar" },
  change_request_negar: { rotulo: "Pedido de escala negado", verbo: "negou o pedido d", tom: "recusar" },
  reajustar: { rotulo: "Devolvido para reajuste", verbo: "devolveu para reajuste", tom: "recusar" },
  negar: { rotulo: "Negado", verbo: "negou", tom: "recusar" },
  send_review: { rotulo: "Envio para o RH", verbo: "enviou para o RH", tom: "enviar" },
  reset_password: { rotulo: "Senha redefinida", verbo: "redefiniu a senha d", tom: "alterar" },
  activate: { rotulo: "Ativação", verbo: "ativou", tom: "aprovar" },
  deactivate: { rotulo: "Desativação", verbo: "desativou", tom: "excluir" },
  emitir: { rotulo: "Passagem emitida", verbo: "marcou como emitida", tom: "aprovar" },
  reactivate: { rotulo: "Reativação", verbo: "reativou", tom: "aprovar" },
  suggestion_rejected: { rotulo: "Sugestão negada", verbo: "negou", tom: "recusar" },
  suggestion_bypass_approve: { rotulo: "Aprovada sem validação da área", verbo: "aprovou direto (sem validação da área)", tom: "aprovar" },
  // Ações do histórico da vaga (team_inclusion_logs) — mesmos nomes, se aparecerem aqui.
  created: { rotulo: "Criação", verbo: "criou", tom: "criar" },
  deleted: { rotulo: "Exclusão", verbo: "excluiu", tom: "excluir" },
  status_changed: { rotulo: "Situação alterada", verbo: "mudou a situação d", tom: "alterar" },
  city_changed: { rotulo: "“Sai de” alterado", verbo: "mudou de onde sai o colaborador d", tom: "alterar" },
  collaborator_changed: { rotulo: "Colaborador trocado", verbo: "trocou o colaborador d", tom: "alterar" },
  daily_rates_changed: { rotulo: "Diárias alteradas", verbo: "mudou as diárias d", tom: "alterar" },
  daily_value_changed: { rotulo: "Valor da diária alterado", verbo: "mudou o valor da diária d", tom: "alterar" },
  dates_changed: { rotulo: "Datas alteradas", verbo: "mudou as datas d", tom: "alterar" },
  travel_dates_changed: { rotulo: "Datas de viagem alteradas", verbo: "mudou as datas de viagem d", tom: "alterar" },
  work_days_changed: { rotulo: "Dias de trabalho alterados", verbo: "mudou os dias de trabalho d", tom: "alterar" },
  observations_changed: { rotulo: "Observações alteradas", verbo: "mudou as observações d", tom: "alterar" },
  note: { rotulo: "Anotação", verbo: "anotou n", tom: "neutro" },
};

/** Ação que ainda não tem nome: nunca mostrar o código (dono, 18/09: "nada em inglês"). */
export const acaoDe = (action: string): Acao =>
  ACOES[action] ?? { rotulo: "Outra ação", verbo: "registrou uma ação n", tom: "neutro" };

// ─── Campos ──────────────────────────────────────────────────────────────────

/** Campos técnicos que não ajudam ninguém a entender o que aconteceu. */
export const CAMPOS_OCULTOS = new Set([
  "id", "createdAt", "updatedAt", "updatedBy", "rowOrder", "userId", "password", "resetToken",
  "resetTokenExpiry", "fileUrl", "splitParentId", "inclusionIds", "itemIds", "resolvedInclusionId",
  "reviewedBy", "requestedBy", "plannedId", "rhAdjustedFields", "teamInclusionId",
]);

export const ROTULO_DO_CAMPO: Record<string, string> = {
  // gerais
  name: "Nome", email: "E-mail", role: "Perfil", status: "Situação", phase: "Etapa",
  previousStatus: "Situação anterior", isActive: "Ativo", mustChangePassword: "Troca de senha obrigatória",
  canApproveCenotecnica: "Aprova cenotécnica", observations: "Observações", content: "Comentário",
  count: "Quantidade", reason: "Motivo", createdBy: "Criado por", before: "Antes", after: "Depois",
  collaborator: "Colaborador", eventName: "Evento", action: "Ação", comment: "Comentário",
  // evento
  eventId: "Evento", location: "Local", startDate: "Início do evento", endDate: "Fim do evento",
  eventNumber: "Nº do evento", paymentCompanyName: "Empresa pagadora", paymentCompanyCnpj: "CNPJ da pagadora",
  // vaga
  functionId: "Função", collaboratorId: "Colaborador", area: "Área", city: "Sai de",
  // endereço do colaborador (22/09)
  addressStreet: "Rua", addressNumber: "Número", addressComplement: "Complemento", addressZip: "CEP",
  inclusionNumber: "Nº da vaga", scheduleStartDate: "Início da escala", scheduleEndDate: "Fim da escala",
  actualStartDate: "Início realizado", actualEndDate: "Fim realizado", workDays: "Dias de trabalho",
  dailyRates: "Diárias", actualDailyRates: "Diárias realizadas", dailyValue: "Valor da diária",
  actualObservations: "Observações do realizado", needsTicket: "Precisa de passagem",
  needsAccommodation: "Precisa de hospedagem", flightDepartureDate: "Ida sugerida",
  flightDepartureSuggestedTime: "Horário sugerido da ida", flightArrivalSuggestedTime: "Chegada sugerida da ida",
  flightReturnDate: "Volta sugerida", flightReturnSuggestedTime: "Horário sugerido da volta",
  emergencyRecord: "Registro emergencial", approvedByProduction: "Aprovada pelo gestor",
  approvedByProductionAt: "Aprovada pelo gestor em", deletedAt: "Excluída em", deletedBy: "Excluída por",
  suggestionSentAt: "Sugestão enviada em", validatedAt: "Validada em", validatedBy: "Validada por",
  empreitaEmpresa: "Empresa da empreita", empreitaPessoas: "Pessoas da empreita", empreitaValor: "Valor da empreita",
  cenoFreelaTipo: "Tipo de freela", atendimentoTipo: "Tipo de atendimento", percurseiroTipo: "Tipo de percurseiro",
  emitsNf: "Emite nota fiscal", transportModeIda: "Transporte da ida", transportModeVolta: "Transporte da volta",
  skipUber: "Sem Uber",
  // passagem
  transportType: "Tipo de transporte", value: "Valor", purchaseDate: "Data da compra",
  purchaseOrderNumber: "LOC / bilhete", locator: "Localizador", ticketCompany: "Companhia",
  ticketStatus: "Situação da passagem", ticketObservations: "Observações da passagem",
  cardLastFourDigits: "Cartão (final)", actualDepartureDate: "Data da ida", actualDepartureTime: "Saída da ida",
  actualArrivalTime: "Chegada da ida", actualReturnDate: "Data da volta", actualReturnTime: "Saída da volta",
  returnArrivalTime: "Chegada da volta", departureAirport: "Aeroporto de saída (ida)",
  destinationAirport: "Aeroporto de chegada (ida)", returnOriginAirport: "Aeroporto de saída (volta)",
  returnDestinationAirport: "Aeroporto de chegada (volta)", departureCityOrigin: "Cidade de saída (ida)",
  departureCityDestination: "Cidade de chegada (ida)", returnCityOrigin: "Cidade de saída (volta)",
  returnCityDestination: "Cidade de chegada (volta)", attachmentIds: "Anexos", emittedAt: "Emitida em",
  emittedBy: "Emitida por", checkIn3: "Conferência", baggageTotalCents: "Valor da bagagem",
  baggageOc: "OC da bagagem", baggageNotes: "Observações da bagagem",
  // pedidos
  requestType: "Tipo de pedido", proposedChanges: "Mudanças pedidas", reviewComment: "Comentário da decisão",
  reviewedByName: "Decidido por", reviewedAt: "Decidido em", requestedByName: "Pedido por",
  // financeiro
  totalValue: "Total", costAssistance: "Ajuda de custo", mobility: "Mobilidade", mobilityIda: "Mobilidade da ida",
  mobilityVolta: "Mobilidade da volta", transport: "Transporte", weekdayLunch: "Almoço (dia útil)",
  weekdayDinner: "Jantar (dia útil)", weekendLunch: "Almoço (fim de semana)", weekendDinner: "Jantar (fim de semana)",
  dailyQuantity: "Qtd. de diárias", collaboratorType: "Tipo de colaborador", didNotAttend: "Não compareceu",
  didNotAttendReason: "Motivo da ausência", workedDays: "Dias trabalhados", rhStatus: "Situação no RH",
  rhComment: "Comentário do RH", rhAdjusted: "Ajustado pelo RH", rhAdjustNote: "Nota do ajuste do RH",
  rhActionAt: "Ação do RH em", rhActionBy: "Ação do RH por", sentForReview: "Enviado ao RH",
  paymentStatus: "Situação do pagamento", approvedBy: "Aprovado por", approvedAt: "Aprovado em",
  changeReason: "Motivo da mudança", resubmitted: "Reenviado", requestsCanceled: "Pedidos cancelados",
  // configurações (Valores Padrão)
  default_daily_value_weekday: "Diária padrão (dia útil)", default_daily_value_weekend: "Diária padrão (fim de semana)",
  default_daily_value_weekday_freela: "Diária padrão do freela (dia útil)",
  default_daily_value_weekend_freela: "Diária padrão do freela (fim de semana)",
  default_mobility: "Mobilidade padrão", default_mobility_ida: "Mobilidade padrão (ida)",
  default_mobility_volta: "Mobilidade padrão (volta)", default_mobility_ida_freela: "Mobilidade padrão do freela (ida)",
  default_mobility_volta_freela: "Mobilidade padrão do freela (volta)",
  default_weekday_lunch: "Almoço padrão (dia útil)", default_weekday_dinner: "Jantar padrão (dia útil)",
  default_weekend_lunch: "Almoço padrão (fim de semana)", default_weekend_dinner: "Jantar padrão (fim de semana)",
  default_weekday_lunch_freela: "Almoço padrão do freela (dia útil)", default_weekday_dinner_freela: "Jantar padrão do freela (dia útil)",
  default_weekend_lunch_freela: "Almoço padrão do freela (fim de semana)", default_weekend_dinner_freela: "Jantar padrão do freela (fim de semana)",
  // prazos das etapas da vaga (dias antes do evento)
  prazo_dias_registro: "Prazo dos registros (dias antes do evento)",
  prazo_dias_validacao: "Prazo da validação (dias antes do evento)",
  prazo_dias_aprovacao: "Prazo da aprovação (dias antes do evento)",
  prazo_dias_escalacao: "Prazo da escalação (dias antes do evento)",
  prazo_dias_escalado: "Prazo do escalado (dias antes do evento)",
  prazo_dias_passagem: "Prazo da passagem emitida (dias antes do evento)",
};

/** Campo que ainda não tem nome: "Outro campo", nunca o código em inglês (18/09). */
export const rotuloDoCampo = (campo: string): string => ROTULO_DO_CAMPO[campo] ?? "Outro campo";

/** Técnico ou interno ("_userId"): fica fora do que se mostra. */
export const campoOculto = (campo: string): boolean => CAMPOS_OCULTOS.has(campo) || campo.startsWith("_");

/** Valores em centavos. */
const CAMPOS_EM_CENTAVOS = new Set([
  "dailyValue", "value", "empreitaValor", "baggageTotalCents", "totalValue", "costAssistance", "mobility",
  "mobilityIda", "mobilityVolta", "transport", "weekdayLunch", "weekdayDinner", "weekendLunch", "weekendDinner",
  "dailyRate",
  "default_daily_value_weekday", "default_daily_value_weekend", "default_daily_value_weekday_freela",
  "default_daily_value_weekend_freela", "default_mobility", "default_mobility_ida", "default_mobility_volta",
  "default_mobility_ida_freela", "default_mobility_volta_freela", "default_weekday_lunch", "default_weekday_dinner",
  "default_weekend_lunch", "default_weekend_dinner", "default_weekday_lunch_freela", "default_weekday_dinner_freela",
  "default_weekend_lunch_freela", "default_weekend_dinner_freela",
]);

/** Campos de código (situação, tipo, perfil…): sem tradução, ao menos sem "_" e com maiúscula. */
const CAMPOS_DE_CODIGO = new Set([
  "status", "previousStatus", "phase", "role", "collaboratorType", "atendimentoTipo", "cenoFreelaTipo",
  "percurseiroTipo", "transportModeIda", "transportModeVolta", "paymentStatus", "rhStatus", "ticketStatus",
  "requestType", "transportType", "action",
]);
const AEROPORTOS = new Set(["departureAirport", "destinationAirport", "returnOriginAirport", "returnDestinationAirport"]);
const CIDADES = new Set(["city", "departureCityOrigin", "departureCityDestination", "returnCityOrigin", "returnCityDestination", "location"]);

/** Campos que guardam o id de outra coisa — viram nome. */
const CAMPOS_DE_EVENTO = new Set(["eventId"]);
const CAMPOS_DE_FUNCAO = new Set(["functionId"]);
const CAMPOS_DE_COLABORADOR = new Set(["collaboratorId"]);
const CAMPOS_DE_USUARIO = new Set([
  "userId", "createdBy", "validatedBy", "deletedBy", "emittedBy", "approvedBy", "rhActionBy", "reviewedBy", "requestedBy",
  "approvedByProduction",
]);

const SITUACOES: Record<string, string> = {
  planejado: "Planejado", "concluído": "Concluído", concluido: "Concluído", "excluído": "Excluído",
  pendente: "Pendente", escalado: "Escalado", escalacao: "Em escalação", aguardando_producao: "Aguardando gestor",
  aguardando_passagem: "Aguardando passagem", aguardando_hospedagem: "Aguardando hospedagem",
  passagem: "Passagem", passagem_comprada: "Passagem comprada", hospedagem: "Hospedagem",
  hospedagem_comprada: "Hospedagem comprada", hospedagem_passagem_comprada: "Passagem e hospedagem compradas",
  aprovacao: "Em aprovação", aprovado: "Aprovado", cancelado: "Cancelado", reaberto: "Reaberto",
  rejeitado: "Recusado", negado: "Negado", comprada: "Comprada", confirmada: "Confirmada", cancelada: "Cancelada",
  reajustado: "Devolvido para reajuste", pending: "Aguardando aprovação", approved: "Aprovado", rejected: "Recusado",
  incluido: "Incluído", reenviado_validacao: "Reenviado para validação", ajustado: "Ajustado",
  ...SUGESTAO_STATUS_LABELS,
};

const VALORES_DO_CAMPO: Record<string, Record<string, string>> = {
  status: SITUACOES,
  previousStatus: SITUACOES,
  ticketStatus: SITUACOES,
  paymentStatus: SITUACOES,
  rhStatus: SITUACOES,
  action: SITUACOES,
  phase: {
    inclusao: "Inclusão", sugestao: "Sugestão de escala", escalacao: "Escalação", passagem: "Passagem",
    hospedagem: "Hospedagem", aprovado: "Aprovada", aprovacao: "Em aprovação", cancelado: "Cancelada",
  },
  role: {
    admin: "Administrador", administrator: "Administrador", administrador: "Administrador", purchasing: "Compras",
    function_area: "Área", production: "Produção", financial: "Financeiro / RH", viewer: "Consulta",
    validador: "Validador", aprovador: "Aprovador",
  },
  // Mesmos nomes das telas (cadastro da vaga).
  atendimentoTipo: Object.fromEntries(ATENDIMENTO_TIPOS.map((t) => [t.value, t.label])),
  transportModeIda: TRANSPORT_MODE_LABELS as Record<string, string>,
  transportModeVolta: TRANSPORT_MODE_LABELS as Record<string, string>,
  collaboratorType: { casa: "Da casa", freela: "Freela", local: "Local" },
  cenoFreelaTipo: { ...(CENO_FREELA_TIPO_LABELS as Record<string, string>) },
  requestType: { inclusao: "Inclusão", exclusao: "Exclusão", ajuste: "Ajuste" },
  transportType: { aereo: "Aéreo", rodoviario: "Rodoviário", van: "Van" },
};

// ─── Formatação de valores ───────────────────────────────────────────────────

/** Como achar o NOME de um id — a tela passa o que tem carregado. */
export interface NomesParaLog {
  evento?: (id: string) => string | undefined;
  funcao?: (id: string) => string | undefined;
  colaborador?: (id: string) => string | undefined;
  usuario?: (id: string) => string | undefined;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).replace(",", " às");
}

const reais = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatarValor(campo: string, valor: unknown, nomes: NomesParaLog = {}): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number" && CAMPOS_EM_CENTAVOS.has(campo)) return reais(valor);
  if (typeof valor === "string") {
    const id = valor;
    if (CAMPOS_DE_EVENTO.has(campo)) return nomes.evento?.(id) ?? "evento não encontrado";
    if (CAMPOS_DE_FUNCAO.has(campo)) return nomes.funcao?.(id) ?? "função não encontrada";
    if (CAMPOS_DE_COLABORADOR.has(campo)) return nomes.colaborador?.(id) ?? "colaborador não encontrado";
    if (CAMPOS_DE_USUARIO.has(campo)) return nomes.usuario?.(id) ?? "usuário não encontrado";
    const traduzido = VALORES_DO_CAMPO[campo]?.[valor];
    if (traduzido) return traduzido;
    if (DATA.test(valor)) return `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}`;
    if (DATA_HORA.test(valor)) return dataHoraBr(valor);
    if (AEROPORTOS.has(campo)) return valor.toUpperCase();
    if (CIDADES.has(campo) && valor === valor.toLowerCase()) return valor.replace(/(^|\s)\S/g, (l) => l.toUpperCase());
    // Código sem tradução ("reenviado_validacao"): nunca cru.
    if (CAMPOS_DE_CODIGO.has(campo) && /^[a-z_]+$/.test(valor)) {
      const s = valor.replace(/_/g, " ");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return valor;
  }
  if (Array.isArray(valor)) {
    if (valor.length === 0) return "nenhum";
    if (campo === "attachmentIds") return `${valor.length} ${valor.length === 1 ? "arquivo" : "arquivos"}`;
    if (valor.every((v) => typeof v === "string" && v.length <= 40)) return valor.join(", ");
    return `${valor.length} ${valor.length === 1 ? "item" : "itens"}`;
  }
  if (typeof valor === "object") {
    const partes = Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => !campoOculto(k))
      .map(([k, v]) => `${rotuloDoCampo(k)}: ${formatarValor(k, v, nomes)}`);
    return partes.length ? partes.join("; ") : "—";
  }
  return String(valor);
}

// ─── O registro descrito ─────────────────────────────────────────────────────

export interface RegistroDeLog {
  action: string;
  entityType: string;
  entityName?: string | null;
  previousData?: string | null;
  newData?: string | null;
}

export interface MudancaDeCampo { campo: string; antes: string; depois: string }
export interface DadoDeCampo { campo: string; valor: string }

export interface LogDescrito {
  /** Rótulo curto da ação ("Exclusão"). */
  acao: string;
  tom: TomDaAcao;
  /** Rótulo do módulo ("Eventos"). */
  modulo: string;
  /** O que foi feito, sem o nome de quem fez: "excluiu o evento “X”". */
  frase: string;
  /** Evento · função · colaborador, quando ajuda a situar. */
  contexto: string[];
  mudancas: MudancaDeCampo[];
  /** Dados de uma criação (ou do que foi removido), sem os técnicos. */
  dados: DadoDeCampo[];
  /** Uma linha: "Situação: Planejado → Excluído · +2 campos". */
  resumo: string;
}

function lerJson(texto: string | null | undefined): Record<string, unknown> | null {
  if (!texto) return null;
  try {
    const v = JSON.parse(texto);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const temConteudo = (o: Record<string, unknown> | null): o is Record<string, unknown> => !!o && Object.keys(o).length > 0;

/** "Inclusão #undefined", "event_comment", "N/A": nome gravado que não serve. */
const nomeQuebrado = (nome: string | null | undefined, entityType: string) =>
  !nome || /undefined|^N\/A$/i.test(nome) || nome === entityType
  // "Prestação #44c70432", "Passagem #14917bcf": pedaço de código, não nome.
  || /#[0-9a-f]{6,}$/i.test(nome);

export function descreverLog(log: RegistroDeLog, nomes: NomesParaLog = {}): LogDescrito {
  const antes = lerJson(log.previousData);
  const depois = lerJson(log.newData);
  const dado = { ...(antes ?? {}), ...(depois ?? {}) } as Record<string, any>;
  const modulo = moduloDe(log.entityType);
  let acao = acaoDe(log.action);

  // Mudanças campo a campo (só com antes E depois).
  const mudancas: MudancaDeCampo[] = [];
  if (temConteudo(antes) && temConteudo(depois)) {
    const campos = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]));
    for (const campo of campos) {
      if (campoOculto(campo)) continue;
      const a = formatarValor(campo, antes[campo], nomes);
      const d = formatarValor(campo, depois[campo], nomes);
      if (a !== d) mudancas.push({ campo: rotuloDoCampo(campo), antes: a, depois: d });
    }
  }

  // Dados de criação (ou do que foi removido).
  const fonte = !temConteudo(antes) ? depois : !temConteudo(depois) ? antes : null;
  const dados: DadoDeCampo[] = temConteudo(fonte)
    ? Object.entries(fonte)
      .filter(([k, v]) => !campoOculto(k) && v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => ({ campo: rotuloDoCampo(k), valor: formatarValor(k, v, nomes) }))
    : [];

  // Verbos que a ação genérica esconde.
  if (log.action === "update" && log.entityType === "event" && antes?.status !== depois?.status) {
    if (depois?.status === "excluído") acao = { rotulo: "Exclusão", verbo: "excluiu", tom: "excluir" };
    else if (antes?.status === "excluído") acao = { rotulo: "Reativação", verbo: "reativou", tom: "aprovar" };
  }
  if (log.action === "update" && log.entityType === "team_inclusion" && depois?.deletedAt && !antes?.deletedAt) {
    acao = { rotulo: "Exclusão", verbo: "excluiu", tom: "excluir" };
  }

  // O nome do alvo.
  const nomeGravado = log.entityName ?? "";
  const evento = typeof dado.eventId === "string" ? nomes.evento?.(dado.eventId) : undefined;
  const funcao = typeof dado.functionId === "string" ? nomes.funcao?.(dado.functionId) : undefined;
  const colaborador = typeof dado.collaboratorId === "string" ? nomes.colaborador?.(dado.collaboratorId) : undefined;

  let alvo: string;
  if (log.entityType === "team_inclusion") {
    const numero = dado.inclusionNumber ?? nomeGravado.match(/#(\d+)/)?.[1];
    alvo = numero ? `a vaga #${numero}` : "uma vaga";
  } else if (log.entityType === "event_comment") {
    alvo = `o evento “${dado.eventName ?? evento ?? "?"}”`;
  } else if (log.entityType === "comment") {
    alvo = "uma vaga";
  } else if (log.entityType === "scaling_function_manager") {
    const quem = typeof dado.userId === "string" ? nomes.usuario?.(dado.userId) : undefined;
    const papel = dado.role === "aprovador" ? "aprovador" : "validador";
    alvo = `${quem ?? "um usuário"} como ${papel} da função “${funcao ?? "?"}”`;
  } else if (log.entityType === "scaling_change_request") {
    const tipo = VALORES_DO_CAMPO.requestType[String(dado.requestType ?? "")]?.toLowerCase() ?? "ajuste";
    alvo = `o pedido de ${tipo}${evento ? ` no evento “${evento}”` : ""}`;
  } else if (log.entityType === "ticket") {
    const loc = dado.purchaseOrderNumber ?? (nomeQuebrado(nomeGravado, log.entityType) || /^Passagem\b/i.test(nomeGravado) ? null : nomeGravado);
    alvo = loc ? `a passagem LOC ${loc}` : "a passagem";
  } else if (log.entityType === "system_settings") {
    alvo = "as configurações do sistema";
  } else {
    const nome = nomeQuebrado(nomeGravado, log.entityType)
      ? (dado.name ?? dado.fullName ?? dado.collaboratorName ?? colaborador ?? null)
      : nomeGravado;
    alvo = `${modulo.artigo} ${modulo.substantivo}${nome ? ` “${nome}”` : ""}`;
  }

  // A frase.
  let frase: string;
  if (log.action === "login" || log.action === "logout") {
    frase = acao.verbo;
  } else if (log.entityType === "event_comment" && log.action === "create") {
    frase = `comentou n${alvo.slice(0, 1) === "o" ? "o" : "a"}${alvo.slice(1)}`;
  } else if (log.entityType === "comment" && log.action === "create") {
    frase = "comentou em uma vaga";
  } else if (log.entityType === "scaling_function_manager" && log.action === "create") {
    frase = `cadastrou ${alvo}`;
  } else if (log.action === "suggestion_sent") {
    const n = Number(dado.count ?? 0);
    const ev = dado.eventName ?? evento;
    frase = `enviou ${n > 0 ? `${n} ${n === 1 ? "vaga" : "vagas"}` : "vagas"} para a Validação de Escala${ev ? ` — evento “${ev}”` : ""}`;
  } else if (acao.verbo.endsWith(" d") || acao.verbo.endsWith(" n")) {
    // Contração: "aprovou a sugestão d" + "a vaga #1" → "da vaga #1";
    // "anotou n" + "a vaga" → "na vaga". Com "uma vaga": "de uma" / "em uma".
    const prep = acao.verbo.endsWith(" d") ? "de" : "em";
    frase = alvo.startsWith("um") ? `${acao.verbo.slice(0, -1)}${prep} ${alvo}` : `${acao.verbo}${alvo}`;
  } else {
    frase = `${acao.verbo} ${alvo}`;
  }

  const comContexto = ["team_inclusion", "scaling_change_request", "budget_planned", "budget_actual", "budget_comparison"];
  // Sem repetir o que a frase já diz (ex.: o evento de "enviou 16 vagas — evento X").
  const contexto = comContexto.includes(log.entityType)
    ? [evento, funcao, colaborador].filter((x): x is string => !!x && !frase.includes(x))
    : [];

  const resumo = mudancas.length > 0
    ? mudancas.slice(0, 2).map((m) => `${m.campo}: ${m.antes} → ${m.depois}`).join(" · ")
      + (mudancas.length > 2 ? ` · +${mudancas.length - 2} ${mudancas.length - 2 === 1 ? "campo" : "campos"}` : "")
    : dados.length > 0 && log.action === "create"
      ? `${dados.length} ${dados.length === 1 ? "campo preenchido" : "campos preenchidos"}`
      : "";

  return { acao: acao.rotulo, tom: acao.tom, modulo: modulo.rotulo, frase, contexto, mudancas, dados, resumo };
}

/** Resumo curto que o SERVIDOR grava em details: "Alterou: Situação, Datas". */
export function resumoParaGravar(action: string, camposAlterados: string[]): string {
  const visiveis = Array.from(new Set(camposAlterados.filter((c) => !campoOculto(c)).map(rotuloDoCampo)));
  if (action === "create") return "Registro criado";
  if (visiveis.length === 0) return `${acaoDe(action).rotulo}`;
  return `Alterou: ${visiveis.join(", ")}`;
}

