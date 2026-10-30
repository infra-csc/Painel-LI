/**
 * Honorários da cenotécnica (dono, 16/10) — regras puras, usadas pelo servidor
 * e pelas telas.
 *
 * "O pessoal de cenotécnica entra, coloca um valor que negociou e manda para a
 * aprovação, que é o mesmo aprovador de escala. Mas temos que deixar isso em
 * outra aba, pois é financeiro. Depois o Financeiro tem que ter relatórios,
 * principalmente total por evento, e colocar quando liberar a verba."
 *
 * É um módulo À PARTE da escala: NADA aqui grava status de vaga, o
 * Planejado/Realizado ou qualquer cálculo existente. As tabelas são próprias
 * (honorarios_ceno, _historico, _liberacoes — ver shared/schema.ts).
 *
 * 21/10 (dono: "a aprovação do honorário tem que afetar o planejado"): o
 * Planejado passa a LER os pedidos do evento. Vaga com honorário aprovado tem
 * a mão de obra (subtotal de diárias) = o valor aprovado, no lugar da tabela
 * ou da diária; a empreita aprovada é rateada entre as vagas dela. Antes da
 * aprovação o Planejado só mostra o selo do pedido. Regra em
 * `honorariosNasVagas` / `valorDoHonorarioNaVaga` (fim deste arquivo),
 * aplicada por shared/budget-engine.ts. Continua só leitura: o honorário não
 * grava nada no Planejado; o valor entra no cálculo da tela e no "Atualizar
 * padrões".
 *
 * Linhas do pedido:
 *  - VAGA: cada vaga ATIVA de cenotécnica (inclui Sup Ceno) — escalada com
 *    freela (local ou viagem) OU ainda aberta, sem colaborador (dono, 20/10:
 *    "não precisa escalar"). Casa (funcionário) e vaga cancelada não entram.
 *    O valor é o da TABELA do tipo de freela (Viagem, SP, Local A, Local B —
 *    shared/cenotecnica-empreita.ts) ou "Outro valor", negociado à parte
 *    (dono, 20/10: "ele só coloca qual tipo de freela ou um valor à parte").
 *  - EMPREITA: equipe com valor fechado — responsável, nº de pessoas e, desde
 *    20/10, as VAGAS do evento que fazem parte dela (uma vaga em uma empreita
 *    só; nela, a vaga não tem pedido próprio). Pode não ter vaga nenhuma
 *    (equipe terceirizada que não está na escala).
 *
 * Fluxo (estados do pedido):
 *   rascunho ──enviar──▶ aguardando ──aprovar──────────▶ aprovado ─┐
 *       ▲                    │      ──aprovar c/ ajuste─▶ aprovado_ajuste ─┤──liberações──▶ parcial / liberada
 *       │                    └──devolver──▶ devolvido ──editar/enviar──▶ aguardando
 *       └─────────── (aprovado sem liberação também pode ser devolvido) ┘
 * A situação da VERBA (a liberar / parcial / liberada) é derivada da soma das
 * liberações — não é um status gravado.
 *
 * Dinheiro sempre em CENTAVOS inteiros.
 */
import { ehSupervisorDeCenotecnica, normalizarNomeDeFuncao } from "./cenotecnica";
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, isCenoFreelaTipo, type CenoFreelaTipo } from "./cenotecnica-empreita";
import { ACTIVE_CONFLICT_STATUSES, STATUS_QUE_PODEM_CONFIRMAR } from "./vaga-status";

// ── Domínios ────────────────────────────────────────────────────────────────

export const HONORARIO_STATUS = ["rascunho", "aguardando", "aprovado", "aprovado_ajuste", "devolvido"] as const;
export type HonorarioStatus = (typeof HONORARIO_STATUS)[number];

export const HONORARIO_STATUS_LABEL: Record<HonorarioStatus, string> = {
  rascunho: "Rascunho",
  aguardando: "Aguardando aprovação",
  aprovado: "Aprovado",
  aprovado_ajuste: "Aprovado c/ ajuste",
  devolvido: "Devolvido para negociar",
};

export const HONORARIO_TIPOS = ["vaga", "empreita"] as const;
export type HonorarioTipo = (typeof HONORARIO_TIPOS)[number];

/** Setor da planilha (SUP CENO, MARCENEIRO, MONTAGEM). Não é a função do app. */
export const SETORES_CENO = ["sup_ceno", "marceneiro", "montagem"] as const;
export type SetorCeno = (typeof SETORES_CENO)[number];
export const SETOR_CENO_LABEL: Record<SetorCeno, string> = {
  sup_ceno: "Sup Ceno",
  marceneiro: "Marceneiro",
  montagem: "Montagem",
};

/** Posição da planilha. CASA não entra (funcionário não recebe honorário). */
export const POSICOES_CENO = ["freela_local", "freela_viagem", "empreita"] as const;
export type PosicaoCeno = (typeof POSICOES_CENO)[number];
export const POSICAO_CENO_LABEL: Record<PosicaoCeno, string> = {
  freela_local: "Freela local",
  freela_viagem: "Freela viagem",
  empreita: "Empreita",
};

/**
 * De onde vem o valor de um pedido de VAGA (20/10): um dos 4 tipos de freela
 * da tabela fechada ou "Outro valor" (negociado à parte — "nem sempre é o
 * valor de freela": vale tanto quanto o da tabela, não é exceção).
 */
export const TIPOS_DO_VALOR = [...CENO_FREELA_TIPOS, "outro"] as const;
export type TipoDoValor = CenoFreelaTipo | "outro";
export const TIPO_DO_VALOR_LABEL: Record<TipoDoValor, string> = { ...CENO_FREELA_TIPO_LABELS, outro: "Outro valor" };
export const ehTipoDoValor = (v: unknown): v is TipoDoValor => v === "outro" || isCenoFreelaTipo(v);
/** O valor sai da tabela (não se digita). */
export const ehTipoDeTabela = (v: unknown): v is CenoFreelaTipo => isCenoFreelaTipo(v);

/**
 * Posição que o tipo implica: Freela Viagem → viagem; SP e Local A/B → local.
 * "Outro valor" não diz nada (null — quem chama usa a sugestão da vaga).
 */
export function posicaoDoTipo(t: string | null | undefined): PosicaoCeno | null {
  if (t === "viagem") return "freela_viagem";
  if (t === "sp" || t === "local_a" || t === "local_b") return "freela_local";
  return null;
}

/**
 * Como o aprovador e o Financeiro leem a origem do valor, numa linha:
 * "Freela Local (A) · tabela", "Outro valor · <observação>", "Empreita · 3
 * vagas". Pedido antigo (sem tipo) cai no setor · posição de antes.
 */
