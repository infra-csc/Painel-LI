/**
 * Honorários da cenotécnica (dono, 16/10) — regras puras, usadas pelo servidor
 * e pelas telas.
 *
 * "O pessoal de cenotécnica entra, coloca um valor que negociou e manda para a
 * aprovação, que é o mesmo aprovador de escala. Mas temos que deixar isso em
 * outra aba, pois é financeiro. Depois o Financeiro tem que ter relatórios,
 * principalmente total por evento, e colocar quando liberar a verba."
 *
 * É um módulo À PARTE da escala: NADA aqui lê ou grava status de vaga, o
 * Planejado/Realizado ou qualquer cálculo existente. As tabelas são próprias
 * (honorarios_ceno, _historico, _liberacoes — ver shared/schema.ts).
 *
 * Linhas do pedido:
 *  - VAGA: cada vaga ESCALADA de cenotécnica (inclui Sup Ceno) com colaborador
 *    freela (local ou viagem). Casa (funcionário) não entra.
 *  - EMPREITA: equipe terceirizada que NÃO é vaga do app — responsável, nº de
 *    pessoas, descrição e valor fechado ("EQUIPE (3x)").
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

/**
 * Posição sugerida para a vaga escalada. Ordem de confiança:
 *  1. empreita por empresa na vaga → empreita;
 *  2. modalidade de freela escolhida na Escalação (`ceno_freela_tipo`):
 *     viagem → freela viagem; SP / Local A / Local B → freela local;
 *  3. colaborador "local" → freela local;
 *  4. vaga que precisa de passagem → freela viagem; senão freela local.
 * Casa devolve null (não entra no honorário).
 */
export function posicaoSugerida(v: {
  collaboratorType?: string | null;
  cenoFreelaTipo?: string | null;
  needsTicket?: boolean | null;
  empreitaEmpresa?: string | null;
}): PosicaoCeno | null {
  if (v.empreitaEmpresa && v.empreitaEmpresa.trim()) return "empreita";
  if (v.collaboratorType === "casa") return null;
  if (v.cenoFreelaTipo === "viagem") return "freela_viagem";
  if (v.cenoFreelaTipo === "sp" || v.cenoFreelaTipo === "local_a" || v.cenoFreelaTipo === "local_b") return "freela_local";
  if (v.collaboratorType === "local") return "freela_local";
  return v.needsTicket ? "freela_viagem" : "freela_local";
}

/** A vaga escalada entra no honorário? Casa (funcionário) fica de fora. */
export function vagaRecebeHonorario(v: { collaboratorType?: string | null; empreitaEmpresa?: string | null; collaboratorId?: string | null }): boolean {
  if (v.empreitaEmpresa && v.empreitaEmpresa.trim()) return true;
  if (!v.collaboratorId) return false;
  return v.collaboratorType !== "casa";
}

// ── A vaga mudou depois do pedido ───────────────────────────────────────────

/**
 * O pedido de VAGA guarda um retrato (colaborador, nome, função). Se a escala
 * muda depois — troca de colaborador, cancelamento, exclusão, a vaga passa
 * para outra função ou para um funcionário da casa — o pedido não pode seguir
 * calado: quem pede não envia, e quem aprova/libera vê o aviso.
 *  - colaborador_trocado: a vaga continua valendo, com OUTRA pessoa (quem pede
 *    confirma e o pedido passa a ser dela);
 *  - os demais: a vaga saiu dos honorários (nada a enviar ou editar).
 */
export type AvisoDaVaga = "excluida" | "fora_da_escala" | "outra_funcao" | "casa" | "colaborador_trocado";

export const AVISO_DA_VAGA_LABEL: Record<AvisoDaVaga, string> = {
  excluida: "A vaga foi excluída da escala",
  fora_da_escala: "A vaga não está mais escalada",
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
  if ((vaga.collaboratorId ?? null) !== (h.collaboratorId ?? null)) return "colaborador_trocado";
  return null;
}

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

/** O que falta para a linha poder ir para a aprovação (null = pode enviar). */
export function faltaParaEnviar(h: { status: string; valorPedido: number; diarias: number | null; setor: string | null; posicao: string | null }): string | null {
  if (!podeEditarHonorario(h.status)) return "Este pedido já foi enviado.";
  if (!h.valorPedido || h.valorPedido <= 0) return "Informe o valor negociado.";
  if (!h.diarias || h.diarias <= 0) return "Informe as diárias.";
  if (!ehSetorCeno(h.setor)) return "Escolha o setor.";
  if (!ehPosicaoCeno(h.posicao)) return "Escolha a posição.";
  return null;
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

/** Liberação de verba: data, OC/DP e valor até o que falta liberar. */
export function validarLiberacao(l: { data: string; oc: string; valor: number }, faltaCents: number): string | null {
  if (!ehDataIso(l.data)) return "Informe a data da liberação.";
  const oc = (l.oc ?? "").trim();
  if (!oc) return "Informe o número da OC/DP.";
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

/** Por pessoa e empreita — mesmo nome em eventos diferentes soma junto. Maior aprovado primeiro. */
export function totalPorPessoa(linhas: readonly LinhaDoRelatorio[]): GrupoDoRelatorio[] {
  const eventos = new Map<string, Set<string>>();
  const grupos = agrupar(linhas, (l) => {
    const tipo = l.tipo === "empreita" ? "empreita" : "pessoa";
    const chave = `${tipo}|${normalizarNomeDeFuncao(l.nome)}`;
    const set = eventos.get(chave) ?? new Set<string>();
    set.add(l.eventId);
    eventos.set(chave, set);
    return { chave, rotulo: l.nome.trim(), ordem: l.nome };
  });
  return grupos
    .map((g) => {
      const n = eventos.get(g.chave)?.size ?? 0;
      const tipo = g.chave.startsWith("empreita|") ? "Empreita" : "Pessoa";
      return { ...g, detalhe: `${tipo} · ${n} ${n === 1 ? "evento" : "eventos"}` };
    })
    .sort((a, b) => b.aprovado - a.aprovado || b.pedido - a.pedido || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
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
