/**
 * Helpers compartilhados pelos routers de server/routes/ (24/09).
 *
 * Tudo o que as rotas usavam do escopo de `registerRoutes` quando routes.ts
 * era um arquivo só: autorização por papel, auditoria (system_logs), erros com
 * status, upload (multer), guardas do módulo financeiro e a máquina de
 * estados da vaga (usada por escalação, passagens, hospedagem e trocas).
 * Nenhuma rota é registrada aqui.
 */
import multer from "multer";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { storage } from "../storage";
import { type InsertSystemLog, type TeamInclusion, type User } from "@shared/schema";
import { isFinanceRole, normalizeRole, ROLE_GROUPS, type CanonicalRole } from "@shared/roles";
import { effectiveUserId } from "../simulation";
import { moduloDe, resumoParaGravar } from "@shared/log-auditoria";
import { validarEmpreita } from "@shared/cenotecnica-empreita";
import { faseParaStatus } from "@shared/vaga-status";
import { conflitosDoColaborador, type VagaParaConflito } from "@shared/conflito-de-agenda";
import { podeEditarVaga, statusDeLogistica, passagemConta, hospedagemConta } from "../vaga-guards";

// Comparação de tokens em tempo constante (defesa contra timing attacks)
export function safeTokenEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Audit helpers
export function sanitizeFields(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = ['password', 'resetToken', 'resetTokenExpiry'];
  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (sanitized[field] !== undefined) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Igualdade por VALOR (18/09): antes era `!==`, e duas datas iguais são objetos
 * diferentes — toda edição acusava "createdAt" como alterado no log.
 */
export function mesmoValor(a: any, b: any): boolean {
  const norm = (v: any) => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export function safeDiff(oldData: any, newData: any): { changed: string[], previous: any, current: any } {
  if (!oldData && !newData) return { changed: [], previous: {}, current: {} };
  if (!oldData) return { changed: Object.keys(newData || {}), previous: {}, current: sanitizeFields(newData) };
  if (!newData) return { changed: [], previous: sanitizeFields(oldData), current: {} };

  const changed: string[] = [];
  const previous: any = {};
  const current: any = {};

  // Compare all fields from both objects
  const allFields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const field of Array.from(allFields)) {
    if (!mesmoValor(oldData[field], newData[field])) {
      changed.push(field);
      previous[field] = oldData[field];
      current[field] = newData[field];
    }
  }

  return {
    changed,
    previous: sanitizeFields(previous),
    current: sanitizeFields(current)
  };
}

export function getEntityName(entityType: string, entityData: any): string {
  if (!entityData) return 'N/A';

  switch (entityType) {
    case 'user':
      return entityData.name || entityData.email || 'Usuário';
    case 'event':
      return entityData.name || `Evento #${entityData.eventNumber}` || 'Evento';
    case 'function':
      return entityData.name || `Função #${entityData.functionNumber}` || 'Função';
    case 'collaborator':
      return entityData.fullName || `Colaborador #${entityData.collaboratorNumber}` || 'Colaborador';
    case 'team_inclusion':
      return entityData.inclusionNumber != null ? `Vaga #${entityData.inclusionNumber}` : 'Vaga';
    case 'ticket':
      return entityData.purchaseOrderNumber || `Passagem #${entityData.id?.slice(0, 8)}` || 'Passagem';
    case 'accommodation':
      return entityData.reservationNumber || `Hospedagem #${entityData.id?.slice(0, 8)}` || 'Hospedagem';
    case 'financial':
      return `Financeiro #${entityData.id?.slice(0, 8)}` || 'Registro Financeiro';
    case 'comment':
      return `Comentário em ${entityData.phase}` || 'Comentário';
    case 'budget_planned':
      return entityData.collaboratorName || `Planejamento #${entityData.id?.slice(0, 8)}` || 'Planejamento';
    case 'budget_actual':
      return entityData.collaboratorName || `Prestação #${entityData.id?.slice(0, 8)}` || 'Prestação de Contas';
    case 'budget_comparison':
      return entityData.collaboratorName || `Comparativo #${entityData.id?.slice(0, 8)}` || 'Comparativo';
    case 'system_settings':
      return 'Configurações do Sistema';
    case 'scaling_change_request':
      return entityData.requestType ? `Pedido de ${entityData.requestType} #${entityData.id?.slice(0, 8)}` : 'Pedido de ajuste de escala';
    default:
      // Nunca o código cru ("event_comment") como nome (18/09).
      return moduloDe(entityType).substantivo;
  }
}

/**
 * Monta a linha de system_logs sem gravar (23/09) — para as rotas que decidem
 * N registros gravarem a auditoria num INSERT só, e para o storage gravá-la
 * DENTRO da transação da vaga (updateTeamInclusion `auditFor`).
 * O log de request nunca leva dado pessoal: o diff passa por sanitizeFields e
 * o corpo cru da requisição não entra.
 */
export function montarLogDeAuditoria(
  action: string,
  entityType: string,
  entityId: string,
  entityData: any,
  userId?: string,
  userName?: string,
  oldData?: any,
  req?: any,
): InsertSystemLog {
  const diff = safeDiff(oldData, entityData);
  return {
    action,
    entityType,
    entityId,
    // Nome sem "#undefined" e resumo em português (18/09) — a tela do log
    // monta a frase completa a partir de previousData/newData.
    entityName: /undefined/.test(getEntityName(entityType, entityData)) ? moduloDe(entityType).substantivo : getEntityName(entityType, entityData),
    details: resumoParaGravar(action, diff.changed),
    previousData: diff.changed.length > 0 ? JSON.stringify(diff.previous) : null,
    newData: diff.changed.length > 0 ? JSON.stringify(diff.current) : JSON.stringify(sanitizeFields(entityData)),
    userId: userId || null,
    userName: userName || 'Sistema',
    ipAddress: req?.ip || req?.connection?.remoteAddress || null,
    userAgent: req?.get?.('User-Agent') || null,
  };
}

export async function createAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  entityData: any,
  userId?: string,
  userName?: string,
  oldData?: any,
  req?: any
) {
  try {
    await storage.createSystemLog(montarLogDeAuditoria(action, entityType, entityId, entityData, userId, userName, oldData, req));
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

/** Auditoria de N registros num INSERT (rotas em lote). Nunca derruba a rota. */
export async function createAuditLogsBatch(logs: InsertSystemLog[]) {
  try {
    await storage.createSystemLogsBatch(logs);
  } catch (error) {
    console.error('Failed to create audit logs batch:', error);
  }
}

/**
 * Usuário REAL da sessão, já carregado pelo gate global (server/index.ts).
 * As mutações não rodam em simulação (guard de somente leitura), então para
 * escrever/auditar é sempre este — sem reler o banco a cada handler (23/09).
 */
export function usuarioDaSessao(req: any): User | null {
  return (req?.user as User | undefined) ?? null;
}

/** Postgres 23505 (unique) → 409 com a mensagem do negócio. */
export function ehViolacaoDeUnicidade(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as any).code === "23505";
}

/** Erros com status (HttpError do http.ts, StorageHttpError do storage) respondidos como { message }. */
export function responderErroComStatus(res: any, error: unknown, fallback: string, fallbackStatus = 400): void {
  const status = (error as any)?.status;
  if (typeof status === "number" && status >= 400 && status < 500 && (error as any)?.message) {
    res.status(status).json({ message: (error as any).message });
    return;
  }
  console.error(fallback + ":", error);
  res.status(fallbackStatus).json({ message: fallback });
}

// Tipos aceitos nos uploads (23/09): PDF, PNG/JPG, XLSX e CSV — o que o app
// realmente recebe (CPF/RG, vouchers, notas, planilhas do espelho). Este
// filtro olha só o mimetype declarado pelo navegador e serve de primeira
// barreira; /api/upload confere os primeiros bytes (objectAcl.ts).
// `application/vnd.ms-excel` e `text/plain` entram porque o Windows/Excel
// rotula CSV assim; o conteúdo decide depois.
export const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
]);

