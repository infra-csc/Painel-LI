/**
 * Hospedagem (accommodations): listagem, registro e edição.
 * Papéis: logística (admin/Compras/Produção). O status da vaga é derivado
 * após cada escrita; a hospedagem nunca troca de vaga pelo corpo.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertAccommodationSchema } from "@shared/schema";
import { assertInclusionEventEditable } from "../event-guard";
import {
  createAuditLog,
  responderErroComStatus,
  requireRoles,
  LOGISTICA_ROLES,
  eventIdDaQuery,
  recalcularStatusDeLogistica,
} from "./_compartilhado";

export function registrarHospedagem(app: Express): void {
  // Accommodations routes
  app.get("/api/accommodations", async (req, res) => {
    try {
      const eventId = eventIdDaQuery(req);
      const accommodations = await storage.getAccommodations(eventId);
      res.set("Cache-Control", "no-store"); // dados do hóspede
      res.json(accommodations);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar hospedagens" });
    }
  });

  app.post("/api/accommodations", async (req, res) => {
    const accommodationCreator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!accommodationCreator) return;
    try {
      // Não logar o corpo: hospedagem contém dados pessoais do hóspede
      const accommodationData = insertAccommodationSchema.parse(req.body);
      const vaga = await storage.getTeamInclusion(accommodationData.teamInclusionId);
      if (!vaga || vaga.deletedAt) return res.status(404).json({ message: "Vaga não encontrada ou excluída" });
      // Evento encerrado: só o administrador
      if (!await assertInclusionEventEditable(accommodationData.teamInclusionId, accommodationCreator, res, vaga)) return;
      const accommodation = await storage.createAccommodation({ ...accommodationData, updatedBy: accommodationCreator.id });
      await createAuditLog('create', 'accommodation', accommodation.id, accommodation, accommodationCreator.id, accommodationCreator.name || 'Sistema', undefined, req);
      // Status da vaga DERIVADO pelo servidor (23/09): o client não manda mais
      // hospedagem_comprada pelo PATCH.
      const inclusion = await recalcularStatusDeLogistica(accommodationData.teamInclusionId, accommodationCreator, req);
      res.json(inclusion ? { ...accommodation, inclusionStatus: inclusion.status } : accommodation);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dados inválidos", error: error.message });
      responderErroComStatus(res, error, "Erro ao registrar hospedagem");
    }
  });

  app.patch("/api/accommodations/:id", async (req, res) => {
    const accommodationEditor = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!accommodationEditor) return;
    try {
      const { id } = req.params;
      // Allowlist via schema: só colunas conhecidas de accommodations entram
      // (antes o body inteiro ia direto para o UPDATE). O ator vem da sessão
      // (updatedBy) e a hospedagem NUNCA troca de escalação pelo corpo — mandar
      // um teamInclusionId de outro evento era o jeito de furar a trava de
      // evento encerrado: a guarda checava o evento ANTIGO e o UPDATE movia a
      // linha para o novo. Mesmo tratamento do PATCH de passagens.
      const parsed = insertAccommodationSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados inválidos", error: parsed.error.message });
      }
      const { teamInclusionId: bodyInclusionId, updatedBy: _ignoredActor, ...allowed } = parsed.data;
      const updates = {
        ...allowed,
        updatedAt: new Date(),
        updatedBy: accommodationEditor.id, // ator vem da sessão, não do corpo
      };
      const prev = await storage.getAccommodation(id);
      if (!prev) return res.status(404).json({ message: "Hospedagem não encontrada" });
      // O client manda o teamInclusionId da própria hospedagem (é o mesmo do
      // POST). Divergiu = tentativa de mover a linha: recusa em vez de ignorar
      // em silêncio, para o erro aparecer em vez de virar um "salvou" mentiroso.
      if (bodyInclusionId != null && bodyInclusionId !== prev.teamInclusionId) {
        return res.status(400).json({ message: "A hospedagem não pode ser movida para outra escalação" });
      }
      // Evento encerrado: só o administrador. `prev` já está carregado, mas a
      // guarda precisa do eventId (que mora na escalação, não na hospedagem).
      if (!await assertInclusionEventEditable(prev.teamInclusionId, accommodationEditor, res)) return;
      const accommodation = await storage.updateAccommodation(id, updates);
      await createAuditLog('update', 'accommodation', id, accommodation, accommodationEditor.id, accommodationEditor.name || 'Sistema', prev, req);
      const inclusion = await recalcularStatusDeLogistica(prev.teamInclusionId, accommodationEditor, req);
      res.json(inclusion ? { ...accommodation, inclusionStatus: inclusion.status } : accommodation);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar hospedagem");
    }
  });
}
