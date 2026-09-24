/**
 * Controle de Bagagem: solicitações (CRUD com exclusão lógica) e histórico
 * pré-sistema por colaborador × CIA.
 * Papéis: admin e Compras.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertBaggageRequestSchema } from "@shared/schema";
import { createAuditLog, requireRoles, primeiraMensagemDoZod } from "./_compartilhado";

export function registrarBagagem(app: Express): void {
  // ─── Controle de Bagagem ────────────────────────────────────────────────────
  // Acesso restrito a admin e purchasing. Identidade SEMPRE da sessão.
  // Contagens por CIA são derivadas dos registros no client — o servidor só
  // guarda as solicitações. Exclusão é soft delete (deleted_at/deleted_by).

  const requireBagagem = (req: Request, res: Response) =>
    requireRoles(req, res, ['admin', 'purchasing'] as const);

  // Campos que o PATCH aceita — nada de mass assignment de created_by/deleted_at
  const BAGGAGE_EDITABLE_FIELDS = [
    'loc', 'cia', 'valueCents', 'os', 'quantity', 'agency',
    'requestDate', 'boardingDate', 'notes', 'eventId', 'collaboratorId',
  ] as const;

  const MSG_BAGAGEM_INVALIDA = "Dados inválidos. Verifique os campos e tente de novo.";

  app.get("/api/baggage-requests", async (req, res) => {
    if (!await requireBagagem(req, res)) return;
    try {
      const eventId = typeof req.query.eventId === 'string' && req.query.eventId ? req.query.eventId : undefined;
      const requests = await storage.getBaggageRequests(eventId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching baggage requests:", error);
      res.status(500).json({ message: "Erro ao buscar solicitações de bagagem" });
    }
  });

  // Histórico pré-sistema (contagens importadas da planilha antiga)
  app.get("/api/baggage-history", async (req, res) => {
    if (!await requireBagagem(req, res)) return;
    try {
      res.json(await storage.getBaggageHistory());
    } catch (error) {
      console.error("Error fetching baggage history:", error);
      res.status(500).json({ message: "Erro ao buscar o histórico de bagagens" });
    }
  });

  // Ajuste manual da contagem histórica (admin/compras): define o valor de
  // colaborador × CIA; 0 remove. Auditado.
  const BAGGAGE_HISTORY_CIAS = ["Azul", "Gol", "TAM", "Outros"] as const;
  app.put("/api/baggage-history", async (req, res) => {
    const user = await requireBagagem(req, res);
    if (!user) return;
    try {
      const schema = z.object({
        collaboratorId: z.string().min(1, "Informe o colaborador"),
        cia: z.enum(BAGGAGE_HISTORY_CIAS, { errorMap: () => ({ message: "CIA inválida" }) }),
        quantity: z.number().int("Quantidade deve ser inteira").min(0, "Quantidade não pode ser negativa").max(999),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error, MSG_BAGAGEM_INVALIDA) });
      const collaborator = await storage.getCollaborator(parsed.data.collaboratorId);
      if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });

      const before = (await storage.getBaggageHistory())
        .find(h => h.collaboratorId === parsed.data.collaboratorId && h.cia === parsed.data.cia);
      const row = await storage.setBaggageHistory(parsed.data.collaboratorId, parsed.data.cia, parsed.data.quantity);
      await createAuditLog(
        'update', 'baggage_history', `${parsed.data.collaboratorId}:${parsed.data.cia}`,
        { before: before?.quantity ?? 0, after: parsed.data.quantity, collaborator: collaborator.fullName },
        user.id, user.name, undefined, req,
      );
      res.json(row ?? { collaboratorId: parsed.data.collaboratorId, cia: parsed.data.cia, quantity: 0 });
    } catch (error) {
      console.error("Error updating baggage history:", error);
      res.status(500).json({ message: "Erro ao ajustar o histórico de bagagens" });
    }
  });

  app.post("/api/baggage-requests", async (req, res) => {
    const user = await requireBagagem(req, res);
    if (!user) return;
    try {
      const parsed = insertBaggageRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error, MSG_BAGAGEM_INVALIDA) });
      }
      const event = await storage.getEvent(parsed.data.eventId);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      const collaborator = await storage.getCollaborator(parsed.data.collaboratorId);
      if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });

      const created = await storage.createBaggageRequest({
        ...parsed.data,
        loc: parsed.data.loc.toUpperCase(),
        createdBy: user.id,
        createdByName: user.name,
      });
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating baggage request:", error);
      res.status(500).json({ message: "Erro ao registrar solicitação de bagagem" });
    }
  });

  app.patch("/api/baggage-requests/:id", async (req, res) => {
    const user = await requireBagagem(req, res);
    if (!user) return;
    try {
      const existing = await storage.getBaggageRequest(req.params.id);
      if (!existing || existing.deletedAt) {
        return res.status(404).json({ message: "Solicitação não encontrada" });
      }

      // Allowlist: só os campos editáveis entram no merge
      const updates: Record<string, unknown> = {};
      for (const field of BAGGAGE_EDITABLE_FIELDS) {
        if (req.body?.[field] !== undefined) updates[field] = req.body[field];
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Nenhum campo editável informado" });
      }

      // Valida o registro COMPLETO (existente + alterações) com o mesmo schema
      // do POST — as regras cross-field (embarque >= solicitação) valem sempre
      const candidate = {
        eventId: existing.eventId,
        collaboratorId: existing.collaboratorId,
        loc: existing.loc,
        cia: existing.cia,
        valueCents: existing.valueCents,
        os: existing.os,
        quantity: existing.quantity,
        agency: existing.agency,
        requestDate: existing.requestDate,
        boardingDate: existing.boardingDate,
        notes: existing.notes,
        ...updates,
      };
      const parsed = insertBaggageRequestSchema.safeParse(candidate);
      if (!parsed.success) {
        return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error, MSG_BAGAGEM_INVALIDA) });
      }

      if (updates.eventId !== undefined && updates.eventId !== existing.eventId) {
        const event = await storage.getEvent(parsed.data.eventId);
        if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      }
      if (updates.collaboratorId !== undefined && updates.collaboratorId !== existing.collaboratorId) {
        const collaborator = await storage.getCollaborator(parsed.data.collaboratorId);
        if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });
      }

      const updated = await storage.updateBaggageRequest(req.params.id, {
        ...parsed.data,
        loc: parsed.data.loc.toUpperCase(),
      });
      if (!updated) return res.status(404).json({ message: "Solicitação não encontrada" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating baggage request:", error);
      res.status(500).json({ message: "Erro ao atualizar solicitação de bagagem" });
    }
  });

  app.delete("/api/baggage-requests/:id", async (req, res) => {
    const user = await requireBagagem(req, res);
    if (!user) return;
    try {
      const existing = await storage.getBaggageRequest(req.params.id);
      if (!existing || existing.deletedAt) {
        return res.status(404).json({ message: "Solicitação não encontrada" });
      }
      await storage.softDeleteBaggageRequest(req.params.id, user.id);
      await createAuditLog('delete', 'baggage_request', req.params.id, existing, user.id, user.name, undefined, req);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting baggage request:", error);
      res.status(500).json({ message: "Erro ao excluir solicitação de bagagem" });
    }
  });
}
