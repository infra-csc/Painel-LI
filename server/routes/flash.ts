/**
 * Conta Corrente Flash (flash_movements): lançamentos manuais, crédito
 * inicial da admissão, edição e exclusão (lançamentos automáticos do
 * comparativo são intocáveis por aqui).
 * Papéis: financeiro (admin/RH).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { flashMovements as flashMovementsTable, insertFlashMovementSchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { HttpError } from "../http";
import { isAutomaticFlashMovement } from "@shared/flash-rules";
import { createAuditLog, responderErroComStatus, requireFinanceUser, requireFinSession } from "./_compartilhado";

export function registrarFlash(app: Express): void {
  // ─── Conta Corrente Flash (slide 6 do deck de melhorias) ────────────────────

  app.get("/api/flash-movements", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const collaboratorId = req.query.collaboratorId as string | undefined;
      const movements = await storage.getFlashMovements(collaboratorId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching flash movements:", error);
      res.status(500).json({ message: "Erro ao buscar lançamentos da conta corrente" });
    }
  });

  app.post("/api/flash-movements", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const data = insertFlashMovementSchema.parse(req.body);
      const movement = await storage.createFlashMovement({
        ...data,
        createdBy: user.id,
        createdByName: user.name,
      });
      res.status(201).json(movement);
    } catch (error) {
      console.error("Error creating flash movement:", error);
      res.status(400).json({ message: "Dados inválidos. Verifique categoria, tipo, valor e data." });
    }
  });

  // Crédito inicial da admissão: os dois lançamentos (alimentação R$ 350 +
  // mobilidade R$ 150) numa única transação — antes eram 2 POSTs do client e
  // uma falha no segundo deixava o saldo pela metade sem correção pela UI.
  app.post("/api/flash-movements/initial-credit", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const { collaboratorId, movementDate } = req.body;
      if (!collaboratorId || !movementDate) {
        return res.status(400).json({ message: "collaboratorId e movementDate são obrigatórios" });
      }
      // Só lançamentos MANUAIS contam como "conta já aberta" — um crédito
      // automático (comparativo aprovado do primeiro evento, ou 'oc' legado)
      // não pode impedir o crédito inicial da admissão. A checagem roda DENTRO
      // da transação (23/09): dois cliques simultâneos abriam a conta duas vezes.
      const base = { collaboratorId, type: "credito" as const, movementDate, description: "Crédito inicial — admissão", createdBy: user.id, createdByName: user.name };
      const movements = await db.transaction(async (tx) => {
        const existentes = await tx.select().from(flashMovementsTable).where(eq(flashMovementsTable.collaboratorId, collaboratorId));
        if (existentes.some((m) => !isAutomaticFlashMovement(m))) {
          throw new HttpError(409, "Este colaborador já tem lançamentos — o crédito inicial só vale para conta nova.");
        }
        return await tx.insert(flashMovementsTable).values([
          { ...base, category: "alimentacao", amountCents: 35000 },
          { ...base, category: "mobilidade", amountCents: 15000 },
        ]).returning();
      });
      await createAuditLog("create", "financial", movements[0]?.id ?? collaboratorId, { collaboratorId, acao: "crédito inicial", lancamentos: movements.length }, user.id, user.name, undefined, req);
      res.status(201).json(movements);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao lançar o crédito inicial", 500);
    }
  });

  // Edição in-place de lançamento: substitui o antigo delete+recreate do
  // client (que perdia o original se a recriação falhasse). Mesmo schema do
  // POST; identidade de criação preservada; alteração fica no audit log.
  app.patch("/api/flash-movements/:id", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const prev = await storage.getFlashMovement(req.params.id);
      if (!prev) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (isAutomaticFlashMovement(prev)) {
        // Cita o botão que EXISTE na tela (Comparativo → card "Fechamento do
        // comparativo"): a mensagem antiga mandava "rejeitar/devolver o
        // comparativo", ação que nenhum botão do client executava.
        return res.status(409).json({ message: "Este lançamento é automático (gerado pela aprovação do comparativo) e não pode ser editado. Ele acompanha o Realizado: para atualizá-lo, use \"Ressincronizar Flash\" na tela Comparativo; para estorná-lo, use \"Reabrir comparativo (estorna o Flash)\"." });
      }
      const data = insertFlashMovementSchema
        .omit({ createdBy: true, createdByName: true })
        .parse(req.body);
      const movement = await storage.updateFlashMovement(req.params.id, data);
      if (!movement) return res.status(404).json({ message: "Lançamento não encontrado" });
      // Trilha: edição de lançamento financeiro fica no audit log com o diff
      await createAuditLog('update', 'financial', req.params.id, movement, user.id, user.name, prev, req);
      res.json(movement);
    } catch (error) {
      console.error("Error updating flash movement:", error);
      res.status(400).json({ message: "Dados inválidos. Verifique categoria, tipo, valor e data." });
    }
  });

  app.delete("/api/flash-movements/:id", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      const prev = await storage.getFlashMovement(req.params.id);
      if (!prev) return res.status(404).json({ message: "Lançamento não encontrado" });
      if (isAutomaticFlashMovement(prev)) {
        return res.status(409).json({ message: "Este lançamento é automático (gerado pela aprovação do comparativo) e não pode ser excluído. O estorno acontece no botão \"Reabrir comparativo (estorna o Flash)\", na tela Comparativo." });
      }
      await storage.deleteFlashMovement(req.params.id);
      // Trilha: exclusão de lançamento financeiro fica no audit log com o registro apagado
      await createAuditLog('delete', 'financial', req.params.id, prev, user.id, user.name, undefined, req);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting flash movement:", error);
      res.status(500).json({ message: "Erro ao excluir lançamento" });
    }
  });
}
