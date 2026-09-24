/**
 * Observações do orçamento (budget_notes, chat de auditoria) e histórico por
 * entidade (activity-logs, lido de system_logs).
 * Papéis: qualquer sessão lê/escreve observações; histórico é do financeiro
 * (admin/RH).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { budgetNotes, insertBudgetNoteSchema } from "@shared/schema";
import { eq, and, sql as drizzleSql } from "drizzle-orm";
import { effectiveUserId } from "../simulation";
import { requireRoles, FINANCE_ROLES } from "./_compartilhado";

export function registrarNotasEHistorico(app: Express): void {
  // ─── Budget Notes (Chat de Auditoria) ───────────────────────────────────────

  // GET /api/budget-notes?entityType=X&entityId=Y
  app.get("/api/budget-notes", async (req, res) => {
    const userId = effectiveUserId(req);
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) return res.status(400).json({ message: "entityType e entityId obrigatórios" });
    try {
      const notes = await db
        .select()
        .from(budgetNotes)
        .where(and(eq(budgetNotes.entityType, entityType), eq(budgetNotes.entityId, entityId)))
        .orderBy(budgetNotes.createdAt);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching budget notes:", error);
      res.status(500).json({ message: "Erro ao buscar observações" });
    }
  });

  // POST /api/budget-notes
  app.post("/api/budget-notes", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Usuário não encontrado" });
    const parsed = insertBudgetNoteSchema.safeParse({
      ...req.body,
      authorId: userId,
      authorName: user.name,
    });
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", errors: parsed.error.flatten() });
    try {
      const [note] = await db.insert(budgetNotes).values(parsed.data).returning();

      // Se nota em budget_planned que já foi enviado → log automático pós-planejamento
      if (parsed.data.entityType === 'planned') {
        try {
          const sentCheck = await db.execute(drizzleSql`
            SELECT id FROM budget_actual WHERE planned_id = ${parsed.data.entityId} LIMIT 1`
          );
          const rows = Array.isArray(sentCheck) ? sentCheck : (sentCheck as any).rows || [];
          if (rows.length > 0) {
            await storage.createSystemLog({
              action: 'note',
              entityType: 'budget_planned',
              entityId: parsed.data.entityId,
              entityName: user.name,
              details: `Nota adicionada pós-planejamento por ${user.name}`,
              userId,
              userName: user.name,
              previousData: null,
              newData: JSON.stringify({ content: parsed.data.content }),
            });
          }
        } catch (_) {}
      }

      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating budget note:", error);
      res.status(500).json({ message: "Erro ao criar observação" });
    }
  });

  // GET /api/budget-notes/by-event?entityType=actual|planned&eventId=X
  app.get("/api/budget-notes/by-event", async (req, res) => {
    const userId = effectiveUserId(req);
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const { entityType, eventId } = req.query as Record<string, string>;
    if (!entityType || !eventId) return res.status(400).json({ message: "entityType e eventId obrigatórios" });
    try {
      let result: any;
      if (entityType === "actual") {
        result = await db.execute(drizzleSql`
          SELECT bn.* FROM budget_notes bn
          JOIN budget_actual ba ON bn.entity_id = ba.id
          WHERE bn.entity_type = 'actual' AND ba.event_id = ${eventId}
          ORDER BY bn.created_at DESC`
        );
      } else if (entityType === "planned") {
        result = await db.execute(drizzleSql`
          SELECT bn.* FROM budget_notes bn
          JOIN budget_planned bp ON bn.entity_id = bp.id
          WHERE bn.entity_type = 'planned' AND bp.event_id = ${eventId}
          ORDER BY bn.created_at DESC`
        );
      } else {
        return res.json([]);
      }
      const notes = Array.isArray(result) ? result : (result as any).rows || [];
      res.json(notes);
    } catch (error) {
      console.error("Error fetching event budget notes:", error);
      res.status(500).json({ message: "Erro ao buscar observações do evento" });
    }
  });

  // ── Activity Logs (Histórico por entidade) ──

  // GET /api/activity-logs?entityType=budget_planned|budget_actual&entityId=X
  // Histórico por entidade (23/09): antes qualquer sessão lia previous_data/
  // new_data de qualquer registro. O briefing pedia só admin (como
  // /api/system-logs), mas a linha do tempo é usada pelo RH nas telas
  // Planejado/Realizado/Comparativo (activity-timeline.tsx) — fica no grupo
  // financeiro (admin + RH), que é quem acessa essas telas.
  app.get("/api/activity-logs", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    const { entityType, entityId } = req.query as Record<string, string>;
    if (!entityType || !entityId) return res.status(400).json({ message: "entityType e entityId obrigatórios" });
    try {
      const result = await db.execute(drizzleSql`
        SELECT id, action, entity_type, entity_id, entity_name, details,
               previous_data, new_data, user_id, user_name, created_at
        FROM system_logs
        WHERE entity_type = ${entityType} AND entity_id = ${entityId}
        ORDER BY created_at DESC
        LIMIT 100`
      );
      const logs = Array.isArray(result) ? result : (result as any).rows || [];
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Erro ao buscar histórico" });
    }
  });

  // GET /api/activity-logs/by-event?entityType=budget_planned|budget_actual&eventId=X
  app.get("/api/activity-logs/by-event", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    const { entityType, eventId } = req.query as Record<string, string>;
    if (!entityType || !eventId) return res.status(400).json({ message: "entityType e eventId obrigatórios" });
    try {
      let result: any;
      if (entityType === "budget_planned") {
        result = await db.execute(drizzleSql`
          SELECT sl.id, sl.action, sl.entity_type, sl.entity_id, sl.entity_name,
                 sl.details, sl.previous_data, sl.new_data, sl.user_id, sl.user_name, sl.created_at
          FROM system_logs sl
          JOIN budget_planned bp ON sl.entity_id = bp.id
          WHERE sl.entity_type = 'budget_planned' AND bp.event_id = ${eventId}
          ORDER BY sl.created_at DESC`
        );
      } else if (entityType === "budget_actual") {
        result = await db.execute(drizzleSql`
          SELECT sl.id, sl.action, sl.entity_type, sl.entity_id, sl.entity_name,
                 sl.details, sl.previous_data, sl.new_data, sl.user_id, sl.user_name, sl.created_at
          FROM system_logs sl
          JOIN budget_actual ba ON sl.entity_id = ba.id
          WHERE sl.entity_type = 'budget_actual' AND ba.event_id = ${eventId}
          ORDER BY sl.created_at DESC`
        );
      } else {
        return res.json([]);
      }
      const logs = Array.isArray(result) ? result : (result as any).rows || [];
      res.json(logs);
    } catch (error) {
      console.error("Error fetching event activity logs:", error);
      res.status(500).json({ message: "Erro ao buscar histórico do evento" });
    }
  });
}
