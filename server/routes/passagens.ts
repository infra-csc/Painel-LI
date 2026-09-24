/**
 * Passagens (tickets): listagem, registro, carimbo de emissão em lote e edição.
 * Papéis: logística (admin/Compras/Produção) registra e edita; só admin e
 * Compras carimbam a emissão. O status da vaga é derivado após cada escrita.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { tickets as ticketsTable, insertTicketSchema } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { assertInclusionEventEditable, newEventCache } from "../event-guard";
import {
  montarLogDeAuditoria,
  createAuditLog,
  createAuditLogsBatch,
  responderErroComStatus,
  requireRoles,
  LOGISTICA_ROLES,
  eventIdDaQuery,
  recalcularStatusDeLogistica,
} from "./_compartilhado";

export function registrarPassagens(app: Express): void {
  // Tickets routes
  app.get("/api/tickets", async (req, res) => {
    try {
      const eventId = eventIdDaQuery(req);
      const tickets = await storage.getTickets(eventId);
      res.set("Cache-Control", "no-store"); // dados do passageiro
      res.json(tickets);
    } catch {
      res.status(500).json({ message: "Erro ao buscar passagens" });
    }
  });

  app.post("/api/tickets", async (req, res) => {
    const ticketCreator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ticketCreator) return;
    try {
      // Não logar o corpo: passagens contêm dados pessoais do passageiro
      const ticketData = insertTicketSchema.parse(req.body);
      const vaga = await storage.getTeamInclusion(ticketData.teamInclusionId);
      if (!vaga || vaga.deletedAt) return res.status(404).json({ message: "Vaga não encontrada ou excluída" });
      // Evento encerrado: só o administrador
      if (!await assertInclusionEventEditable(ticketData.teamInclusionId, ticketCreator, res, vaga)) return;
      const ticket = await storage.createTicket({ ...ticketData, updatedBy: ticketCreator.id });
      await createAuditLog('create', 'ticket', ticket.id, ticket, ticketCreator.id, ticketCreator.name || 'Sistema', undefined, req);
      // Status da vaga DERIVADO pelo servidor (23/09): o client não manda mais
      // passagem_comprada pelo PATCH.
      const inclusion = await recalcularStatusDeLogistica(ticketData.teamInclusionId, ticketCreator, req);
      res.json(inclusion ? { ...ticket, inclusionStatus: inclusion.status } : ticket);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dados inválidos", error: error.message });
      responderErroComStatus(res, error, "Erro ao registrar passagem");
    }
  });

  /**
   * POST /api/tickets/emitidas — body { inclusionIds: string[], emitida: boolean }
   *
   * "O bilhete saiu" dito à mão por quem compra (regra do dono, 26/08), uma
   * vaga ou várias de uma vez. A partir do carimbo a área não pede mais ajuste
   * naquela vaga; preencher os dados da passagem continua liberado — por isso
   * marcar NÃO exige passagem preenchida: se a vaga ainda não tem linha de
   * passagem, uma é criada só com o carimbo.
   *
   * Desmarcar existe porque erro de clique acontece: reabre a janela de ajuste.
   * Tudo vai para a auditoria, com quem marcou e quando.
   */
  app.post("/api/tickets/emitidas", async (req, res) => {
    // Só ADMIN e COMPRAS carimbam a emissão (decisão do dono, 26/08) — quem
    // preenche a passagem não decide quando a janela de ajuste fecha.
    const actor = await requireRoles(req, res, ["admin", "purchasing"]);
    if (!actor) return;
    const ids: string[] = Array.isArray(req.body?.inclusionIds) ? req.body.inclusionIds.filter((x: unknown) => typeof x === "string") : [];
    const emitida = req.body?.emitida !== false;
    if (ids.length === 0) return res.status(400).json({ message: "Escolha ao menos uma vaga." });
    if (ids.length > 200) return res.status(400).json({ message: "Marque no máximo 200 vagas por vez." });
    try {
      const agora = new Date();
      const ok: string[] = [];
      const pulados: { id: string; motivo: string }[] = [];
      // Leituras EM LOTE (auditoria 28/08): 1 SELECT de vagas + 1 de passagens
      // + cache de evento. Escritas EM LOTE (23/09): um UPDATE … WHERE id IN
      // para as passagens existentes, um INSERT multi-linha para as que faltam
      // e um INSERT de auditoria.
      const vagas = await storage.getTeamInclusionsByIds(ids);
      const vagaPorId = new Map(vagas.map((v) => [v.id, v]));
      const passagens = await db.select().from(ticketsTable).where(inArray(ticketsTable.teamInclusionId, ids));
      const passagensPorVaga = new Map<string, typeof passagens>();
      for (const t of passagens) {
        const lista = passagensPorVaga.get(t.teamInclusionId) ?? [];
        lista.push(t);
        passagensPorVaga.set(t.teamInclusionId, lista);
      }
      const eventCache = newEventCache();
      const patch = { emittedAt: emitida ? agora : null, emittedBy: emitida ? actor.id : null, updatedAt: agora, updatedBy: actor.id };
      const idsParaAtualizar: string[] = [];
      const vagasSemPassagem: string[] = [];
      for (const inclusionId of ids) {
        const inclusion = vagaPorId.get(inclusionId);
        if (!inclusion || inclusion.deletedAt) { pulados.push({ id: inclusionId, motivo: "vaga não encontrada" }); continue; }
        // Evento encerrado: mesma trava do resto da escalação (evento em cache).
        if (!await assertInclusionEventEditable(inclusionId, actor, res, inclusion, eventCache)) return;
        const doVaga = passagensPorVaga.get(inclusionId) ?? [];
        if (doVaga.length === 0) {
          if (!emitida) { pulados.push({ id: inclusionId, motivo: "sem passagem para desmarcar" }); continue; }
          vagasSemPassagem.push(inclusionId);
        } else {
          idsParaAtualizar.push(...doVaga.map((t) => t.id));
        }
        ok.push(inclusionId);
      }
      const anteriorPorTicket = new Map(passagens.map((t) => [t.id, t]));
      const { atualizadas, criadas } = await db.transaction(async (tx) => {
        const atualizadas = idsParaAtualizar.length > 0
          ? await tx.update(ticketsTable).set(patch).where(inArray(ticketsTable.id, idsParaAtualizar)).returning()
          : [];
        const criadas = vagasSemPassagem.length > 0
          ? await tx.insert(ticketsTable).values(vagasSemPassagem.map((teamInclusionId) => ({ teamInclusionId, ...patch }))).returning()
          : [];
        return { atualizadas, criadas };
      });
      await createAuditLogsBatch([
        ...criadas.map((t) => montarLogDeAuditoria("emitir", "ticket", t.id, t, actor.id, actor.name, undefined, req)),
        ...atualizadas.map((t) => montarLogDeAuditoria(emitida ? "emitir" : "desfazer_emissao", "ticket", t.id, t, actor.id, actor.name, anteriorPorTicket.get(t.id), req)),
      ]);
      // Uma vaga que ganhou a primeira linha de passagem passa a "passagem comprada"
      for (const inclusionId of vagasSemPassagem) await recalcularStatusDeLogistica(inclusionId, actor, req);
      res.json({ ok, pulados, emitida });
    } catch (error) {
      console.error("erro ao marcar passagem emitida:", error);
      res.status(500).json({ message: "Erro ao marcar as passagens" });
    }
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    const ticketEditor = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ticketEditor) return;
    try {
      const { id } = req.params;
      // Allowlist via schema: só colunas conhecidas de tickets entram. A passagem
      // nunca troca de inclusão pelo corpo (teamInclusionId) e o ator vem da
      // sessão (updatedBy) — antes o body inteiro ia direto para o UPDATE.
      const parsed = insertTicketSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados inválidos", error: parsed.error.message });
      }
      const { teamInclusionId: _ignoredInclusion, updatedBy: _ignoredActor, ...allowed } = parsed.data;
      const updates = {
        ...allowed,
        updatedAt: new Date(),
        updatedBy: ticketEditor.id,
      };
      const prev = await storage.getTicket(id);
      if (!prev) return res.status(404).json({ message: "Passagem não encontrada" });
      // Evento encerrado: só o administrador
      if (!await assertInclusionEventEditable(prev.teamInclusionId, ticketEditor, res)) return;
      const ticket = await storage.updateTicket(id, updates);
      await createAuditLog('update', 'ticket', id, ticket, ticketEditor.id, ticketEditor.name || 'Sistema', prev, req);
      const inclusion = await recalcularStatusDeLogistica(prev.teamInclusionId, ticketEditor, req);
      res.json(inclusion ? { ...ticket, inclusionStatus: inclusion.status } : ticket);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar passagem");
    }
  });
}
