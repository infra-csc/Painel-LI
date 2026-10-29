/**
 * Presença no evento — o que as duas pontas usam (27/10, Fase 1 do Módulo de
 * Honorários): o portal do colaborador (server/routes/colaborador-portal.ts)
 * e a tela interna da produção/DP (server/routes/presenca.ts).
 *
 *  - configurações (system_settings com o padrão provisório de shared/presenca.ts);
 *  - "prestação do fluxo novo": budget_actual raiz (sem divisão), não marcada
 *    como "não participou", de evento que termina a partir da data de corte;
 *  - montagem das prestações (dias pela mesma regra do Realizado, presenças,
 *    ocorrências, confirmação, recálculo, dias pendentes);
 *  - registro de entrada/saída (selfie no Object Storage, localização, hora
 *    do SERVIDOR) — o mesmo caminho para o colaborador e o representante;
 *  - confirmação final (colaborador ou representante).
 */
import type { Request, Response } from "express";
import multer from "multer";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  presencas, presencaConfirmacoes, teamInclusions, functionManagers, functions as functionsTable,
  type BudgetActual, type Collaborator, type Event, type Presenca, type PresencaConfirmacao, type PresencaOcorrencia, type TeamInclusion, type User,
} from "@shared/schema";
import {
  diaEmBrasilia, diaValido, diasPendentes, estadoDoDia, inclusaoDaPrestacao, lerConfiguracaoDaPresenca, periodoDaPrestacao,
  podeConfirmarPrestacao, podeRegistrarEntrada, podeRegistrarSaida, realizadoParaCalculo, recalcularValor, situacaoDoCnpjInformado,
  type CalculoDaPresenca, type RealizadoParaCalculo, type ConfiguracaoDaPresenca, type EstadoDoDia, type FonteDosDias, type QuemConfirma, type QuemRegistra,
} from "@shared/presenca";
import { ehEventoLegado } from "@shared/legado-honorarios";
import { deflationFactorsFromSettings, isPercursoFunction, type DeflationFactors } from "@shared/calculation-rules";
import { isCenotecnicaFunction } from "@shared/alimentacao";
import { usaEmpreitaCenotecnica, vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { prestacaoEstaTravada } from "@shared/prestacao-rules";
import { digitosDoCnpj } from "@shared/cnpj";
import { hojeISO } from "@shared/hoje-sp";
import { lerDataDeCorteDoBanco } from "./routes/honorarios-fluxo";
import { nfIsentaPorEscalacao } from "@shared/prestacao-rules";
import { prazoDaPrestacao, type PrazoDaPrestacao, type PrazosDosHonorarios } from "@shared/prazos-honorarios";
import type { Invoice } from "@shared/schema";
import { confirmacoesDasPrestacoes, ocorrenciasDasPrestacoes, presencasDasPrestacoes } from "./storage/presenca";
import { contratosDosColaboradores } from "./storage/contratos";
import { createAuditLog } from "./routes/_compartilhado";

// ── Configurações ───────────────────────────────────────────────────────────

export async function lerConfiguracaoDoBanco(): Promise<ConfiguracaoDaPresenca> {
  return lerConfiguracaoDaPresenca(await storage.getSystemSettings());
}

// ── Fluxo novo ──────────────────────────────────────────────────────────────

/** Prestação que entra na presença: raiz, participou, evento do fluxo novo (não cancelado). */
export function prestacaoDoFluxoNovo(actual: BudgetActual, evento: Pick<Event, "endDate" | "status"> | null | undefined, dataDeCorte: string): boolean {
  if (!evento || actual.splitParentId || actual.didNotAttend) return false;
  if (evento.status === "cancelado") return false;
  return !ehEventoLegado(evento.endDate, dataDeCorte);
}

// ── Montagem ────────────────────────────────────────────────────────────────

export interface PrestacaoMontada {
  actual: BudgetActual;
  evento: Event;
  colaborador: Collaborator | null;
  funcaoNome: string | null;
  inclusao: TeamInclusion | null;
  /** O Realizado do recálculo: a base do 1º check-out final, se houver (28/10, R2). */
  realizado: RealizadoParaCalculo;
  dias: string[];
  fonteDosDias: FonteDosDias;
  presencaPorDia: Map<string, Presenca>;
  ocorrencias: PresencaOcorrencia[];
  confirmacao: PresencaConfirmacao | null;
  calculo: CalculoDaPresenca;
  pendentes: string[];
  checkoutFinalFeito: boolean;
  /** Fatores da deflação do recálculo (null = valor fechado por dia: percurso/empreita) — 29/10, dobra na base. */
  fatores: DeflationFactors | null;
}

/**
 * Junta tudo o que a presença precisa de cada prestação, em poucas idas ao
 * banco (eventos, funções, vagas, colaboradores, presenças, ocorrências e
 * confirmações em lote).
 */
export async function montarPrestacoes(actuals: readonly BudgetActual[], config: ConfiguracaoDaPresenca): Promise<PrestacaoMontada[]> {
  if (actuals.length === 0) return [];
  const ids = actuals.map((a) => a.id);
  const eventIds = Array.from(new Set(actuals.map((a) => a.eventId)));
  const colabIds = Array.from(new Set(actuals.map((a) => a.collaboratorId).filter((v): v is string => !!v)));
  const funcIds = Array.from(new Set(actuals.map((a) => a.functionId).filter((v): v is string => !!v)));
  const [eventos, funcoes, colaboradores, vagas, todasPresencas, ocorrencias, confirmacoes, settings] = await Promise.all([
    storage.getEventsByIds(eventIds),
    storage.getFunctionsByIds(funcIds),
    colabIds.length ? Promise.all(colabIds.map((id) => storage.getCollaborator(id))) : Promise.resolve([]),
    colabIds.length
      ? db.select().from(teamInclusions).where(and(inArray(teamInclusions.eventId, eventIds), inArray(teamInclusions.collaboratorId, colabIds), isNull(teamInclusions.deletedAt)))
      : Promise.resolve([] as TeamInclusion[]),
    presencasDasPrestacoes(ids),
    ocorrenciasDasPrestacoes(ids),
    confirmacoesDasPrestacoes(ids),
    storage.getSystemSettings(),
  ]);
  // Deflação do Valores Padrão — a regra do dia é a do Planejado (28/10, R3).
  const fatoresDoPadrao = deflationFactorsFromSettings(Object.fromEntries(settings.map((x) => [x.key, x.value])));
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const funcaoPorId = new Map(funcoes.map((f) => [f.id, f.name]));
  const colabPorId = new Map(colaboradores.filter((c): c is Collaborator => !!c).map((c) => [c.id, c]));
  const confirmacaoPorActual = new Map(confirmacoes.map((c) => [c.actualId, c]));

  const montadas: PrestacaoMontada[] = [];
  for (const actual of actuals) {
    const evento = eventoPorId.get(actual.eventId);
    if (!evento) continue;
    const inclusao = inclusaoDaPrestacao(actual, vagas) ?? null;
    // 28/10 (revisão R2): depois do 1º check-out final o recálculo (e os dias)
    // partem da BASE gravada — o Realizado de agora já tem as horas extras e o ajuste.
    const realizado = realizadoParaCalculo(actual);
    const periodo = periodoDaPrestacao(realizado, inclusao, evento);
    const presencasDela = todasPresencas.filter((p) => p.actualId === actual.id);
    const presencaPorDia = new Map(presencasDela.map((p) => [String(p.dia).slice(0, 10), p]));
    const ocorrenciasDela = ocorrencias.filter((o) => o.actualId === actual.id);
    const funcaoNome = actual.functionId ? funcaoPorId.get(actual.functionId) ?? null : null;
    // Valor fechado por dia (percurso, empreita): sem deflação, como no Planejado.
    const valorFlatPorDia = isPercursoFunction(funcaoNome) || vagaComEmpreita(inclusao)
      || usaEmpreitaCenotecnica(isCenotecnicaFunction(funcaoNome), actual.collaboratorType);
    const fatores = valorFlatPorDia ? null : fatoresDoPadrao;
    const calculo = recalcularValor({
      realizado,
      dias: periodo.dias,
      ocorrencias: ocorrenciasDela.map((o) => ({ tipo: o.tipo, dia: o.dia ? String(o.dia).slice(0, 10) : null, horas: o.horas })),
      divisorHoraExtra: config.horaExtraDivisor,
      horaExtraMaxDia: config.horaExtraMaxDia,
      fatores,
      nomeDaFuncao: funcaoNome,
    });
    const pendentes = diasPendentes({
      dias: periodo.dias,
      presencas: presencasDela.map((p) => ({ dia: String(p.dia).slice(0, 10), checkinEm: p.checkinEm, checkoutEm: p.checkoutEm })),
      ocorrencias: ocorrenciasDela.map((o) => ({ tipo: o.tipo, dia: o.dia ? String(o.dia).slice(0, 10) : null })),
    });
    montadas.push({
      actual, evento, colaborador: actual.collaboratorId ? colabPorId.get(actual.collaboratorId) ?? null : null,
      funcaoNome, inclusao, realizado, dias: periodo.dias, fonteDosDias: periodo.fonte, presencaPorDia,
      ocorrencias: ocorrenciasDela, confirmacao: confirmacaoPorActual.get(actual.id) ?? null,
      calculo, pendentes, checkoutFinalFeito: !!actual.checkoutFinalEm, fatores,
    });
  }
  return montadas;
}

/** Uma prestação montada (ou null se a prestação/evento não existir). */
export async function montarPrestacao(actualId: string, config: ConfiguracaoDaPresenca): Promise<PrestacaoMontada | null> {
  const actual = await storage.getBudgetActualById(actualId);
  if (!actual) return null;
  const [m] = await montarPrestacoes([actual], config);
  return m ?? null;
}

/** Estado de cada dia (para as duas telas). */
export function estadosDosDias(m: PrestacaoMontada, hoje: string): { dia: string; estado: EstadoDoDia }[] {
  const ocorrencias = m.ocorrencias.map((o) => ({ tipo: o.tipo, dia: o.dia ? String(o.dia).slice(0, 10) : null }));
  return m.dias.map((dia) => ({ dia, estado: estadoDoDia({ dia, hoje, presenca: m.presencaPorDia.get(dia), ocorrencias }) }));
}

/**
 * O prazo da etapa atual da prestação (28/10, Fase 3) — a MESMA regra do
 * Painel de honorários (shared/prazos-honorarios): último dia pelos dias da
 * presença, confirmação, Realizado, OC e a nota.
 */
export function prazoDaMontada(m: PrestacaoMontada, prazos: PrazosDosHonorarios, hoje: string, nota: Invoice | null): PrazoDaPrestacao {
  const emiteNf = !nfIsentaPorEscalacao(m.inclusao ? [m.inclusao] : [], m.actual.collaboratorId, m.actual.functionId, m.actual.eventId);
  return prazoDaPrestacao({
    hoje, prazos, emiteNf,
    ultimoDia: m.dias[m.dias.length - 1] ?? null,
    confirmado: !!m.confirmacao,
    realizado: m.actual,
    nota,
  });
}

/** A confirmação do colaborador abre? */
export function permissaoDeConfirmar(m: PrestacaoMontada, hoje: string) {
  const ultimo = m.dias[m.dias.length - 1];
  return podeConfirmarPrestacao({ dias: m.dias, hoje, presencaDoUltimoDia: ultimo ? m.presencaPorDia.get(ultimo) : null, checkoutFinalFeito: m.checkoutFinalFeito });
}

// ── Função da Área de Função ────────────────────────────────────────────────

/** Funções em que o usuário é responsável (function_managers ou o campo legado functions.userId). */
export async function funcoesDoResponsavel(userId: string): Promise<Set<string>> {
  const [gerencia, legado] = await Promise.all([
    db.select({ id: functionManagers.functionId }).from(functionManagers).where(eq(functionManagers.userId, userId)),
    db.select({ id: functionsTable.id }).from(functionsTable).where(eq(functionsTable.userId, userId)),
  ]);
  return new Set([...gerencia, ...legado].map((l) => l.id));
}

// ── Selfie (multipart) ──────────────────────────────────────────────────────

export const TAMANHO_MAXIMO_DA_SELFIE = 8 * 1024 * 1024;
const TIPOS_DA_SELFIE = new Set(["image/jpeg", "image/png"]);

const uploadDaSelfie = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_DA_SELFIE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_DA_SELFIE.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error("tipo"), { codigoDaSelfie: "tipo" }));
  },
});