export function rotuloDoValor(h: { tipo: string; tipoFreela?: string | null; observacao?: string | null; setor?: string | null; posicao?: string | null; vagasDaEmpreita?: readonly unknown[] | null; pessoas?: number | null }): string {
  if (h.tipo === "empreita") {
    const n = h.vagasDaEmpreita?.length ?? 0;
    return `Valor fechado da equipe${n ? ` · ${n} ${n === 1 ? "vaga" : "vagas"} da escala` : " · sem vaga na escala"}`;
  }
  if (ehTipoDeTabela(h.tipoFreela)) return `${CENO_FREELA_TIPO_LABELS[h.tipoFreela]} · tabela`;
  if (h.tipoFreela === "outro") {
    const obs = (h.observacao ?? "").trim();
    return `Outro valor${obs ? ` · ${obs}` : ""}`;
  }
  const setor = ehSetorCeno(h.setor) ? SETOR_CENO_LABEL[h.setor] : "Sem setor";
  const posicao = ehPosicaoCeno(h.posicao) ? POSICAO_CENO_LABEL[h.posicao] : "Sem posição";
  return `${setor} · ${posicao}`;
}

/**
 * Status de vaga ATIVA para os honorários (20/10): as escaladas (confirmadas,
 * com os legados) e as só salvas/abertas (planejado, reaberto, escalacao…).
 * Fora: cancelado e a etapa de sugestão (Validação de escala).
 */
export const STATUS_DE_VAGA_ATIVA: readonly string[] = Array.from(new Set([...ACTIVE_CONFLICT_STATUSES, ...STATUS_QUE_PODEM_CONFIRMAR]));

/** Nome da linha de uma vaga ainda sem colaborador: "Vaga #5063 sem nome · Cenotécnica local". */
export function nomeDaVagaSemColaborador(numero: number | null | undefined, funcao: string | null | undefined): string {
  return `Vaga${numero != null ? ` #${numero}` : ""} sem nome${funcao ? ` · ${funcao}` : ""}`;
}

export const ehStatusDeHonorario = (v: unknown): v is HonorarioStatus =>
  typeof v === "string" && (HONORARIO_STATUS as readonly string[]).includes(v);
export const ehSetorCeno = (v: unknown): v is SetorCeno =>
  typeof v === "string" && (SETORES_CENO as readonly string[]).includes(v);
export const ehPosicaoCeno = (v: unknown): v is PosicaoCeno =>
  typeof v === "string" && (POSICOES_CENO as readonly string[]).includes(v);

// ── Limites ─────────────────────────────────────────────────────────────────

/** Teto de sanidade por linha: R$ 1.000.000,00 (a maior empreita da planilha é ~R$ 20 mil). */
export const HONORARIO_VALOR_MAX = 100_000_000;
export const HONORARIO_DIARIAS_MAX = 120;
export const HONORARIO_PESSOAS_MAX = 500;
export const HONORARIO_NOME_MAX = 120;
export const HONORARIO_TEXTO_MAX = 500;
export const HONORARIO_MOTIVO_MIN = 3;
export const HONORARIO_OC_MAX = 40;
/** Itens por lote (enviar, aprovar, devolver). */
export const HONORARIO_LOTE_MAX = 200;

// ── Estados: o que cada etapa permite ───────────────────────────────────────

/** Quem pediu ainda pode mexer (antes de enviar, ou depois de devolvido). */
export function podeEditarHonorario(status: string): boolean {
  return status === "rascunho" || status === "devolvido";
}

/** Só rascunho que nunca foi enviado sai da lista (o devolvido tem histórico). */
export function podeRemoverHonorario(status: string, enviadoEm: unknown): boolean {
  return status === "rascunho" && !enviadoEm;
}

export function ehAprovado(status: string): boolean {
  return status === "aprovado" || status === "aprovado_ajuste";
}

/** O aprovador decide só o que está aguardando. */
export function podeDecidirHonorario(status: string): boolean {
  return status === "aguardando";
}

/**
 * Devolver para negociar: o que está aguardando e também o aprovado que ainda
 * não teve verba liberada ("pedido aprovado não se edita; para mudar, o
 * aprovador devolve"). Com verba liberada, a devolução desfaria dinheiro pago.
 */
export function podeDevolverHonorario(status: string, liberadoCents: number): boolean {
  if (status === "aguardando") return true;
  return ehAprovado(status) && liberadoCents <= 0;
}

/** O Financeiro libera verba só do que foi aprovado. */
export function podeLiberarHonorario(status: string): boolean {
  return ehAprovado(status);
}

// ── Situação da verba ───────────────────────────────────────────────────────

export type SituacaoDaVerba = "sem_aprovacao" | "a_liberar" | "parcial" | "liberada";
export const SITUACAO_DA_VERBA_LABEL: Record<SituacaoDaVerba, string> = {
  sem_aprovacao: "Sem aprovação",
  a_liberar: "A liberar",
  parcial: "Liberada parcial",
  liberada: "Liberada",
};

export function situacaoDaVerba(status: string, aprovadoCents: number | null | undefined, liberadoCents: number): SituacaoDaVerba {
  if (!ehAprovado(status) || aprovadoCents == null) return "sem_aprovacao";
  if (liberadoCents <= 0) return "a_liberar";
  if (liberadoCents >= aprovadoCents) return "liberada";
  return "parcial";
}

/** Quanto ainda falta liberar (nunca negativo). */
export function faltaLiberar(aprovadoCents: number | null | undefined, liberadoCents: number): number {
  if (aprovadoCents == null) return 0;
  return Math.max(0, aprovadoCents - liberadoCents);
}

/**
 * Etapa única para listas e filtros — junta o status do pedido com a situação
 * da verba: rascunho · aguardando · devolvido · a_liberar · parcial · liberada.
 */
export type EtapaDoHonorario = "rascunho" | "aguardando" | "devolvido" | "a_liberar" | "parcial" | "liberada";
export const ETAPA_LABEL: Record<EtapaDoHonorario, string> = {
  rascunho: "Rascunho",
  aguardando: "Aguardando aprovação",
  devolvido: "Devolvido para negociar",
  a_liberar: "Aprovado · a liberar",
  parcial: "Liberado parcial",
  liberada: "Liberado",
};

export function etapaDoHonorario(h: { status: string; valorAprovado: number | null; liberado: number }): EtapaDoHonorario {
  if (h.status === "rascunho") return "rascunho";
  if (h.status === "aguardando") return "aguardando";
  if (h.status === "devolvido") return "devolvido";
  const s = situacaoDaVerba(h.status, h.valorAprovado, h.liberado);
  return s === "sem_aprovacao" ? "a_liberar" : s;
}

// ── Cálculos ────────────────────────────────────────────────────────────────

/** "cálculo unit aproximado (diária)" da planilha: valor ÷ diárias, em centavos. */
export function valorPorDiaria(valorCents: number | null | undefined, diarias: number | null | undefined): number | null {
  if (valorCents == null || !diarias || diarias <= 0) return null;
  return Math.round(valorCents / diarias);
}

