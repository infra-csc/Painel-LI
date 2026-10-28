/**
 * Honorários, Fase 2 MANUAL (28/10) — o que as rotas internas
 * (server/routes/honorarios-pagamento.ts), o portal do colaborador
 * (server/routes/colaborador-portal.ts) e a presença (server/routes/presenca.ts)
 * usam em comum:
 *  - a carga das prestações de um evento com nota, contrato, isenção de NF e
 *    os nomes (a linha da tela "Ordens de compra" e o lote de OC);
 *  - o bloco "Nota fiscal e pagamento" do portal;
 *  - o ENVIO da NF com a OC (colaborador no portal ou produção/DP como
 *    representante): grava a MESMA `invoices` que a tela Notas fiscais lê.
 * Regras puras em shared/honorarios-pagamento.ts.
 */
import type { Request, Response } from "express";
import multer from "multer";
import { and, arrayContains, eq, inArray, isNotNull, isNull, like, ne, or, sql as drizzleSql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import {
  accommodations as accommodationsTable, budgetActual as budgetActualTable, collaborators as collaboratorsTable, invoices as invoicesTable,
  teamInclusions, tickets as ticketsTable,
  type BudgetActual, type Collaborator, type Event, type HistoricoNfEntrada, type Invoice, type User,
} from "@shared/schema";
import {
  ROTULO_DO_ESTADO_DO_PAGAMENTO, conferirNotaComOc, descricaoSugeridaDaNota, estadoDoPagamento, fraseDoPagamentoAoColaborador,
  notaProgramada, ocExigeJustificativa, podeDesfazerOc, podeDesfazerPago, podeEnviarNotaDaOc, podeMarcarPago, podeRegistrarOc,
  type ConferenciaDaNota, type EstadoDoPagamento, type PrestacaoDoLote,
} from "@shared/honorarios-pagamento";
import { SITUACAO_DO_CNPJ_LABEL, cpfDoCadastro, situacaoDoCnpjInformado, type SituacaoDoCnpjInformado } from "@shared/presenca";
import { nfIsentaPorEscalacao } from "@shared/prestacao-rules";
import { cnpjValido, digitosDoCnpj, mascararCnpj } from "@shared/cnpj";
import { hojeISO } from "@shared/hoje-sp";
import { pagamentoMascarado } from "@shared/pagamento";
import { contratosDosColaboradores, ehAnexoDeContrato, obterPagamento } from "./storage/contratos";
import { confirmacoesDasPrestacoes, ehFotoDePresenca } from "./storage/presenca";
import { decifrarPagamento, temContaOuPix } from "./pagamento-servico";
import { createAuditLog } from "./routes/_compartilhado";

// ── Leituras ────────────────────────────────────────────────────────────────

/** A nota (uma por prestação) de cada prestação. */
export async function notasDasPrestacoes(actualIds: readonly string[]): Promise<Map<string, Invoice>> {
  if (actualIds.length === 0) return new Map();
  const rows = await db.select().from(invoicesTable).where(inArray(invoicesTable.budgetActualId, [...actualIds]));
  return new Map(rows.filter((r) => r.budgetActualId).map((r) => [r.budgetActualId!, r]));
}

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const dia = (v: Date | string | null | undefined) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);

/** Tudo que a OC e o pagamento precisam de UMA prestação. */
export interface PrestacaoDoPagamentoMontada {
  actual: BudgetActual;
  colaborador: Collaborator | null;
  /** 28/10 (R7): divisão da vaga (o substituto) — o titular; null na prestação raiz. */
  divisao: { titularActualId: string; titularNome: string | null } | null;
  funcao: { id: string | null; nome: string | null; centroDeCusto: string | null };
  nota: Invoice | null;
  emiteNf: boolean;
  cnpj: { digitos: string | null; razaoSocial: string | null; origem: "checkout_final" | "confirmacao" | null; situacao: SituacaoDoCnpjInformado; contratoId: string | null };
}

/**
 * As prestações do evento que participaram, com nota, contrato do CNPJ
 * emissor, isenção de NF da escalação e função. `ids` restringe a um
 * subconjunto. 28/10 (R7): as divisões com colaborador próprio (o substituto
 * da "Dividir escalação") entram como prestações próprias.
 */
