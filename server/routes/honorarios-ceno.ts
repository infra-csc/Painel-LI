/**
 * Honorários da cenotécnica (16/10) — rotas.
 *
 * Quem faz o quê (decisões do dono, 16/10):
 *  - PEDE: quem responde pelas funções de cenotécnica (validador da escala ou
 *    responsável da função) e o admin. Vê e edita só o que é das funções dele.
 *  - APROVA: o MESMO aprovador da escala — aprovador cadastrado da função de
 *    cenotécnica, o aprovador padrão do sistema — e o admin.
 *  - LIBERA: o Financeiro (papéis financeiros: admin e RH — shared/roles.ts).
 *  - Ninguém fora disso vê valores: 403.
 *
 * Ordem das respostas (padrão do app): 401 → 403 (papel/escopo) → 400
 * (dados) → 409 (estado/corrida). Toda mudança passa pela trava de versão.
 * NADA aqui mexe na escala (team_inclusions só é lida). Quando quem pede
 * escolhe o tipo de freela e a vaga ainda não tem, a TELA grava o tipo na vaga
 * pela rota da Escalação (PATCH /api/team-inclusions/:id/ceno-freela-tipo),
 * com as permissões e o log de lá.
 *
 * 20/10 (dono):
 *  - vaga ABERTA também pede ("não precisa escalar") — ver vagasAtivas;
 *  - o valor da vaga é o da TABELA do tipo de freela, calculado AQUI pelos
 *    dias da vaga e os Valores Padrão (a tela não manda o valor), ou "Outro
 *    valor", digitado; setor, posição, período e diárias saem da vaga/tipo;
 *  - a empreita agrupa vagas do evento (uma vaga em uma empreita só, sem
 *    pedido próprio): rascunho/devolvido próprio é descartado com a
 *    confirmação de quem pede; aguardando/aprovado bloqueia ("peça para o
 *    aprovador devolver").
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { effectiveUserId } from "../simulation";
import { createAuditLog, primeiraMensagemDoZod } from "./_compartilhado";
import { isFinanceRole, normalizeRole } from "@shared/roles";
import { DEFAULT_APPROVER_SETTING_KEY } from "@shared/scaling-validation-rules";
import { hojeISO } from "@shared/hoje-sp";
import type { User } from "@shared/schema";
import {
  HONORARIO_LOTE_MAX, HONORARIO_NOME_MAX, HONORARIO_OC_MAX, HONORARIO_TEXTO_MAX, HONORARIO_STATUS_LABEL,
  diasDoPeriodo, faltaLiberar, faltaParaEnviar, podeDecidirHonorario, podeDevolverHonorario,
  podeEditarHonorario, podeLiberarHonorario, podeRemoverHonorario, posicaoSugerida, setorDaVaga,
  validarAjuste, validarDadosDoPedido, validarLiberacao, validarMotivo, vagaRecebeHonorario, ehAprovado,
  vagaSaiuDosHonorarios, AVISO_DA_VAGA_LABEL, TIPO_DO_VALOR_LABEL, ehTipoDeTabela, ehTipoDoValor, nomeDaVagaSemColaborador,
  posicaoDoTipo, type HonorarioStatus,
} from "@shared/honorarios-ceno";
import { CENO_FREELA_TIPOS, cenoEmpreitaTotalCents, isCenoFreelaTipo, type CenoFreelaTipo } from "@shared/cenotecnica-empreita";
import * as dados from "../storage/honorarios-ceno";
import type { HonorarioComContexto, VagaDeCenotecnica } from "../storage/honorarios-ceno";

// ── Acesso ──────────────────────────────────────────────────────────────────

interface Acesso {
  user: User;
  admin: boolean;
  financeiro: boolean;
  aprovadorPadrao: boolean;
  funcoesCeno: { id: string; name: string }[];
  /** Funções de cenotécnica em que a pessoa pode pedir honorário. */
  pedeEm: Set<string>;
  /** Funções de cenotécnica em que a pessoa é aprovadora cadastrada. */
  aprovaEm: Set<string>;
}

const brl = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function aprovadorPadraoId(): Promise<string | null> {
  try {
    const settings = await storage.getSystemSettings();
    return settings.find((s) => s.key === DEFAULT_APPROVER_SETTING_KEY)?.value?.trim() || null;
  } catch {
    return null;
  }
}

/** Usuário EFETIVO (no "Ver como usuário" os GETs respondem como o simulado). */
async function usuarioDe(req: Request, res: Response): Promise<User | null> {
  const userId = effectiveUserId(req);
  if (!userId) { res.status(401).json({ message: "Não autenticado" }); return null; }
  const user = req.user && req.user.id === userId ? req.user : await storage.getUser(userId);
  if (!user) { res.status(401).json({ message: "Usuário não encontrado" }); return null; }
  return user;
}

async function acessoDe(user: User): Promise<Acesso> {
  const [funcoesCeno, papeis, padrao] = await Promise.all([
    dados.funcoesDeCenotecnica(),
    dados.papeisNasFuncoes(user.id),
    aprovadorPadraoId(),
  ]);
  const ids = new Set(funcoesCeno.map((f) => f.id));
  const pedeEm = new Set<string>();
  const aprovaEm = new Set<string>();
  for (const id of Array.from(ids)) {
    if (papeis.validador.has(id) || papeis.responsavel.has(id)) pedeEm.add(id);
    if (papeis.aprovador.has(id)) aprovaEm.add(id);
  }
  return {
    user,
    admin: normalizeRole(user.role) === "admin",
    financeiro: isFinanceRole(user.role),
    aprovadorPadrao: !!padrao && padrao === user.id,
    funcoesCeno,
    pedeEm,
    aprovaEm,
  };
}

const podePedir = (a: Acesso) => a.admin || a.pedeEm.size > 0;
const podeAprovar = (a: Acesso) => a.admin || a.aprovadorPadrao || a.aprovaEm.size > 0;
/** Funções em que a pessoa pode pedir (admin: todas as de cenotécnica). */
const funcoesQuePede = (a: Acesso) => (a.admin ? a.funcoesCeno.map((f) => f.id) : Array.from(a.pedeEm));

function pedeNaLinha(a: Acesso, h: { functionId: string | null }): boolean {
  if (a.admin) return true;
  return h.functionId ? a.pedeEm.has(h.functionId) : a.pedeEm.size > 0;
}
/** É o aprovador de fato (cadastro ou padrão) — o que vira aviso no sino. */
function eAprovadorNaLinha(a: Acesso, h: { functionId: string | null }): boolean {
  if (a.aprovadorPadrao) return true;
  return h.functionId ? a.aprovaEm.has(h.functionId) : a.aprovaEm.size > 0;
}
const aprovaNaLinha = (a: Acesso, h: { functionId: string | null }) => a.admin || eAprovadorNaLinha(a, h);
const veLinha = (a: Acesso, h: { functionId: string | null }) => a.financeiro || pedeNaLinha(a, h) || aprovaNaLinha(a, h);

const SEM_ACESSO = "Os honorários da cenotécnica são vistos só por quem pede (cenotécnica), pelo aprovador da escala e pelo Financeiro.";

function negar(res: Response, message = SEM_ACESSO) {
  res.status(403).json({ message });
}

// ── Visão do pedido para as telas ───────────────────────────────────────────

/**
 * Por que o pedido parou do lado de quem pede (null = segue normal): o evento
 * foi excluído ou a vaga saiu dos honorários (cancelada, excluída, casa,
 * outra função). Nesses casos não se edita nem se envia — sobra remover o
 * rascunho; o que já está com o aprovador ele mesmo devolve.
 */