// Configure multer for file uploads
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMES.has(file.mimetype)) return cb(null, true);
    // status 415: o tratador global (server/http.ts) traduz para a mensagem
    const err: any = new Error(`Tipo de arquivo não permitido: ${file.mimetype}`);
    err.status = 415;
    cb(err);
  }
});

// ── Evento encerrado: quem ainda pode mexer ───────────────────────────────
// Regra do usuário (20/08): a partir do dia seguinte ao término do evento, só
// o ADMINISTRADOR age sobre ESCALAÇÃO e o que depende dela (passagem,
// hospedagem, troca de colaborador). A trava mora em server/event-guard.ts —
// server/scaling-validation.ts usa as MESMAS funções, e importá-las de cá
// fecharia um ciclo (é routes.ts que registra as rotas de escala).

// ── Catálogos: cache curto no navegador ────────────────────────────────────
// Os catálogos usam max-age curto em vez de revalidação (ETag desligado em
// registerRoutes).
export const cacheDeCatalogo = (res: any) => res.set("Cache-Control", "private, max-age=60");

// ── Autorização por papel ─────────────────────────────────────────────────
// A autenticação é garantida pelo middleware global de server/index.ts (toda
// rota /api exige sessão, exceto /api/auth, /api/integration e /api/portal).
// Estes helpers cuidam da AUTORIZAÇÃO: quem, entre os autenticados, pode agir.
// A identidade vem sempre da sessão — nunca do corpo da requisição.
// `effectiveUserId` (server/simulation.ts) devolve o usuário SIMULADO quando
// o admin está no modo "Ver como usuário" (as mutações já foram bloqueadas
// pelo guard global de somente leitura) e o usuário real fora dele.
// O gate global já carregou o usuário REAL em `req.user`; só voltamos ao
// banco quando a identidade efetiva é outra (simulação).
export const requireRoles = async (req: any, res: any, roles: readonly CanonicalRole[]) => {
  const userId = effectiveUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Não autenticado" });
    return null;
  }
  const user = req.user && req.user.id === userId ? req.user : await storage.getUser(userId);
  const role = normalizeRole(user?.role);
  if (!user || !role || !roles.includes(role)) {
    res.status(403).json({ message: "Sem permissão para esta ação" });
    return null;
  }
  return user;
};

