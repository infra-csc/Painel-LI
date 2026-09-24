/**
 * Solicitações de troca de colaborador (swap_requests): listagem com filtros,
 * por vaga, abertura (substituição, permuta, transferência), aprovação,
 * rejeição e cancelamento — tudo em transação, com registro no histórico da
 * vaga e auditoria.
 * Papéis: quem edita a vaga abre; admin/Compras decidem; solicitante cancela.
 */
import type { Express } from "express";
import { storage, mapSwapRequestRow } from "../storage";
import { db } from "../db";
import {
  swapRequests as swapRequestsTable,
  teamInclusions as teamInclusionsTable,
  teamInclusionLogs as teamInclusionLogsTable,
  tickets as ticketsTable,
  accommodations as accommodationsTable,
  type TeamInclusion,
  type User,
} from "@shared/schema";
import { eq, and, isNull, sql as drizzleSql } from "drizzle-orm";
import { assertEventEditable, assertInclusionEventEditable } from "../event-guard";
import { HttpError } from "../http";
import { conflitosDoColaborador, type VagaParaConflito } from "@shared/conflito-de-agenda";
import { validarSaiDe } from "@shared/swap-sai-de";
import { isSuggestionInclusion } from "@shared/scaling-validation-rules";
import {
  createAuditLog,
  ehViolacaoDeUnicidade,
  responderErroComStatus,
  ehAdminOuCompras,
  podeEditarVagaAsync,
  logisticaDaVaga,
  descreverVagas,
  fmtBr,
  atorDaVaga,
} from "./_compartilhado";