/** O valor que vale para a linha: o aprovado quando existe, senão o pedido. */
export function valorVigente(h: { valorPedido: number; valorAprovado: number | null }): number {
  return h.valorAprovado ?? h.valorPedido;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
export function ehDataIso(v: unknown): v is string {
  if (typeof v !== "string" || !RE_DATA.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Dias corridos do período, contando os dois extremos (null se inválido). */
export function diasDoPeriodo(inicio: string | null | undefined, fim: string | null | undefined): number | null {
  if (!ehDataIso(inicio) || !ehDataIso(fim)) return null;
  const dias = Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1;
  return dias > 0 ? dias : null;
}

// ── Sugestões a partir da vaga (o pedido pode mudar tudo) ───────────────────

/** Posição pelo NOME da função ("Cenotécnica Local" → local; "… Viagem" → viagem); null se não diz. */
export function posicaoPelaFuncao(nomeDaFuncao: string | null | undefined): PosicaoCeno | null {
  const n = ` ${normalizarNomeDeFuncao(nomeDaFuncao).replace(/[^a-z0-9]+/g, " ")} `;
  if (n.includes(" viagem ")) return "freela_viagem";
  if (n.includes(" local ")) return "freela_local";
  return null;
}

/**
 * Posição sugerida para a vaga. Ordem de confiança:
 *  1. empreita por empresa na vaga → empreita;
 *  2. modalidade de freela escolhida na Escalação (`ceno_freela_tipo`):
 *     viagem → freela viagem; SP / Local A / Local B → freela local;
 *  3. vaga ABERTA (sem colaborador, 20/10): pelo nome da função, se ele
 *     disser ("cenotécnica local" → local); senão null — quem pede escolhe;
 *  4. colaborador "local" → freela local;
 *  5. vaga que precisa de passagem → freela viagem; senão freela local.
 * Casa devolve null (não entra no honorário).
 */
export function posicaoSugerida(v: {
  collaboratorId?: string | null;
  collaboratorType?: string | null;
  cenoFreelaTipo?: string | null;
  needsTicket?: boolean | null;
  empreitaEmpresa?: string | null;
  functionName?: string | null;
}): PosicaoCeno | null {
  if (v.empreitaEmpresa && v.empreitaEmpresa.trim()) return "empreita";
  if (v.collaboratorType === "casa") return null;
  const peloTipo = posicaoDoTipo(v.cenoFreelaTipo);
  if (peloTipo) return peloTipo;
  if (v.collaboratorId === null) return posicaoPelaFuncao(v.functionName);
  if (v.collaboratorType === "local") return "freela_local";
  return v.needsTicket ? "freela_viagem" : "freela_local";
}

/**
 * A vaga entra no honorário? Casa (funcionário) fica de fora. Vaga ABERTA,
 * sem colaborador, entra (dono, 20/10: "não precisa escalar").
 */
export function vagaRecebeHonorario(v: { collaboratorType?: string | null; empreitaEmpresa?: string | null; collaboratorId?: string | null }): boolean {
  if (v.empreitaEmpresa && v.empreitaEmpresa.trim()) return true;
  if (!v.collaboratorId) return true;
  return v.collaboratorType !== "casa";
}

/** A vaga ainda não tem ninguém (nem colaborador, nem empreita por empresa). */
export function vagaSemColaborador(v: { collaboratorId?: string | null; empreitaEmpresa?: string | null }): boolean {
  return !v.collaboratorId && !(v.empreitaEmpresa && v.empreitaEmpresa.trim());
}

// ── A vaga mudou depois do pedido ───────────────────────────────────────────

/**
 * O pedido de VAGA guarda um retrato (colaborador, nome, função). Se a escala
 * muda depois — troca de colaborador, cancelamento, exclusão, a vaga passa
 * para outra função ou para um funcionário da casa — o pedido não pode seguir
 * calado: quem pede não envia, e quem aprova/libera vê o aviso.
 *  - colaborador_trocado: a vaga continua valendo, com OUTRA pessoa (quem pede
 *    confirma e o pedido passa a ser dela) — ou ficou sem ninguém de novo;
 *  - os demais: a vaga saiu dos honorários (nada a enviar ou editar).
 *
 * Vaga ABERTA que ganha um freela depois do pedido (20/10) NÃO é troca: o
 * pedido era da vaga, não de uma pessoa. O storage grava o nome no pedido na
 * próxima leitura (storage/honorarios-ceno.ts · adotarColaboradorDaVaga) e
 * aqui não há aviso. Se a vaga ganha um funcionário da casa, vale "casa".
 */
export type AvisoDaVaga = "excluida" | "fora_da_escala" | "outra_funcao" | "casa" | "colaborador_trocado";

export const AVISO_DA_VAGA_LABEL: Record<AvisoDaVaga, string> = {
  excluida: "A vaga foi excluída da escala",
  fora_da_escala: "A vaga foi cancelada na escala",
  outra_funcao: "A vaga saiu da cenotécnica",
  casa: "A vaga passou para um funcionário da casa",
  colaborador_trocado: "A vaga trocou de colaborador",
};

/** Retrato atual da vaga, como as rotas leem (null = a vaga não existe mais). */
export interface VagaAtual {
  deletedAt: unknown;
  status: string | null;
  phase: string | null;
  functionId: string | null;
  collaboratorId: string | null;
  collaboratorType: string | null;
  empreitaEmpresa: string | null;
}

export function avisoDaVaga(
  h: { tipo: string; functionId: string | null; collaboratorId: string | null },
  vaga: VagaAtual | null,
  statusEscalados: readonly string[],
): AvisoDaVaga | null {
  if (h.tipo !== "vaga") return null;
  if (!vaga || vaga.deletedAt) return "excluida";
  if (!vaga.status || !statusEscalados.includes(vaga.status) || vaga.phase === "sugestao") return "fora_da_escala";
  if (h.functionId && vaga.functionId !== h.functionId) return "outra_funcao";
  if (!vagaRecebeHonorario(vaga)) return "casa";
  // Pedido feito na vaga aberta e a vaga ganhou um freela: o pedido acompanha (não é troca).
  if (!h.collaboratorId && vaga.collaboratorId) return null;
  if ((vaga.collaboratorId ?? null) !== (h.collaboratorId ?? null)) return "colaborador_trocado";
  return null;
}

/**
 * Aviso de uma vaga DENTRO de uma empreita (20/10). Na empreita a pessoa da
 * vaga pode mudar à vontade (o valor é da equipe); o que importa é a vaga
 * continuar ativa, de cenotécnica e não ser de funcionário da casa.
 */
export function avisoDaVagaNaEmpreita(
  vaga: VagaAtual | null,
  statusAtivos: readonly string[],
  funcaoEhDeCenotecnica: boolean,
): Exclude<AvisoDaVaga, "colaborador_trocado"> | null {
  if (!vaga || vaga.deletedAt) return "excluida";
  if (!vaga.status || !statusAtivos.includes(vaga.status) || vaga.phase === "sugestao") return "fora_da_escala";
  if (!funcaoEhDeCenotecnica) return "outra_funcao";
  if (!vagaRecebeHonorario(vaga)) return "casa";
  return null;
}

/** Rótulo curto do aviso de uma vaga da empreita ("#5063 cancelada"). */
export const AVISO_NA_EMPREITA_LABEL: Record<Exclude<AvisoDaVaga, "colaborador_trocado">, string> = {
  excluida: "excluída da escala",
  fora_da_escala: "cancelada na escala",
  outra_funcao: "saiu da cenotécnica",
  casa: "passou para um funcionário da casa",
};

/** A vaga saiu dos honorários (o pedido fica parado: não se edita nem se envia). */
export const vagaSaiuDosHonorarios = (a: AvisoDaVaga | null | undefined) => !!a && a !== "colaborador_trocado";

/** Setor sugerido pelo nome da função ("Sup Ceno" → Sup Ceno; "Marcenaria" → Marceneiro). */
export function setorSugerido(nomeDaFuncao: string | null | undefined): SetorCeno | null {
  if (ehSupervisorDeCenotecnica(nomeDaFuncao)) return "sup_ceno";
  const n = normalizarNomeDeFuncao(nomeDaFuncao);
  if (n.includes("marcen")) return "marceneiro";
  if (n.includes("montag")) return "montagem";
  return null;
}

// ── Validação (mensagens em pt-BR; null = ok) ───────────────────────────────

export interface DadosDoPedido {
  tipo: HonorarioTipo;
  nome?: string | null;
  pessoas?: number | null;
  descricao?: string | null;
  setor?: string | null;
  posicao?: string | null;
  inicio?: string | null;
  fim?: string | null;
  diarias?: number | null;
  valorPedido?: number | null;
  observacao?: string | null;
  tipoFreela?: string | null;
}

/** Validação do que se GRAVA (rascunho aceita campos em branco; o envio exige tudo). */
export function validarDadosDoPedido(d: DadosDoPedido): string | null {
  if (d.tipo === "empreita") {
    const nome = (d.nome ?? "").trim();
    if (nome.length < 2) return "Informe o responsável pela empreita.";
    if (nome.length > HONORARIO_NOME_MAX) return `Nome muito longo (até ${HONORARIO_NOME_MAX} caracteres).`;
    if (d.pessoas != null && (!Number.isInteger(d.pessoas) || d.pessoas < 1 || d.pessoas > HONORARIO_PESSOAS_MAX)) {
      return `Número de pessoas entre 1 e ${HONORARIO_PESSOAS_MAX}.`;
    }
  }
  if (d.tipoFreela != null && d.tipoFreela !== "" && (d.tipo === "empreita" || !ehTipoDoValor(d.tipoFreela))) return "Tipo de freela inválido.";
  if (d.setor != null && d.setor !== "" && !ehSetorCeno(d.setor)) return "Setor inválido.";
  if (d.posicao != null && d.posicao !== "" && !ehPosicaoCeno(d.posicao)) return "Posição inválida.";
  if (d.inicio != null && d.inicio !== "" && !ehDataIso(d.inicio)) return "Data de início inválida.";
  if (d.fim != null && d.fim !== "" && !ehDataIso(d.fim)) return "Data final inválida.";
  if (ehDataIso(d.inicio) && ehDataIso(d.fim) && d.fim < d.inicio) return "O fim da montagem é antes do início.";
  if (d.diarias != null && (!Number.isInteger(d.diarias) || d.diarias < 1 || d.diarias > HONORARIO_DIARIAS_MAX)) {
    return `Diárias entre 1 e ${HONORARIO_DIARIAS_MAX}.`;
  }
  if (d.valorPedido != null && (!Number.isInteger(d.valorPedido) || d.valorPedido < 0 || d.valorPedido > HONORARIO_VALOR_MAX)) {
    return "Valor inválido.";
  }
  if ((d.descricao ?? "").length > HONORARIO_TEXTO_MAX) return `Descrição com até ${HONORARIO_TEXTO_MAX} caracteres.`;
  if ((d.observacao ?? "").length > HONORARIO_TEXTO_MAX) return `Observação com até ${HONORARIO_TEXTO_MAX} caracteres.`;
  return null;
}

/**
 * O que falta para a linha poder ir para a aprovação (null = pode enviar).
 * 20/10: setor, posição e diárias saíram do formulário (vêm da vaga e do
 * tipo) — a VAGA pede o tipo (um dos 4 da tabela ou "Outro valor") e um
 * valor; a EMPREITA, o valor fechado.
 */
export function faltaParaEnviar(h: { status: string; tipo?: string; tipoFreela?: string | null; valorPedido: number }): string | null {
  if (!podeEditarHonorario(h.status)) return "Este pedido já foi enviado.";
  if (h.tipo === "empreita") {
    if (!h.valorPedido || h.valorPedido <= 0) return "Informe o valor fechado da empreita.";
    return null;
  }
  if (!ehTipoDoValor(h.tipoFreela)) return "Escolha o tipo de freela ou “Outro valor”.";
  if (!h.valorPedido || h.valorPedido <= 0) {
    return h.tipoFreela === "outro" ? "Informe o valor negociado." : "A tabela não tem valor para os dias desta vaga — confira o período na vaga ou use “Outro valor”.";
  }
  return null;
}

/** Setor da vaga para o relatório: pela função; a cenotécnica genérica é Montagem. */
export function setorDaVaga(nomeDaFuncao: string | null | undefined): SetorCeno {
  return setorSugerido(nomeDaFuncao) ?? "montagem";
}

export function validarMotivo(motivo: string | null | undefined, rotulo = "o motivo"): string | null {
  const t = (motivo ?? "").trim();
  if (t.length < HONORARIO_MOTIVO_MIN) return `Escreva ${rotulo}.`;
  if (t.length > HONORARIO_TEXTO_MAX) return `Até ${HONORARIO_TEXTO_MAX} caracteres.`;
  return null;
}

/** Aprovar com ajuste: valor novo positivo, diferente do pedido, e motivo. */
export function validarAjuste(valorPedidoCents: number, novoCents: number, motivo: string | null | undefined): string | null {
  if (!Number.isInteger(novoCents) || novoCents <= 0) return "Informe o valor aprovado.";
  if (novoCents > HONORARIO_VALOR_MAX) return "Valor inválido.";
  if (novoCents === valorPedidoCents) return "O valor é igual ao pedido — use Aprovar.";
  return validarMotivo(motivo, "o motivo do ajuste");
}

/**
 * OC/DP da liberação (30/10, dono): deixou de ser obrigatória — o Financeiro
 * libera sem OC e o DP informa depois. A coluna é NOT NULL: "sem OC" é a
 * string vazia (ou só espaços); toda leitura passa por aqui.
 */
export const temOc = (oc: string | null | undefined): boolean => !!(oc ?? "").trim();
/** "OC/DP 45123" ou "sem OC" — para histórico, toasts e listas. */
export const textoDaOc = (oc: string | null | undefined): string => (temOc(oc) ? `OC/DP ${(oc ?? "").trim()}` : "sem OC");

/** OC informada DEPOIS da liberação (o DP): aqui ela é obrigatória. */
export function validarOcInformada(oc: string | null | undefined): string | null {
  const t = (oc ?? "").trim();
  if (!t) return "Informe o número da OC/DP.";
  if (t.length > HONORARIO_OC_MAX) return `OC/DP com até ${HONORARIO_OC_MAX} caracteres.`;
  return null;
}

/** Liberação de verba: data e valor até o que falta liberar; a OC/DP é opcional (30/10). */
export function validarLiberacao(l: { data: string; oc?: string | null; valor: number }, faltaCents: number): string | null {
  if (!ehDataIso(l.data)) return "Informe a data da liberação.";
  const oc = (l.oc ?? "").trim();
  if (oc.length > HONORARIO_OC_MAX) return `OC/DP com até ${HONORARIO_OC_MAX} caracteres.`;
  if (!Number.isInteger(l.valor) || l.valor <= 0) return "Informe o valor liberado.";
  if (faltaCents <= 0) return "Este pedido já está todo liberado.";
  if (l.valor > faltaCents) return "O valor passa do que falta liberar.";
  return null;
}

// ── Relatórios do Financeiro ────────────────────────────────────────────────

/** Linha mínima que os relatórios leem (o que GET /financeiro devolve). */
export interface LinhaDoRelatorio {
  id: string;
  eventId: string;
  eventName: string | null;
  eventStartDate: string | null;
  tipo: HonorarioTipo | string;
  nome: string;
  setor: string | null;
  posicao: string | null;
  status: string;
  diarias: number | null;
  valorPedido: number;
  valorAprovado: number | null;
  liberado: number;
  /** Pedido de vaga ainda sem colaborador (20/10) — no "por pessoa" vai para "Vagas sem nome". */
  semColaborador?: boolean;
}

export interface Totais {
  /** Linhas que entram no total (enviadas: aguardando + aprovadas). */
  linhas: number;
  /** Valor pedido do que foi ENVIADO (aguardando + aprovados). */
  pedido: number;
  /** Valor pedido que ainda espera o aprovador. */
  aguardando: number;
  aprovado: number;
  liberado: number;
  aLiberar: number;
  /** Devolvidos para negociar (fora dos totais, só contados). */
  emNegociacao: number;
}

const ZERO: Totais = { linhas: 0, pedido: 0, aguardando: 0, aprovado: 0, liberado: 0, aLiberar: 0, emNegociacao: 0 };

/** Soma de um conjunto de linhas. Rascunho não entra; devolvido só é contado. */
export function somar(linhas: readonly LinhaDoRelatorio[]): Totais {
  const t = { ...ZERO };
  for (const l of linhas) {
    if (l.status === "rascunho") continue;
    if (l.status === "devolvido") { t.emNegociacao += 1; continue; }
    t.linhas += 1;
    t.pedido += l.valorPedido;
    if (l.status === "aguardando") t.aguardando += l.valorPedido;
    if (ehAprovado(l.status) && l.valorAprovado != null) {
      t.aprovado += l.valorAprovado;
      t.liberado += l.liberado;
      t.aLiberar += faltaLiberar(l.valorAprovado, l.liberado);
    }
  }
  return t;
}

export interface GrupoDoRelatorio extends Totais {
  chave: string;
  rotulo: string;
  /** Linha secundária (data do evento, nº de eventos, posição…). */
  detalhe: string | null;
  /** Para ordenar (data do evento, mês). */
  ordem: string;
}

function agrupar(
  linhas: readonly LinhaDoRelatorio[],
  chaveDe: (l: LinhaDoRelatorio) => { chave: string; rotulo: string; detalhe?: string | null; ordem?: string },
): GrupoDoRelatorio[] {
  const mapa = new Map<string, { info: { chave: string; rotulo: string; detalhe?: string | null; ordem?: string }; linhas: LinhaDoRelatorio[] }>();
  for (const l of linhas) {
    if (l.status === "rascunho") continue;
    const info = chaveDe(l);
    const g = mapa.get(info.chave);
    if (g) g.linhas.push(l); else mapa.set(info.chave, { info, linhas: [l] });
  }
  return Array.from(mapa.values()).map(({ info, linhas: ls }) => ({
    ...somar(ls),
    chave: info.chave,
    rotulo: info.rotulo,
    detalhe: info.detalhe ?? null,
    ordem: info.ordem ?? info.rotulo,
  }));
}

const fmtDataBr = (iso: string | null) => (iso && ehDataIso(iso) ? iso.split("-").reverse().join("/") : "");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "outubro de 2026" a partir de "2026-10". */
export function rotuloDoMes(anoMes: string): string {
  const [a, m] = anoMes.split("-").map(Number);
  if (!a || !m || m < 1 || m > 12) return anoMes;
  return `${MESES[m - 1]} de ${a}`;
}

/** TOTAL POR EVENTO — o relatório principal. Mais recente primeiro. */
export function totalPorEvento(linhas: readonly LinhaDoRelatorio[]): GrupoDoRelatorio[] {
  return agrupar(linhas, (l) => ({
    chave: l.eventId,
    rotulo: l.eventName ?? "Evento sem nome",
    detalhe: fmtDataBr(l.eventStartDate) || null,
    ordem: l.eventStartDate ?? "",
  })).sort((a, b) => b.ordem.localeCompare(a.ordem) || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Por mês do evento (a planilha tinha uma aba por mês). Mais recente primeiro. */
export function totalPorMes(linhas: readonly LinhaDoRelatorio[]): GrupoDoRelatorio[] {
  const porEvento = new Map<string, Set<string>>();
  const grupos = agrupar(linhas, (l) => {
    const anoMes = (l.eventStartDate ?? "").slice(0, 7) || "sem-data";
    const set = porEvento.get(anoMes) ?? new Set<string>();
    set.add(l.eventId);
    porEvento.set(anoMes, set);
    return { chave: anoMes, rotulo: anoMes === "sem-data" ? "Sem data" : rotuloDoMes(anoMes), ordem: anoMes };
  });
  return grupos
    .map((g) => {
      const n = porEvento.get(g.chave)?.size ?? 0;
      return { ...g, detalhe: `${n} ${n === 1 ? "evento" : "eventos"}` };
    })
    .sort((a, b) => b.ordem.localeCompare(a.ordem));
}

export const CHAVE_DAS_VAGAS_SEM_NOME = "sem-nome|";

/**
 * Por pessoa e empreita — mesmo nome em eventos diferentes soma junto. Maior
 * aprovado primeiro. Os pedidos de vaga ainda SEM colaborador (20/10) não são
 * de ninguém: somam numa linha só, "Vagas sem nome", que vai para o fim — é o
 * valor que o Financeiro ainda não sabe a quem paga. (Uma linha por vaga
 * espalharia "Vaga #5063 sem nome", "Vaga #5064 sem nome"… no meio das
 * pessoas, e o nº da vaga já está na lista do Financeiro.)
 */
export function totalPorPessoa(linhas: readonly LinhaDoRelatorio[]): GrupoDoRelatorio[] {
  const eventos = new Map<string, Set<string>>();
  const pedidos = new Map<string, number>();
  const grupos = agrupar(linhas, (l) => {
    const semNome = l.tipo !== "empreita" && !!l.semColaborador;
    const tipo = l.tipo === "empreita" ? "empreita" : "pessoa";
    const chave = semNome ? CHAVE_DAS_VAGAS_SEM_NOME : `${tipo}|${normalizarNomeDeFuncao(l.nome)}`;
    const set = eventos.get(chave) ?? new Set<string>();
    set.add(l.eventId);
    eventos.set(chave, set);
    pedidos.set(chave, (pedidos.get(chave) ?? 0) + 1);
    return semNome ? { chave, rotulo: "Vagas sem nome", ordem: "~" } : { chave, rotulo: l.nome.trim(), ordem: l.nome };
  });
  return grupos
    .map((g) => {
      const n = eventos.get(g.chave)?.size ?? 0;
      const ev = `${n} ${n === 1 ? "evento" : "eventos"}`;
      if (g.chave === CHAVE_DAS_VAGAS_SEM_NOME) {
        const p = pedidos.get(g.chave) ?? 0;
        return { ...g, detalhe: `Ainda sem colaborador · ${p} ${p === 1 ? "vaga" : "vagas"} · ${ev}` };
      }
      const tipo = g.chave.startsWith("empreita|") ? "Empreita" : "Pessoa";
      return { ...g, detalhe: `${tipo} · ${ev}` };
    })
    .sort((a, b) => Number(a.chave === CHAVE_DAS_VAGAS_SEM_NOME) - Number(b.chave === CHAVE_DAS_VAGAS_SEM_NOME)
      || b.aprovado - a.aprovado || b.pedido - a.pedido || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Por setor × posição (Sup Ceno · Freela viagem…). Maior pedido primeiro. */
export function totalPorSetorEPosicao(linhas: readonly LinhaDoRelatorio[]): GrupoDoRelatorio[] {
  return agrupar(linhas, (l) => {
    const setor = ehSetorCeno(l.setor) ? SETOR_CENO_LABEL[l.setor] : "Sem setor";
    const posicao = ehPosicaoCeno(l.posicao) ? POSICAO_CENO_LABEL[l.posicao] : "Sem posição";
    return { chave: `${l.setor ?? ""}|${l.posicao ?? ""}`, rotulo: setor, detalhe: posicao, ordem: `${setor}|${posicao}` };
  }).sort((a, b) => b.pedido - a.pedido || a.ordem.localeCompare(b.ordem, "pt-BR"));
}

export type TipoDeRelatorio = "evento" | "mes" | "pessoa" | "setor";
export const RELATORIOS: Record<TipoDeRelatorio, { rotulo: string; coluna: string; detalhe: string; gerar: (l: readonly LinhaDoRelatorio[]) => GrupoDoRelatorio[] }> = {
  evento: { rotulo: "Por evento", coluna: "Evento", detalhe: "Data", gerar: totalPorEvento },
  mes: { rotulo: "Por mês", coluna: "Mês", detalhe: "Eventos", gerar: totalPorMes },
  pessoa: { rotulo: "Por pessoa e empreita", coluna: "Pessoa / empreita", detalhe: "Tipo", gerar: totalPorPessoa },
  setor: { rotulo: "Por setor e posição", coluna: "Setor", detalhe: "Posição", gerar: totalPorSetorEPosicao },
};

/** Valor em reais para o CSV ("1234,56" — o Excel em pt-BR soma). */
export function reaisParaCsv(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Cabeçalho + linhas do CSV de um relatório (a proteção contra fórmula fica no download). */
export function csvDoRelatorio(tipo: TipoDeRelatorio, grupos: readonly GrupoDoRelatorio[]): { cabecalho: string[]; linhas: string[][] } {
  const r = RELATORIOS[tipo];
  const cabecalho = [r.coluna, r.detalhe, "Linhas", "Pedido (R$)", "Aguardando aprovação (R$)", "Aprovado (R$)", "Liberado (R$)", "A liberar (R$)", "Devolvidos p/ negociar"];
  const linhas = grupos.map((g) => [
    g.rotulo, g.detalhe ?? "", String(g.linhas), reaisParaCsv(g.pedido), reaisParaCsv(g.aguardando),
    reaisParaCsv(g.aprovado), reaisParaCsv(g.liberado), reaisParaCsv(g.aLiberar), String(g.emNegociacao),
  ]);
  const total = somarGrupos(grupos);
  linhas.push(["Total", "", String(total.linhas), reaisParaCsv(total.pedido), reaisParaCsv(total.aguardando), reaisParaCsv(total.aprovado), reaisParaCsv(total.liberado), reaisParaCsv(total.aLiberar), String(total.emNegociacao)]);
  return { cabecalho, linhas };
}

/** Soma de grupos (rodapé das tabelas de relatório). */
export function somarGrupos(grupos: readonly Totais[]): Totais {
  return grupos.reduce<Totais>((acc, g) => ({
    linhas: acc.linhas + g.linhas, pedido: acc.pedido + g.pedido, aguardando: acc.aguardando + g.aguardando,
    aprovado: acc.aprovado + g.aprovado, liberado: acc.liberado + g.liberado, aLiberar: acc.aLiberar + g.aLiberar, emNegociacao: acc.emNegociacao + g.emNegociacao,
  }), { ...ZERO });
}

// ── No Planejado (21/10) ────────────────────────────────────────────────────
//
// Dono: "a aprovação do honorário tem que afetar o planejado". O Planejado lê
// os pedidos do evento (GET /api/budget-planned/honorarios) e, por vaga:
//  - APROVADO (aprovado ou aprovado c/ ajuste): a mão de obra da vaga é o
//    valor aprovado — substitui a tabela, a diária e a empreita por empresa.
//    Alimentação e mobilidade seguem as regras normais (o valor fechado cobre
//    só a mão de obra — regra de 18/08, shared/cenotecnica-empreita.ts);
//  - EMPREITA aprovada: o valor é RATEADO igualmente entre as vagas dela que
//    continuam valendo, para a soma do evento bater com o aprovado; os
//    centavos que sobram vão para a primeira vaga (menor nº);
//  - ANTES da aprovação (rascunho, aguardando, devolvido): o valor de hoje
//    continua; o pedido só aparece num selo;
//  - o ajuste manual do Planejado continua vencendo, com o aviso de que difere.
// Fora: pedido de vaga que saiu dos honorários (cancelada, excluída, outra
// função, casa) e, na empreita, as vagas com aviso.

/** Vaga de uma empreita, como o Planejado recebe: `ativa` = sem aviso (continua valendo). */
export interface VagaDaEmpreitaParaPlanejado {
  id: string;
  inclusionNumber: number;
  ativa: boolean;
}

/** Um pedido do evento, como o Planejado recebe (só leitura). */
export interface HonorarioParaPlanejado {
  id: string;
  tipo: string;
  nome: string;
  status: string;
  valorPedido: number;
  valorAprovado: number | null;
  decididoPorNome: string | null;
  /** ISO (timestamp) da decisão. */
  decididoEm: string | null;
  /** VAGA: a vaga do pedido. */
  teamInclusionId: string | null;
  /** VAGA: a escala mudou depois do pedido (null = vale como está). */
  avisoDaVaga: AvisoDaVaga | null;
  /** EMPREITA: as vagas dela, em ordem de nº. */
  vagas: VagaDaEmpreitaParaPlanejado[];
}

/** O honorário de UMA vaga no Planejado (já rateado na empreita). */
export interface HonorarioNaVaga {
  honorarioId: string;
  tipo: HonorarioTipo;
  /** Nome do pedido (colaborador, "Vaga #N sem nome" ou a equipe da empreita). */
  nome: string;
  status: HonorarioStatus;
  /** aprovado = vale no Planejado; pendente = rascunho, aguardando ou devolvido (só o selo). */
  situacao: "aprovado" | "pendente";
  /** O valor desta vaga: o aprovado (ou o pedido, se pendente), já rateado na empreita. */
  valorCents: number;
  /** EMPREITA: total e nº de vagas do rateio; `primeira` = recebeu os centavos que sobraram. */
  empreita: { totalCents: number; vagas: number; primeira: boolean } | null;
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  /** O pedido de VAGA era de outra pessoa (a vaga trocou de colaborador depois). */
  colaboradorTrocado: boolean;
}

/**
 * Rateio igual de `totalCents` entre `n` vagas, em centavos inteiros: a soma
 * bate com o total e o que sobra da divisão vai para a primeira.
 * Ex.: R$ 1.000,00 ÷ 3 → [333,34; 333,33; 333,33].
 */
export function ratearEmpreita(totalCents: number, n: number): number[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const total = Math.max(0, Math.round(totalCents));
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

/**
 * Os honorários do evento por vaga (id da vaga → honorário da vaga). Vaga que
 * saiu dos honorários não entra; na empreita só contam as vagas ativas. Se uma
 * vaga aparece em dois pedidos (não deveria — a rota impede), vale a empreita,
 * que descarta o pedido próprio.
 */
export function honorariosNasVagas(hs: readonly HonorarioParaPlanejado[]): Map<string, HonorarioNaVaga> {
  const mapa = new Map<string, HonorarioNaVaga>();
  const base = (h: HonorarioParaPlanejado, status: HonorarioStatus) => {
    const aprovado = ehAprovado(status);
    return {
      honorarioId: h.id,
      nome: h.nome,
      status,
      situacao: aprovado ? "aprovado" as const : "pendente" as const,
      valor: aprovado ? valorVigente(h) : h.valorPedido,
      aprovadoPor: aprovado ? h.decididoPorNome : null,
      aprovadoEm: aprovado ? h.decididoEm : null,
    };
  };
  for (const h of hs) {
    if (h.tipo !== "vaga" || !ehStatusDeHonorario(h.status) || !h.teamInclusionId) continue;
    if (vagaSaiuDosHonorarios(h.avisoDaVaga)) continue;
    const { valor, ...b } = base(h, h.status);
    mapa.set(h.teamInclusionId, { ...b, tipo: "vaga", valorCents: valor, empreita: null, colaboradorTrocado: h.avisoDaVaga === "colaborador_trocado" });
  }
  for (const h of hs) {
    if (h.tipo !== "empreita" || !ehStatusDeHonorario(h.status)) continue;
    const ativas = [...h.vagas].filter((v) => v.ativa).sort((a, b) => a.inclusionNumber - b.inclusionNumber);
    if (ativas.length === 0) continue;
    const { valor, ...b } = base(h, h.status);
    const partes = ratearEmpreita(valor, ativas.length);
    ativas.forEach((v, i) => {
      mapa.set(v.id, {
        ...b, tipo: "empreita", valorCents: partes[i],
        empreita: { totalCents: valor, vagas: ativas.length, primeira: i === 0 },
        colaboradorTrocado: false,
      });
    });
  }
  return mapa;
}

/** A mão de obra da vaga no Planejado, e de onde ela veio. */
export interface MaoDeObraDaVaga {
  subtotalCents: number;
  /** regra = tabela/diária de hoje; honorario = o aprovado; ajuste = o ajuste manual do Planejado. */
  fonte: "regra" | "honorario" | "ajuste";
  /** O aprovado que vale para a vaga (null sem honorário aprovado). */
  aprovadoCents: number | null;
  /** O pedido ainda sem aprovação (rascunho, aguardando, devolvido) — só para o selo. */
  pendenteCents: number | null;
  /** Há ajuste manual e ele difere do aprovado → "difere do honorário aprovado". */
  difereDoAprovado: boolean;
}

/**
 * A regra, numa linha: ajuste manual > honorário aprovado > regra de hoje.
 * `regraCents` é a mão de obra pela tabela/diária (sem ajuste); `ajusteCents`
 * é a mão de obra com o ajuste manual da diária (null = sem ajuste).
 */
export function valorDoHonorarioNaVaga(e: {
  honorario?: HonorarioNaVaga | null;
  regraCents: number;
  ajusteCents?: number | null;
}): MaoDeObraDaVaga {
  const h = e.honorario ?? null;
  const aprovadoCents = h?.situacao === "aprovado" ? h.valorCents : null;
  const pendenteCents = h?.situacao === "pendente" ? h.valorCents : null;
  const ajuste = e.ajusteCents ?? null;
  if (ajuste != null) {
    return { subtotalCents: ajuste, fonte: "ajuste", aprovadoCents, pendenteCents, difereDoAprovado: aprovadoCents != null && ajuste !== aprovadoCents };
  }
  if (aprovadoCents != null) return { subtotalCents: aprovadoCents, fonte: "honorario", aprovadoCents, pendenteCents, difereDoAprovado: false };
  return { subtotalCents: e.regraCents, fonte: "regra", aprovadoCents, pendenteCents, difereDoAprovado: false };
}

// ── Situação na Escalação (23/10) ───────────────────────────────────────────
//
// Dono: "nos honorários, quem lança não sabe quais lançou, tinha que ser mais
// claro". A Fila de trabalho da Escalação ganha um selo por vaga de
// cenotécnica e um filtro "Honorário"; a gaveta do evento, um resumo e abas.
// SÓ LEITURA e só apresentação: as etapas abaixo são uma leitura dos status
// que já existem (nada novo é gravado). A vaga que está numa EMPREITA segue a
// etapa da empreita (o valor dela é o da equipe); a da casa não recebe.

/** Onde o honorário de uma vaga está, para quem lança. */
export type SituacaoNaFila = "falta_lancar" | "rascunho" | "aguardando" | "devolvido" | "aprovado" | "casa";

export const SITUACAO_NA_FILA_LABEL: Record<SituacaoNaFila, string> = {
  falta_lancar: "Falta lançar",
  rascunho: "Rascunho (não enviado)",
  aguardando: "Aguardando aprovação",
  devolvido: "Devolvido para negociar",
  aprovado: "Aprovado",
  casa: "Da casa · não recebe",
};

/** Lê o status do pedido como etapa da fila (sem pedido → falta lançar). */
export function situacaoDoStatus(status: string | null | undefined): Exclude<SituacaoNaFila, "casa"> {
  if (status === "rascunho" || status === "aguardando" || status === "devolvido") return status;
  if (status && ehAprovado(status)) return "aprovado";
  return "falta_lancar";
}

/** O que ainda é trabalho de quem lança: falta lançar, rascunho não enviado e devolvido. */
export const situacaoPedeAcao = (s: SituacaoNaFila | null | undefined): boolean =>
  s === "falta_lancar" || s === "rascunho" || s === "devolvido";

/** Quem lançou / enviou / decidiu um pedido, como a rota agregada devolve. */
export interface AutoriaDoPedido {
  criadoPor: string | null;
  criadoPorNome: string | null;
  createdAt: string | null;
  enviadoPor: string | null;
  enviadoPorNome: string | null;
  enviadoEm: string | null;
  decididoPorNome: string | null;
  decididoEm: string | null;
}

/** O pedido foi lançado ou enviado pela pessoa ("Lançados por mim"). */
export function lancadoPor(p: { criadoPor?: string | null; enviadoPor?: string | null }, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return p.criadoPor === userId || p.enviadoPor === userId;
}

/** Uma vaga na Fila da Escalação (GET /api/honorarios-ceno/situacao). */
export interface HonorarioNaFila extends AutoriaDoPedido {
  vagaId: string;
  eventId: string;
  situacao: SituacaoNaFila;
  /** O pedido que vale para a vaga: o próprio ou o da empreita (null = falta lançar / casa). */
  honorarioId: string | null;
  status: string | null;
  /** O valor que vale hoje: o aprovado, se houver, senão o pedido (centavos). */
  valorCents: number | null;
  /** O pedido original, quando houve ajuste. */
  valorPedidoCents: number | null;
  /** A vaga faz parte de uma empreita (o valor é o da equipe, rateado no Planejado). */
  empreita: { id: string; nome: string; vagas: number } | null;
  /** Lançado ou enviado pela pessoa logada. */
  meu: boolean;
  /** A escala mudou depois do pedido (troca de colaborador, vaga da empreita mudou…). */
  aviso: string | null;
}

/** Pedido (vaga ou empreita) como a montagem da situação lê. */
export interface PedidoParaFila extends AutoriaDoPedido {
  id: string;
  nome: string;
  status: string;
  valorPedido: number;
  valorAprovado: number | null;
  avisoDaVaga?: AvisoDaVaga | null;
  colaboradorAtual?: string | null;
  avisosDaEmpreita?: readonly string[] | null;
}

const SEM_AUTORIA: AutoriaDoPedido = {
  criadoPor: null, criadoPorNome: null, createdAt: null, enviadoPor: null, enviadoPorNome: null, enviadoEm: null, decididoPorNome: null, decididoEm: null,
};

/**
 * A situação de UMA vaga ativa de cenotécnica para quem lança. Ordem:
 *  1. da casa (funcionário) → "casa" (não recebe, sem pedido);
 *  2. numa empreita → a etapa da EMPREITA, com o nome dela;
 *  3. com pedido próprio → a etapa do pedido;
 *  4. sem nada → falta lançar.
 */
export function honorarioNaFila(
  vaga: { id: string; eventId: string; collaboratorId: string | null; collaboratorType: string | null; empreitaEmpresa: string | null },
  pedido: PedidoParaFila | null,
  empreita: { pedido: PedidoParaFila; vagas: number } | null,
  userId: string | null | undefined,
): HonorarioNaFila {
  const base = { vagaId: vaga.id, eventId: vaga.eventId };
  if (!vagaRecebeHonorario(vaga)) {
    return { ...base, ...SEM_AUTORIA, situacao: "casa", honorarioId: null, status: null, valorCents: null, valorPedidoCents: null, empreita: null, meu: false, aviso: null };
  }
  const p = empreita?.pedido ?? pedido;
  if (!p) {
    return { ...base, ...SEM_AUTORIA, situacao: "falta_lancar", honorarioId: null, status: null, valorCents: null, valorPedidoCents: null, empreita: null, meu: false, aviso: null };
  }
  const aviso = empreita
    ? (empreita.pedido.avisosDaEmpreita?.length ? `Vaga da empreita mudou: ${empreita.pedido.avisosDaEmpreita.join("; ")}` : null)
    : p.avisoDaVaga
      ? (p.avisoDaVaga === "colaborador_trocado"
        ? (p.colaboradorAtual ? `A vaga trocou de colaborador — hoje: ${p.colaboradorAtual}` : "A vaga ficou sem colaborador")
        : AVISO_DA_VAGA_LABEL[p.avisoDaVaga])
      : null;
  const aprovado = ehAprovado(p.status) && p.valorAprovado != null;
  return {
    ...base,
    situacao: situacaoDoStatus(p.status),
    honorarioId: p.id,
    status: p.status,
    valorCents: aprovado ? p.valorAprovado : p.valorPedido,
    valorPedidoCents: p.valorPedido,
    empreita: empreita ? { id: empreita.pedido.id, nome: empreita.pedido.nome, vagas: empreita.vagas } : null,
    criadoPor: p.criadoPor, criadoPorNome: p.criadoPorNome, createdAt: p.createdAt,
    enviadoPor: p.enviadoPor, enviadoPorNome: p.enviadoPorNome, enviadoEm: p.enviadoEm,
    decididoPorNome: p.decididoPorNome, decididoEm: p.decididoEm,
    meu: lancadoPor(p, userId),
    aviso,
  };
}

/** Os pedidos de uma etapa só ("enviados" = saíram do rascunho: aguardando, decididos). */
export interface ContagemDoLancamento {
  /** Linhas que recebem honorário: vagas (fora de empreita) + empreitas. */
  total: number;
  faltaLancar: number;
  rascunho: number;
  aguardando: number;
  devolvido: number;
  aprovado: number;
  /** Com pedido (qualquer etapa). */
  lancadas: number;
  /** Já saíram do rascunho (aguardando, devolvido, aprovado). */
  enviadas: number;
}

export function contarLancamento(situacoes: readonly SituacaoNaFila[]): ContagemDoLancamento {
  const c: ContagemDoLancamento = { total: 0, faltaLancar: 0, rascunho: 0, aguardando: 0, devolvido: 0, aprovado: 0, lancadas: 0, enviadas: 0 };
  for (const s of situacoes) {
    if (s === "casa") continue;
    c.total += 1;
    if (s === "falta_lancar") { c.faltaLancar += 1; continue; }
    c.lancadas += 1;
    if (s === "rascunho") c.rascunho += 1;
    else {
      c.enviadas += 1;
      if (s === "aguardando") c.aguardando += 1;
      else if (s === "devolvido") c.devolvido += 1;
      else c.aprovado += 1;
    }
  }
  return c;
}