// Grupos definidos em shared/roles.ts — fonte única entre client e servidor
export const CADASTRO_ROLES = ROLE_GROUPS.cadastro;
export const FINANCE_ROLES = ROLE_GROUPS.financeiro;
export const LOGISTICA_ROLES = ROLE_GROUPS.logistica;

/**
 * Todos os papéis canônicos do sistema, como tupla (serve ao z.enum e ao
 * requireRoles). Antes vivia duplicado em usuários (PAPEIS_VALIDOS) e em
 * anexos (TODOS_OS_PAPEIS).
 */
export const TODOS_OS_PAPEIS = ["admin", "production", "function_area", "purchasing", "financial"] as const satisfies readonly CanonicalRole[];

/** Admin ou Compras — quem decide trocas de colaborador. */
export function ehAdminOuCompras(user: { role?: string | null } | null | undefined): boolean {
  const papel = normalizeRole(user?.role);
  return papel === "admin" || papel === "purchasing";
}

/** Primeira mensagem de um ZodError (ou o fallback) — para respostas 400 curtas. */
export function primeiraMensagemDoZod(error: z.ZodError, fallback = "Dados inválidos"): string {
  return error.issues[0]?.message || fallback;
}

/** `?eventId=` da query: string não vazia e diferente de "all", senão undefined. */
export function eventIdDaQuery(req: { query: Record<string, unknown> }): string | undefined {
  const v = req.query.eventId;
  return typeof v === "string" && v && v !== "all" ? v : undefined;
}

/** Mensagem única para vaga que só a Validação de Escala pode alterar. */
export const MSG_VAGA_EM_VALIDACAO = "Esta vaga está em Validação de Escala — use a tela de Validação para alterá-la.";

/**
 * Empreita por EMPRESA (dono, 10/09) — mesma normalização no PATCH e no
 * /confirm. Devolve a mensagem de erro (400) ou null. Fora de cenotécnica os
 * campos são zerados; com empresa informada, a vaga fica SEM colaborador e
 * sem passagem/hospedagem (a empresa se vira), e o tipo de freela não se
 * aplica (o valor é o da empreita).
 */