/**
 * Lê o multipart do check-in/out (campo `foto` + `lat`, `lng`, `precisao`).
 * Responde o erro e devolve false quando o arquivo não serve. JPG/PNG até 8 MB
 * (HEIC fica de fora: a allowlist do app não o reconhece — o navegador do
 * celular converte a foto da câmera para JPG no envio).
 */
export function receberSelfie(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) => {
    uploadDaSelfie.single("foto")(req, res, (err: unknown) => {
      if (!err) return resolve(true);
      const e = err as { code?: string; codigoDaSelfie?: string };
      if (e.code === "LIMIT_FILE_SIZE") res.status(413).json({ message: "A foto passa de 8 MB. Tire outra." });
      else if (e.codigoDaSelfie === "tipo") res.status(415).json({ message: "A foto tem que ser JPG ou PNG." });
      else res.status(400).json({ message: "Não consegui ler o envio da foto." });
      resolve(false);
    });
  });
}

function coordenada(v: unknown, limite: number): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= limite ? n.toFixed(6) : null;
}

/** Localização do corpo (opcional): só grava par lat/lng válido. */
export function localizacaoDoCorpo(body: Record<string, unknown> | undefined): { lat: string | null; lng: string | null; precisaoM: number | null } {
  const lat = coordenada(body?.lat, 90);
  const lng = coordenada(body?.lng, 180);
  if (!lat || !lng) return { lat: null, lng: null, precisaoM: null };
  const p = Number(body?.precisao);
  return { lat, lng, precisaoM: Number.isFinite(p) && p >= 0 && p <= 100_000 ? Math.round(p) : null };
}