export async function montarDoEvento(eventId: string, ids?: readonly string[]): Promise<PrestacaoDoPagamentoMontada[]> {
  const filtros = [
    eq(budgetActualTable.eventId, eventId), eq(budgetActualTable.didNotAttend, false),
    or(isNull(budgetActualTable.splitParentId), isNotNull(budgetActualTable.collaboratorId))!,
  ];
  if (ids) {
    if (ids.length === 0) return [];
    filtros.push(inArray(budgetActualTable.id, [...ids]));
  }
  const actuals = await db.select().from(budgetActualTable).where(and(...filtros));
  return montar(actuals);
}

export async function montar(actuals: readonly BudgetActual[]): Promise<PrestacaoDoPagamentoMontada[]> {
  if (actuals.length === 0) return [];
  const ids = actuals.map((a) => a.id);
  // 28/10 (R7): o titular de cada divisão (para a linha dizer de quem é a vaga).
  const paiIds = Array.from(new Set(actuals.map((a) => a.splitParentId).filter((v): v is string => !!v)));
  const pais = paiIds.length
    ? await db.select({ id: budgetActualTable.id, collaboratorId: budgetActualTable.collaboratorId }).from(budgetActualTable).where(inArray(budgetActualTable.id, paiIds))
    : [];
  const titularDe = new Map(pais.map((p) => [p.id, p.collaboratorId]));
  const colabIds = Array.from(new Set([...actuals.map((a) => a.collaboratorId), ...pais.map((p) => p.collaboratorId)].filter((v): v is string => !!v)));
  const funcIds = Array.from(new Set(actuals.map((a) => a.functionId).filter((v): v is string => !!v)));
  const eventIds = Array.from(new Set(actuals.map((a) => a.eventId)));
  const [notas, colaboradores, funcoes, contratos, confirmacoes, vagas] = await Promise.all([
    notasDasPrestacoes(ids),
    colabIds.length ? db.select().from(collaboratorsTable).where(inArray(collaboratorsTable.id, colabIds)) : Promise.resolve([] as Collaborator[]),
    storage.getFunctionsByIds(funcIds),
    contratosDosColaboradores(colabIds),
    confirmacoesDasPrestacoes(ids),
    colabIds.length
      ? db.select().from(teamInclusions).where(and(inArray(teamInclusions.eventId, eventIds), inArray(teamInclusions.collaboratorId, colabIds), isNull(teamInclusions.deletedAt)))
      : Promise.resolve([]),
  ]);
  const colabPorId = new Map(colaboradores.map((c) => [c.id, c]));
  const funcaoPorId = new Map(funcoes.map((f) => [f.id, f]));
  const confirmacaoPor = new Map(confirmacoes.map((c) => [c.actualId, c]));
  const hoje = hojeISO();
  return actuals.map((a) => {
    const confirmacao = confirmacaoPor.get(a.id);
    const digitos = digitosDoCnpj(a.cnpjEmissor || confirmacao?.cnpj) || null;
    const origem = a.cnpjEmissor ? "checkout_final" as const : confirmacao?.cnpj ? "confirmacao" as const : null;
    const sit = situacaoDoCnpjInformado(digitos, a.collaboratorId ? contratos.get(a.collaboratorId) ?? [] : [], hoje);
    const f = a.functionId ? funcaoPorId.get(a.functionId) : undefined;
    const titularId = a.splitParentId ? titularDe.get(a.splitParentId) ?? null : null;
    return {
      actual: a,
      colaborador: a.collaboratorId ? colabPorId.get(a.collaboratorId) ?? null : null,
      divisao: a.splitParentId ? { titularActualId: a.splitParentId, titularNome: titularId ? colabPorId.get(titularId)?.fullName ?? null : null } : null,
      funcao: { id: a.functionId, nome: f?.name ?? null, centroDeCusto: f?.costCenter ?? null },
      nota: notas.get(a.id) ?? null,
      emiteNf: !nfIsentaPorEscalacao(vagas, a.collaboratorId, a.functionId, a.eventId),
      cnpj: {
        digitos, razaoSocial: a.cnpjEmissor ? a.razaoSocialEmissor : confirmacao?.razaoSocial ?? null, origem,
        situacao: sit.situacao, contratoId: sit.contratoId,
      },
    };
  });
}