export function normalizarEmpreita(updates: Record<string, any>, atual: Record<string, any>, cenotecnica: boolean): string | null {
  const chaves = ["empreitaEmpresa", "empreitaPessoas", "empreitaValor"] as const;
  const tocou = chaves.some((k) => updates[k] !== undefined);
  const limpar = () => { for (const k of chaves) updates[k] = null; };
  if (!cenotecnica) { if (tocou) limpar(); return null; }
  const empresa = updates.empreitaEmpresa !== undefined ? updates.empreitaEmpresa : atual.empreitaEmpresa;
  if (!tocou && !empresa) return null;
  if (!empresa || String(empresa).trim() === "") { limpar(); return null; }
  const pessoas = updates.empreitaPessoas !== undefined ? updates.empreitaPessoas : atual.empreitaPessoas;
  const valor = updates.empreitaValor !== undefined ? updates.empreitaValor : atual.empreitaValor;
  const erro = validarEmpreita({ empresa: String(empresa), pessoas: Number(pessoas), valorCents: Number(valor) });
  if (erro) return erro;
  updates.empreitaEmpresa = String(empresa).trim();
  updates.empreitaPessoas = Number(pessoas);
  updates.empreitaValor = Number(valor);
  updates.collaboratorId = null;
  updates.needsTicket = false;
  updates.needsAccommodation = false;
  updates.cenoFreelaTipo = null;
  return null;
}

// ── Helpers da máquina de estados da vaga (23/09) ─────────────────────────

/** "" → null nos campos de data que o formulário manda vazios. */
export const CAMPOS_DE_DATA_DA_VAGA = ["scheduleStartDate", "scheduleEndDate", "actualStartDate", "actualEndDate", "flightDepartureDate", "flightReturnDate"] as const;
export const limparDatasVazias = (raw: Record<string, any>) => {
  const out = { ...raw };
  for (const k of CAMPOS_DE_DATA_DA_VAGA) if (out[k] === "") out[k] = null;
  return out;
};

/** Responsável da função (function_managers) ou responsável legado (functions.userId). */
export const podeEditarVagaAsync = async (ator: User, inclusion: { functionId: string }, func: { userId?: string | null } | null | undefined) => {
  const papel = normalizeRole(ator.role);
  if (papel === "admin" || papel === "production" || papel === "purchasing") return true;
  const ehResponsavel = await storage.isUserFunctionManager(inclusion.functionId, ator.id);
  return podeEditarVaga(ator, func, ehResponsavel);
};

/** Passagem/hospedagem VIVAS da vaga (as que contam para o status e travam a troca direta). */
export const logisticaDaVaga = async (inclusionId: string) => {
  const [passagens, hospedagens] = await Promise.all([
    storage.getTicketsByInclusionId(inclusionId),
    storage.getAccommodationsByInclusionId(inclusionId),
  ]);
  return {
    passagens, hospedagens,
    temPassagem: passagens.some(passagemConta),
    temHospedagem: hospedagens.some(hospedagemConta),
  };
};

export type AvisoDeAgenda = { vagaId: string; eventoId: string | null; evento: string | null; inicio: string | null; fim: string | null };
export const descreverVagas = async (vagas: TeamInclusion[]): Promise<AvisoDeAgenda[]> => {
  const eventos = await storage.getEventsByIds(vagas.map((v) => v.eventId));
  const nome = new Map(eventos.map((e) => [e.id, e.name]));
  return vagas.map((v) => ({
    vagaId: v.id, eventoId: v.eventId, evento: nome.get(v.eventId) ?? null,
    inicio: v.scheduleStartDate ?? null, fim: v.scheduleEndDate ?? null,
  }));
};
export const fmtBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

/**
 * Colaborador ativo/aprovado + conflito de agenda com as OUTRAS vagas dele
 * (regra em shared/conflito-de-agenda). Sobreposição de 2+ dias bloqueia
 * (409); um dia em comum vira aviso devolvido no JSON. Antes só a tela
 * conferia — quem chamava a API direto passava.
 */
