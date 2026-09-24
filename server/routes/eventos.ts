/**
 * Eventos: listagem, criação, edição, empresa pagadora, exclusão lógica e o
 * mural de comentários do evento.
 * Papéis: cadastro (admin/Compras/Logística) cria e edita; financeiro define a
 * empresa pagadora; só admin exclui; qualquer sessão lê e comenta.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  eventComments as eventCommentsTable,
  users,
  teamInclusions as teamInclusionsTable,
  insertEventSchema,
  updateEventSchema,
} from "@shared/schema";
import { eq, and, ne, desc, sql as drizzleSql } from "drizzle-orm";
import { isFinanceRole, normalizeRole } from "@shared/roles";
import { createAuditLog, cacheDeCatalogo, requireRoles, CADASTRO_ROLES, FINANCE_ROLES } from "./_compartilhado";

export function registrarEventos(app: Express): void {
  // Events routes
  app.get("/api/events", async (req, res) => {
    try {
      const includeDeleted = req.query.includeDeleted === "true";
      const events = await storage.getEvents(includeDeleted);
      cacheDeCatalogo(res);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar eventos" });
    }
  });

  // Get events that have team inclusions (for template loading)
  app.get("/api/events-with-inclusions", async (req, res) => {
    try {
      const eventsWithInclusions = await storage.getEventsWithInclusions();
      res.json(eventsWithInclusions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar eventos com escalações" });
    }
  });

  // Criar evento: papéis de cadastro (antes bastava estar logado — Área de
  // Função e RH criavam evento).
  app.post("/api/events", async (req, res) => {
    const currentUser = await requireRoles(req, res, CADASTRO_ROLES);
    if (!currentUser) return;
    try {
      const eventData = insertEventSchema.parse(req.body);
      // Empresa pagadora é decisão do financeiro (rota dedicada abaixo)
      const { paymentCompanyName: _pc, paymentCompanyCnpj: _cnpj, ...semPagadora } = eventData as any;
      const event = await storage.createEvent(semPagadora);

      await createAuditLog('create', 'event', event.id, event, currentUser.id, currentUser.name, undefined, req);
      res.json(event);
    } catch (error) {
      if ((error as any)?.name === "ZodError") return res.status(400).json({ message: "Dados inválidos" });
      throw error;
    }
  });

  // Dedicated endpoint for updating payment company (accessible to admin + financial roles)
  app.patch("/api/events/:id/payment-company", async (req, res) => {
    const actor = await requireRoles(req, res, FINANCE_ROLES);
    if (!actor) return;
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      const { paymentCompanyName, paymentCompanyCnpj } = req.body ?? {};
      if (typeof paymentCompanyName !== "string" || typeof paymentCompanyCnpj !== "string" ||
          !paymentCompanyName.trim() || !paymentCompanyCnpj.trim()) {
        return res.status(400).json({ message: "Nome e CNPJ são obrigatórios" });
      }
      const updated = await storage.updateEvent(req.params.id, { paymentCompanyName, paymentCompanyCnpj });
      await createAuditLog('update', 'event', updated.id, updated, actor.id, actor.name, event, req);
      res.json(updated);
    } catch (error) {
      console.error("Error updating payment company:", error);
      res.status(500).json({ message: "Erro ao atualizar empresa pagadora" });
    }
  });

  // Editar evento: papéis de cadastro (admin, Compras, Logística). Empresa
  // pagadora (paymentCompanyName/Cnpj) só muda pelo financeiro/admin — se o
  // formulário mandar o valor igual ao gravado, ignoramos; se tentar mudar,
  // 403 explícito (nada de descartar em silêncio).
  app.put("/api/events/:id", async (req, res) => {
    const currentUser = await requireRoles(req, res, CADASTRO_ROLES);
    if (!currentUser) return;
    try {
      const eventId = req.params.id;
      const oldEvent = await storage.getEvent(eventId);
      if (!oldEvent) {
        return res.status(404).json({ message: "Evento não encontrado" });
      }

      // Allow partial updates including status field
      const eventData: Record<string, any> = updateEventSchema.parse(req.body);
      if (!isFinanceRole(currentUser.role)) {
        for (const campo of ["paymentCompanyName", "paymentCompanyCnpj"] as const) {
          if (eventData[campo] === undefined) continue;
          if ((eventData[campo] ?? null) !== (oldEvent[campo] ?? null)) {
            return res.status(403).json({ message: "A empresa pagadora só pode ser alterada pelo financeiro." });
          }
          delete eventData[campo];
        }
      }
      // Excluir evento é só do administrador (dono, 18/09 — o Girl Power
      // Brasília foi excluído e sumiu com 26 vagas). Compras continua editando
      // e pode REATIVAR um evento excluído.
      if (eventData.status === "excluído" && oldEvent.status !== "excluído" && normalizeRole(currentUser.role) !== "admin") {
        return res.status(403).json({ message: "Só o administrador pode excluir eventos. Você pode editar ou reativar." });
      }
      const updatedEvent = await storage.updateEvent(eventId, eventData);

      await createAuditLog('update', 'event', updatedEvent.id, updatedEvent, currentUser.id, currentUser.name, oldEvent, req);

      res.json(updatedEvent);
    } catch (error) {
      if ((error as any)?.name === "ZodError") return res.status(400).json({ message: "Dados inválidos" });
      throw error;
    }
  });

  // Excluir evento — só admin, e desde 23/09 é SOFT DELETE (status "excluído",
  // como o PUT já fazia): a exclusão física apagava em cascata vagas,
  // passagens e hospedagens (ou estourava 500 na FK). Com vagas vivas o
  // servidor recusa com 409 e diz quantas são.
  app.delete("/api/events/:id", async (req, res) => {
    const currentUser = await requireRoles(req, res, ["admin"]);
    if (!currentUser) return;

    const eventId = req.params.id;
    const event = await storage.getEvent(eventId);
    if (!event) {
      return res.status(404).json({ message: "Evento não encontrado" });
    }
    if (event.status === "excluído") {
      return res.json({ message: "Evento já estava excluído" });
    }

    const [{ n: vagasVivas }] = await db
      .select({ n: drizzleSql<number>`count(*)::int` })
      .from(teamInclusionsTable)
      .where(and(eq(teamInclusionsTable.eventId, eventId), ne(teamInclusionsTable.status, "cancelado")));
    if (vagasVivas > 0) {
      return res.status(409).json({
        message: `Este evento tem ${vagasVivas} vaga(s) ativa(s). Cancele ou mova as vagas antes de excluir o evento.`,
        vagasVivas,
      });
    }

    // updateEvent tipa Partial<InsertEvent> (sem status); o PUT já grava status
    // pelo mesmo caminho via updateEventSchema.
    const updated = await storage.updateEvent(eventId, { status: "excluído" } as any);

    await createAuditLog('delete', 'event', eventId, updated, currentUser.id, currentUser.name, event, req);

    res.json({ message: "Evento excluído com sucesso" });
  });

  // ── Comentários gerais do evento (28/08) ──────────────────────────────────
  // Mural aberto: qualquer usuário logado lê e escreve. O nome vai junto na
  // resposta para a tela não precisar da lista de usuários.
  app.get("/api/events/:id/comments", async (req, res) => {
    try {
      const rows = await db
        .select({
          id: eventCommentsTable.id,
          eventId: eventCommentsTable.eventId,
          userId: eventCommentsTable.userId,
          userName: users.name,
          content: eventCommentsTable.content,
          createdAt: eventCommentsTable.createdAt,
        })
        .from(eventCommentsTable)
        .leftJoin(users, eq(users.id, eventCommentsTable.userId))
        .where(eq(eventCommentsTable.eventId, req.params.id))
        .orderBy(desc(eventCommentsTable.createdAt));
      res.set("Cache-Control", "no-store");
      res.json(rows);
    } catch {
      res.status(500).json({ message: "Erro ao buscar comentários do evento" });
    }
  });

  app.post("/api/events/:id/comments", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) return res.status(400).json({ message: "Escreva o comentário." });
    if (content.length > 2000) return res.status(400).json({ message: "Comentário pode ter no máximo 2000 caracteres." });
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      const [row] = await db.insert(eventCommentsTable).values({ eventId: req.params.id, userId, content }).returning();
      const actor = await storage.getUser(userId);
      await createAuditLog("create", "event_comment", row.id, row, userId, actor?.name || "Usuário", undefined, req);
      res.status(201).json({ ...row, userName: actor?.name ?? null });
    } catch {
      res.status(500).json({ message: "Erro ao gravar o comentário" });
    }
  });
}