/** Para o lote de OC (shared/honorarios-pagamento.ts → lerLoteDeOc). */
export function paraOLote(m: PrestacaoDoPagamentoMontada): PrestacaoDoLote {
  return {
    id: m.actual.id, colaboradorNumero: m.colaborador?.collaboratorNumber ?? null, colaboradorNome: m.colaborador?.fullName ?? null,
    cpf: m.colaborador ? cpfDoCadastro(m.colaborador) : null, totalValue: m.actual.totalValue,
    rhStatus: m.actual.rhStatus, splitParentId: m.actual.splitParentId, collaboratorId: m.actual.collaboratorId, didNotAttend: m.actual.didNotAttend, ocNumero: m.actual.ocNumero,
    pagoEm: m.actual.pagoEm, situacaoDoCnpj: m.cnpj.situacao, emiteNf: m.emiteNf,
  };
}

// ── A linha da tela "Ordens de compra" (e da conferência em Notas fiscais) ──

export interface LinhaDaOc {
  actualId: string;
  eventId: string;
  colaborador: { id: string; nome: string; numero: number } | null;
  /** 28/10 (R7): divisão da vaga (o substituto é pago como prestação própria) — o titular. */
  divisao: { titularActualId: string; titularNome: string | null } | null;
  funcao: { id: string | null; nome: string | null; centroDeCusto: string | null };
  valorAprovado: number;
  rhActionAt: string | null;
  emiteNf: boolean;
  cnpjEmissor: { cnpj: string | null; razaoSocial: string | null; origem: string | null; situacao: SituacaoDoCnpjInformado; rotulo: string; contratoId: string | null };
  oc: {
    numero: string; valor: number | null; data: string | null; registradaEm: string | null;
    registradaPor: { id: string; nome: string | null } | null; origem: string | null; justificativa: string | null;
  } | null;
  nota: {
    id: string; status: string; oc: string | null; numero: string | null; valor: number | null; cnpj: string | null;
    arquivoNome: string | null; arquivoUrl: string | null; comentarioDoDp: string | null;
    enviadaEm: string | null; paymentDate: string | null; lancadaNoM4Em: string | null;
  } | null;
  conferencia: ConferenciaDaNota | null;
  programadoPara: string | null;
  pagamento: {
    pagoEm: string; registradoPor: { id: string; nome: string | null } | null; registradoEm: string | null;
    observacao: string | null; comprovanteId: string | null; comprovanteUrl: string | null;
  } | null;
  estado: EstadoDoPagamento;
  rotuloDoEstado: string;
  acoes: {
    registrarOc: boolean; exigeJustificativa: boolean; desfazerOc: boolean; marcarPago: boolean; desfazerPago: boolean;
    motivoSemOc: string | null;
  };
}

