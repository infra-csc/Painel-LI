/** Comentários das vagas (tabela comments). */
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { comments, type Comment, type InsertComment } from "@shared/schema";
import { getUser } from "./usuarios";
import { createSystemLog } from "./logs-do-sistema";

export async function getComments(teamInclusionId: string): Promise<Comment[]> {
  return await db.select().from(comments).where(eq(comments.teamInclusionId, teamInclusionId));
}

export async function getAllComments(limit = 500): Promise<Comment[]> {
  // ORDER BY e LIMIT no banco (23/09): antes a tabela inteira vinha para o
  // Node e era ordenada em JS a cada abertura da tela.
  return await db.select().from(comments)
    .orderBy(sql`${comments.createdAt} DESC NULLS LAST`, desc(comments.id))
    .limit(Math.max(1, Math.min(limit, 2000)));
}

export async function createComment(commentData: InsertComment): Promise<Comment> {
  const [comment] = await db.insert(comments).values(commentData).returning();

  // Nome real do autor no log (antes era o literal "Usuário")
  const author = commentData.userId ? await getUser(commentData.userId) : undefined;

  await createSystemLog({
    action: "create",
    entityType: "comment",
    entityId: comment.teamInclusionId,
    entityName: `Comentário na inclusão ${comment.teamInclusionId}`,
    details: `Novo comentário adicionado: "${commentData.content.substring(0, 50)}..."`,
    newData: JSON.stringify(comment),
    userId: commentData.userId,
    userName: author?.name || "Usuário",
  });

  return comment;
}