// ── Entrada / saída ─────────────────────────────────────────────────────────

export interface Marcacao {
  req: Request;
  res: Response;
  m: PrestacaoMontada;
  dia: string;
  tipo: "entrada" | "saida";
  por: QuemRegistra;
  /** Usuário interno (representante); null quando é o próprio colaborador. */
  ator: User | null;
  config: ConfiguracaoDaPresenca;
}

const nomeDoAtor = (m: PrestacaoMontada, ator: User | null) =>
  ator ? ator.name || ator.email || "Usuário" : `Colaborador (portal): ${m.colaborador?.fullName ?? "—"}`;

/**
 * Registra a entrada ou a saída do dia: janela (só no próprio dia, Brasília),
 * selfie (obrigatória pela configuração), localização opcional, hora do
 * SERVIDOR. Responde o erro e devolve null; devolve a presença gravada no
 * sucesso (o chamador responde).
 */
export async function registrarMarcacao(a: Marcacao): Promise<Presenca | null> {
  const { req, res, m, dia, tipo, por, ator, config } = a;
  if (!diaValido(dia)) { res.status(400).json({ message: "Dia inválido (use AAAA-MM-DD)." }); return null; }
  if (prestacaoEstaTravada(m.actual)) {
    res.status(409).json({ message: "Esta prestação já foi enviada ao DP — a presença não muda mais por aqui." });
    return null;
  }
  if (!m.actual.collaboratorId) { res.status(409).json({ message: "Prestação sem colaborador." }); return null; }
  const hoje = diaEmBrasilia();
  const presenca = m.presencaPorDia.get(dia) ?? null;
  const permissao = tipo === "entrada"
    ? podeRegistrarEntrada({ dia, hoje, dias: m.dias, presenca })
    : podeRegistrarSaida({ dia, hoje, dias: m.dias, presenca });
  if (!permissao.ok) { res.status(409).json({ message: permissao.motivo }); return null; }

  const arquivo = req.file;
  if (!arquivo && config.selfieObrigatoria) {
    res.status(400).json({ message: "Tire a selfie para registrar a presença.", codigo: "selfie_obrigatoria" });
    return null;
  }
  let fotoId: string | null = null;
  // 28/10 (revisão S5): a foto sobe ANTES de gravar; se a gravação falhar
  // (409 da corrida ou erro), o objeto sai do storage — nada de selfie órfã.
  const apagarFotoOrfa = async () => {
    if (!fotoId) return;
    const { ObjectStorageService } = await import("./objectStorage");
    await new ObjectStorageService().apagarAnexo(fotoId);
  };
  if (arquivo) {
    const { tipoPermitidoDoArquivo } = await import("./objectAcl");
    const tipoDoArquivo = tipoPermitidoDoArquivo(arquivo.buffer, arquivo.mimetype, arquivo.originalname);
    if (!tipoDoArquivo || !TIPOS_DA_SELFIE.has(tipoDoArquivo.contentType)) {
      res.status(415).json({ message: "A foto tem que ser JPG ou PNG." });
      return null;
    }
    const { ObjectStorageService, novoIdDeAnexo } = await import("./objectStorage");
    fotoId = novoIdDeAnexo();
    await new ObjectStorageService().enviarAnexo(fotoId, arquivo.buffer, tipoDoArquivo.contentType, {
      ownerId: `colaborador:${m.actual.collaboratorId}`,
      nomeOriginal: `selfie-${tipo}-${dia}.${tipoDoArquivo.extensao}`,
      classe: "presenca",
    });
  }
  const loc = config.localizacao === "registrar" ? localizacaoDoCorpo(req.body) : { lat: null, lng: null, precisaoM: null };
  const agora = new Date();
  const campos = tipo === "entrada"
    ? { checkinEm: agora, checkinFotoId: fotoId, checkinLat: loc.lat, checkinLng: loc.lng, checkinPrecisaoM: loc.precisaoM, checkinPor: por, checkinUserId: ator?.id ?? null }
    : { checkoutEm: agora, checkoutFotoId: fotoId, checkoutLat: loc.lat, checkoutLng: loc.lng, checkoutPrecisaoM: loc.precisaoM, checkoutPor: por, checkoutUserId: ator?.id ?? null };

  let gravada: Presenca | undefined;
  try {
    if (tipo === "entrada") {
      [gravada] = await db.insert(presencas)
        .values({ actualId: m.actual.id, eventId: m.actual.eventId, collaboratorId: m.actual.collaboratorId, dia, ...campos })
        .onConflictDoUpdate({ target: [presencas.actualId, presencas.dia], set: { ...campos, atualizadoEm: agora }, setWhere: isNull(presencas.checkinEm) })
        .returning();
    } else {
      [gravada] = await db.update(presencas)
        .set({ ...campos, atualizadoEm: agora })
        .where(and(eq(presencas.actualId, m.actual.id), eq(presencas.dia, dia), isNull(presencas.checkoutEm)))
        .returning();
    }
  } catch (erro) {
    await apagarFotoOrfa();
    throw erro;
  }
  if (!gravada) {
    await apagarFotoOrfa();
    res.status(409).json({ message: tipo === "entrada" ? "O check-in deste dia já foi feito." : "O check-out deste dia já foi feito." });
    return null;
  }
  // Auditoria SEM a foto (nem o id dela) e sem coordenadas: só o fato.
  await createAuditLog(tipo === "entrada" ? "checkin" : "checkout", "presenca", gravada.id, {
    acao: tipo === "entrada" ? "check-in" : "check-out", prestacao: m.actual.id, dia, por,
    comSelfie: !!fotoId, comLocalizacao: !!loc.lat,
  }, ator?.id, nomeDoAtor(m, ator), undefined, req);
  return gravada;
}