export async function linhasDaOc(montadas: readonly PrestacaoDoPagamentoMontada[]): Promise<LinhaDaOc[]> {
  const userIds = Array.from(new Set(montadas.flatMap((m) => [m.actual.ocRegistradaPor, m.actual.pagoRegistradoPor]).filter((v): v is string => !!v)));
  const usuarios: User[] = userIds.length ? await storage.getUsersByIds(userIds) : [];
  const nomeDe = new Map(usuarios.map((u) => [u.id, u.name || u.email]));
  const pessoa = (id: string | null | undefined) => (id ? { id, nome: nomeDe.get(id) ?? null } : null);
  return montadas.map((m) => {
    const a = m.actual;
    const n = m.nota;
    const estado = estadoDoPagamento({ ocNumero: a.ocNumero, pagoEm: a.pagoEm, nota: n });
    const registrar = podeRegistrarOc(a);
    const motivoSemOc = !registrar.ok ? registrar.motivo : !m.emiteNf ? "Não emite NF (marcado na escalação) — não tem OC." : null;
    return {
      actualId: a.id,
      eventId: a.eventId,
      colaborador: m.colaborador ? { id: m.colaborador.id, nome: m.colaborador.fullName, numero: m.colaborador.collaboratorNumber } : null,
      divisao: m.divisao,
      funcao: m.funcao,
      valorAprovado: a.totalValue,
      rhActionAt: iso(a.rhActionAt),
      emiteNf: m.emiteNf,
      cnpjEmissor: {
        cnpj: m.cnpj.digitos ? mascararCnpj(m.cnpj.digitos) : null, razaoSocial: m.cnpj.razaoSocial, origem: m.cnpj.origem,
        situacao: m.cnpj.situacao, rotulo: SITUACAO_DO_CNPJ_LABEL[m.cnpj.situacao], contratoId: m.cnpj.contratoId,
      },
      oc: a.ocNumero ? {
        numero: a.ocNumero, valor: a.ocValor, data: dia(a.ocData), registradaEm: iso(a.ocRegistradaEm),
        registradaPor: pessoa(a.ocRegistradaPor), origem: a.ocOrigem, justificativa: a.ocJustificativa,
      } : null,
      nota: n ? {
        id: n.id, status: n.status, oc: n.oc, numero: n.nfNumero, valor: n.nfValor, cnpj: n.nfCnpj ? mascararCnpj(n.nfCnpj) : null,
        arquivoNome: n.attachmentName, arquivoUrl: n.attachmentUrl, comentarioDoDp: n.returnComment,
        enviadaEm: iso(n.createdAt), paymentDate: dia(n.paymentDate), lancadaNoM4Em: iso(n.checkinAt),
      } : null,
      conferencia: n ? conferirNotaComOc({ ocNumero: a.ocNumero, ocValor: a.ocValor, cnpjEmissor: m.cnpj.digitos }, { oc: n.oc, nfValor: n.nfValor, nfCnpj: n.nfCnpj }) : null,
      programadoPara: notaProgramada(n) ? dia(n!.paymentDate) : null,
      pagamento: a.pagoEm ? {
        pagoEm: dia(a.pagoEm)!, registradoPor: pessoa(a.pagoRegistradoPor), registradoEm: iso(a.pagoRegistradoEm),
        observacao: a.pagamentoObs, comprovanteId: a.pagamentoComprovanteId,
        comprovanteUrl: a.pagamentoComprovanteId ? `/api/attachments/${a.pagamentoComprovanteId}/view` : null,
      } : null,
      estado,
      rotuloDoEstado: !m.emiteNf && estado === "sem_oc" ? "Não emite NF" : ROTULO_DO_ESTADO_DO_PAGAMENTO[estado],
      acoes: {
        registrarOc: registrar.ok && m.emiteNf,
        exigeJustificativa: ocExigeJustificativa(m.cnpj.situacao),
        desfazerOc: podeDesfazerOc(a, n).ok,
        marcarPago: podeMarcarPago(a, n).ok,
        desfazerPago: podeDesfazerPago(a).ok,
        motivoSemOc,
      },
    };
  });
}

// ── Portal: o bloco "Nota fiscal e pagamento" ───────────────────────────────

export interface ContaDoPortal {
  cadastrada: boolean;
  /** Mascarada (banco, agência e conta com os últimos dígitos; PIX mascarado). */
  mascarada: Record<string, string | null> | null;
  /** Sem conta nem PIX gravados: o colaborador informa no envio da NF. */
  podeInformar: boolean;
}

/** A conta do colaborador como o portal mostra (nunca em claro). */
export async function contaDoPortal(collaboratorId: string): Promise<ContaDoPortal> {
  const gravado = await obterPagamento(collaboratorId);
  if (!temContaOuPix(gravado)) return { cadastrada: false, mascarada: null, podeInformar: true };
  const { dados } = decifrarPagamento(gravado, collaboratorId);
  const m = pagamentoMascarado(dados);
  return { cadastrada: true, mascarada: { banco: m.banco, agencia: m.agencia, conta: m.conta, tipoConta: m.tipoConta, pixTipo: m.pixTipo, pixChave: m.pixChave, titular: m.titular }, podeInformar: false };
}