export const verificarColaboradorParaVaga = async (
  collaboratorId: string,
  vaga: { id?: string | null; scheduleStartDate?: string | null; scheduleEndDate?: string | null },
): Promise<{ erro: { status: number; message: string } | null; avisos: AvisoDeAgenda[] }> => {
  const colaborador = await storage.getCollaborator(collaboratorId);
  if (!colaborador) return { erro: { status: 404, message: "Colaborador não encontrado" }, avisos: [] };
  if (colaborador.active === false || colaborador.status !== "aprovado") {
    return { erro: { status: 400, message: `Colaborador inativo/não aprovado (${colaborador.fullName}) — não pode ser escalado.` }, avisos: [] };
  }
  const outras = await storage.getTeamInclusionsByCollaborator(collaboratorId);
  const { bloqueia, avisos } = conflitosDoColaborador<VagaParaConflito>(
    { id: vaga.id ?? null, scheduleStartDate: vaga.scheduleStartDate ?? null, scheduleEndDate: vaga.scheduleEndDate ?? null },
    outras,
  );
  if (bloqueia.length > 0) {
    const lista = await descreverVagas(bloqueia as TeamInclusion[]);
    const texto = lista.map((l) => `${l.evento ?? "evento"} (${fmtBr(l.inicio)} a ${fmtBr(l.fim)})`).join("; ");
    return { erro: { status: 409, message: `${colaborador.fullName} já está escalado em ${texto} — datas sobrepostas. Use outro colaborador ou a Solicitação de Troca.` }, avisos: [] };
  }
  return { erro: null, avisos: await descreverVagas(avisos as TeamInclusion[]) };
};

/**
 * Status DERIVADO da logística após criar/alterar passagem ou hospedagem
 * (shared/vaga-status + server/vaga-guards.statusDeLogistica). Guardado pelo
 * status atual: se outra decisão chegou antes, não grava por cima.
 */
export const recalcularStatusDeLogistica = async (inclusionId: string, ator: User, req: any): Promise<TeamInclusion | null> => {
  const vaga = await storage.getTeamInclusion(inclusionId);
  if (!vaga || vaga.deletedAt) return null;
  const { temPassagem, temHospedagem } = await logisticaDaVaga(inclusionId);
  const novo = statusDeLogistica({ statusAtual: vaga.status, temPassagem, temHospedagem });
  if (!novo) return null;
  try {
    return await storage.updateTeamInclusion(inclusionId, {
      status: novo, phase: faseParaStatus(novo) ?? vaga.phase, updatedBy: ator.id,
    }, {
      expectedStatus: vaga.status,
      auditFor: (updated) => montarLogDeAuditoria("update", "team_inclusion", inclusionId, updated, ator.id, ator.name, vaga, req),
    });
  } catch (error) {
    // Perdeu a corrida (409): a outra decisão vale; a passagem/hospedagem já está gravada.
    if ((error as any)?.status === 409) return null;
    throw error;
  }
};

/** Ator da sessão para as rotas sem requireRoles (permissão decidida na própria rota). */
export const atorDaVaga = async (req: any, res: any): Promise<User | null> => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ message: "Usuário não autenticado" }); return null; }
  const user = usuarioDaSessao(req) ?? (await storage.getUser(userId)) ?? null;
  if (!user) { res.status(401).json({ message: "Usuário não encontrado" }); return null; }
  return user;
};

// ── Guardas do módulo financeiro ────────────────────────────────────────────
// Identidade vem SOMENTE da sessão (o fallback _userId do corpo é forjável).
// Usuário EFETIVO: no modo simulação os GETs financeiros respondem como o
// usuário simulado (as escritas já foram barradas pelo guard global).
//
// 23/09: `requireFinSession` deixou de ser "qualquer sessão" e passou a
// exigir papel financeiro (admin/RH) — planejado, realizado, comparativo,
// Flash e configurações são custo, e no client essas telas já eram só
// admin/RH (docs/seguranca-e-permissoes.md: grupo `financeiro`). A única
// leitura que continua aberta a qualquer sessão é /api/payment-companies
// (nomes de empresa, sem custo, usados pelo modal de evento).
export const requireQualquerSessao = (req: any, res: any): string | null => {
  const userId = effectiveUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Não autenticado" });
    return null;
  }
  return userId;
};
// Sessão + papel de decisão financeira (admin/RH, aliases legados inclusos)
export const requireFinanceUser = async (req: any, res: any) => {
  const userId = requireQualquerSessao(req, res);
  if (!userId) return null;
  const user = req.user && req.user.id === userId ? req.user : await storage.getUser(userId);
  if (!user || !isFinanceRole(user.role)) {
    res.status(403).json({ message: "Sem permissão para esta ação financeira" });
    return null;
  }
  return user;
};
// Leitura e escrita no módulo financeiro exigem papel financeiro. Os dois
// nomes devolvem o userId (string) ou null, mantendo os call sites.
export const requireFinSession = async (req: any, res: any): Promise<string | null> => {
  const user = await requireFinanceUser(req, res);
  return user ? user.id : null;
};
export const requireFinWrite = requireFinSession;
