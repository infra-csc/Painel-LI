/**
 * Financeiro legado (tabela financial, valores por vaga): listagem, criação e
 * edição com allowlist explícita.
 * Papéis: financeiro (admin/RH).
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertFinancialSchema } from "@shared/schema";
import { requireRoles, FINANCE_ROLES, primeiraMensagemDoZod } from "./_compartilhado";

export function registrarFinanceiroLegado(app: Express): void {
  // Financial routes — leitura também é do financeiro (23/09): valores por
  // vaga são custo, e as telas financeiras do client são só admin/RH.
  app.get("/api/financial", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const financial = await storage.getFinancials();
      res.json(financial);
    } catch {
      res.status(500).json({ message: "Erro ao buscar dados financeiros" });
    }
  });

  app.post("/api/financial", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const financialData = insertFinancialSchema.parse(req.body);
      const financial = await storage.createFinancial(financialData);
      res.json(financial);
    } catch {
      res.status(400).json({ message: "Dados inválidos" });
    }
  });

  // Allowlist explícita (23/09): `...req.body` deixava o cliente gravar
  // approved/approvedBy/approvedAt e trocar o teamInclusionId do registro.
  const atualizarFinanceiroSchema = z.object({
    plannedDailyRates: z.number().int().nullable().optional(),
    actualDailyRates: z.number().int().nullable().optional(),
    plannedValue: z.number().int().nullable().optional(),
    actualValue: z.number().int().nullable().optional(),
    actualFee: z.number().int().nullable().optional(),
    observations: z.string().nullable().optional(),
  }).strict();
  app.patch("/api/financial/:id", async (req, res) => {
    const ator = await requireRoles(req, res, FINANCE_ROLES);
    if (!ator) return;
    const parsed = atualizarFinanceiroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: primeiraMensagemDoZod(parsed.error) });
    }
    try {
      const { id } = req.params;
      const updates = {
        ...parsed.data,
        updatedAt: new Date(),
        updatedBy: ator.id, // ator vem da sessão, não do corpo
      };
      const financial = await storage.updateFinancial(id, updates);
      res.json(financial);
    } catch {
      res.status(400).json({ message: "Erro ao atualizar dados financeiros" });
    }
  });
}
