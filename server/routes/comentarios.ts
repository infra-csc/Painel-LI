/**
 * Comentários por vaga: contagem por vaga (para a grade), leitura por vaga,
 * criação e listagem geral limitada.
 * Papéis: qualquer sessão; a autoria vem sempre da sessão.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { teamInclusions as teamInclusionsTable, comments as commentsTable, insertCommentSchema } from "@shared/schema";
import { eq, isNull, sql as drizzleSql } from "drizzle-orm";

export function registrarComentarios(app: Express): void {
  // Comments routes
  /**
   * Quantos comentários cada vaga tem (01/09).
   *
   * A lista da Escalação mostra o número no botão de comentários — sem ele, o
   * ícone é igual em quem tem uma conversa de dez mensagens e em quem nunca
   * recebeu nada, e a pessoa precisa abrir cada registro para descobrir.
   *
   * É uma agregação no banco de propósito: /api/all-comments desce o texto de
   * TODOS os comentários do sistema, o que seria um exagero para exibir um
   * contador numa coluna de 30px.
   */
  app.get("/api/comments/counts", async (req, res) => {
    try {
      // Só vagas vivas (23/09): comentário de vaga excluída não conta na grade.
      const linhas = await db
        .select({ teamInclusionId: commentsTable.teamInclusionId, n: drizzleSql`count(*)::int` })
        .from(commentsTable)
        .innerJoin(teamInclusionsTable, eq(teamInclusionsTable.id, commentsTable.teamInclusionId))
        .where(isNull(teamInclusionsTable.deletedAt))
        .groupBy(commentsTable.teamInclusionId);
      res.set("Cache-Control", "no-store");
      res.json(linhas);
    } catch (error) {
      console.error("erro ao contar comentários:", error);
      res.status(500).json({ message: "Erro ao contar comentários" });
    }
  });

  app.get("/api/comments/:teamInclusionId", async (req, res) => {
    try {
      const { teamInclusionId } = req.params;
      const comments = await storage.getComments(teamInclusionId);
      res.json(comments);
    } catch {
      res.status(500).json({ message: "Erro ao buscar comentários" });
    }
  });

  app.post("/api/comments", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const parsed = insertCommentSchema.parse(req.body);
      // A autoria vem da sessão, nunca do corpo (o schema tinha userId e o
      // client mandava user.id — mesmo padrão _userId removido do resto do app)
      const inclusion = await storage.getTeamInclusion(parsed.teamInclusionId);
      if (!inclusion) return res.status(404).json({ message: "Inclusão não encontrada" });
      const comment = await storage.createComment({ ...parsed, userId });
      res.json(comment);
    } catch {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  app.get("/api/all-comments", async (req, res) => {
    try {
      // Ordenado e limitado no banco (23/09); ?limit= até 2000, padrão 500.
      const limit = Number.parseInt(String(req.query.limit ?? ""), 10);
      const allComments = await storage.getAllComments(Number.isFinite(limit) && limit > 0 ? limit : 500);
      res.set("Cache-Control", "no-store");
      res.json(allComments);
    } catch {
      res.status(500).json({ message: "Erro ao buscar todos os comentários" });
    }
  });
}
