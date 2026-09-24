/**
 * Valores por função (function_values): tabela de diária/ajuda de custo/
 * refeições/mobilidade por função e geração de valores padrão.
 * Papéis: financeiro (admin/RH) escreve; leitura aberta a qualquer sessão.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { insertFunctionValuesSchema } from "@shared/schema";
import { createAuditLog, cacheDeCatalogo, requireRoles, FINANCE_ROLES } from "./_compartilhado";

export function registrarValoresPorFuncao(app: Express): void {
  // ================ BUDGET ROUTES ================

  // Function Values (valores automáticos por função)
  app.get("/api/function-values", async (req, res) => {
    try {
      const values = await storage.getAllFunctionValues();
      cacheDeCatalogo(res);
      res.json(values);
    } catch (error) {
      console.error("Error fetching function values:", error);
      res.status(500).json({ message: "Erro ao buscar valores das funções" });
    }
  });

  app.get("/api/function-values/:functionId", async (req, res) => {
    try {
      const value = await storage.getFunctionValues(req.params.functionId);
      res.json(value || null);
    } catch (error) {
      console.error("Error fetching function value:", error);
      res.status(500).json({ message: "Erro ao buscar valor da função" });
    }
  });

  // Valores por função definem diárias — impacto financeiro direto
  app.post("/api/function-values", async (req, res) => {
    const ator = await requireRoles(req, res, FINANCE_ROLES);
    if (!ator) return;
    try {
      const data = insertFunctionValuesSchema.parse(req.body);
      const value = await storage.createFunctionValue(data);
      await createAuditLog("create", "function_value", value.id, value, ator.id, ator.name, undefined, req);
      res.status(201).json(value);
    } catch (error) {
      console.error("Error creating function value:", error);
      res.status(400).json({ message: "Erro ao criar valor da função" });
    }
  });

  app.patch("/api/function-values/:id", async (req, res) => {
    const ator = await requireRoles(req, res, FINANCE_ROLES);
    if (!ator) return;
    try {
      const data = insertFunctionValuesSchema.partial().parse(req.body);
      const anterior = (await storage.getAllFunctionValues()).find((v) => v.id === req.params.id);
      if (!anterior) return res.status(404).json({ message: "Valor da função não encontrado" });
      const value = await storage.updateFunctionValue(req.params.id, data);
      await createAuditLog("update", "function_value", req.params.id, value, ator.id, ator.name, anterior, req);
      res.json(value);
    } catch (error) {
      console.error("Error updating function value:", error);
      res.status(400).json({ message: "Erro ao atualizar valor da função" });
    }
  });

  // Gerar valores padrão para funções sem configuração — financeiro/admin
  // (antes qualquer logado gravava valores de diária para todas as funções)
  app.post("/api/function-values/generate-defaults", async (req, res) => {
    if (!await requireRoles(req, res, FINANCE_ROLES)) return;
    try {
      const functions = await storage.getFunctions();
      const existingValues = await storage.getAllFunctionValues();
      const existingFunctionIds = new Set(existingValues.map(v => v.functionId));

      const defaultValues: Record<string, { dailyValue: number; costAssistance: number; mobility: number }> = {
        'coordenador': { dailyValue: 50000, costAssistance: 15000, mobility: 5000 },
        'supervisor': { dailyValue: 40000, costAssistance: 12000, mobility: 4000 },
        'lider': { dailyValue: 35000, costAssistance: 10000, mobility: 3500 },
        'tecnico': { dailyValue: 30000, costAssistance: 8000, mobility: 3000 },
        'operador': { dailyValue: 25000, costAssistance: 7000, mobility: 2500 },
        'auxiliar': { dailyValue: 20000, costAssistance: 6000, mobility: 2000 },
        'motorista': { dailyValue: 22000, costAssistance: 8000, mobility: 0 },
        'default': { dailyValue: 25000, costAssistance: 7000, mobility: 2500 }
      };

      const created = [];
      for (const func of functions) {
        if (!existingFunctionIds.has(func.id)) {
          const funcNameLower = func.name.toLowerCase();
          let values = defaultValues['default'];

          for (const [key, val] of Object.entries(defaultValues)) {
            if (funcNameLower.includes(key)) {
              values = val;
              break;
            }
          }

          const newValue = await storage.createFunctionValue({
            functionId: func.id,
            dailyValue: values.dailyValue,
            costAssistance: values.costAssistance,
            weekdayLunch: 3500,
            weekdayDinner: 4000,
            weekendLunch: 4000,
            weekendDinner: 4500,
            mobility: values.mobility,
            transport: 0,
          });
          created.push(newValue);
        }
      }

      res.json({ created: created.length, values: created });
    } catch (error) {
      console.error("Error generating default values:", error);
      res.status(500).json({ message: "Erro ao gerar valores padrão" });
    }
  });
}