export function blocoDoPortal(a: BudgetActual, evento: Event, nota: Invoice | null, funcao: string | null, conta: ContaDoPortal, inicio: string | null, fim: string | null) {
  const estado = estadoDoPagamento({ ocNumero: a.ocNumero, pagoEm: a.pagoEm, nota });
  const programadoPara = notaProgramada(nota) ? dia(nota!.paymentDate) : null;
  const enviar = podeEnviarNotaDaOc(a, nota);
  return {
    estado,
    rotulo: ROTULO_DO_ESTADO_DO_PAGAMENTO[estado],
    frase: fraseDoPagamentoAoColaborador(estado, { programadoPara, pagoEm: a.pagoEm }),
    oc: a.ocNumero ? { numero: a.ocNumero, valor: a.ocValor, data: dia(a.ocData) } : null,
    nota: nota ? {
      status: nota.status, enviadaEm: iso(nota.createdAt), atualizadaEm: iso(nota.updatedAt), arquivoNome: nota.attachmentName,
      temArquivo: !!nota.attachmentUrl, numero: nota.nfNumero, valor: nota.nfValor,
      // O comentário do DP só quando ele devolve ou recusa (é o que o colaborador corrige).
      comentarioDoDp: nota.status === "devolvida" || nota.status === "recusada" ? nota.returnComment : null,
    } : null,
    programadoPara,
    pagoEm: dia(a.pagoEm),
    podeEnviarNf: enviar.ok,
    motivoNaoPodeEnviar: enviar.ok ? null : enviar.motivo,
    // O que deve constar na nota (só com OC).
    instrucoes: a.ocNumero ? {
      tomador: { nome: evento.paymentCompanyName ?? null, cnpj: evento.paymentCompanyCnpj ? mascararCnpj(evento.paymentCompanyCnpj) : null },
      valor: a.ocValor ?? a.totalValue,
      oc: a.ocNumero,
      descricaoSugerida: descricaoSugeridaDaNota({ funcao, evento: evento.name, inicio, fim, ocNumero: a.ocNumero }),
    } : null,
    contaBancaria: conta,
  };
}

// ── Envio da NF com a OC (portal e representante) ──────────────────────────

export const TAMANHO_MAXIMO_DA_NOTA = 10 * 1024 * 1024;
const TIPOS_DA_NOTA = new Set(["application/pdf", "image/jpeg", "image/png"]);

const uploadDaNota = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_DA_NOTA, files: 1, fields: 30 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_DA_NOTA.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error("tipo"), { codigoDaNota: "tipo" }));
  },
});

/** Lê o multipart do envio da NF (campo `arquivo`). Responde o erro e devolve false. */
export function receberArquivoDaNota(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    uploadDaNota.single("arquivo")(req, res, (err: unknown) => {
      if (!err) return resolve(true);
      const e = err as { code?: string; codigoDaNota?: string };
      if (e.code === "LIMIT_FILE_SIZE") res.status(413).json({ message: "O arquivo da nota passa de 10 MB." });
      else if (e.codigoDaNota === "tipo") res.status(415).json({ message: "A nota tem que ser PDF (ou foto JPG/PNG)." });
      else res.status(400).json({ message: "Não consegui ler o envio da nota." });
      resolve(false);
    });
  });
}

/** Campos do formulário da NF (multipart: tudo chega como texto). */
export interface CamposDaNota { numeroNota: string | null; valorNota: number; cnpjNota: string | null }

/** Valida os campos da nota do corpo multipart. */
export function lerCamposDaNota(body: Record<string, unknown> | undefined): { campos: CamposDaNota } | { erro: string; campo: string } {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const numeroNota = texto(body?.numeroNota).slice(0, 40) || null;
  const valorBruto = texto(body?.valorNota);
  const valorNota = /^\d{1,10}$/.test(valorBruto) ? Number(valorBruto) : NaN;
  if (!Number.isInteger(valorNota) || valorNota <= 0 || valorNota > 1_000_000_000) {
    return { erro: "Informe o valor da nota (em centavos, maior que zero).", campo: "valorNota" };
  }
  const cnpjBruto = texto(body?.cnpjNota);
  if (cnpjBruto && !cnpjValido(cnpjBruto)) return { erro: "CNPJ da nota inválido — confira os 14 dígitos.", campo: "cnpjNota" };
  return { campos: { numeroNota, valorNota, cnpjNota: cnpjBruto ? digitosDoCnpj(cnpjBruto) : null } };
}

