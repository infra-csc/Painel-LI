/**
 * Escalação (vagas / team_inclusions): listagem com recorte, histórico e
 * linha do tempo, criação (unitária e em lote), edição, confirmação,
 * cancelamento, reativação, exclusão lógica, tipos (atendimento, percurseiro,
 * freela cenotécnica), decisão do gestor de cenotécnica, correções
 * administrativas e o contador "aguardando gestor" do menu.
 * Papéis: cadastro (admin/Produção/Compras) e responsável da função editam;
 * gestor de cenotécnica aprova/reprova; admin reativa e roda correções.
 * Os helpers da máquina de estados da vaga moram em _compartilhado.ts.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import {
  teamInclusions as teamInclusionsTable,
  teamInclusionLogs as teamInclusionLogsTable,
  type User,
  insertTeamInclusionSchema,
} from "@shared/schema";
import { eq, and, inArray, isNull, sql as drizzleSql } from "drizzle-orm";
import { normalizeRole } from "@shared/roles";
import { assertEventEditable } from "../event-guard";
import { HttpError } from "../http";
import { log } from "../vite";
import { isAtendimentoFunction } from "@shared/atendimento";
import { isPercursoFunction } from "@shared/calculation-rules";
import { isCenotecnicaFunction } from "@shared/alimentacao";
import { isCenoFreelaTipo } from "@shared/cenotecnica-empreita";
import { nextStatusOnConfirm, isCenotecnicaFunctionName } from "@shared/scaling-rules";
import { podeConfirmar, podeTransitar, faseParaStatus } from "@shared/vaga-status";
import { recalcularDiasDaVaga } from "@shared/dias-de-trabalho";
import {
  podeMudarValorDaDiaria,
  motivoParaNaoTrocarColaborador,
  validarDiasDeTrabalho,
  motivoParaRecusarFluxoNoPatch,
  CAMPOS_DE_FLUXO_DA_VAGA,
} from "../vaga-guards";
import { montarHistoricoDaVaga } from "@shared/inclusion-timeline";
import { trocaNaVisaoDaVaga } from "@shared/swap-permuta";
import { ONDE_A_VAGA_NASCEU, origemDaCriacao } from "@shared/criacao-da-vaga";
import { isSuggestionInclusion, SUGESTAO_PHASE } from "@shared/scaling-validation-rules";
import { effectiveUserId } from "../simulation";
import {
  normalizarEmpreita,
  montarLogDeAuditoria,
  createAuditLog,
  createAuditLogsBatch,
  usuarioDaSessao,
  responderErroComStatus,
  requireRoles,
  CADASTRO_ROLES,
  MSG_VAGA_EM_VALIDACAO,
  limparDatasVazias,
  podeEditarVagaAsync,
  logisticaDaVaga,
  type AvisoDeAgenda,
  verificarColaboradorParaVaga,
  atorDaVaga,
} from "./_compartilhado";

export function registrarEscalacao(app: Express): void {
  // Team Inclusions routes
  //
  // FILTRO CENTRAL DE PHASE (Validação de Escala): por padrão esta rota EXCLUI
  // as vagas em phase 'sugestao' — a escala sugerida pela logística que a área
  // ainda não validou não pode "vazar" para Escalação, Passagens, Hospedagem,
  // Planejado, Espelho etc. Quem precisa delas pede explicitamente:
  //   ?phase=sugestao → só sugestões
  //   ?phase=all      → tudo (histórico)
  //
  // RECORTE OBRIGATÓRIO (23/09): a lista completa de vagas de TODOS os eventos
  // era baixada por sete telas a cada abertura. Agora a rota exige um recorte
  // (`eventId`, `phase` ou `status`); `?all=1` continua existindo só para
  // admin/compras/produção (telas transversais: Escalação, Passagens,
  // Hospedagem) e fica registrado no log para a migração do client.
  app.get("/api/team-inclusions", async (req, res) => {
    try {
      const { eventId, includeDeleted, phase, status, all } = req.query;
      const phaseFilter = phase === 'sugestao' || phase === 'all' ? phase : undefined;
      const eventFilter = eventId && eventId !== 'all' ? String(eventId) : undefined;
      const statusFilter = typeof status === "string" && status && status !== "all" ? status : undefined;
      const temRecorte = !!eventFilter || !!phaseFilter || !!statusFilter;
      if (!temRecorte) {
        const ator = usuarioDaSessao(req) ?? (effectiveUserId(req) ? await storage.getUser(effectiveUserId(req)!) : null);
        const papel = normalizeRole(ator?.role);
        // RH (financial) também lê a fila inteira: Controle RH e Comparativo cruzam
        // todos os eventos (24/09). function_area continua precisando de recorte.
        const podeTudo = papel === "admin" || papel === "purchasing" || papel === "production" || papel === "financial";
        if (!podeTudo) {
          return res.status(400).json({ message: "Informe o evento (eventId) ou um filtro de fase/status para listar as vagas." });
        }
        log(`GET /api/team-inclusions sem recorte (${all === "1" ? "all=1" : "sem all"}) por ${ator?.id ?? "?"} (${papel}) — client deve migrar para ?eventId=`, "warn");
      }

      // eventId vai no WHERE (o storage já aceitava e a rota filtrava em JS
      // depois de trazer a tabela inteira — auditoria de performance 28/08).
      const inclusions = await storage.getTeamInclusions(
        includeDeleted === 'true',
        phaseFilter,
        { eventId: eventFilter, status: statusFilter, orderByInclusionNumber: true },
      );

      // Disable HTTP caching to prevent stale data
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      res.json(inclusions);
    } catch (error) {
      console.error("Erro ao listar vagas:", error);
      res.status(500).json({ message: "Erro ao buscar inclusões de equipe" });
    }
  });

  // Get logs for a specific team inclusion
  /**
   * Uma vaga pelo id (04/09).
   *
   * A Aprovação precisa da vaga completa para reajustar um pedido de ajuste, e
   * só tinha a lista de sugestões — que não contém vaga já escalada. Sem esta
   * rota, o reajuste de um pedido vindo da Escalação ficava travado para sempre
   * em "aguarde a vaga carregar".
   */
  app.get("/api/team-inclusions/:id", async (req, res) => {
    try {
      const inclusion = await storage.getTeamInclusion(req.params.id);
      if (!inclusion) return res.status(404).json({ message: "Vaga não encontrada" });
      res.set("Cache-Control", "no-store");
      res.json(inclusion);
    } catch (error) {
      console.error("Erro ao buscar a vaga:", error);
      res.status(500).json({ message: "Erro ao buscar a vaga" });
    }
  });

  // Histórico COMPLETO da vaga (dono, 14/09): junta os registros da vaga com
  // o que nunca gravou neles — criação, envio/validação, passagem, hospedagem,
  // trocas e pedidos — numa linha do tempo sem duplicatas. Só leitura.
  app.get("/api/team-inclusions/:id/timeline", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const { id } = req.params;
      const vaga = await storage.getTeamInclusion(id);
      if (!vaga) return res.status(404).json({ message: "Vaga não encontrada" });
      const [logs, passagens, hospedagens, pedidos, trocasRes] = await Promise.all([
        storage.getTeamInclusionLogs(id),
        storage.getTicketsByInclusionId(id),
        storage.getAccommodationsByInclusionId(id),
        storage.getScalingChangeRequestsByInclusion(id),
        // Permuta (14/09): o pedido entra no histórico das DUAS vagas.
        db.execute(drizzleSql`
          SELECT sr.*, cc.full_name AS current_collaborator_name, nc.full_name AS new_collaborator_name,
                 ti.inclusion_number AS inclusion_number, me.name AS event_name,
                 pti.inclusion_number AS paired_inclusion_number, pe.name AS paired_event_name
          FROM swap_requests sr
          LEFT JOIN collaborators cc ON sr.current_collaborator_id = cc.id
          LEFT JOIN collaborators nc ON sr.new_collaborator_id = nc.id
          LEFT JOIN team_inclusions ti ON sr.team_inclusion_id = ti.id
          LEFT JOIN events me ON ti.event_id = me.id
          LEFT JOIN team_inclusions pti ON sr.paired_inclusion_id = pti.id
          LEFT JOIN events pe ON pti.event_id = pe.id
          WHERE sr.team_inclusion_id = ${id} OR sr.paired_inclusion_id = ${id}
        `),
      ]);
      // Só os usuários que a linha do tempo cita (23/09) — antes a tabela
      // inteira de usuários vinha junto a cada abertura do histórico.
      const idsDeUsuario = [
        (vaga as any).validatedBy as string | null,
        ...passagens.map((t) => t.emittedBy),
      ].filter((v): v is string => !!v);
      const usuarios = await storage.getUsersByIds(idsDeUsuario);
      const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));
      const trocas = (((trocasRes as any).rows ?? trocasRes) as any[]).map((r) => trocaNaVisaoDaVaga(r, id));
      // Quem criou a vaga, por onde e quando (dono, 14/09). A vaga não guarda o
      // autor: vem do registro da vaga (pedido, sugestão, criação) ou da
      // auditoria gravada na criação — a da grade antiga é UMA por lote, achada
      // pela hora. A janela é calculada no próprio banco, com a hora da vaga,
      // para não depender do fuso do servidor.
      const auditoriasRes = await db.execute(drizzleSql`
        SELECT entity_id, action, user_name, new_data, created_at FROM system_logs
        WHERE entity_type = 'team_inclusion' AND action IN ('create', 'suggestion_sent')
          AND (
            entity_id = ${id}
            OR created_at BETWEEN (SELECT created_at FROM team_inclusions WHERE id = ${id}) - interval '2 minutes'
                              AND (SELECT created_at FROM team_inclusions WHERE id = ${id}) + interval '2 minutes'
          )
        ORDER BY created_at ASC
        LIMIT 50
      `);
      const criacao = origemDaCriacao({
        vagaId: id,
        createdAt: vaga.createdAt,
        logs,
        auditorias: (((auditoriasRes as any).rows ?? auditoriasRes) as any[]).map((a) => ({
          entityId: String(a.entity_id),
          action: String(a.action),
          userName: a.user_name ?? null,
          newData: a.new_data ?? null,
          createdAt: a.created_at,
        })),
      });
      const historico = montarHistoricoDaVaga({
        vaga: {
          id: vaga.id,
          createdAt: vaga.createdAt,
          suggestionSentAt: (vaga as any).suggestionSentAt,
          validatedAt: (vaga as any).validatedAt,
          validatedByName: (vaga as any).validatedBy ? nomeDoUsuario.get((vaga as any).validatedBy) ?? null : null,
          deletedAt: (vaga as any).deletedAt,
          criadaPor: criacao.por,
          criadaOnde: criacao.onde,
        },
        logs,
        passagens: passagens.map((t) => ({
          id: t.id, createdAt: t.createdAt, purchaseDate: t.purchaseDate, emittedAt: t.emittedAt,
          emittedByName: t.emittedBy ? nomeDoUsuario.get(t.emittedBy) ?? null : null,
          ticketStatus: t.ticketStatus, transportType: t.transportType,
          departureCityOrigin: t.departureCityOrigin, departureCityDestination: t.departureCityDestination,
        })),
        hospedagens: hospedagens.map((h) => ({
          id: h.id, createdAt: h.createdAt, hotelName: h.hotelName, checkInDate: h.checkInDate, checkOutDate: h.checkOutDate, hotelStatus: h.hotelStatus,
        })),
        trocas,
        pedidos: pedidos.map((p) => ({
          id: p.id, createdAt: p.createdAt, requestType: p.requestType, requestedByName: p.requestedByName, reason: p.reason,
          status: p.status, reviewedAt: p.reviewedAt, reviewedByName: p.reviewedByName, reviewComment: p.reviewComment,
        })),
      });
      res.set("Cache-Control", "no-store");
      res.json(historico);
    } catch (error) {
      console.error("Error building inclusion timeline:", error);
      res.status(500).json({ message: "Erro ao montar o histórico da vaga" });
    }
  });

  app.get("/api/team-inclusions/:id/logs", async (req, res) => {
    try {
      const { id } = req.params;
      const logs = await storage.getTeamInclusionLogs(id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar histórico de alterações" });
    }
  });

  app.post("/api/team-inclusions", async (req, res) => {
    const creatorActor = await requireRoles(req, res, CADASTRO_ROLES);
    if (!creatorActor) return;
    try {
      // O schema PÚBLICO já omite status/phase/previousStatus/updatedBy etc.:
      // quem decide o FLUXO é o servidor — a vaga nasce planejado/inclusao.
      const inclusionData = insertTeamInclusionSchema.parse(limparDatasVazias(req.body ?? {}));
      if (!await assertEventEditable(inclusionData.eventId, creatorActor, res)) return;
      if (Array.isArray(inclusionData.workDays)) {
        const dias = validarDiasDeTrabalho(inclusionData.workDays, inclusionData.scheduleStartDate, inclusionData.scheduleEndDate);
        if (!dias.ok) return res.status(400).json({ message: dias.erro });
        inclusionData.workDays = dias.dias;
        inclusionData.dailyRates = dias.dias.length;
      }
      let avisosDeAgenda: AvisoDeAgenda[] = [];
      if (inclusionData.collaboratorId) {
        const check = await verificarColaboradorParaVaga(inclusionData.collaboratorId, inclusionData);
        if (check.erro) return res.status(check.erro.status).json({ message: check.erro.message });
        avisosDeAgenda = check.avisos;
      }
      const inclusion = await storage.createTeamInclusion({
        ...inclusionData,
        status: "planejado",
        phase: "inclusao",
        updatedBy: creatorActor.id,
      });
      await createAuditLog('create', 'team_inclusion', inclusion.id, inclusion, creatorActor.id, creatorActor.name || 'Sistema', undefined, req);
      // Criação registrada na PRÓPRIA vaga (14/09): quem e por onde, para o
      // Histórico. Esta rota só é chamada pela escalação de emergência.
      await storage.createTeamInclusionLog({
        teamInclusionId: inclusion.id,
        action: 'created',
        details: "Pela " + ONDE_A_VAGA_NASCEU.emergencia,
        previousValue: null,
        newValue: inclusion.status,
        userId: creatorActor.id,
        userName: creatorActor.name ?? 'Usuário',
      });
      // Resposta continua sendo a vaga; `avisosDeAgenda` só aparece quando há aviso.
      res.json(avisosDeAgenda.length > 0 ? { ...inclusion, avisosDeAgenda } : inclusion);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dados inválidos", error: error.message });
      responderErroComStatus(res, error, "Erro ao criar a vaga", 500);
    }
  });

  // Criação em lote (grade de escalação) — tudo numa transação: ou todas as
  // escalações entram, ou nenhuma. Antes o client fazia N POSTs sequenciais e
  // uma falha no meio deixava escalação parcial.
  app.post("/api/team-inclusions/bulk", async (req, res) => {
    const actor = await requireRoles(req, res, CADASTRO_ROLES);
    if (!actor) return;
    try {
      const { inclusions } = req.body as { inclusions: any[] };
      if (!Array.isArray(inclusions) || inclusions.length === 0) {
        return res.status(400).json({ message: "Lista de escalações é obrigatória" });
      }
      if (inclusions.length > 500) return res.status(400).json({ message: "No máximo 500 vagas por lote." });
      const rows = inclusions.map((raw, idx) => {
        const parsed = insertTeamInclusionSchema.parse(limparDatasVazias(raw));
        if (Array.isArray(parsed.workDays)) {
          const dias = validarDiasDeTrabalho(parsed.workDays, parsed.scheduleStartDate, parsed.scheduleEndDate);
          if (!dias.ok) throw new HttpError(400, `Linha ${idx + 1}: ${dias.erro}`);
          parsed.workDays = dias.dias;
          parsed.dailyRates = dias.dias.length;
        }
        // O servidor define o fluxo: toda vaga do lote nasce planejado/inclusao.
        return { ...parsed, status: "planejado" as const, phase: "inclusao" as const, updatedBy: actor.id };
      });
      // Um lote pode misturar eventos — basta um encerrado para recusar tudo
      for (const eventId of Array.from(new Set(rows.map(r => r.eventId).filter(Boolean)))) {
        if (!await assertEventEditable(eventId, actor, res)) return;
      }
      // Colaborador já escolhido na grade: ativo/aprovado e sem sobreposição de agenda
      const avisosDeAgenda: AvisoDeAgenda[] = [];
      for (const r of rows) {
        if (!r.collaboratorId) continue;
        const check = await verificarColaboradorParaVaga(r.collaboratorId, r);
        if (check.erro) return res.status(check.erro.status).json({ message: check.erro.message });
        avisosDeAgenda.push(...check.avisos);
      }
      // Vagas + registro de criação de cada uma na MESMA transação (23/09).
      const created = await storage.createTeamInclusionsBatch(rows, (c) => ({
        teamInclusionId: c.id,
        action: 'created',
        details: "Pela " + ONDE_A_VAGA_NASCEU.inclusao,
        previousValue: null,
        newValue: c.status,
        userId: actor.id,
        userName: actor.name ?? 'Usuário',
      }));
      await createAuditLog('create', 'team_inclusion', created[0]?.id ?? 'bulk', { count: created.length }, actor.id, actor.name, undefined, req);
      res.status(201).json({ created: created.length, items: created, ...(avisosDeAgenda.length > 0 ? { avisosDeAgenda } : {}) });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dados inválidos no lote de escalações", error: error.message });
      responderErroComStatus(res, error, "Erro ao criar o lote de escalações", 500);
    }
  });

  app.patch("/api/team-inclusions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await atorDaVaga(req, res);
      if (!user) return;
      const userId = user.id;

      // Get the team inclusion to check function
      const currentInclusion = await storage.getTeamInclusion(id);
      if (!currentInclusion) {
        return res.status(404).json({ message: "Inclusão de equipe não encontrada" });
      }
      if (currentInclusion.deletedAt) return res.status(404).json({ message: "Vaga excluída" });
      // Vaga em Validação de Escala: só a máquina de estados (scaling-validation.ts) mexe.
      if (isSuggestionInclusion(currentInclusion)) {
        return res.status(400).json({ message: MSG_VAGA_EM_VALIDACAO });
      }
      // E ninguém empurra uma inclusão de volta para a fase de sugestão por aqui.
      if (req.body?.phase === SUGESTAO_PHASE || (typeof req.body?.status === "string" && req.body.status.startsWith("sugestao"))) {
        return res.status(400).json({ message: "Status/fase de Validação de Escala não podem ser definidos por esta rota." });
      }
      // Status/fase saíram do PATCH (23/09): cancelar → POST /cancel, reativar →
      // /reactivate, compra → derivada ao registrar passagem/hospedagem. Um
      // client antigo que mande o MESMO status que a vaga já tem é ignorado.
      const motivoFluxo = motivoParaRecusarFluxoNoPatch(req.body ?? {}, currentInclusion);
      if (motivoFluxo) return res.status(400).json({ message: motivoFluxo });

      // Check if user can manage this function
      const func = await storage.getFunction(currentInclusion.functionId);
      if (!func) {
        return res.status(404).json({ message: "Função não encontrada" });
      }

      // Authorization check: Admin, production, purchasing or function manager can modify
      const isAdmin = normalizeRole(user.role) === 'admin';
      const isProductionOrPurchasing = normalizeRole(user.role) === 'production' || normalizeRole(user.role) === 'purchasing';
      if (!await podeEditarVagaAsync(user, currentInclusion, func)) {
        return res.status(403).json({ message: "Sem permissão para modificar esta escalação." });
      }

      // Evento encerrado: só o administrador
      if (!await assertEventEditable(currentInclusion.eventId, user, res)) return;

      // Pedido de ajuste EM ANÁLISE trava a escalação inteira (regra do dono,
      // 26/08). O aprovador está decidindo sobre a vaga como ela está; salvar
      // por baixo faria a decisão cair sobre outra coisa. A tela já bloqueia e
      // explica — aqui é a trava de verdade, para quem chamar a API direto.
      const pendingChange = (await storage.getScalingChangeRequestsByInclusion(id))
        .find((r) => r.status === "pendente");
      if (pendingChange) {
        return res.status(409).json({
          message: `Há um pedido de ${pendingChange.requestType} aguardando o aprovador — a escalação fica travada até a decisão.`,
        });
      }

      // Descarta campos de identidade que o client legado ainda possa enviar
      const { _userId, ...bodyData } = limparDatasVazias(req.body ?? {});
      for (const k of CAMPOS_DE_FLUXO_DA_VAGA) delete bodyData[k];

      // Troca de FUNÇÃO (dono, 11/09: "tento trocar e ele não muda"). O
      // formulário de Inclusões sempre mandou functionId, mas a allowlist
      // descartava em silêncio — a tela dizia "salvo" e a função ficava a
      // mesma. Regras: só admin/produção/compras trocam; vaga já escalada
      // (com colaborador) só o administrador, porque a função define as
      // regras de diária e alimentação de quem já foi confirmado.
      let funcAlvo = func;
      if (bodyData.functionId !== undefined && bodyData.functionId !== currentInclusion.functionId) {
        if (!isAdmin && !isProductionOrPurchasing) {
          return res.status(403).json({ message: "Só administrador, produção ou compras trocam a função de uma vaga." });
        }
        if (currentInclusion.collaboratorId && !isAdmin) {
          return res.status(400).json({ message: "Vaga já escalada — tire o colaborador antes de trocar a função, ou peça ao administrador." });
        }
        const nova = await storage.getFunction(String(bodyData.functionId));
        if (!nova) return res.status(404).json({ message: "Função não encontrada." });
        funcAlvo = nova;
      }

      // Dias de trabalho e diárias (23/09): `dailyRates` NUNCA vem do corpo —
      // é sempre o tamanho de workDays. Datas alteradas sem workDays → a lista
      // é refeita pela regra única de shared/dias-de-trabalho (a mesma do
      // Espelho Operacional).
      const newStartDate = bodyData.scheduleStartDate || currentInclusion.scheduleStartDate;
      const newEndDate = bodyData.scheduleEndDate || currentInclusion.scheduleEndDate;
      const datesChanged = (bodyData.scheduleStartDate && bodyData.scheduleStartDate !== currentInclusion.scheduleStartDate) ||
                           (bodyData.scheduleEndDate && bodyData.scheduleEndDate !== currentInclusion.scheduleEndDate);
      delete bodyData.dailyRates;
      if (Array.isArray(bodyData.workDays)) {
        const dias = validarDiasDeTrabalho(bodyData.workDays, newStartDate, newEndDate);
        if (!dias.ok) return res.status(400).json({ message: dias.erro });
        bodyData.workDays = dias.dias;
        bodyData.dailyRates = dias.dias.length;
      } else if (datesChanged) {
        const recalculado = recalcularDiasDaVaga(newStartDate, newEndDate);
        if (recalculado) {
          bodyData.workDays = recalculado.workDays;
          bodyData.dailyRates = recalculado.dailyRates;
        }
      }

      // Colaborador (23/09): troca direta só em vaga NÃO confirmada e sem
      // passagem/hospedagem viva — fora disso, Solicitação de Troca. O novo
      // colaborador precisa estar ativo/aprovado e sem sobreposição de agenda.
      // "" e null são a mesma coisa (vaga por empreita não tem colaborador e o
      // modal manda "" — sem isto, editar a observação de uma empreita
      // confirmada cairia nesta trava).
      let avisosDeAgenda: AvisoDeAgenda[] = [];
      const colaboradorMuda = bodyData.collaboratorId !== undefined &&
        (bodyData.collaboratorId || null) !== (currentInclusion.collaboratorId || null);
      if (colaboradorMuda) {
        const { temPassagem, temHospedagem } = await logisticaDaVaga(id);
        const motivo = motivoParaNaoTrocarColaborador(currentInclusion, temPassagem || temHospedagem);
        if (motivo) return res.status(403).json({ message: motivo });
        if (bodyData.collaboratorId) {
          const check = await verificarColaboradorParaVaga(String(bodyData.collaboratorId), {
            id, scheduleStartDate: newStartDate ?? null, scheduleEndDate: newEndDate ?? null,
          });
          if (check.erro) return res.status(check.erro.status).json({ message: check.erro.message });
          avisosDeAgenda = check.avisos;
        }
      }

      // Valor da diária é dinheiro (23/09): só Financeiro/admin mudam. Mandar o
      // valor que já está gravado não é mudança (o modal reenvia o formulário).
      if (bodyData.dailyValue !== undefined && Number(bodyData.dailyValue) !== Number(currentInclusion.dailyValue ?? 0) && !podeMudarValorDaDiaria(user)) {
        return res.status(403).json({ message: "O valor da diária só pode ser alterado pelo Financeiro ou pelo administrador." });
      }

      // Allowlist: só campos legitimamente editáveis por esta rota genérica.
      // Fora dela ficam status/fase (rotas dedicadas), a aprovação da produção
      // (/approve-production), o soft-delete (DELETE), identidade
      // (event/inclusionNumber) e campos de servidor.
      const EDITABLE_INCLUSION_FIELDS = new Set([
        'collaboratorId', 'functionId', 'area', 'emitsNf', 'rowOrder',
        'scheduleStartDate', 'scheduleEndDate', 'actualStartDate', 'actualEndDate',
        'flightDepartureDate', 'flightDepartureSuggestedTime', 'flightArrivalSuggestedTime',
        'flightReturnDate', 'flightReturnSuggestedTime',
        'needsTicket', 'needsAccommodation', 'dailyRates', 'workDays', 'dailyValue',
        'actualDailyRates', 'observations', 'actualObservations', 'emergencyRecord',
        'city', 'atendimentoTipo', 'percurseiroTipo',
        'cenoFreelaTipo', 'empreitaEmpresa', 'empreitaPessoas', 'empreitaValor',
      ]);
      const updates: Record<string, any> = { updatedBy: userId };
      for (const [k, v] of Object.entries(bodyData)) {
        if (EDITABLE_INCLUSION_FIELDS.has(k)) updates[k] = v;
      }

      // Atendimento: ao ter colaborador atribuído, o tipo (Key Account /
      // Executivo de Contas) é obrigatório — define a tarifa da diária.
      // (As regras abaixo olham a função ALVO — a nova, quando trocada.)
      if (isAtendimentoFunction(funcAlvo.name)) {
        const effColab = updates.collaboratorId !== undefined ? updates.collaboratorId : currentInclusion.collaboratorId;
        const effTipo = updates.atendimentoTipo !== undefined ? updates.atendimentoTipo : (currentInclusion as any).atendimentoTipo;
        if (effColab && !effTipo) {
          return res.status(400).json({ message: "Para atendimento, selecione o tipo (Key Account ou Executivo de Contas) ao escalar o colaborador." });
        }
      } else if (updates.atendimentoTipo !== undefined) {
        // Fora de atendimento o campo não faz sentido
        updates.atendimentoTipo = null;
      }

      // Percurso (motoqueiro): o tipo (Tipo 1 / Tipo 2) define o pacote fechado
      // da diária, mas por decisão do usuário (17/08) é definido NO PLANEJADO —
      // a escalação NÃO exige o tipo (só valida o valor se vier).
      if (isPercursoFunction(funcAlvo.name)) {
        const effTipo = updates.percurseiroTipo !== undefined ? updates.percurseiroTipo : (currentInclusion as any).percurseiroTipo;
        if (effTipo != null && effTipo !== 'tipo_1' && effTipo !== 'tipo_2') {
          return res.status(400).json({ message: "Tipo de percurseiro inválido — use Tipo 1 ou Tipo 2." });
        }
      } else if (updates.percurseiroTipo !== undefined) {
        updates.percurseiroTipo = null;
      }

      // Cenotécnica (empreita): a modalidade (Freela Viagem / SP / Local A / B)
      // define o valor FECHADO por nº de dias (regra 19/08). Não é obrigatória
      // ao escalar — só valida o valor quando vier; fora de cenotécnica, limpa.
      if (isCenotecnicaFunction(funcAlvo.name)) {
        const effTipo = updates.cenoFreelaTipo !== undefined ? updates.cenoFreelaTipo : (currentInclusion as any).cenoFreelaTipo;
        if (effTipo != null && !isCenoFreelaTipo(effTipo)) {
          return res.status(400).json({ message: "Tipo de freela cenotécnica inválido — use Freela Viagem, Freela SP, Freela Local (A) ou Freela Local (B)." });
        }
      } else if (updates.cenoFreelaTipo !== undefined) {
        updates.cenoFreelaTipo = null;
      }

      const erroEmpreita = normalizarEmpreita(updates, currentInclusion as any, isCenotecnicaFunction(funcAlvo?.name ?? ""));
      if (erroEmpreita) return res.status(400).json({ message: erroEmpreita });

      // UPDATE guardado pelo status atual + auditoria na mesma transação.
      const inclusion = await storage.updateTeamInclusion(id, updates, {
        expectedStatus: currentInclusion.status,
        rejectDeleted: true,
        conflictMessage: "A escalação mudou de status enquanto você editava — recarregue e tente de novo.",
        auditFor: (updated) => montarLogDeAuditoria('update', 'team_inclusion', id, updated, userId, user?.name || 'Sistema', currentInclusion, req),
      });
      res.json(avisosDeAgenda.length > 0 ? { ...inclusion, avisosDeAgenda } : inclusion);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar inclusão");
    }
  });

  // Confirmar escalação — o SERVIDOR decide status/fase (nextStatusOnConfirm em
  // shared/scaling-rules.ts). Antes o client calculava e mandava status/phase
  // pelo PATCH genérico; agora o Confirmar chama esta rota e o Salvar (sem
  // confirmar) continua no PATCH. Mesma permissão do PATCH. A confirmação em
  // massa (bulk-confirm-bar) chama esta rota vaga a vaga — a regra vale igual.
  app.post("/api/team-inclusions/:id/confirm", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await atorDaVaga(req, res);
      if (!user) return;
      const userId = user.id;

      const currentInclusion = await storage.getTeamInclusion(id);
      if (!currentInclusion) return res.status(404).json({ message: "Inclusão de equipe não encontrada" });
      if (currentInclusion.deletedAt) return res.status(404).json({ message: "Vaga excluída" });
      if (isSuggestionInclusion(currentInclusion)) {
        return res.status(400).json({ message: MSG_VAGA_EM_VALIDACAO });
      }

      const func = await storage.getFunction(currentInclusion.functionId);
      if (!func) return res.status(404).json({ message: "Função não encontrada" });

      // Mesma autorização do PATCH: admin, produção, compras ou responsável da função
      if (!await podeEditarVagaAsync(user, currentInclusion, func)) {
        return res.status(403).json({ message: "Sem permissão para confirmar esta escalação." });
      }

      // Evento encerrado: só o administrador
      if (!await assertEventEditable(currentInclusion.eventId, user, res)) return;

      // Máquina de estados (shared/vaga-status): só planejado/reaberto/
      // escalacao confirmam. Cancelada → reative; já confirmada → Solicitação
      // de Troca (reconfirmar apagava passagem_comprada — incidente em prod).
      const regra = podeConfirmar(currentInclusion.status);
      if (!regra.ok) return res.status(409).json({ message: regra.motivo });

      const body = limparDatasVazias((req.body ?? {}) as Record<string, any>);
      // Empreita por empresa (10/09): a vaga confirma SEM colaborador.
      const empreitaNoPedido = body.empreitaEmpresa !== undefined
        ? !!(body.empreitaEmpresa && String(body.empreitaEmpresa).trim())
        : !!(currentInclusion as any).empreitaEmpresa;
      const collaboratorId: string | undefined = empreitaNoPedido ? undefined : (body.collaboratorId || currentInclusion.collaboratorId || undefined);
      if (!collaboratorId && !empreitaNoPedido) {
        return res.status(400).json({ message: "Selecione um colaborador (ou informe a empreita) antes de confirmar." });
      }

      // Mesma trava do PATCH: colaborador de escalação já confirmada só muda via troca
      if ((collaboratorId ?? null) !== (currentInclusion.collaboratorId ?? null)) {
        const { temPassagem, temHospedagem } = await logisticaDaVaga(id);
        const motivo = motivoParaNaoTrocarColaborador(currentInclusion, temPassagem || temHospedagem);
        if (motivo) return res.status(403).json({ message: motivo });
      }

      // Colaborador ativo/aprovado e sem sobreposição de agenda (servidor, 23/09)
      let avisosDeAgenda: AvisoDeAgenda[] = [];
      if (collaboratorId) {
        const check = await verificarColaboradorParaVaga(collaboratorId, currentInclusion);
        if (check.erro) return res.status(check.erro.status).json({ message: check.erro.message });
        avisosDeAgenda = check.avisos;
      }

      // Só os campos que o Confirmar da tela envia
      const CONFIRM_FIELDS = new Set(['observations', 'city', 'atendimentoTipo', 'percurseiroTipo', 'cenoFreelaTipo', 'dailyValue', 'emitsNf', 'needsTicket', 'needsAccommodation', 'empreitaEmpresa', 'empreitaPessoas', 'empreitaValor']);
      const updates: Record<string, any> = { updatedBy: userId, collaboratorId: collaboratorId ?? null };
      for (const [k, v] of Object.entries(body)) {
        if (CONFIRM_FIELDS.has(k) && v !== undefined) updates[k] = v;
      }
      if (updates.dailyValue !== undefined && Number(updates.dailyValue) !== Number(currentInclusion.dailyValue ?? 0) && !podeMudarValorDaDiaria(user)) {
        return res.status(403).json({ message: "O valor da diária só pode ser alterado pelo Financeiro ou pelo administrador." });
      }

      // "Sai de" obrigatório para confirmar (dono, 15/09). É a origem da
      // passagem: vazio, Compras não sabe de onde comprar. Sem cidade no pedido,
      // vale a do cadastro do colaborador — a mesma que a tela mostra quando o
      // campo está vazio; sem nenhuma, recusa. Empreita por empresa não tem
      // colaborador e fica fora da regra.
      if (collaboratorId) {
        const cidadeInformada = updates.city !== undefined
          ? String(updates.city ?? "").trim()
          : String(currentInclusion.city ?? "").trim();
        if (!cidadeInformada) {
          const cidadeDoCadastro = String((await storage.getCollaborator(collaboratorId))?.city ?? "").trim();
          if (!cidadeDoCadastro) {
            return res.status(400).json({ message: "Informe de onde o colaborador sai (Sai de) antes de confirmar." });
          }
          updates.city = cidadeDoCadastro;
        }
      }

      // Atendimento: tipo obrigatório ao escalar (define a tarifa da diária)
      if (isAtendimentoFunction(func.name)) {
        const effTipo = updates.atendimentoTipo !== undefined ? updates.atendimentoTipo : (currentInclusion as any).atendimentoTipo;
        if (!effTipo) {
          return res.status(400).json({ message: "Para atendimento, selecione o tipo (Key Account ou Executivo de Contas) ao escalar o colaborador." });
        }
      } else if (updates.atendimentoTipo !== undefined) {
        updates.atendimentoTipo = null;
      }

      // Percurso: o tipo (Tipo 1 / Tipo 2) é definido NO PLANEJADO (decisão do
      // usuário, 17/08) — confirmar a escalação não exige o tipo; só valida o valor.
      if (isPercursoFunction(func.name)) {
        const effTipo = updates.percurseiroTipo !== undefined ? updates.percurseiroTipo : (currentInclusion as any).percurseiroTipo;
        if (effTipo != null && effTipo !== 'tipo_1' && effTipo !== 'tipo_2') {
          return res.status(400).json({ message: "Tipo de percurseiro inválido — use Tipo 1 ou Tipo 2." });
        }
      } else if (updates.percurseiroTipo !== undefined) {
        updates.percurseiroTipo = null;
      }

      // Cenotécnica (empreita): modalidade opcional na confirmação — o valor
      // fechado por dias só entra no Planejado quando ela estiver definida.
      if (isCenotecnicaFunction(func.name)) {
        const effTipo = updates.cenoFreelaTipo !== undefined ? updates.cenoFreelaTipo : (currentInclusion as any).cenoFreelaTipo;
        if (effTipo != null && !isCenoFreelaTipo(effTipo)) {
          return res.status(400).json({ message: "Tipo de freela cenotécnica inválido — use Freela Viagem, Freela SP, Freela Local (A) ou Freela Local (B)." });
        }
      } else if (updates.cenoFreelaTipo !== undefined) {
        updates.cenoFreelaTipo = null;
      }

      const erroEmpreita = normalizarEmpreita(updates, currentInclusion as any, isCenotecnicaFunction(func.name));
      if (erroEmpreita) return res.status(400).json({ message: erroEmpreita });

      const next = nextStatusOnConfirm({
        functionName: func.name,
        needsTicket: updates.needsTicket ?? currentInclusion.needsTicket,
        needsAccommodation: updates.needsAccommodation ?? currentInclusion.needsAccommodation,
      });
      const transicao = podeTransitar(currentInclusion.status, next.status);
      if (!transicao.ok) return res.status(409).json({ message: transicao.motivo });
      updates.status = next.status;
      updates.phase = next.phase;
      console.log(`[Escalação ${id}] confirmar: ${currentInclusion.status}/${currentInclusion.phase} → ${next.status}/${next.phase}`);

      // updateTeamInclusion grava o log "status_changed" e a auditoria na MESMA
      // transação do UPDATE, guardado pelo status lido acima (409 se mudou).
      const inclusion = await storage.updateTeamInclusion(id, updates, {
        expectedStatus: currentInclusion.status,
        rejectDeleted: true,
        conflictMessage: "Esta escalação acabou de mudar de status (outra pessoa confirmou ou cancelou) — recarregue a lista.",
        auditFor: (updated) => montarLogDeAuditoria('confirm', 'team_inclusion', id, updated, userId, user.name || 'Sistema', currentInclusion, req),
      });
      res.json(avisosDeAgenda.length > 0 ? { ...inclusion, avisosDeAgenda } : inclusion);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao confirmar escalação");
    }
  });

  /**
   * POST /api/team-inclusions/:id/cancel — cancelar a escalação (23/09).
   *
   * Substitui o `PATCH { status: 'cancelado' }` do client. Regras: cadastro
   * (admin/produção/compras); vaga excluída → 404; já cancelada → 409; a
   * transição passa por `podeTransitar`; com passagem EMITIDA só o
   * administrador cancela (o bilhete já saiu — Compras precisa saber). Grava
   * previousStatus para a reativação e a fase coerente (faseParaStatus).
   */
  app.post("/api/team-inclusions/:id/cancel", async (req, res) => {
    const ator = await requireRoles(req, res, CADASTRO_ROLES);
    if (!ator) return;
    try {
      const { id } = req.params;
      const current = await storage.getTeamInclusion(id);
      if (!current) return res.status(404).json({ message: "Escalação não encontrada" });
      if (current.deletedAt) return res.status(404).json({ message: "Vaga excluída" });
      if (isSuggestionInclusion(current)) {
        return res.status(400).json({ message: MSG_VAGA_EM_VALIDACAO });
      }
      if (current.status === "cancelado") return res.status(409).json({ message: "Esta escalação já está cancelada." });
      const transicao = podeTransitar(current.status, "cancelado");
      if (!transicao.ok) return res.status(409).json({ message: transicao.motivo });
      if (!await assertEventEditable(current.eventId, ator, res)) return;

      const { passagens } = await logisticaDaVaga(id);
      const emitida = passagens.some((t) => !!t.emittedAt && t.ticketStatus !== "cancelada");
      if (emitida && normalizeRole(ator.role) !== "admin") {
        return res.status(403).json({ message: "Esta vaga tem passagem já EMITIDA. Só o administrador cancela a escalação — avise Compras para tratar o bilhete." });
      }
      const motivo = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

      const inclusion = await storage.updateTeamInclusion(id, {
        status: "cancelado",
        phase: faseParaStatus("cancelado") ?? "cancelado",
        previousStatus: current.status,
        updatedBy: ator.id,
      }, {
        expectedStatus: current.status,
        rejectDeleted: true,
        conflictMessage: "A escalação mudou de status enquanto você cancelava — recarregue a lista.",
        extraLogs: [{
          action: "cancelled",
          details: `Escalação cancelada${motivo ? ` — motivo: ${motivo}` : ""}${emitida ? " (passagem já emitida — Compras deve revisar)" : ""}`,
          previousValue: current.status, newValue: "cancelado",
          userId: ator.id, userName: ator.name ?? "Usuário",
        }],
        auditFor: (updated) => montarLogDeAuditoria("cancel", "team_inclusion", id, updated, ator.id, ator.name, current, req),
      });
      res.json({ message: "Escalação cancelada", inclusion, logisticaParaRevisar: emitida });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao cancelar escalação");
    }
  });

  // Define o tipo de atendimento (Key Account / Executivo de Contas) de uma
  // escalação. Rota dedicada porque o RH — que trabalha no Planejado e precisa
  // classificar as escalações antigas ao flag — não tem papel no PATCH
  // genérico de escalação (admin/produção/compras/responsável da função).
  app.patch("/api/team-inclusions/:id/atendimento-tipo", async (req, res) => {
    const actor = await requireRoles(req, res, ['admin', 'financial', 'production', 'purchasing']);
    if (!actor) return;
    try {
      const { atendimentoTipo } = req.body as { atendimentoTipo?: string };
      if (atendimentoTipo !== 'key_account' && atendimentoTipo !== 'executivo_contas') {
        return res.status(400).json({ message: "Tipo inválido — use Key Account ou Executivo de Contas." });
      }
      const current = await storage.getTeamInclusion(req.params.id);
      if (!current) return res.status(404).json({ message: "Escalação não encontrada" });
      if (current.deletedAt) return res.status(404).json({ message: "Vaga excluída" });
      const func = await storage.getFunction(current.functionId);
      if (!isAtendimentoFunction(func?.name)) {
        return res.status(400).json({ message: "Esta escalação não é de atendimento." });
      }
      if (!await assertEventEditable(current.eventId, actor, res)) return;
      const inclusion = await storage.updateTeamInclusion(req.params.id, {
        atendimentoTipo,
        updatedBy: actor.id,
      } as any, {
        rejectDeleted: true,
        auditFor: (updated) => montarLogDeAuditoria('update', 'team_inclusion', req.params.id, updated, actor.id, actor.name, current, req),
      });
      res.json(inclusion);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar inclusão");
    }
  });

  // Define o tipo do percurseiro (Tipo 1 / Tipo 2) de uma escalação de
  // percurso — espelho da rota de atendimento-tipo (RH classifica no Planejado).
  app.patch("/api/team-inclusions/:id/percurseiro-tipo", async (req, res) => {
    const actor = await requireRoles(req, res, ['admin', 'financial', 'production', 'purchasing']);
    if (!actor) return;
    try {
      const { percurseiroTipo } = req.body as { percurseiroTipo?: string };
      if (percurseiroTipo !== 'tipo_1' && percurseiroTipo !== 'tipo_2') {
        return res.status(400).json({ message: "Tipo inválido — use Tipo 1 ou Tipo 2." });
      }
      const current = await storage.getTeamInclusion(req.params.id);
      if (!current) return res.status(404).json({ message: "Escalação não encontrada" });
      if (current.deletedAt) return res.status(404).json({ message: "Vaga excluída" });
      const func = await storage.getFunction(current.functionId);
      if (!isPercursoFunction(func?.name)) {
        return res.status(400).json({ message: "Esta escalação não é de percurso." });
      }
      if (!await assertEventEditable(current.eventId, actor, res)) return;
      const inclusion = await storage.updateTeamInclusion(req.params.id, {
        percurseiroTipo,
        updatedBy: actor.id,
      } as any, {
        rejectDeleted: true,
        auditFor: (updated) => montarLogDeAuditoria('update', 'team_inclusion', req.params.id, updated, actor.id, actor.name, current, req),
      });
      res.json(inclusion);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar inclusão");
    }
  });

  // Define a modalidade de EMPREITA do cenotécnico (Freela Viagem / SP /
  // Local A / Local B) de uma escalação de cenotécnica — espelho da rota de
  // percurseiro-tipo (RH classifica no Planejado). Regra do usuário, 19/08:
  // o valor é FECHADO por nº de dias (ver shared/cenotecnica-empreita.ts).
  app.patch("/api/team-inclusions/:id/ceno-freela-tipo", async (req, res) => {
    // Quem escala define a modalidade: os mesmos papéis do /confirm — inclusive
    // o RESPONSÁVEL da função (gestor), que é quem usa a tela de Escalação.
    const actor = await requireRoles(req, res, ['admin', 'financial', 'production', 'purchasing', 'function_area']);
    if (!actor) return;
    try {
      const { cenoFreelaTipo } = req.body as { cenoFreelaTipo?: string };
      if (!isCenoFreelaTipo(cenoFreelaTipo)) {
        return res.status(400).json({ message: "Tipo inválido — use Freela Viagem, Freela SP, Freela Local (A) ou Freela Local (B)." });
      }
      const current = await storage.getTeamInclusion(req.params.id);
      if (!current) return res.status(404).json({ message: "Escalação não encontrada" });
      if (current.deletedAt) return res.status(404).json({ message: "Vaga excluída" });
      const func = await storage.getFunction(current.functionId);
      if (!isCenotecnicaFunction(func?.name)) {
        return res.status(400).json({ message: "Esta escalação não é de cenotécnica." });
      }
      if (!await assertEventEditable(current.eventId, actor, res)) return;
      const actorRole = normalizeRole(actor.role);
      if (actorRole !== "admin" && actorRole !== "production" && actorRole !== "purchasing" && actorRole !== "financial") {
        if (!await podeEditarVagaAsync(actor, current, func)) {
          return res.status(403).json({ message: "Sem permissão para definir o tipo de freela desta cenotécnica." });
        }
      }
      const inclusion = await storage.updateTeamInclusion(req.params.id, {
        cenoFreelaTipo,
        updatedBy: actor.id,
      } as any, {
        rejectDeleted: true,
        auditFor: (updated) => montarLogDeAuditoria('update', 'team_inclusion', req.params.id, updated, actor.id, actor.name, current, req),
      });
      res.json(inclusion);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar inclusão");
    }
  });

  /** Permissão do gestor de cenotécnica: admin, flag histórica ou 'aprovador' da função. */
  const podeDecidirProducao = async (user: User, functionId: string) =>
    normalizeRole(user.role) === 'admin'
    || user.canApproveCenotecnica === true
    || await storage.isUserFunctionApprover(functionId, user.id);

  // Aprovação de Produção para cenotécnica
  app.patch("/api/team-inclusions/:id/approve-production", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await atorDaVaga(req, res);
      if (!user) return;
      const userId = user.id;

      const inclusion = await storage.getTeamInclusion(id);
      if (!inclusion) return res.status(404).json({ message: "Escalação não encontrada" });
      if (inclusion.deletedAt) return res.status(404).json({ message: "Vaga excluída" });

      if (!await podeDecidirProducao(user, inclusion.functionId)) {
        return res.status(403).json({ message: "Você não tem permissão para aprovar escalações de cenotécnica" });
      }

      // Evento encerrado: só o administrador
      if (!await assertEventEditable(inclusion.eventId, user, res)) return;

      if (inclusion.status !== 'aguardando_producao') {
        return res.status(409).json({ message: "Escalação não está aguardando aprovação do gestor" });
      }

      // Verificar se é cenotécnica
      const func = await storage.getFunction(inclusion.functionId);
      if (!isCenotecnicaFunctionName(func?.name)) {
        return res.status(400).json({ message: "Apenas funções cenotécnicas precisam de aprovação do gestor" });
      }

      // Após aprovação da produção, vai direto para aprovado se sem logística
      // (Compras só entra no fluxo de trocas, não na primeira escalação)
      const noLogistics = !inclusion.needsTicket && !inclusion.needsAccommodation;
      const nextStatus = noLogistics ? 'aprovado' : 'escalado';
      const nextPhase = faseParaStatus(nextStatus) ?? (noLogistics ? 'aprovado' : 'escalacao');

      // UPDATE condicionado a 'aguardando_producao' (409 se outro gestor decidiu
      // antes); log da vaga e auditoria na mesma transação.
      const updated = await storage.updateTeamInclusion(id, {
        status: nextStatus,
        phase: nextPhase,
        approvedByProduction: userId,
        approvedByProductionAt: new Date(),
        updatedBy: userId,
      }, {
        expectedStatus: 'aguardando_producao',
        rejectDeleted: true,
        conflictMessage: "Esta escalação já foi decidida pelo gestor — recarregue a lista.",
        extraLogs: [{
          action: 'approve_production',
          details: `Escalação aprovada pelo gestor → status: ${nextStatus === 'aprovado' ? 'Aprovado' : 'Escalado'}`,
          previousValue: 'aguardando_producao', newValue: nextStatus,
          userId, userName: user.name ?? 'Produção',
        }],
        auditFor: (row) => montarLogDeAuditoria('approve_production', 'team_inclusion', id, row, userId, user.name ?? 'Produção', inclusion, req),
      });
      res.json({ message: "Escalação aprovada pelo gestor", inclusion: updated });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao aprovar escalação", 500);
    }
  });

  // Reprovar escalação de cenotécnica pela Produção (remove colaborador, volta p/ escalacao)
  app.patch("/api/team-inclusions/:id/reject-production", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await atorDaVaga(req, res);
      if (!user) return;
      const userId = user.id;

      const inclusion = await storage.getTeamInclusion(id);
      if (!inclusion) return res.status(404).json({ message: "Escalação não encontrada" });
      if (inclusion.deletedAt) return res.status(404).json({ message: "Vaga excluída" });

      if (!await podeDecidirProducao(user, inclusion.functionId)) {
        return res.status(403).json({ message: "Você não tem permissão para reprovar escalações de cenotécnica" });
      }

      // Evento encerrado: só o administrador
      if (!await assertEventEditable(inclusion.eventId, user, res)) return;

      if (inclusion.status !== 'aguardando_producao') {
        return res.status(409).json({ message: "Escalação não está aguardando aprovação do gestor" });
      }

      // Reprovar: remove colaborador e volta para fase de escalação
      const updated = await storage.updateTeamInclusion(id, {
        status: 'escalacao',
        phase: faseParaStatus('escalacao') ?? 'escalacao',
        collaboratorId: null,
        updatedBy: userId,
      }, {
        expectedStatus: 'aguardando_producao',
        rejectDeleted: true,
        conflictMessage: "Esta escalação já foi decidida pelo gestor — recarregue a lista.",
        extraLogs: [{
          action: 'reject_production',
          details: `Escalação reprovada pelo gestor — colaborador removido, voltou para escalação`,
          previousValue: 'aguardando_producao', newValue: 'escalacao',
          userId, userName: user.name ?? 'Produção',
        }],
        auditFor: (row) => montarLogDeAuditoria('reject_production', 'team_inclusion', id, row, userId, user.name ?? 'Produção', inclusion, req),
      });
      res.json({ message: "Escalação reprovada pelo gestor — colaborador removido", inclusion: updated });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao reprovar escalação", 500);
    }
  });

  // Admin: corrige cenotécnicas gravadas como 'escalado' sem passar pelo gestor.
  // UM UPDATE em lote (23/09) — e nunca em vaga que o gestor JÁ aprovou
  // (approvedByProduction preenchido): nela 'escalado' é o estado certo.
  app.post("/api/admin/fix-cenotecnica-statuses", async (req, res) => {
    const user = await requireRoles(req, res, ["admin"]);
    if (!user) return;
    try {
      const allFunctions = await storage.getFunctions();
      const cenotecnicaFunctionIds = allFunctions.filter((f) => isCenotecnicaFunctionName(f.name)).map((f) => f.id);
      if (cenotecnicaFunctionIds.length === 0) return res.json({ message: "0 escalação(ões) cenotécnica corrigida(s)", fixed: [] });

      const antes = await db.select().from(teamInclusionsTable).where(and(
        inArray(teamInclusionsTable.functionId, cenotecnicaFunctionIds),
        eq(teamInclusionsTable.status, 'escalado'),
        isNull(teamInclusionsTable.approvedByProduction),
        isNull(teamInclusionsTable.deletedAt),
        drizzleSql`${teamInclusionsTable.collaboratorId} IS NOT NULL`,
      ));
      if (antes.length === 0) return res.json({ message: "0 escalação(ões) cenotécnica corrigida(s)", fixed: [] });
      const ids = antes.map((i) => i.id);
      const agora = new Date();
      const fixedRows = await db.transaction(async (tx) => {
        const rows = await tx.update(teamInclusionsTable)
          .set({ status: 'aguardando_producao', phase: 'escalacao', updatedBy: user.id, updatedAt: agora })
          .where(and(inArray(teamInclusionsTable.id, ids), eq(teamInclusionsTable.status, 'escalado'), isNull(teamInclusionsTable.approvedByProduction)))
          .returning();
        if (rows.length > 0) {
          await tx.insert(teamInclusionLogsTable).values(rows.map((r) => ({
            teamInclusionId: r.id, action: 'status_changed',
            details: 'Correção administrativa: cenotécnica sem decisão do gestor voltou para "Aguardando gestor"',
            previousValue: 'escalado', newValue: 'aguardando_producao', userId: user.id, userName: user.name ?? 'Admin',
          })));
        }
        return rows;
      });
      const anteriorPorId = new Map(antes.map((i) => [i.id, i]));
      await createAuditLogsBatch(fixedRows.map((r) =>
        montarLogDeAuditoria('update', 'team_inclusion', r.id, r, user.id, user.name, anteriorPorId.get(r.id), req)));
      const fixed = fixedRows.map((r) => ({ id: r.id, inclusionNumber: r.inclusionNumber }));
      log(`admin fix: ${fixed.length} vaga(s) de cenotécnica corrigida(s)`);
      res.json({ message: `${fixed.length} escalação(ões) cenotécnica corrigida(s)`, fixed });
    } catch (error) {
      console.error("Error fixing cenotecnica statuses:", error);
      res.status(500).json({ message: "Erro ao corrigir escalações" });
    }
  });

  // Reativar escalação cancelada (admin only) → 'reaberto' (nunca o legado 'pendente')
  app.patch("/api/team-inclusions/:id/reactivate", async (req, res) => {
    const user = await requireRoles(req, res, ["admin"]);
    if (!user) return;
    try {
      const { id } = req.params;
      const current = await storage.getTeamInclusion(id);
      if (!current) return res.status(404).json({ message: "Escalação não encontrada" });
      if (current.deletedAt) return res.status(404).json({ message: "Vaga excluída — restaure a exclusão antes de reativar." });
      if (current.status !== 'cancelado') return res.status(409).json({ message: "Apenas escalações canceladas podem ser reativadas" });
      const transicao = podeTransitar(current.status, "reaberto");
      if (!transicao.ok) return res.status(409).json({ message: transicao.motivo });
      // Hoje só admin chega aqui (passa pela regra); a trava fica explícita
      // para a rota não escapar se a permissão de reativar for ampliada.
      if (!await assertEventEditable(current.eventId, user, res)) return;

      const updated = await storage.updateTeamInclusion(id, {
        status: 'reaberto',
        phase: faseParaStatus('reaberto') ?? 'inclusao',
        previousStatus: current.status,
        updatedBy: user.id,
      }, {
        expectedStatus: 'cancelado',
        rejectDeleted: true,
        conflictMessage: "Esta escalação já foi reativada — recarregue a lista.",
        auditFor: (row) => montarLogDeAuditoria('reactivate', 'team_inclusion', id, row, user.id, user.name ?? 'Admin', current, req),
      });
      res.json({ message: "Escalação reativada com sucesso", inclusion: updated });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao reativar escalação", 500);
    }
  });

  app.delete("/api/team-inclusions/:id", async (req, res) => {
    const deleteActor = await requireRoles(req, res, CADASTRO_ROLES);
    if (!deleteActor) return;
    try {
      const { id } = req.params;
      // Soft delete - marca como excluído ao invés de deletar permanentemente
      const prevInclusion = await storage.getTeamInclusion(id);
      if (!prevInclusion) return res.status(404).json({ message: "Inclusão de equipe não encontrada" });
      if (prevInclusion.deletedAt) return res.status(404).json({ message: "Vaga já excluída" });
      if (isSuggestionInclusion(prevInclusion)) {
        return res.status(400).json({ message: MSG_VAGA_EM_VALIDACAO });
      }
      // Evento encerrado: só o administrador
      if (!await assertEventEditable(prevInclusion.eventId, deleteActor, res)) return;
      const inclusion = await storage.updateTeamInclusion(id, {
        deletedAt: new Date(),
        deletedBy: deleteActor.id,
        updatedBy: deleteActor.id,
      }, {
        rejectDeleted: true,
        extraLogs: [{
          action: 'deleted', details: 'Vaga excluída (exclusão lógica)',
          previousValue: prevInclusion.status, newValue: null,
          userId: deleteActor.id, userName: deleteActor.name ?? 'Usuário',
        }],
        auditFor: () => montarLogDeAuditoria('delete', 'team_inclusion', id, prevInclusion, deleteActor.id, deleteActor.name || 'Sistema', undefined, req),
      });
      res.json({ message: "Inclusão removida com sucesso", inclusion });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao remover inclusão", 500);
    }
  });

  // Endpoint para migrar horários das observações para os campos específicos.
  // Admin-only e UM UPDATE em lote (23/09) — antes qualquer papel de cadastro
  // disparava N updates, um por vaga.
  app.post("/api/team-inclusions/migrate-flight-times", async (req, res) => {
    const user = await requireRoles(req, res, ["admin"]);
    if (!user) return;
    try {
      const inclusions = await storage.getTeamInclusions();
      const alteracoes: { id: string; ida: string | null; horario: string | null }[] = [];
      for (const inclusion of inclusions) {
        // Atualizar apenas se não tiver horários definidos mas tiver observações
        if (!(inclusion.needsTicket && inclusion.observations &&
            (!inclusion.flightDepartureSuggestedTime || !inclusion.flightReturnSuggestedTime))) continue;
        const observations = inclusion.observations;
        const idaMatch = observations.match(/Ida:\s*([^|]*?)(?:\s*\||\s*$)/);
        const horarioMatch = observations.match(/Horário:\s*([^|]*?)(?:\s*\||\s*$)/);
        const ida = (idaMatch && idaMatch[1].trim()) ? idaMatch[1].trim() : null;
        const horario = (horarioMatch && horarioMatch[1].trim()) ? horarioMatch[1].trim() : null;
        if (ida || horario) alteracoes.push({ id: inclusion.id, ida, horario });
      }
      let updatedCount = 0;
      if (alteracoes.length > 0) {
        // UPDATE … FROM (VALUES …): um comando para todas as linhas.
        const valores = drizzleSql.join(
          alteracoes.map((a) => drizzleSql`(${a.id}::varchar, ${a.ida}::text, ${a.horario}::text)`),
          drizzleSql`, `,
        );
        const r = await db.execute(drizzleSql`
          UPDATE team_inclusions AS t
          SET flight_departure_suggested_time = v.ida, flight_return_suggested_time = v.horario, updated_at = NOW(), updated_by = ${user.id}
          FROM (VALUES ${valores}) AS v(id, ida, horario)
          WHERE t.id = v.id
        `);
        updatedCount = Number((r as any).rowCount ?? alteracoes.length);
        await createAuditLog('update', 'team_inclusion', 'migrate-flight-times', { updatedCount, ids: alteracoes.map((a) => a.id) }, user.id, user.name, undefined, req);
      }
      res.json({ message: `Migração concluída`, updatedCount, totalProcessed: inclusions.length });
    } catch (error) {
      console.error("Erro ao migrar horários:", error);
      res.status(500).json({ message: "Erro ao migrar horários das observações" });
    }
  });

  /**
   * Contador do menu (15/09): vagas de cenotécnica aguardando o gestor, só de
   * eventos que ainda não terminaram. Existe para a casca do app NÃO baixar a
   * lista inteira de vagas (~6,5 MB) em toda troca de tela só para contar.
   */
  app.get("/api/shell/aguardando-gestor", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const user = await storage.getUser(req.session.userId);
      const pode = !!user && (normalizeRole(user.role) === "admin" || user.canApproveCenotecnica === true);
      if (!pode) return res.json({ count: 0 });
      const rows = await db.execute(drizzleSql`
        SELECT count(*)::int AS n
        FROM team_inclusions ti
        JOIN events e ON e.id = ti.event_id
        WHERE ti.deleted_at IS NULL
          AND ti.status = 'aguardando_producao'
          AND e.end_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      `);
      const n = Number((rows as any).rows?.[0]?.n ?? 0);
      res.json({ count: n });
    } catch (error) {
      res.status(500).json({ message: "Erro ao contar vagas aguardando o gestor" });
    }
  });
}