function pedidoParado(h: HonorarioComContexto): string | null {
  if (h.eventoExcluido) return "O evento foi excluído — o pedido não segue.";
  if (h.avisoDaVaga && vagaSaiuDosHonorarios(h.avisoDaVaga)) return `${AVISO_DA_VAGA_LABEL[h.avisoDaVaga]} — o pedido não segue.`;
  return null;
}

/** O que impede o envio além dos dados (null = pode enviar). */
function bloqueioDoEnvio(h: HonorarioComContexto): string | null {
  const parado = pedidoParado(h);
  if (parado) return parado;
  if (h.avisoDaVaga === "colaborador_trocado") {
    return h.colaboradorAtual
      ? `A vaga trocou de colaborador (agora: ${h.colaboradorAtual}) — confirme na linha antes de enviar.`
      : "A vaga ficou sem colaborador — confirme na linha antes de enviar.";
  }
  if (h.tipo === "empreita" && h.avisosDaEmpreita.length) {
    return `Vaga da empreita mudou na escala (${h.avisosDaEmpreita.join("; ")}) — tire-a da empreita antes de enviar.`;
  }
  return null;
}

// ── Tabela da cenotécnica (Valores Padrão) ──────────────────────────────────

type ValoresPadrao = Record<string, string>;

async function valoresPadrao(): Promise<ValoresPadrao> {
  try {
    const s = await storage.getSystemSettings();
    return Object.fromEntries(s.map((x) => [x.key, x.value]));
  } catch {
    return {};
  }
}

/** Valor da tabela para o tipo e os dias da vaga (0 quando a vaga não tem dias). */
function valorDaTabela(tipo: CenoFreelaTipo, dias: number, vp: ValoresPadrao): number {
  return cenoEmpreitaTotalCents(tipo, dias, vp)?.totalCents ?? 0;
}

/** Os 4 cartões da tela: o valor de cada tipo para os dias da vaga. */
function tabelaDaVaga(v: VagaDeCenotecnica, vp: ValoresPadrao) {
  const valores = {} as Record<CenoFreelaTipo, { total: number; extrapolado: boolean } | null>;
  for (const t of CENO_FREELA_TIPOS) {
    const r = cenoEmpreitaTotalCents(t, v.dias, vp);
    valores[t] = r ? { total: r.totalCents, extrapolado: r.extrapolado } : null;
  }
  return { dias: v.dias, valores };
}

/** Nome da linha da vaga: empresa da empreita na escala, o colaborador ou "Vaga #N sem nome · função". */
const nomeDaVaga = (v: VagaDeCenotecnica) => v.empreitaEmpresa?.trim() || v.collaboratorName || nomeDaVagaSemColaborador(v.inclusionNumber, v.functionName);

/**
 * O que o pedido de VAGA grava além do que a pessoa escolheu: setor pela
 * função, posição pelo tipo, período e diárias da vaga — e, no tipo de
 * tabela, o VALOR da tabela (a tela não manda valor nesse caso).
 */
function camposDaVaga(v: VagaDeCenotecnica, tipo: string | null, vp: ValoresPadrao, valorDigitado: number | undefined, atual?: { setor: string | null; posicao: string | null }) {
  const diarias = v.dias > 0 ? v.dias : diasDoPeriodo(v.scheduleStartDate, v.scheduleEndDate);
  return {
    setor: atual?.setor ?? setorDaVaga(v.functionName),
    posicao: posicaoDoTipo(tipo) ?? atual?.posicao ?? posicaoSugerida(v),
    inicio: v.scheduleStartDate,
    fim: v.scheduleEndDate,
    diarias: diarias && diarias > 0 ? diarias : null,
    ...(ehTipoDeTabela(tipo) ? { valorPedido: valorDaTabela(tipo, v.dias, vp) } : valorDigitado !== undefined ? { valorPedido: valorDigitado } : {}),
  };
}

function visao(a: Acesso, h: HonorarioComContexto) {
  return {
    ...h,
    falta: ehAprovado(h.status) ? faltaLiberar(h.valorAprovado, h.liberado) : 0,
    podeEditar: pedeNaLinha(a, h) && podeEditarHonorario(h.status) && !pedidoParado(h),
    podeRemover: pedeNaLinha(a, h) && podeRemoverHonorario(h.status, h.enviadoEm),
    podeDecidir: aprovaNaLinha(a, h) && podeDecidirHonorario(h.status),
    podeDevolver: aprovaNaLinha(a, h) && podeDevolverHonorario(h.status, h.liberado),
    podeLiberar: a.financeiro && podeLiberarHonorario(h.status) && faltaLiberar(h.valorAprovado, h.liberado) > 0,
    eAprovador: eAprovadorNaLinha(a, h),
  };
}
export type VisaoDoHonorario = ReturnType<typeof visao>;

/** Sugestões tiradas da vaga — o que a linha mostra antes de existir pedido. */
function sugestaoDaVaga(v: VagaDeCenotecnica) {
  const inicio = v.scheduleStartDate;
  const fim = v.scheduleEndDate;
  return {
    setor: setorDaVaga(v.functionName),
    posicao: posicaoSugerida(v),
    inicio,
    fim,
    diarias: v.dias > 0 ? v.dias : v.dailyRates > 0 ? v.dailyRates : diasDoPeriodo(inicio, fim),
    nome: nomeDaVaga(v),
    /** O tipo de freela já escolhido no Resumo da vaga vem pré-selecionado. */
    // Empreita por empresa na escala não é tipo de freela: vem em "Outro valor".
    tipoFreela: v.empreitaEmpresa?.trim() ? "outro" : isCenoFreelaTipo(v.cenoFreelaTipo) ? v.cenoFreelaTipo : null,
    semColaborador: !v.collaboratorId && !v.empreitaEmpresa?.trim(),
  };
}

// ── Empreita: conferência das vagas escolhidas ──────────────────────────────

type ConferenciaDaEmpreita =
  | { ok: true; vagaIds: string[]; descartar: string[]; vagas: VagaDeCenotecnica[] }
  | { ok: false; status: number; message: string; precisaConfirmar?: { id: string; nome: string; status: string; inclusionNumber: number }[] };

/**
 * Confere a lista de vagas de uma empreita. Só as NOVAS na lista passam pela
 * regra (as que já estavam podem ficar, mesmo com aviso — é para tirar):
 *  - ativa, de cenotécnica, da função de quem pede, do evento e não da casa;
 *  - fora de outra empreita;
 *  - sem pedido próprio enviado (aguardando/aprovado → "peça para o aprovador
 *    devolver"); rascunho ou devolvido próprio é DESCARTADO, mas só com a
 *    confirmação de quem pede (`descartarRascunhos: true`).
 */
