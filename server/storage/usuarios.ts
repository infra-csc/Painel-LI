/** Usuários do sistema (tabela users). */
import { eq, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, type User, type InsertUser } from "@shared/schema";
import { idsUnicos } from "./_comum";

export async function getUsers(): Promise<User[]> {
  return await db.select().from(users);
}

export async function getUsersByIds(ids: string[]): Promise<User[]> {
  const unique = idsUnicos(ids);
  if (unique.length === 0) return [];
  return await db.select().from(users).where(inArray(users.id, unique));
}

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  try {
    // Sem diferenciar maiúsculas (23/09): o SSO manda o e-mail como o portal
    // o tem, e o banco pode ter sido cadastrado à mão com outra caixa — a
    // comparação exata criava uma segunda conta para a mesma pessoa.
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
    return user;
  } catch (error) {
    console.error('[Storage] Error in getUserByEmail:', error);
    throw error;
  }
}

export async function getUserByResetToken(token: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.resetToken, token));
  return user;
}

export async function createUser(userData: InsertUser): Promise<User> {
  const [user] = await db.insert(users).values(userData).returning();
  return user;
}

export async function getUsersByStatus(status: 'pending' | 'approved' | 'rejected'): Promise<User[]> {
  return await db.select().from(users).where(eq(users.status, status));
}

export async function approveUser(id: string, status: 'approved' | 'rejected', role?: string): Promise<User | undefined> {
  const updateData: any = { status };
  if (role) updateData.role = role;

  const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
  return user;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
  const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return user;
}