const anexarAoHistorico = (evento: Record<string, unknown>) => {
  const entrada: HistoricoNfEntrada[] = [{ ...evento, type: String(evento.type), at: new Date().toISOString() }];
  return drizzleSql`COALESCE(${invoicesTable.history}, '[]'::jsonb) || ${JSON.stringify(entrada)}::jsonb`;
};

/**
 * Grava a NF da prestação (etapa 5): sobe o arquivo (allowlist por magic
 * number: PDF, JPG, PNG), cria a nota "enviada" com a OC REGISTRADA — ou
 * reenvia a devolvida (limpa o comentário do DP). Responde o erro e devolve
 * null; devolve a nota gravada no sucesso.
 */
export async function enviarNotaDaPrestacao(a: {
  req: Request; res: Response; actual: BudgetActual; nota: Invoice | null; campos: CamposDaNota;
  /** Usuário interno (representante) ou null (o próprio colaborador, no portal). */
  ator: User | null; nomeDoAtor: string;
}): Promise<Invoice | null> {
  const { req, res, actual, campos, ator, nomeDoAtor } = a;
  const permissao = podeEnviarNotaDaOc(actual, a.nota);
  if (!permissao.ok) { res.status(409).json({ message: permissao.motivo, codigo: permissao.codigo }); return null; }
  if (!actual.collaboratorId || !actual.functionId) { res.status(409).json({ message: "Prestação sem colaborador ou função." }); return null; }
  const arquivo = req.file;
  if (!arquivo) { res.status(400).json({ message: "Anexe a nota fiscal (PDF ou foto).", campo: "arquivo" }); return null; }
  const { tipoPermitidoDoArquivo, sanitizarNomeDeArquivo } = await import("./objectAcl");
  const tipo = tipoPermitidoDoArquivo(arquivo.buffer, arquivo.mimetype, arquivo.originalname);
  if (!tipo || !TIPOS_DA_NOTA.has(tipo.contentType)) { res.status(415).json({ message: "A nota tem que ser PDF (ou foto JPG/PNG)." }); return null; }
  const { ObjectStorageService, novoIdDeAnexo } = await import("./objectStorage");
  const anexoId = novoIdDeAnexo();
  const nome = sanitizarNomeDeArquivo(arquivo.originalname || "nota-fiscal", tipo);
  await new ObjectStorageService().enviarAnexo(anexoId, arquivo.buffer, tipo.contentType, {
    ownerId: ator ? ator.id : `colaborador:${actual.collaboratorId}`, nomeOriginal: nome,
  });
  const cnpjNota = campos.cnpjNota ?? (digitosDoCnpj(actual.cnpjEmissor) || null);
  const valores = {
    oc: actual.ocNumero, attachmentUrl: `/api/attachments/${anexoId}/view`, attachmentName: nome,
    nfNumero: campos.numeroNota, nfValor: campos.valorNota, nfCnpj: cnpjNota,
  };
  const por = ator ? "representante" : "colaborador";
  let gravada: Invoice | undefined;
  if (!a.nota) {
    try {
      [gravada] = await db.insert(invoicesTable).values({
        eventId: actual.eventId, collaboratorId: actual.collaboratorId, functionId: actual.functionId, budgetActualId: actual.id,
        ...valores, status: "enviada",
        history: [{ type: "enviado", oc: actual.ocNumero, attachmentName: nome, por, at: new Date().toISOString() }],
      }).returning();
    } catch (error) {
      if ((error as { code?: unknown })?.code === "23505") { res.status(409).json({ message: "A nota desta prestação acabou de ser enviada — recarregue.", codigo: "nf_em_analise" }); return null; }
      throw error;
    }
  } else {
    // Reenvio da devolvida (ou da "pendente" antiga): guardado pelo status — dois envios não se atropelam.
    [gravada] = await db.update(invoicesTable).set({
      ...valores, status: "enviada", returnComment: null, updatedAt: new Date(),
      history: anexarAoHistorico({ type: "reenviado", oc: actual.ocNumero, attachmentName: nome, por }),
    }).where(and(eq(invoicesTable.id, a.nota.id), or(eq(invoicesTable.status, "devolvida"), eq(invoicesTable.status, "pendente")))).returning();
    if (!gravada) { res.status(409).json({ message: "A nota mudou de situação — recarregue.", codigo: "nf_status" }); return null; }
  }
  await createAuditLog(a.nota ? "update" : "create", "invoice", gravada.id, {
    acao: a.nota ? `NF reenviada (${por === "colaborador" ? "portal do colaborador" : "representante"})` : `NF enviada (${por === "colaborador" ? "portal do colaborador" : "representante"})`,
    prestacao: actual.id, oc: actual.ocNumero, nfNumero: campos.numeroNota, nfValor: campos.valorNota,
    nfCnpj: cnpjNota ? mascararCnpj(cnpjNota) : null, arquivo: nome,
  }, ator?.id, nomeDoAtor, a.nota ? { status: a.nota.status, arquivo: a.nota.attachmentName } : undefined, req);
  return gravada;
}