async function conferirVagasDaEmpreita(a: Acesso, eventId: string, vagaIds: string[], empreitaId: string | null, jaNaEmpreita: string[], confirmouDescarte: boolean): Promise<ConferenciaDaEmpreita> {
  const unicas = Array.from(new Set(vagaIds));
  const novas = unicas.filter((id) => !jaNaEmpreita.includes(id));
  if (novas.length === 0) return { ok: true, vagaIds: unicas, descartar: [], vagas: [] };
  const ativas = new Map((await dados.vagasAtivas(funcoesQuePede(a), [eventId])).map((v) => [v.id, v]));
  const vagas: VagaDeCenotecnica[] = [];
  for (const id of novas) {
    const v = ativas.get(id);
    if (!v) return { ok: false, status: 400, message: "Uma das vagas escolhidas não está ativa entre as vagas de cenotécnica deste evento pelas quais você responde. Recarregue a lista." };
    if (!vagaRecebeHonorario(v)) return { ok: false, status: 400, message: `A vaga #${v.inclusionNumber} é de funcionário da casa — não entra em empreita.` };
    vagas.push(v);
  }
  const emOutra = await dados.empreitasDasVagas(novas);
  for (const v of vagas) {
    const e = emOutra.get(v.id);
    if (e && e.honorarioId !== empreitaId) return { ok: false, status: 409, message: `A vaga #${v.inclusionNumber} já está na empreita ${e.nome}.` };
  }
  const individuais = await dados.pedidosIndividuaisDasVagas(novas);
  const descartar: string[] = [];
  const precisaConfirmar: { id: string; nome: string; status: string; inclusionNumber: number }[] = [];
  for (const p of individuais) {
    const v = vagas.find((x) => x.id === p.teamInclusionId)!;
    if (p.status === "rascunho" || p.status === "devolvido") {
      descartar.push(p.id);
      precisaConfirmar.push({ id: p.id, nome: p.nome, status: p.status, inclusionNumber: v.inclusionNumber });
      continue;
    }
    return {
      ok: false, status: 409,
      message: `A vaga #${v.inclusionNumber} (${p.nome}) já tem pedido próprio "${HONORARIO_STATUS_LABEL[p.status as HonorarioStatus] ?? p.status}" — peça para o aprovador devolver antes de colocá-la na empreita.`,
    };
  }
  if (precisaConfirmar.length && !confirmouDescarte) {
    const lista = precisaConfirmar.map((x) => `#${x.inclusionNumber} ${x.nome}`).join(", ");
    return { ok: false, status: 409, message: `${precisaConfirmar.length === 1 ? "A vaga" : "As vagas"} ${lista} ${precisaConfirmar.length === 1 ? "tem" : "têm"} pedido próprio em rascunho — confirme para descartá-lo e colocar na empreita.`, precisaConfirmar };
  }
  return { ok: true, vagaIds: unicas, descartar, vagas };
}

/** Período da empreita: o das vagas dela (do primeiro início ao último fim), ou o do evento. */
function periodoDaEmpreita(vagas: { scheduleStartDate: string | null; scheduleEndDate: string | null }[], evento: { startDate: string; endDate: string }) {
  const inicios = vagas.map((v) => v.scheduleStartDate).filter((x): x is string => !!x).sort();
  const fins = vagas.map((v) => v.scheduleEndDate).filter((x): x is string => !!x).sort();
  const inicio = inicios[0] ?? evento.startDate;
  const fim = fins[fins.length - 1] ?? evento.endDate;
  return { inicio, fim, diarias: diasDoPeriodo(inicio, fim) };
}

// ── Esquemas ────────────────────────────────────────────────────────────────

const dataOpcional = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable().optional()
  .or(z.literal("").transform(() => null));
const textoOpcional = (max: number) => z.string().trim().max(max, `Até ${max} caracteres`).nullable().optional();
const inteiroOpcional = z.number().int("Use um número inteiro").nullable().optional();

const camposEditaveis = {
  nome: textoOpcional(HONORARIO_NOME_MAX),
  pessoas: inteiroOpcional,
  descricao: textoOpcional(HONORARIO_TEXTO_MAX),
  setor: z.string().nullable().optional(),
  posicao: z.string().nullable().optional(),
  inicio: dataOpcional,
  fim: dataOpcional,
  diarias: inteiroOpcional,
  valorPedido: z.number().int("Valor em centavos").min(0, "Valor inválido").optional(),
  observacao: textoOpcional(HONORARIO_TEXTO_MAX),
  /** Vaga: 'viagem' | 'sp' | 'local_a' | 'local_b' (tabela) ou 'outro' (valor digitado). */
  tipoFreela: z.string().nullable().optional(),
  /** Empreita: as vagas do evento que fazem parte dela (substitui a lista). */
  vagaIds: z.array(z.string().min(1)).max(HONORARIO_LOTE_MAX, `No máximo ${HONORARIO_LOTE_MAX} vagas`).optional(),
  /** Empreita: quem pede confirmou descartar o rascunho próprio das vagas que entram. */
  descartarRascunhos: z.boolean().optional(),
};

const criarSchema = z.object({
  eventId: z.string().min(1),
  tipo: z.enum(["vaga", "empreita"]),
  teamInclusionId: z.string().min(1).optional(),
  ...camposEditaveis,
}).strict();

const editarSchema = z.object({ versao: z.number().int(), ...camposEditaveis }).strict();
const versaoSchema = z.object({ versao: z.number().int() }).strict();
const itensSchema = z.array(z.object({ id: z.string().min(1), versao: z.number().int() }).strict())
  .min(1, "Nenhum pedido escolhido").max(HONORARIO_LOTE_MAX, `No máximo ${HONORARIO_LOTE_MAX} por vez`);
const enviarSchema = z.object({ itens: itensSchema }).strict();
const aprovarSchema = z.object({ versao: z.number().int() }).strict();
const ajusteSchema = z.object({ versao: z.number().int(), valor: z.number().int(), motivo: z.string() }).strict();
const devolverSchema = z.object({ versao: z.number().int(), motivo: z.string() }).strict();
const loteSchema = z.object({ acao: z.enum(["aprovar", "devolver"]), itens: itensSchema, motivo: z.string().optional() }).strict();
const liberarSchema = z.object({
  versao: z.number().int(),
  data: z.string(),
  oc: z.string().max(HONORARIO_OC_MAX, `OC/DP com até ${HONORARIO_OC_MAX} caracteres`),
  valor: z.number().int(),
  observacao: textoOpcional(HONORARIO_TEXTO_MAX),
}).strict();
const estornarSchema = z.object({ versao: z.number().int(), motivo: z.string() }).strict();

function corpo<T>(schema: z.ZodType<T>, req: Request, res: Response): T | null {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) { res.status(400).json({ message: primeiraMensagemDoZod(r.error) }); return null; }
  return r.data;
}

/** 409 com o estado atual — a tela recarrega e mostra o que mudou. */
async function responderCorrida(res: Response, a: Acesso, id: string, fallback = "Este pedido mudou enquanto você decidia. Recarregue para ver como ele está agora.") {
  const atual = await dados.getHonorario(id);
  if (!atual) return res.status(404).json({ message: "Pedido não encontrado — ele pode ter sido removido." });
  const quem = atual.decididoPorNome && atual.status !== "rascunho" ? ` (${HONORARIO_STATUS_LABEL[atual.status as HonorarioStatus] ?? atual.status}${atual.decididoPorNome ? ` por ${atual.decididoPorNome}` : ""})` : "";
  return res.status(409).json({ message: `${fallback}${quem}`, atual: visao(a, atual) });
}

const ator = (u: User) => ({ id: u.id, nome: u.name ?? "Usuário" });

/** Conflito de regra lançado dentro da transação (vaga entrou em empreita no meio, índice único). */
function conflitoDaTransacao(err: unknown): string | null {
  if (err instanceof dados.ConflitoDoHonorario) return err.message;
  const e = err as { code?: string; cause?: { code?: string } } | null;
  if (e?.code === "23505" || e?.cause?.code === "23505") return "Esta vaga já tem pedido ou já está em outra empreita — recarregue.";
  return null;
}

/** Snapshot curto para o log de auditoria (sem dado pessoal além do nome). */
function resumoParaAuditoria(h: { nome: string; tipo: string; status: string; valorPedido: number; valorAprovado: number | null; eventId: string }) {
  return { nome: h.nome, tipo: h.tipo, status: h.status, valorPedido: h.valorPedido, valorAprovado: h.valorAprovado, eventId: h.eventId };
}

// ── Rotas ───────────────────────────────────────────────────────────────────