export function registrarTrocas(app: Express): void {
  // ── Solicitações de troca ─────────────────────────────────────────────────
  // 23/09: filtros no GET, permissão (cadastro ou responsável da função) e
  // transação na abertura, decisão com UPDATE guardado (`status = 'pendente'`
  // → 409 se já decidido), revalidação da vaga/colaborador/agenda na hora de
  // aplicar e registro no histórico da vaga + auditoria em todas as ações.
  const SQL_TROCAS_COM_JOINS = drizzleSql`
        SELECT sr.*,
               cc.full_name as current_collaborator_name,
               nc.full_name as new_collaborator_name,
               ti.status as inclusion_status,
               ti.deleted_at as inclusion_deleted_at,
               ti.inclusion_number as inclusion_number,
               ti.event_id as inclusion_event_id,
               me.name as event_name,
               pti.inclusion_number as paired_inclusion_number,
               pe.name as paired_event_name,
               pf.name as paired_function_name
        FROM swap_requests sr
        LEFT JOIN collaborators cc ON sr.current_collaborator_id = cc.id
        LEFT JOIN collaborators nc ON sr.new_collaborator_id = nc.id
        LEFT JOIN team_inclusions ti ON sr.team_inclusion_id = ti.id
        LEFT JOIN events me ON ti.event_id = me.id
        LEFT JOIN team_inclusions pti ON sr.paired_inclusion_id = pti.id
        LEFT JOIN events pe ON pti.event_id = pe.id
        LEFT JOIN functions pf ON pti.function_id = pf.id`;

  app.get("/api/swap-requests", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      // ?status=pendente|aprovado|rejeitado|cancelado|todos (padrão: todos, como
      // sempre foi) e ?eventId= — recortes no banco (23/09).
      const status = typeof req.query.status === "string" && req.query.status && req.query.status !== "todos" && req.query.status !== "all" ? req.query.status : null;
      const eventId = typeof req.query.eventId === "string" && req.query.eventId && req.query.eventId !== "all" ? req.query.eventId : null;
      const condicoes = [drizzleSql`true`];
      if (status) condicoes.push(drizzleSql`sr.status = ${status}`);
      if (eventId) condicoes.push(drizzleSql`(ti.event_id = ${eventId} OR pti.event_id = ${eventId})`);
      const rows = await db.execute(drizzleSql`${SQL_TROCAS_COM_JOINS}
        WHERE ${drizzleSql.join(condicoes, drizzleSql` AND `)}
        ORDER BY sr.created_at DESC`);
      // snake_case, como o SQL devolve — o client normaliza (swap-types.ts).
      res.set("Cache-Control", "no-store");
      res.json((((rows as any).rows ?? rows) as any[]).map(mapSwapRequestRow));
    } catch (error) {
      console.error("Error fetching swap requests:", error);
      res.status(500).json({ message: "Erro ao buscar solicitações de troca" });
    }
  });

  app.get("/api/swap-requests/inclusion/:teamInclusionId", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    const { teamInclusionId } = req.params;
    try {
      // Permuta (14/09): o pedido aparece nas DUAS vagas — a do pedido e a
      // pareada — com os dados da outra vaga para as telas dizerem quem vai
      // para onde.
      const rows = await db.execute(drizzleSql`${SQL_TROCAS_COM_JOINS}
        WHERE sr.team_inclusion_id = ${teamInclusionId} OR sr.paired_inclusion_id = ${teamInclusionId}
        ORDER BY sr.created_at DESC`);
      res.set("Cache-Control", "no-store");
      res.json((((rows as any).rows ?? rows) as any[]).map(mapSwapRequestRow));
    } catch (error) {
      console.error("Error fetching swap requests for inclusion:", error);
      res.status(500).json({ message: "Erro ao buscar solicitações de troca" });
    }
  });

  /** Vaga viva para a troca: existe, não excluída, não cancelada, fora da Validação de Escala. */
  const vagaVivaParaTroca = (vaga: TeamInclusion | undefined, rotulo: string): { status: number; message: string } | null => {
    if (!vaga || vaga.deletedAt) return { status: 404, message: `${rotulo} não existe mais (excluída).` };
    if (vaga.status === "cancelado") return { status: 404, message: `${rotulo} está cancelada.` };
    if (isSuggestionInclusion(vaga)) return { status: 400, message: `${rotulo} ainda está em Validação de Escala.` };
    return null;
  };

  /** Colaborador ativo/aprovado + agenda contra as outras vagas dele (ignorando as vagas da própria troca). */
  const conflitoNaTroca = async (collaboratorId: string, vaga: TeamInclusion, ignorarIds: string[]) => {
    const colaborador = await storage.getCollaborator(collaboratorId);
    if (!colaborador) return { status: 404, message: "Colaborador não encontrado" };
    if (colaborador.status !== "aprovado" || colaborador.active === false) {
      return { status: 400, message: `O colaborador ${colaborador.fullName} não está aprovado/ativo.` };
    }
    const outras = (await storage.getTeamInclusionsByCollaborator(collaboratorId)).filter((o) => !ignorarIds.includes(o.id));
    const { bloqueia } = conflitosDoColaborador<VagaParaConflito>(vaga, outras);
    if (bloqueia.length > 0) {
      const lista = await descreverVagas(bloqueia as TeamInclusion[]);
      return { status: 409, message: `${colaborador.fullName} já está escalado em ${lista.map((l) => `${l.evento ?? "evento"} (${fmtBr(l.inicio)} a ${fmtBr(l.fim)})`).join("; ")} — datas sobrepostas.` };
    }
    return null;
  };

  const logDaTroca = (teamInclusionId: string, action: string, details: string, previousValue: string | null, newValue: string | null, ator: User) => ({
    teamInclusionId, action, details, previousValue, newValue, userId: ator.id, userName: ator.name ?? "Usuário",
  });

  app.post("/api/swap-requests", async (req, res) => {
    const currentUser = await atorDaVaga(req, res);
    if (!currentUser) return;

    const { teamInclusionId, newCollaboratorId, reason, newCity, kind, pairedInclusionId, pairedNewCity } = req.body ?? {};
    if (!teamInclusionId || !newCollaboratorId || !reason?.trim()) {
      return res.status(400).json({ message: "Campos obrigatórios: teamInclusionId, newCollaboratorId, reason" });
    }

    // A inclusão precisa existir e ter um colaborador atual — sem alguém para
    // trocar, a operação correta é atribuir direto, não abrir uma troca.
    const inclusion = await storage.getTeamInclusion(teamInclusionId);
    if (!inclusion) return res.status(404).json({ message: "Escalação não encontrada" });
    const erroVaga = vagaVivaParaTroca(inclusion, "Esta vaga");
    if (erroVaga) return res.status(erroVaga.status).json({ message: erroVaga.message });
    // Quem abre a troca é quem pode editar a vaga: cadastro ou responsável da função (23/09).
    const func = await storage.getFunction(inclusion.functionId);
    if (!await podeEditarVagaAsync(currentUser, inclusion, func)) {
      return res.status(403).json({ message: "Sem permissão para pedir troca nesta escalação — só cadastro ou o responsável da função." });
    }
    // Evento encerrado: só o administrador
    if (!await assertEventEditable(inclusion.eventId, currentUser, res)) return;
    const currentCollaboratorId = inclusion.collaboratorId ?? null;
    // Transferência (14/09) é justamente para a vaga SEM colaborador.
    if (!currentCollaboratorId && kind !== "transferencia") {
      return res.status(400).json({ message: "Esta escalação ainda não tem colaborador — não há troca a fazer." });
    }
    if (newCollaboratorId === currentCollaboratorId) {
      return res.status(400).json({ message: "O novo colaborador é o mesmo que já está escalado." });
    }
    // "Sai de" do novo colaborador (dono, 14/09): obrigatório no pedido.
    const erroSaiDe = validarSaiDe(newCity);
    if (erroSaiDe) return res.status(400).json({ message: erroSaiDe });

    // Permuta e transferência (dono, 14/09) envolvem uma SEGUNDA vaga — nos
    // dois casos a Escalação barrava por conflito de datas:
    //  - permuta: dois colaboradores já escalados trocam de vaga entre si;
    //  - transferência: um colaborador escalado em outra vaga passa para ESTA
    //    vaga, ainda aberta — a vaga de origem fica aberta.
    const permuta = kind === "permuta";
    const transferencia = kind === "transferencia";
    const comOutraVaga = permuta || transferencia;
    if (transferencia && (currentCollaboratorId || (inclusion as any).empreitaEmpresa)) {
      return res.status(400).json({ message: "Esta vaga já está preenchida — use a troca de colaborador." });
    }
    const pairedInclusion = comOutraVaga && pairedInclusionId ? await storage.getTeamInclusion(String(pairedInclusionId)) : undefined;
    if (comOutraVaga) {
      if (!pairedInclusionId || pairedInclusionId === teamInclusionId) {
        return res.status(400).json({ message: transferencia ? "Escolha de qual vaga o colaborador sai." : "Escolha a vaga do outro colaborador." });
      }
      const erroOutra = vagaVivaParaTroca(pairedInclusion, "A outra vaga");
      if (erroOutra) return res.status(erroOutra.status).json({ message: erroOutra.message });
      if (!pairedInclusion!.collaboratorId) {
        return res.status(400).json({ message: "A outra vaga não tem colaborador." });
      }
      if (pairedInclusion!.collaboratorId !== newCollaboratorId) {
        return res.status(409).json({ message: "O colaborador da outra vaga mudou — abra o pedido de novo." });
      }
      if (!await assertEventEditable(pairedInclusion!.eventId, currentUser, res)) return;
    }
    if (permuta && validarSaiDe(pairedNewCity)) {
      return res.status(400).json({ message: "Informe de onde o colaborador atual sai para a outra vaga." });
    }

    // O novo colaborador precisa existir, estar aprovado e ativo
    const newCollaborator = await storage.getCollaborator(newCollaboratorId);
    if (!newCollaborator) return res.status(404).json({ message: "Colaborador novo não encontrado" });
    if (newCollaborator.status !== 'aprovado' || newCollaborator.active === false) {
      return res.status(400).json({ message: "O colaborador escolhido não está aprovado/ativo." });
    }

    try {
      const vagaOutra = pairedInclusion?.id ?? teamInclusionId;
      const row = await db.transaction(async (tx) => {
        // Pedido pendente em QUALQUER uma das vagas envolvidas (a outra vaga da
        // permuta/transferência também conta): duas decisões sobre a mesma vaga
        // se atropelariam. O UNIQUE parcial do banco cobre a corrida (23505 → 409).
        const existing = await tx.execute(drizzleSql`
          SELECT id FROM swap_requests
          WHERE status = 'pendente'
            AND (team_inclusion_id IN (${teamInclusionId}, ${vagaOutra}) OR paired_inclusion_id IN (${teamInclusionId}, ${vagaOutra}))
        `);
        if ((((existing as any).rows ?? existing) as any[]).length > 0) {
          throw new HttpError(409, comOutraVaga
            ? "Já existe uma solicitação de troca pendente nesta vaga ou na outra vaga."
            : "Já existe uma solicitação de troca pendente para esta escalação");
        }
        const result = await tx.execute(drizzleSql`
          INSERT INTO swap_requests (team_inclusion_id, requested_by, requested_by_name, current_collaborator_id, new_collaborator_id, reason, status, new_city, swap_kind, paired_inclusion_id, paired_new_city)
          VALUES (${teamInclusionId}, ${currentUser.id}, ${currentUser.name}, ${currentCollaboratorId}, ${newCollaboratorId}, ${reason.trim()}, 'pendente', ${String(newCity).trim()}, ${comOutraVaga ? kind : 'substituicao'}, ${comOutraVaga && pairedInclusion ? pairedInclusion.id : null}, ${permuta ? String(pairedNewCity).trim() : null})
          RETURNING *
        `);
        const created = ((result as any).rows ?? result)[0];
        const detalhe = `Solicitação de troca (${comOutraVaga ? kind : "substituição"}) aberta por ${currentUser.name}: ${newCollaborator.fullName} — motivo: ${reason.trim()}`;
        const logs = [logDaTroca(teamInclusionId, "swap_requested", detalhe, currentCollaboratorId, newCollaboratorId, currentUser)];
        if (pairedInclusion) logs.push(logDaTroca(pairedInclusion.id, "swap_requested", detalhe, pairedInclusion.collaboratorId ?? null, currentCollaboratorId, currentUser));
        await tx.insert(teamInclusionLogsTable).values(logs);
        return created;
      });
      await createAuditLog("create", "swap_request", String(row.id), row, currentUser.id, currentUser.name, undefined, req);
      res.status(201).json(row);
    } catch (error) {
      if (ehViolacaoDeUnicidade(error)) return res.status(409).json({ message: "Já existe uma solicitação de troca pendente para esta escalação" });
      responderErroComStatus(res, error, "Erro ao criar solicitação de troca", 500);
    }
  });

  /** Carrega o pedido com o evento da vaga (para a trava de evento encerrado). */
  const carregarTroca = async (id: string) => {
    const srRows = await db.execute(drizzleSql`SELECT sr.*, (SELECT event_id FROM team_inclusions WHERE id = sr.team_inclusion_id) AS inclusion_event_id
      FROM swap_requests sr WHERE sr.id = ${id}`);
    return ((srRows as any).rows ?? srRows)[0] as Record<string, any> | undefined;
  };

  app.patch("/api/swap-requests/:id/approve", async (req, res) => {
    const currentUser = await atorDaVaga(req, res);
    if (!currentUser) return;

    const isAdminOrPurchasing = ehAdminOuCompras(currentUser);
    if (!isAdminOrPurchasing) return res.status(403).json({ message: "Sem permissão" });

    const { id } = req.params;
    const { reviewComment } = req.body ?? {};

    try {
      const sr = await carregarTroca(id);
      if (!sr) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (sr.status !== 'pendente') return res.status(409).json({ message: "Este pedido já foi decidido" });
      // Evento encerrado: só o administrador. O eventId já veio junto do swap
      // request (subselect acima) — a guarda não relê a escalação.
      if (!await assertInclusionEventEditable(sr.team_inclusion_id, currentUser, res, { eventId: sr.inclusion_event_id ?? null })) return;

      // "Sai de" (dono, 14/09): quem APROVA não muda nada — só vê e decide.
      // Vale a cidade do pedido; em solicitação antiga (feita antes do campo
      // existir) vale a cidade do cadastro do colaborador. Qualquer cidade no
      // corpo desta rota é ignorada.
      const cidadeDoCadastro = async (collaboratorId: string | null | undefined) =>
        collaboratorId ? String((await storage.getCollaborator(collaboratorId))?.city ?? "").trim() : "";
      const saiDe = String(sr.new_city ?? "").trim() || await cidadeDoCadastro(sr.new_collaborator_id);
      const erroSaiDe = validarSaiDe(saiDe);
      if (erroSaiDe) return res.status(400).json({ message: "Solicitação sem cidade de saída do novo colaborador — recuse e peça de novo." });

      const [vagaDoPedido, vagaPareada] = await Promise.all([
        storage.getTeamInclusion(sr.team_inclusion_id),
        sr.paired_inclusion_id ? storage.getTeamInclusion(sr.paired_inclusion_id) : Promise.resolve(undefined),
      ]);
      const erroVaga = vagaVivaParaTroca(vagaDoPedido, "A vaga do pedido");
      if (erroVaga) return res.status(erroVaga.status === 404 ? 409 : erroVaga.status).json({ message: `${erroVaga.message} Recuse o pedido.` });
      const vaga = vagaDoPedido!;
      const nomeDoNovo = String((await storage.getCollaborator(sr.new_collaborator_id))?.fullName ?? "novo colaborador");
      const decisao = { status: 'aprovado', reviewedBy: currentUser.id, reviewedByName: currentUser.name, reviewComment: reviewComment ?? null };
      const auditarPedido = async (rowDepois: unknown) => createAuditLog("approve", "swap_request", id, rowDepois, currentUser.id, currentUser.name, sr, req);

      if (sr.swap_kind === 'transferencia') {
        // Transferência (dono, 14/09): a pessoa sai da vaga de origem e entra
        // nesta, que estava aberta — numa transação só. A de origem volta a
        // ficar aberta (sem colaborador, de volta à escalação, como a reprovação
        // do gestor faz). Se esta vaga já ganhou alguém ou a pessoa já saiu da
        // origem, recusa em vez de aplicar sobre um estado que ninguém viu.
        const erroOrigem = vagaVivaParaTroca(vagaPareada, "A vaga de origem");
        if (erroOrigem) return res.status(409).json({ message: `${erroOrigem.message} Recuse o pedido.` });
        const vagaOrigem = vagaPareada!;
        if (vaga.collaboratorId || vagaOrigem.collaboratorId !== sr.new_collaborator_id) {
          return res.status(409).json({ message: "As vagas mudaram desde o pedido — recuse e peça a transferência de novo." });
        }
        if (!await assertInclusionEventEditable(vagaOrigem.id, currentUser, res, { eventId: vagaOrigem.eventId ?? null })) return;
        const conflito = await conflitoNaTroca(sr.new_collaborator_id, vaga, [vaga.id, vagaOrigem.id]);
        if (conflito) return res.status(conflito.status).json({ message: conflito.message });
        const pedido = await db.transaction(async (tx) => {
          const [pedido] = await tx.update(swapRequestsTable).set({ ...decisao, newCity: saiDe, reviewedAt: new Date() })
            .where(and(eq(swapRequestsTable.id, id), eq(swapRequestsTable.status, 'pendente'))).returning();
          if (!pedido) throw new HttpError(409, "Este pedido já foi decidido");
          const [destino] = await tx.update(teamInclusionsTable)
            .set({ collaboratorId: sr.new_collaborator_id, city: saiDe, updatedAt: new Date(), updatedBy: currentUser.id })
            .where(and(eq(teamInclusionsTable.id, vaga.id), isNull(teamInclusionsTable.collaboratorId), isNull(teamInclusionsTable.deletedAt))).returning();
          const [origem] = await tx.update(teamInclusionsTable)
            .set({ collaboratorId: null, status: 'escalacao', phase: 'escalacao', updatedAt: new Date(), updatedBy: currentUser.id })
            .where(and(eq(teamInclusionsTable.id, vagaOrigem.id), eq(teamInclusionsTable.collaboratorId, sr.new_collaborator_id), isNull(teamInclusionsTable.deletedAt))).returning();
          if (!destino || !origem) throw new HttpError(409, "As vagas mudaram desde o pedido — recuse e peça a transferência de novo.");
          await tx.insert(teamInclusionLogsTable).values([
            logDaTroca(vaga.id, "swap_approved", `Transferência aprovada por ${currentUser.name}: ${nomeDoNovo} entrou nesta vaga (vinha da vaga #${vagaOrigem.inclusionNumber})`, null, sr.new_collaborator_id, currentUser),
            logDaTroca(vagaOrigem.id, "swap_approved", `Transferência aprovada por ${currentUser.name}: ${nomeDoNovo} saiu desta vaga para a vaga #${vaga.inclusionNumber} — vaga voltou a aberta`, sr.new_collaborator_id, null, currentUser),
          ]);
          return pedido;
        });
        await auditarPedido(pedido);
        return res.json({ message: "Transferência aprovada com sucesso" });
      }

      if (sr.swap_kind === 'permuta') {
        // Permuta (dono, 14/09): os DOIS trocam de vaga numa transação só —
        // nunca fica um colaborador em duas vagas nem uma vaga vazia no meio.
        // Se alguma vaga mudou desde o pedido, recusa em vez de aplicar sobre
        // um estado que o solicitante não viu.
        const erroOutra = vagaVivaParaTroca(vagaPareada, "A outra vaga da troca");
        if (erroOutra) return res.status(409).json({ message: `${erroOutra.message} Recuse o pedido.` });
        const outra = vagaPareada!;
        if (vaga.collaboratorId !== sr.current_collaborator_id || outra.collaboratorId !== sr.new_collaborator_id) {
          return res.status(409).json({ message: "As vagas mudaram desde o pedido — recuse e peça a troca de novo." });
        }
        if (!await assertInclusionEventEditable(outra.id, currentUser, res, { eventId: outra.eventId ?? null })) return;
        const saiDeOutro = String(sr.paired_new_city ?? "").trim() || await cidadeDoCadastro(sr.current_collaborator_id);
        if (validarSaiDe(saiDeOutro)) {
          return res.status(400).json({ message: "Solicitação sem cidade de saída do colaborador que vai para a outra vaga — recuse e peça de novo." });
        }
        const c1 = await conflitoNaTroca(sr.new_collaborator_id, vaga, [vaga.id, outra.id]);
        if (c1) return res.status(c1.status).json({ message: c1.message });
        const c2 = await conflitoNaTroca(sr.current_collaborator_id, outra, [vaga.id, outra.id]);
        if (c2) return res.status(c2.status).json({ message: c2.message });
        const nomeDoAtual = String((await storage.getCollaborator(sr.current_collaborator_id))?.fullName ?? "colaborador atual");
        const { pedido, logisticaParaRevisar } = await db.transaction(async (tx) => {
          const [pedido] = await tx.update(swapRequestsTable).set({ ...decisao, newCity: saiDe, pairedNewCity: saiDeOutro, reviewedAt: new Date() })
            .where(and(eq(swapRequestsTable.id, id), eq(swapRequestsTable.status, 'pendente'))).returning();
          if (!pedido) throw new HttpError(409, "Este pedido já foi decidido");
          const [a] = await tx.update(teamInclusionsTable)
            .set({ collaboratorId: sr.new_collaborator_id, city: saiDe, updatedAt: new Date(), updatedBy: currentUser.id })
            .where(and(eq(teamInclusionsTable.id, vaga.id), eq(teamInclusionsTable.collaboratorId, sr.current_collaborator_id), isNull(teamInclusionsTable.deletedAt))).returning();
          const [b] = await tx.update(teamInclusionsTable)
            .set({ collaboratorId: sr.current_collaborator_id, city: saiDeOutro, updatedAt: new Date(), updatedBy: currentUser.id })
            .where(and(eq(teamInclusionsTable.id, outra.id), eq(teamInclusionsTable.collaboratorId, sr.new_collaborator_id), isNull(teamInclusionsTable.deletedAt))).returning();
          if (!a || !b) throw new HttpError(409, "As vagas mudaram desde o pedido — recuse e peça a troca de novo.");
          // Passagem/hospedagem das duas vagas NÃO são apagadas: Compras revisa.
          const [p1, p2, h1, h2] = await Promise.all([
            tx.select({ id: ticketsTable.id }).from(ticketsTable).where(eq(ticketsTable.teamInclusionId, vaga.id)),
            tx.select({ id: ticketsTable.id }).from(ticketsTable).where(eq(ticketsTable.teamInclusionId, outra.id)),
            tx.select({ id: accommodationsTable.id }).from(accommodationsTable).where(eq(accommodationsTable.teamInclusionId, vaga.id)),
            tx.select({ id: accommodationsTable.id }).from(accommodationsTable).where(eq(accommodationsTable.teamInclusionId, outra.id)),
          ]);
          const logisticaParaRevisar = p1.length + p2.length + h1.length + h2.length > 0;
          const aviso = logisticaParaRevisar ? " — passagem/hospedagem já registradas: Compras deve revisar" : "";
          await tx.insert(teamInclusionLogsTable).values([
            logDaTroca(vaga.id, "swap_approved", `Permuta aprovada por ${currentUser.name}: ${nomeDoAtual} → ${nomeDoNovo}${aviso}`, sr.current_collaborator_id, sr.new_collaborator_id, currentUser),
            logDaTroca(outra.id, "swap_approved", `Permuta aprovada por ${currentUser.name}: ${nomeDoNovo} → ${nomeDoAtual}${aviso}`, sr.new_collaborator_id, sr.current_collaborator_id, currentUser),
          ]);
          return { pedido, logisticaParaRevisar };
        });
        await auditarPedido(pedido);
        return res.json({ message: "Troca entre vagas aprovada com sucesso", logisticaParaRevisar });
      }

      // Substituição simples: o colaborador atual da vaga precisa ser o do pedido.
      if ((vaga.collaboratorId ?? null) !== (sr.current_collaborator_id ?? null)) {
        return res.status(409).json({ message: "O colaborador desta vaga mudou desde o pedido — recuse e peça a troca de novo." });
      }
      const conflito = await conflitoNaTroca(sr.new_collaborator_id, vaga, [vaga.id]);
      if (conflito) return res.status(conflito.status).json({ message: conflito.message });
      // Passagem/hospedagem da vaga NÃO são apagadas: ficam para Compras revisar.
      const { temPassagem, temHospedagem } = await logisticaDaVaga(vaga.id);
      const logisticaParaRevisar = temPassagem || temHospedagem;
      const pedido = await db.transaction(async (tx) => {
        const [pedido] = await tx.update(swapRequestsTable).set({ ...decisao, newCity: saiDe, reviewedAt: new Date() })
          .where(and(eq(swapRequestsTable.id, id), eq(swapRequestsTable.status, 'pendente'))).returning();
        if (!pedido) throw new HttpError(409, "Este pedido já foi decidido");
        // Trocar colaborador E cidade de saída na vaga — a cidade é a origem da
        // passagem; ficar com a do colaborador antigo comprava do lugar errado.
        const [atualizada] = await tx.update(teamInclusionsTable)
          .set({ collaboratorId: sr.new_collaborator_id, city: saiDe, updatedAt: new Date(), updatedBy: currentUser.id })
          .where(and(
            eq(teamInclusionsTable.id, vaga.id),
            sr.current_collaborator_id ? eq(teamInclusionsTable.collaboratorId, sr.current_collaborator_id) : isNull(teamInclusionsTable.collaboratorId),
            isNull(teamInclusionsTable.deletedAt),
          )).returning();
        if (!atualizada) throw new HttpError(409, "O colaborador desta vaga mudou desde o pedido — recuse e peça a troca de novo.");
        await tx.insert(teamInclusionLogsTable).values([
          logDaTroca(vaga.id, "swap_approved",
            `Troca aprovada por ${currentUser.name}: ${nomeDoNovo} assume a vaga${logisticaParaRevisar ? " — passagem/hospedagem já registradas: Compras deve revisar" : ""}`,
            sr.current_collaborator_id ?? null, sr.new_collaborator_id, currentUser),
        ]);
        return pedido;
      });
      await auditarPedido(pedido);
      res.json({ message: "Troca aprovada com sucesso", logisticaParaRevisar });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao aprovar troca", 500);
    }
  });

  app.patch("/api/swap-requests/:id/reject", async (req, res) => {
    const currentUser = await atorDaVaga(req, res);
    if (!currentUser) return;

    const isAdminOrPurchasing = ehAdminOuCompras(currentUser);
    if (!isAdminOrPurchasing) return res.status(403).json({ message: "Sem permissão" });

    const { id } = req.params;
    const { reviewComment } = req.body ?? {};
    if (!reviewComment?.trim()) return res.status(400).json({ message: "Motivo da rejeição é obrigatório" });

    try {
      const sr = await carregarTroca(id);
      if (!sr) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (sr.status !== 'pendente') return res.status(409).json({ message: "Este pedido já foi decidido" });
      if (!await assertInclusionEventEditable(sr.team_inclusion_id, currentUser, res, { eventId: sr.inclusion_event_id ?? null })) return;

      const pedido = await db.transaction(async (tx) => {
        const [pedido] = await tx.update(swapRequestsTable)
          .set({ status: 'rejeitado', reviewedBy: currentUser.id, reviewedByName: currentUser.name, reviewComment: reviewComment.trim(), reviewedAt: new Date() })
          .where(and(eq(swapRequestsTable.id, id), eq(swapRequestsTable.status, 'pendente'))).returning();
        if (!pedido) throw new HttpError(409, "Este pedido já foi decidido");
        const logs = [logDaTroca(sr.team_inclusion_id, "swap_rejected", `Troca recusada por ${currentUser.name}: ${reviewComment.trim()}`, sr.current_collaborator_id ?? null, sr.current_collaborator_id ?? null, currentUser)];
        if (sr.paired_inclusion_id) logs.push(logDaTroca(sr.paired_inclusion_id, "swap_rejected", `Troca recusada por ${currentUser.name}: ${reviewComment.trim()}`, null, null, currentUser));
        await tx.insert(teamInclusionLogsTable).values(logs);
        return pedido;
      });
      await createAuditLog("reject", "swap_request", id, pedido, currentUser.id, currentUser.name, sr, req);
      res.json({ message: "Troca rejeitada" });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao rejeitar troca", 500);
    }
  });

  app.patch("/api/swap-requests/:id/cancel", async (req, res) => {
    const currentUser = await atorDaVaga(req, res);
    if (!currentUser) return;

    const { id } = req.params;
    try {
      const sr = await carregarTroca(id);
      if (!sr) return res.status(404).json({ message: "Solicitação não encontrada" });
      if (sr.status !== 'pendente') return res.status(409).json({ message: "Este pedido já foi decidido" });

      const isAdminOrPurchasing = ehAdminOuCompras(currentUser);
      const isRequester = sr.requested_by === currentUser.id;
      if (!isAdminOrPurchasing && !isRequester) return res.status(403).json({ message: "Sem permissão para cancelar" });
      if (!await assertInclusionEventEditable(sr.team_inclusion_id, currentUser, res, { eventId: sr.inclusion_event_id ?? null })) return;

      const pedido = await db.transaction(async (tx) => {
        const [pedido] = await tx.update(swapRequestsTable)
          .set({ status: 'cancelado', reviewedBy: currentUser.id, reviewedByName: currentUser.name, reviewedAt: new Date() })
          .where(and(eq(swapRequestsTable.id, id), eq(swapRequestsTable.status, 'pendente'))).returning();
        if (!pedido) throw new HttpError(409, "Este pedido já foi decidido");
        const logs = [logDaTroca(sr.team_inclusion_id, "swap_cancelled", `Solicitação de troca cancelada por ${currentUser.name}`, null, null, currentUser)];
        if (sr.paired_inclusion_id) logs.push(logDaTroca(sr.paired_inclusion_id, "swap_cancelled", `Solicitação de troca cancelada por ${currentUser.name}`, null, null, currentUser));
        await tx.insert(teamInclusionLogsTable).values(logs);
        return pedido;
      });
      await createAuditLog("cancel", "swap_request", id, pedido, currentUser.id, currentUser.name, sr, req);
      res.json({ message: "Solicitação cancelada" });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao cancelar solicitação", 500);
    }
  });
}