// ── Portal: o arquivo da nota (28/10, S9) ───────────────────────────────────

/** Quem, por dentro, envia a nota de uma prestação (representante ou lançamento do DP). */
const PAPEIS_QUE_ENVIAM_A_NOTA: readonly CanonicalRole[] = ["admin", "financial", "production"];
const RE_ANEXO_DA_NOTA = /^\/api\/attachments\/(ATT-[A-Z0-9-]{4,60})\/(view|download)$/;

/**
 * O anexo da nota que o PORTAL pode entregar ao colaborador — ou null (404).
 * 28/10 (S9): antes saía qualquer `ATT-…` que estivesse na nota. Agora só o
 * que ELE enviou (dono `colaborador:<id>`) ou o que o DP/produção enviou para
 * AQUELA prestação (dono interno com esse papel, arquivo de nenhuma outra
 * nota); nunca outra classe — selfie, contrato, documento de colaborador,
 * passagem/hospedagem.
 */
export async function anexoDaNotaParaOColaborador(nota: Invoice | null, actualId: string, collaboratorId: string): Promise<string | null> {
  const id = nota?.attachmentUrl?.match(RE_ANEXO_DA_NOTA)?.[1];
  if (!id) return null;
  const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
  const servico = new ObjectStorageService();
  let dono: string | null;
  try {
    const meta = await servico.metadadosDoAnexo(servico.arquivoDoAnexo(id));
    if (meta.classe) return null;
    dono = meta.ownerId;
  } catch (erro) {
    if (erro instanceof ObjectNotFoundError) return null;
    throw erro;
  }
  if (!dono || (dono.startsWith("colaborador:") && dono !== `colaborador:${collaboratorId}`)) return null;
  const [deContrato, deSelfie, deOutraClasse, deOutraNota] = await Promise.all([
    ehAnexoDeContrato(id),
    ehFotoDePresenca(id),
    db.select({ id: collaboratorsTable.id }).from(collaboratorsTable).where(eq(collaboratorsTable.documentAttachmentId, id)).limit(1)
      .then(async (doc) => doc.length > 0
        || (await db.select({ id: ticketsTable.id }).from(ticketsTable).where(arrayContains(ticketsTable.attachmentIds, [id])).limit(1)).length > 0
        || (await db.select({ id: accommodationsTable.id }).from(accommodationsTable).where(arrayContains(accommodationsTable.attachmentIds, [id])).limit(1)).length > 0),
    db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(and(like(invoicesTable.attachmentUrl, `/api/attachments/${id}/%`), or(isNull(invoicesTable.budgetActualId), ne(invoicesTable.budgetActualId, actualId))))
      .limit(1).then((l) => l.length > 0),
  ]);
  if (deContrato || deSelfie || deOutraClasse || deOutraNota) return null;
  if (dono === `colaborador:${collaboratorId}`) return id;
  const [quem] = await storage.getUsersByIds([dono]);
  const papel = quem ? normalizeRole(quem.role) : null;
  return papel && PAPEIS_QUE_ENVIAM_A_NOTA.includes(papel) ? id : null;
}

/** Nota da prestação (a única). */
export async function notaDaPrestacao(actualId: string): Promise<Invoice | null> {
  const [n] = await db.select().from(invoicesTable).where(eq(invoicesTable.budgetActualId, actualId)).limit(1);
  return n ?? null;
}