export function registrarHonorariosCeno(app: Express): void {
  const naoArmazenar = (res: Response) => res.set("Cache-Control", "no-store");

  // O que esta pessoa faz no módulo — as telas escondem o que a API recusaria.
  app.get("/api/honorarios-ceno/acesso", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    naoArmazenar(res);
    res.json({ podePedir: podePedir(a), podeAprovar: podeAprovar(a), podeLiberar: a.financeiro, admin: a.admin });
  });

  // Contagens para o sino e os badges do menu. Nunca 403: quem não participa recebe zeros.
  app.get("/api/honorarios-ceno/pendencias", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    naoArmazenar(res);
    if (!podePedir(a) && !podeAprovar(a) && !a.financeiro) {
      return res.json({ aguardandoMinhaAprovacao: 0, aguardandoPodeDecidir: 0, devolvidosParaMim: 0, aLiberar: 0 });
    }
    const linhas = await dados.listarHonorarios([dados.filtros.status(["aguardando", "devolvido", "aprovado", "aprovado_ajuste"])]);
    let aguardandoMinhaAprovacao = 0, aguardandoPodeDecidir = 0, devolvidosParaMim = 0, aLiberar = 0;
    for (const h of linhas) {
      if (h.status === "aguardando") {
        if (eAprovadorNaLinha(a, h)) aguardandoMinhaAprovacao++;
        if (aprovaNaLinha(a, h)) aguardandoPodeDecidir++;
      } else if (h.status === "devolvido") {
        // Devolvido parado (evento excluído, vaga fora): não há o que fazer — não fica no sino.
        if (pedeNaLinha(a, h) && (h.enviadoPor === user.id || h.criadoPor === user.id) && !pedidoParado(h)) devolvidosParaMim++;
      } else if (a.financeiro && faltaLiberar(h.valorAprovado, h.liberado) > 0) {
        aLiberar++;
      }
    }
    res.json({ aguardandoMinhaAprovacao, aguardandoPodeDecidir, devolvidosParaMim, aLiberar });
  });

  // Quem pede, sem evento escolhido: os eventos com vaga de cenotécnica ativa ou pedido.
  app.get("/api/honorarios-ceno/eventos", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a)) return negar(res);
    const fns = funcoesQuePede(a);
    const ativas = (await dados.vagasAtivas(fns)).filter(vagaRecebeHonorario);
    // Vaga que está numa empreita não tem pedido próprio — não conta como "sem valor".
    const emEmpreita = await dados.empreitasDasVagas(ativas.map((v) => v.id));
    const vagas = ativas.filter((v) => !emEmpreita.has(v.id));
    const comPedido = await dados.eventosComHonorario();
    const ids = Array.from(new Set([...vagas.map((v) => v.eventId), ...comPedido]));
    const [eventos, pedidos] = await Promise.all([dados.eventosPorIds(ids), dados.honorariosDosEventos(ids)]);
    const meus = pedidos.filter((h) => pedeNaLinha(a, h));
    const hoje = hojeISO();
    const lista = eventos
      .map((e) => {
        const doEvento = meus.filter((h) => h.eventId === e.id);
        const vagasDoEvento = vagas.filter((v) => v.eventId === e.id);
        const contar = (s: string) => doEvento.filter((h) => h.status === s).length;
        return {
          ...e,
          vagas: vagasDoEvento.length,
          semColaborador: vagasDoEvento.filter((v) => !v.collaboratorId && !v.empreitaEmpresa?.trim()).length,
          semPedido: vagasDoEvento.filter((v) => !doEvento.some((h) => h.teamInclusionId === v.id)).length,
          empreitas: doEvento.filter((h) => h.tipo === "empreita").length,
          rascunhos: contar("rascunho"),
          aguardando: contar("aguardando"),
          devolvidos: contar("devolvido"),
          aprovados: doEvento.filter((h) => ehAprovado(h.status)).length,
          totalPedido: doEvento.filter((h) => h.status !== "rascunho" && h.status !== "devolvido").reduce((s, h) => s + h.valorPedido, 0),
          totalAprovado: doEvento.filter((h) => ehAprovado(h.status)).reduce((s, h) => s + (h.valorAprovado ?? 0), 0),
          passado: e.endDate < hoje,
        };
      })
      .filter((e) => e.vagas > 0 || e.rascunhos + e.aguardando + e.devolvidos + e.aprovados > 0)
      // Próximos e em andamento primeiro (do mais perto ao mais longe), depois os passados (do mais recente).
      .sort((x, y) => (x.passado === y.passado
        ? (x.passado ? y.startDate.localeCompare(x.startDate) : x.startDate.localeCompare(y.startDate))
        : x.passado ? 1 : -1));
    naoArmazenar(res);
    res.json(lista);
  });

  // Quem pede, com o evento: as vagas ativas da cenotécnica (com ou sem pedido,
  // com ou sem colaborador), as empreitas (com as vagas delas) e a lista de
  // vagas que podem entrar numa empreita.
  app.get("/api/honorarios-ceno/pedido", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a)) return negar(res);
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : "";
    if (!eventId) return res.status(400).json({ message: "Escolha um evento." });
    const evento = await dados.getEvento(eventId);
    if (!evento || evento.status === "excluído") return res.status(404).json({ message: "Evento não encontrado." });

    const [vagas, pedidos, vp] = await Promise.all([
      dados.vagasAtivas(funcoesQuePede(a), [eventId]),
      dados.listarHonorarios([dados.filtros.doEvento(eventId)]),
      valoresPadrao(),
    ]);
    const meus = pedidos.filter((h) => pedeNaLinha(a, h));
    const porVaga = new Map(meus.filter((h) => h.tipo === "vaga" && h.teamInclusionId).map((h) => [h.teamInclusionId!, h]));
    const recebem = vagas.filter(vagaRecebeHonorario);
    const casa = vagas.filter((v) => !vagaRecebeHonorario(v));
    const emEmpreita = await dados.empreitasDasVagas(recebem.map((v) => v.id));
    // A vaga que está numa empreita aparece DENTRO da empreita, não como linha própria.
    const individuais = recebem.filter((v) => !emEmpreita.has(v.id));

    const linhas: { vaga: VagaDeCenotecnica | null; sugestao: ReturnType<typeof sugestaoDaVaga> | null; tabela: ReturnType<typeof tabelaDaVaga> | null; honorario: VisaoDoHonorario | null; foraDaEscala: boolean }[] = individuais.map((v) => ({
      vaga: v,
      sugestao: sugestaoDaVaga(v),
      tabela: tabelaDaVaga(v, vp),
      honorario: porVaga.has(v.id) ? visao(a, porVaga.get(v.id)!) : null,
      foraDaEscala: false,
    }));
    // Pedido de vaga que saiu da escala (cancelada, trocada para casa, excluída): continua visível.
    const idsNaLista = new Set(individuais.map((v) => v.id));
    for (const h of meus) {
      if (h.tipo !== "vaga" || !h.teamInclusionId || idsNaLista.has(h.teamInclusionId)) continue;
      linhas.push({ vaga: null, sugestao: null, tabela: null, honorario: visao(a, h), foraDaEscala: true });
    }
    naoArmazenar(res);
    res.json({
      evento,
      linhas,
      empreitas: meus.filter((h) => h.tipo === "empreita").map((h) => visao(a, h)),
      // Para escolher as vagas de uma empreita: todas as ativas (abertas ou escaladas), com onde estão hoje.
      vagasDoEvento: recebem.map((v) => {
        const e = emEmpreita.get(v.id);
        const p = porVaga.get(v.id);
        return {
          id: v.id, inclusionNumber: v.inclusionNumber, functionName: v.functionName,
          collaboratorName: v.empreitaEmpresa?.trim() || v.collaboratorName, semColaborador: !v.collaboratorId && !v.empreitaEmpresa?.trim(),
          scheduleStartDate: v.scheduleStartDate, scheduleEndDate: v.scheduleEndDate, dias: v.dias,
          empreita: e ? { id: e.honorarioId, nome: e.nome } : null,
          pedidoProprio: p ? { id: p.id, status: p.status, valorPedido: p.valorPedido } : null,
        };
      }),
      casa: casa.map((v) => ({ id: v.id, inclusionNumber: v.inclusionNumber, functionName: v.functionName, collaboratorName: v.collaboratorName })),
      funcoes: a.funcoesCeno.filter((f) => a.admin || a.pedeEm.has(f.id)),
    });
  });

  // Criar o pedido de uma vaga ou uma empreita (nasce como rascunho).
  app.post("/api/honorarios-ceno", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a)) return negar(res);
    const b = corpo(criarSchema, req, res);
    if (!b) return;
    const evento = await dados.getEvento(b.eventId);
    if (!evento || evento.status === "excluído") return res.status(404).json({ message: "Evento não encontrado." });

    if (b.tipoFreela != null && b.tipoFreela !== "" && (b.tipo === "empreita" || !ehTipoDoValor(b.tipoFreela))) {
      return res.status(400).json({ message: "Tipo de freela inválido." });
    }
    if (b.tipo === "vaga" && b.vagaIds !== undefined) return res.status(400).json({ message: "Só a empreita reúne vagas." });

    let base: { functionId: string | null; collaboratorId: string | null; nome: string; setor: string | null; posicao: string | null; inicio: string | null; fim: string | null; diarias: number | null; pessoas: number | null; tipoFreela: string | null; valorPedido: number };
    let extra: dados.PassoNaTransacao | undefined;
    let detalhe = "Pedido iniciado";
    if (b.tipo === "vaga") {
      if (!b.teamInclusionId) return res.status(400).json({ message: "Informe a vaga." });
      const vaga = await dados.getVagaAtiva(b.teamInclusionId, a.funcoesCeno.map((f) => f.id));
      if (!vaga || vaga.eventId !== b.eventId) return res.status(404).json({ message: "Vaga de cenotécnica ativa não encontrada neste evento." });
      if (!pedeNaLinha(a, vaga)) return negar(res, "Você não responde por esta função de cenotécnica.");
      if (!vagaRecebeHonorario(vaga)) return res.status(400).json({ message: "Colaborador da casa (funcionário) não recebe honorário." });
      const existente = await dados.getHonorarioDaVaga(vaga.id);
      if (existente) return res.status(409).json({ message: "Esta vaga já tem pedido de honorário.", atual: visao(a, (await dados.getHonorario(existente.id))!) });
      const empreita = (await dados.empreitasDasVagas([vaga.id])).get(vaga.id);
      if (empreita) return res.status(409).json({ message: `Esta vaga faz parte da empreita ${empreita.nome} — o valor dela é o da empreita.` });
      const tipo = b.tipoFreela || null;
      const c = camposDaVaga(vaga, tipo, await valoresPadrao(), b.valorPedido, { setor: b.setor || null, posicao: b.posicao || null });
      base = {
        functionId: vaga.functionId, collaboratorId: vaga.collaboratorId, nome: nomeDaVaga(vaga), pessoas: vaga.empreitaEmpresa ? vaga.empreitaPessoas : null,
        tipoFreela: tipo, ...c, valorPedido: c.valorPedido ?? 0,
      };
      if (tipo) detalhe = `Pedido iniciado · ${TIPO_DO_VALOR_LABEL[tipo as keyof typeof TIPO_DO_VALOR_LABEL]}${ehTipoDeTabela(tipo) ? " (tabela)" : ""}`;
      extra = (tx) => dados.garantirVagaForaDeEmpreita(tx, vaga.id);
    } else {
      const vagaIds = b.vagaIds ?? [];
      const conf = await conferirVagasDaEmpreita(a, b.eventId, vagaIds, null, [], !!b.descartarRascunhos);
      if (!conf.ok) return res.status(conf.status).json({ message: conf.message, precisaConfirmar: conf.precisaConfirmar });
      const periodo = periodoDaEmpreita(conf.vagas, evento);
      base = {
        functionId: null, collaboratorId: null, nome: (b.nome ?? "").trim(), setor: b.setor || "montagem", posicao: "empreita",
        inicio: b.inicio || periodo.inicio, fim: b.fim || periodo.fim, diarias: b.diarias ?? periodo.diarias,
        pessoas: b.pessoas ?? (conf.vagaIds.length || null), tipoFreela: null, valorPedido: b.valorPedido ?? 0,
      };
      detalhe = conf.vagaIds.length ? `Empreita adicionada com ${conf.vagaIds.length} ${conf.vagaIds.length === 1 ? "vaga" : "vagas"}` : "Empreita adicionada";
      if (conf.vagaIds.length || conf.descartar.length) extra = (tx, id) => dados.gravarVagasDaEmpreita(tx, id, conf.vagaIds, conf.descartar, ator(user));
    }
    const novo = {
      ...base,
      descricao: b.descricao?.trim() || null,
      observacao: b.observacao?.trim() || null,
    };
    const erro = validarDadosDoPedido({ tipo: b.tipo, ...novo });
    if (erro) return res.status(400).json({ message: erro });

    try {
      const criado = await dados.criarHonorario({
        eventId: b.eventId, tipo: b.tipo, teamInclusionId: b.tipo === "vaga" ? b.teamInclusionId! : null,
        ...novo, status: "rascunho", criadoPor: user.id, criadoPorNome: user.name ?? "Usuário",
      }, ator(user), { acao: "criado", valorNovo: novo.valorPedido || null, detalhe }, extra);
      await createAuditLog("create", "honorario_ceno", criado.id, resumoParaAuditoria(criado), user.id, user.name, undefined, req);
      res.status(201).json(visao(a, (await dados.getHonorario(criado.id))!));
    } catch (err) {
      const conflito = conflitoDaTransacao(err);
      if (conflito) return res.status(409).json({ message: b.tipo === "vaga" && !(err instanceof dados.ConflitoDoHonorario) ? "Esta vaga já tem pedido de honorário." : conflito });
      throw err;
    }
  });

  // Editar (rascunho ou devolvido).
  app.patch("/api/honorarios-ceno/:id", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a)) return negar(res);
    const atual = await dados.getHonorario(req.params.id);
    if (!atual) return res.status(404).json({ message: "Pedido não encontrado." });
    if (!pedeNaLinha(a, atual)) return negar(res, "Você não responde por esta função de cenotécnica.");
    const b = corpo(editarSchema, req, res);
    if (!b) return;
    if (!podeEditarHonorario(atual.status)) {
      return res.status(409).json({ message: `Este pedido está "${HONORARIO_STATUS_LABEL[atual.status as HonorarioStatus] ?? atual.status}" e não pode mais ser editado. Para mudar, o aprovador precisa devolver.`, atual: visao(a, atual) });
    }
    const parado = pedidoParado(atual);
    if (parado) return res.status(409).json({ message: parado, atual: visao(a, atual) });
    if (b.tipoFreela != null && b.tipoFreela !== "" && (atual.tipo === "empreita" || !ehTipoDoValor(b.tipoFreela))) {
      return res.status(400).json({ message: "Tipo de freela inválido." });
    }
    if (atual.tipo !== "empreita" && b.vagaIds !== undefined) return res.status(400).json({ message: "Só a empreita reúne vagas." });
    const set: Record<string, unknown> = {};
    // A vaga trocou de colaborador: qualquer gravação de quem pede (inclusive
    // a confirmação, um PATCH só com a versão) passa o pedido para quem está
    // hoje na vaga — e fica no histórico. Se a vaga ficou SEM ninguém, o
    // pedido volta a ser da vaga ("Vaga #N sem nome").
    const trocou = atual.avisoDaVaga === "colaborador_trocado";
    const nomeAtual = (atual.colaboradorAtual ?? "").trim() || nomeDaVagaSemColaborador(atual.inclusionNumber, atual.functionName);
    for (const k of ["nome", "pessoas", "descricao", "setor", "posicao", "inicio", "fim", "diarias", "valorPedido", "observacao", "tipoFreela"] as const) {
      if (b[k] === undefined) continue;
      if (k === "nome" && atual.tipo !== "empreita") continue; // nome da vaga é o do colaborador
      if (k === "posicao" && atual.tipo === "empreita") continue; // empreita é sempre empreita
      const v = b[k];
      set[k] = typeof v === "string" ? (v.trim() || null) : v;
    }
    if (set.nome === null) delete set.nome;
    if (trocou) { set.collaboratorId = atual.colaboradorAtualId; set.nome = nomeAtual; }

    // Vaga: período, diárias, posição e — no tipo de tabela — o valor saem da vaga de HOJE.
    let extra: dados.PassoNaTransacao | undefined;
    const tipoDepois = (set.tipoFreela !== undefined ? set.tipoFreela : atual.tipoFreela) as string | null;
    if (atual.tipo === "vaga" && atual.teamInclusionId && (set.tipoFreela !== undefined || ehTipoDeTabela(tipoDepois))) {
      const vaga = await dados.getVagaAtiva(atual.teamInclusionId, a.funcoesCeno.map((f) => f.id));
      if (vaga) {
        const c = camposDaVaga(vaga, tipoDepois, await valoresPadrao(), set.valorPedido as number | undefined, { setor: (set.setor as string | null | undefined) ?? atual.setor, posicao: (set.posicao as string | null | undefined) ?? atual.posicao });
        Object.assign(set, c);
      }
    }
    // Empreita: a lista de vagas (substitui), com a conferência das novas.
    let mudouVagas: { antes: number; depois: number } | null = null;
    if (atual.tipo === "empreita" && b.vagaIds !== undefined) {
      const ja = atual.vagasDaEmpreita.map((v) => v.id);
      const conf = await conferirVagasDaEmpreita(a, atual.eventId, b.vagaIds, atual.id, ja, !!b.descartarRascunhos);
      if (!conf.ok) return res.status(conf.status).json({ message: conf.message, precisaConfirmar: conf.precisaConfirmar, atual: visao(a, atual) });
      const iguais = conf.vagaIds.length === ja.length && conf.vagaIds.every((id) => ja.includes(id));
      if (!iguais) {
        mudouVagas = { antes: ja.length, depois: conf.vagaIds.length };
        extra = (tx, id) => dados.gravarVagasDaEmpreita(tx, id, conf.vagaIds, conf.descartar, ator(user));
        // Nº de pessoas e período acompanham as vagas, a não ser que venham na mesma gravação.
        const ficam = [...atual.vagasDaEmpreita.filter((v) => conf.vagaIds.includes(v.id)), ...conf.vagas];
        const evento = { startDate: atual.eventStartDate ?? "", endDate: atual.eventEndDate ?? "" };
        const p = periodoDaEmpreita(ficam, evento);
        if (b.pessoas === undefined && (atual.pessoas == null || atual.pessoas === ja.length)) set.pessoas = conf.vagaIds.length || null;
        if (b.inicio === undefined && p.inicio) set.inicio = p.inicio;
        if (b.fim === undefined && p.fim) set.fim = p.fim;
        if (b.diarias === undefined && p.diarias) set.diarias = p.diarias;
      }
    }
    const mesclado = { ...atual, ...set } as typeof atual;
    const erro = validarDadosDoPedido({ ...mesclado, tipo: atual.tipo as "vaga" | "empreita" });
    if (erro) return res.status(400).json({ message: erro });
    const mudouValor = set.valorPedido !== undefined && set.valorPedido !== atual.valorPedido;
    // Antes do primeiro envio é rascunho de trabalho: o histórico só registra a
    // renegociação (valor mudado depois de devolvido) e as vagas da empreita.
    const historico = [
      ...(trocou ? [{ acao: "colaborador_trocado", valorNovo: atual.valorPedido || null, detalhe: `Vaga trocou de colaborador: ${atual.nome} → ${nomeAtual}` }] : []),
      ...(mudouValor && atual.enviadoEm ? [{ acao: "editado", valorAnterior: atual.valorPedido, valorNovo: set.valorPedido as number, detalhe: "Valor renegociado" }] : []),
      ...(mudouVagas ? [{ acao: "vagas_da_empreita", detalhe: `Vagas da empreita: ${mudouVagas.antes} → ${mudouVagas.depois}` }] : []),
    ];
    let linha;
    try {
      linha = await dados.atualizarGuardado(atual.id, b.versao, ["rascunho", "devolvido"], set, ator(user), historico, extra);
    } catch (err) {
      const conflito = conflitoDaTransacao(err);
      if (conflito) return res.status(409).json({ message: conflito, atual: visao(a, atual) });
      throw err;
    }
    if (!linha) return responderCorrida(res, a, atual.id, "Este pedido mudou desde que você abriu.");
    if ((mudouValor && atual.enviadoEm) || trocou || mudouVagas) await createAuditLog("update", "honorario_ceno", linha.id, resumoParaAuditoria(linha), user.id, user.name, resumoParaAuditoria(atual), req);
    res.json(visao(a, (await dados.getHonorario(linha.id))!));
  });

  // Remover rascunho nunca enviado.
  app.delete("/api/honorarios-ceno/:id", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a)) return negar(res);
    const atual = await dados.getHonorario(req.params.id);
    if (!atual) return res.status(404).json({ message: "Pedido não encontrado." });
    if (!pedeNaLinha(a, atual)) return negar(res, "Você não responde por esta função de cenotécnica.");
    const b = corpo(versaoSchema, req, res);
    if (!b) return;
    if (!podeRemoverHonorario(atual.status, atual.enviadoEm)) {
      return res.status(409).json({ message: "Só um rascunho que ainda não foi enviado pode ser removido.", atual: visao(a, atual) });
    }
    const ok = await dados.removerRascunho(atual.id, b.versao);
    if (!ok) return responderCorrida(res, a, atual.id, "Este pedido mudou desde que você abriu.");
    await createAuditLog("delete", "honorario_ceno", atual.id, resumoParaAuditoria(atual), user.id, user.name, resumoParaAuditoria(atual), req);
    res.json({ ok: true });
  });

  // Enviar para aprovação (lote).
  app.post("/api/honorarios-ceno/enviar", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a)) return negar(res);
    const b = corpo(enviarSchema, req, res);
    if (!b) return;
    const linhas = await dados.listarHonorarios([dados.filtros.ids(b.itens.map((i) => i.id))]);
    const porId = new Map(linhas.map((h) => [h.id, h]));
    // 403 antes de tudo: um item de outra função recusa o lote inteiro.
    if (linhas.some((h) => !pedeNaLinha(a, h))) return negar(res, "Há pedido de uma função pela qual você não responde.");
    const enviados: string[] = [];
    const recusados: { id: string; nome: string; motivo: string }[] = [];
    const agora = new Date();
    const vp = await valoresPadrao();
    const fnsCeno = a.funcoesCeno.map((f) => f.id);
    for (const item of b.itens) {
      const h = porId.get(item.id);
      if (!h) { recusados.push({ id: item.id, nome: "—", motivo: "Pedido não encontrado." }); continue; }
      // Tipo de tabela: o valor que vai é o da tabela para os dias da vaga AGORA
      // (se o período mudou depois do rascunho, o envio já leva o certo).
      let doEnvio: { valorPedido?: number; diarias?: number | null; inicio?: string | null; fim?: string | null } = {};
      if (h.tipo === "vaga" && h.teamInclusionId && ehTipoDeTabela(h.tipoFreela) && podeEditarHonorario(h.status)) {
        const vaga = await dados.getVagaAtiva(h.teamInclusionId, fnsCeno);
        if (vaga) {
          const c = camposDaVaga(vaga, h.tipoFreela, vp, undefined, h);
          if (c.valorPedido !== h.valorPedido || c.diarias !== h.diarias) doEnvio = { valorPedido: c.valorPedido, diarias: c.diarias, inicio: c.inicio, fim: c.fim };
        }
      }
      const comEnvio = { ...h, ...doEnvio };
      const falta = faltaParaEnviar(comEnvio) ?? bloqueioDoEnvio(h);
      if (falta) { recusados.push({ id: h.id, nome: h.nome, motivo: falta }); continue; }
      const linha = await dados.atualizarGuardado(h.id, item.versao, ["rascunho", "devolvido"], {
        ...doEnvio, status: "aguardando", enviadoPor: user.id, enviadoPorNome: user.name ?? "Usuário", enviadoEm: agora,
      }, ator(user), {
        acao: "enviado", valorAnterior: doEnvio.valorPedido !== undefined ? h.valorPedido : null, valorNovo: comEnvio.valorPedido,
        detalhe: `${h.status === "devolvido" ? "Reenviado depois da negociação" : "Enviado para aprovação"}${doEnvio.valorPedido !== undefined ? ` · valor da tabela atualizado para ${comEnvio.diarias ?? "?"} dias` : ""}`,
      });
      if (!linha) { recusados.push({ id: h.id, nome: h.nome, motivo: "Mudou enquanto você enviava — recarregue." }); continue; }
      enviados.push(h.id);
      await createAuditLog("honorario_enviado", "honorario_ceno", h.id, resumoParaAuditoria(linha), user.id, user.name, resumoParaAuditoria(h), req);
    }
    if (enviados.length === 0) return res.status(409).json({ message: recusados[0]?.motivo ?? "Nada foi enviado.", enviados, recusados });
    res.json({ enviados, recusados });
  });

  // Aprovador: fila (pendentes) ou decididos.
  app.get("/api/honorarios-ceno/aprovacao", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podeAprovar(a)) return negar(res);
    const situacao = req.query.situacao === "decididos" ? "decididos" : "pendentes";
    const eventId = typeof req.query.eventId === "string" && req.query.eventId ? req.query.eventId : undefined;
    const f = [dados.filtros.status(situacao === "pendentes" ? ["aguardando"] : ["aprovado", "aprovado_ajuste", "devolvido"])];
    if (eventId) f.push(dados.filtros.doEvento(eventId));
    const linhas = await dados.listarHonorarios(f, situacao === "decididos" ? { ordem: "decidido", limite: 300 } : {});
    naoArmazenar(res);
    res.json(linhas.filter((h) => aprovaNaLinha(a, h)).map((h) => visao(a, h)));
  });

  // Decisões de um pedido.
  async function carregarParaDecidir(req: Request, res: Response) {
    const user = await usuarioDe(req, res);
    if (!user) return null;
    const a = await acessoDe(user);
    if (!podeAprovar(a)) { negar(res); return null; }
    const atual = await dados.getHonorario(req.params.id);
    if (!atual) { res.status(404).json({ message: "Pedido não encontrado." }); return null; }
    if (!aprovaNaLinha(a, atual)) { negar(res, "Apenas o aprovador da escala da cenotécnica, o aprovador padrão ou um administrador decide honorários."); return null; }
    return { user, a, atual };
  }

  async function aprovar(a: Acesso, user: User, atual: HonorarioComContexto, versao: number, req: Request) {
    const linha = await dados.atualizarGuardado(atual.id, versao, ["aguardando"], {
      status: "aprovado", valorAprovado: atual.valorPedido, decididoPor: user.id, decididoPorNome: user.name ?? "Usuário", decididoEm: new Date(), motivoDecisao: null,
    }, ator(user), { acao: "aprovado", valorNovo: atual.valorPedido });
    if (linha) await createAuditLog("approve", "honorario_ceno", linha.id, resumoParaAuditoria(linha), user.id, user.name, resumoParaAuditoria(atual), req);
    return linha;
  }

  async function devolver(a: Acesso, user: User, atual: HonorarioComContexto, versao: number, motivo: string, req: Request) {
    const linha = await dados.atualizarGuardado(atual.id, versao, ["aguardando", "aprovado", "aprovado_ajuste"], {
      status: "devolvido", valorAprovado: null, decididoPor: user.id, decididoPorNome: user.name ?? "Usuário", decididoEm: new Date(), motivoDecisao: motivo,
    }, ator(user), { acao: "devolvido", valorAnterior: atual.valorAprovado ?? atual.valorPedido, motivo, detalhe: ehAprovado(atual.status) ? "Aprovação desfeita — devolvido para negociar" : "Devolvido para negociar" });
    if (linha) await createAuditLog("return", "honorario_ceno", linha.id, resumoParaAuditoria(linha), user.id, user.name, resumoParaAuditoria(atual), req);
    return linha;
  }

  app.post("/api/honorarios-ceno/:id/aprovar", async (req, res) => {
    const c = await carregarParaDecidir(req, res);
    if (!c) return;
    const b = corpo(aprovarSchema, req, res);
    if (!b) return;
    if (!podeDecidirHonorario(c.atual.status)) return responderCorrida(res, c.a, c.atual.id, "Este pedido já foi decidido.");
    const linha = await aprovar(c.a, c.user, c.atual, b.versao, req);
    if (!linha) return responderCorrida(res, c.a, c.atual.id);
    res.json(visao(c.a, (await dados.getHonorario(linha.id))!));
  });

  app.post("/api/honorarios-ceno/:id/aprovar-com-ajuste", async (req, res) => {
    const c = await carregarParaDecidir(req, res);
    if (!c) return;
    const b = corpo(ajusteSchema, req, res);
    if (!b) return;
    const erro = validarAjuste(c.atual.valorPedido, b.valor, b.motivo);
    if (erro) return res.status(400).json({ message: erro });
    if (!podeDecidirHonorario(c.atual.status)) return responderCorrida(res, c.a, c.atual.id, "Este pedido já foi decidido.");
    const motivo = b.motivo.trim();
    const linha = await dados.atualizarGuardado(c.atual.id, b.versao, ["aguardando"], {
      status: "aprovado_ajuste", valorAprovado: b.valor, decididoPor: c.user.id, decididoPorNome: c.user.name ?? "Usuário", decididoEm: new Date(), motivoDecisao: motivo,
    }, ator(c.user), { acao: "aprovado_ajuste", valorAnterior: c.atual.valorPedido, valorNovo: b.valor, motivo });
    if (!linha) return responderCorrida(res, c.a, c.atual.id);
    await createAuditLog("aprovar_com_ajuste", "honorario_ceno", linha.id, resumoParaAuditoria(linha), c.user.id, c.user.name, resumoParaAuditoria(c.atual), req);
    res.json(visao(c.a, (await dados.getHonorario(linha.id))!));
  });

  app.post("/api/honorarios-ceno/:id/devolver", async (req, res) => {
    const c = await carregarParaDecidir(req, res);
    if (!c) return;
    const b = corpo(devolverSchema, req, res);
    if (!b) return;
    const erro = validarMotivo(b.motivo, "o que precisa ser renegociado");
    if (erro) return res.status(400).json({ message: erro });
    if (!podeDevolverHonorario(c.atual.status, c.atual.liberado)) {
      return res.status(409).json({
        message: c.atual.liberado > 0
          ? "Este pedido já tem verba liberada pelo Financeiro e não pode mais ser devolvido."
          : `Este pedido está "${HONORARIO_STATUS_LABEL[c.atual.status as HonorarioStatus] ?? c.atual.status}" e não pode ser devolvido.`,
        atual: visao(c.a, c.atual),
      });
    }
    const linha = await devolver(c.a, c.user, c.atual, b.versao, b.motivo.trim(), req);
    if (!linha) return responderCorrida(res, c.a, c.atual.id);
    res.json(visao(c.a, (await dados.getHonorario(linha.id))!));
  });

  // Aprovar ou devolver em lote (ajuste é sempre um por vez).
  app.post("/api/honorarios-ceno/decidir-lote", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podeAprovar(a)) return negar(res);
    const b = corpo(loteSchema, req, res);
    if (!b) return;
    if (b.acao === "devolver") {
      const erro = validarMotivo(b.motivo, "o que precisa ser renegociado");
      if (erro) return res.status(400).json({ message: erro });
    }
    const linhas = await dados.listarHonorarios([dados.filtros.ids(b.itens.map((i) => i.id))]);
    if (linhas.some((h) => !aprovaNaLinha(a, h))) return negar(res, "Há pedido de uma função que você não aprova.");
    const porId = new Map(linhas.map((h) => [h.id, h]));
    const feitos: string[] = [];
    const recusados: { id: string; nome: string; motivo: string }[] = [];
    for (const item of b.itens) {
      const h = porId.get(item.id);
      if (!h) { recusados.push({ id: item.id, nome: "—", motivo: "Pedido não encontrado." }); continue; }
      const pode = b.acao === "aprovar" ? podeDecidirHonorario(h.status) : podeDevolverHonorario(h.status, h.liberado);
      if (!pode) { recusados.push({ id: h.id, nome: h.nome, motivo: `Já está "${HONORARIO_STATUS_LABEL[h.status as HonorarioStatus] ?? h.status}".` }); continue; }
      const linha = b.acao === "aprovar" ? await aprovar(a, user, h, item.versao, req) : await devolver(a, user, h, item.versao, b.motivo!.trim(), req);
      if (!linha) { recusados.push({ id: h.id, nome: h.nome, motivo: "Mudou enquanto você decidia — recarregue." }); continue; }
      feitos.push(h.id);
    }
    if (feitos.length === 0) return res.status(409).json({ message: recusados[0]?.motivo ?? "Nada foi decidido.", feitos, recusados });
    res.json({ feitos, recusados });
  });

  // Financeiro: tudo que já foi enviado (aguardando, devolvido e aprovados), com as liberações.
  app.get("/api/honorarios-ceno/financeiro", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!a.financeiro) return negar(res, "Só o Financeiro (RH) e o administrador veem os honorários a liberar.");
    const eventId = typeof req.query.eventId === "string" && req.query.eventId ? req.query.eventId : undefined;
    const f = [dados.filtros.semRascunho()];
    if (eventId) f.push(dados.filtros.doEvento(eventId));
    const linhas = await dados.listarHonorarios(f);
    const libs = await dados.liberacoesDe(linhas.map((h) => h.id));
    const porHonorario = new Map<string, typeof libs>();
    for (const l of libs) porHonorario.set(l.honorarioId, [...(porHonorario.get(l.honorarioId) ?? []), l]);
    naoArmazenar(res);
    res.json(linhas.map((h) => ({ ...visao(a, h), liberacoes: porHonorario.get(h.id) ?? [] })));
  });

  // Financeiro registra a liberação (aceita parcial).
  app.post("/api/honorarios-ceno/:id/liberacoes", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!a.financeiro) return negar(res, "Só o Financeiro (RH) e o administrador liberam verba.");
    const atual = await dados.getHonorario(req.params.id);
    if (!atual) return res.status(404).json({ message: "Pedido não encontrado." });
    const b = corpo(liberarSchema, req, res);
    if (!b) return;
    if (!podeLiberarHonorario(atual.status)) {
      return res.status(409).json({ message: `Este pedido está "${HONORARIO_STATUS_LABEL[atual.status as HonorarioStatus] ?? atual.status}" — só se libera verba do que foi aprovado.`, atual: visao(a, atual) });
    }
    const falta = faltaLiberar(atual.valorAprovado, atual.liberado);
    const erro = validarLiberacao({ data: b.data, oc: b.oc, valor: b.valor }, falta);
    if (erro) return res.status(falta <= 0 ? 409 : 400).json({ message: erro, atual: visao(a, atual) });
    const aprovado = atual.valorAprovado ?? 0;
    const r = await dados.registrarLiberacao(atual.id, b.versao, { data: b.data, oc: b.oc.trim(), valor: b.valor, observacao: b.observacao?.trim() || null }, ator(user),
      (liberadoAgora) => faltaLiberar(aprovado, liberadoAgora),
      (depois) => `OC/DP ${b.oc.trim()} · ${brl(b.valor)} · ${depois >= aprovado ? "verba liberada por completo" : `liberação parcial — faltam ${brl(aprovado - depois)}`}`);
    if (!r) return responderCorrida(res, a, atual.id, "Este pedido mudou enquanto você registrava a liberação.");
    await createAuditLog("liberar_verba", "honorario_ceno", atual.id, { ...resumoParaAuditoria(r.honorario), oc: b.oc.trim(), valorLiberado: b.valor, data: b.data }, user.id, user.name, undefined, req);
    res.status(201).json(visao(a, (await dados.getHonorario(atual.id))!));
  });

  // Estornar uma liberação lançada errado (lógico — fica no histórico).
  app.post("/api/honorarios-ceno/:id/liberacoes/:liberacaoId/estornar", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!a.financeiro) return negar(res, "Só o Financeiro (RH) e o administrador mexem nas liberações.");
    const atual = await dados.getHonorario(req.params.id);
    if (!atual) return res.status(404).json({ message: "Pedido não encontrado." });
    const b = corpo(estornarSchema, req, res);
    if (!b) return;
    const erro = validarMotivo(b.motivo, "o motivo do estorno");
    if (erro) return res.status(400).json({ message: erro });
    const lib = await dados.getLiberacao(req.params.liberacaoId);
    if (!lib || lib.honorarioId !== atual.id) return res.status(404).json({ message: "Liberação não encontrada." });
    if (lib.estornadaEm) return res.status(409).json({ message: `Esta liberação já foi estornada${lib.estornadaPorNome ? ` por ${lib.estornadaPorNome}` : ""}.`, atual: visao(a, atual) });
    const linha = await dados.estornarLiberacao(atual.id, b.versao, lib.id, b.motivo.trim(), ator(user), `Estorno da OC/DP ${lib.oc} · ${brl(lib.valor)}`);
    if (!linha) return responderCorrida(res, a, atual.id, "Este pedido mudou enquanto você estornava.");
    await createAuditLog("estornar_liberacao", "honorario_ceno", atual.id, { ...resumoParaAuditoria(linha), oc: lib.oc, valorEstornado: lib.valor }, user.id, user.name, undefined, req);
    res.json(visao(a, (await dados.getHonorario(atual.id))!));
  });

  // Histórico + liberações de um pedido (quem vê a linha vê o histórico).
  app.get("/api/honorarios-ceno/:id/historico", async (req, res) => {
    const user = await usuarioDe(req, res);
    if (!user) return;
    const a = await acessoDe(user);
    if (!podePedir(a) && !podeAprovar(a) && !a.financeiro) return negar(res);
    const atual = await dados.getHonorario(req.params.id);
    if (!atual) return res.status(404).json({ message: "Pedido não encontrado." });
    if (!veLinha(a, atual)) return negar(res);
    const [historico, liberacoes] = await Promise.all([dados.historicoDe(atual.id), dados.liberacoesDe([atual.id])]);
    naoArmazenar(res);
    res.json({ honorario: visao(a, atual), historico, liberacoes });
  });

}