// ── Confirmação final ───────────────────────────────────────────────────────

export interface CorpoDaConfirmacao {
  dias: string[];
  cnpj: string;
  razaoSocial?: string | null;
  contestacao?: string | null;
}

/**
 * Grava (ou refaz) a confirmação da prestação. Só depois do último dia e
 * antes do check-out final do produtor. CNPJ de um contrato LIGADO ao
 * colaborador guarda o `contrato_id`; sem contrato grava assim mesmo
 * ("CNPJ sem contrato" para o DP).
 */
export async function salvarConfirmacao(a: {
  req: Request; res: Response; m: PrestacaoMontada; corpo: CorpoDaConfirmacao;
  por: QuemConfirma; ator: User | null; valoresVisiveis: boolean;
}): Promise<PresencaConfirmacao | null> {
  const { req, res, m, corpo, por, ator } = a;
  if (!m.actual.collaboratorId) { res.status(409).json({ message: "Prestação sem colaborador." }); return null; }
  const hoje = diaEmBrasilia();
  const permissao = permissaoDeConfirmar(m, hoje);
  if (!permissao.ok) { res.status(409).json({ message: permissao.motivo }); return null; }
  const aceitos = new Set([...m.dias, ...m.calculo.diasExtras]);
  const dias = Array.from(new Set(corpo.dias)).sort();
  const fora = dias.filter((d) => !aceitos.has(d));
  if (fora.length > 0) { res.status(400).json({ message: "Algum dia informado não é desta prestação." }); return null; }

  const cnpj = digitosDoCnpj(corpo.cnpj);
  const contratos = (await contratosDosColaboradores([m.actual.collaboratorId])).get(m.actual.collaboratorId) ?? [];
  const { contratoId } = situacaoDoCnpjInformado(cnpj, contratos, hojeISO());
  const contestacao = corpo.contestacao?.trim() || null;
  // 28/10 (Fase 3): contestação nova (texto diferente) volta a ficar ABERTA
  // para o DP — a resposta anterior era para outra pergunta.
  const mesmaContestacao = !!m.confirmacao && (m.confirmacao.contestacao ?? null) === contestacao;
  const valores = {
    confirmadoPor: por, userId: ator?.id ?? null, collaboratorId: m.actual.collaboratorId, diasConfirmados: dias,
    valorVisto: a.valoresVisiveis ? m.calculo.valorCalculado : null,
    cnpj, razaoSocial: corpo.razaoSocial?.trim() || null, contratoId,
    contestacao, confirmadoEm: new Date(),
    ...(mesmaContestacao ? {} : { contestacaoResposta: null, contestacaoRespondidaEm: null, contestacaoRespondidaPor: null, contestacaoRespondidaPorNome: null }),
  };
  const [gravada] = await db.insert(presencaConfirmacoes)
    .values({ actualId: m.actual.id, ...valores })
    .onConflictDoUpdate({ target: presencaConfirmacoes.actualId, set: valores })
    .returning();
  await createAuditLog(m.confirmacao ? "update" : "create", "presenca_confirmacao", gravada.id, {
    acao: "confirmação da prestação", prestacao: m.actual.id, por, dias: dias.length,
    cnpj, contratoLigado: !!contratoId, contestou: !!valores.contestacao,
  }, ator?.id, nomeDoAtor(m, ator), m.confirmacao ? { dias: m.confirmacao.diasConfirmados.length, cnpj: m.confirmacao.cnpj } : undefined, req);
  return gravada;
}

/** Data de corte do legado (reexportada para as rotas da presença). */
export { lerDataDeCorteDoBanco };
