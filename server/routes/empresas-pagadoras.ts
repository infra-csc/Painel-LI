/**
 * Empresas pagadoras (payment_companies): catálogo de nome/CNPJ.
 * Papéis: qualquer sessão lê; financeiro + Compras criam; só admin exclui.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { createAuditLog, cacheDeCatalogo, requireRoles, FINANCE_ROLES, requireQualquerSessao } from "./_compartilhado";

export function registrarEmpresasPagadoras(app: Express): void {
  // Payment Companies
  // Lido pelo modal de evento (cadastro): nomes/CNPJ de empresa, sem custo —
  // por isso qualquer sessão, e não o papel financeiro.
  app.get("/api/payment-companies", async (req, res) => {
    if (!requireQualquerSessao(req, res)) return;
    try {
      const companies = await storage.getPaymentCompanies();
      cacheDeCatalogo(res);
      res.json(companies);
    } catch (error) {
      console.error("Error fetching payment companies:", error);
      res.status(500).json({ message: "Erro ao buscar empresas" });
    }
  });

  app.post("/api/payment-companies", async (req, res) => {
    const ator = await requireRoles(req, res, [...FINANCE_ROLES, 'purchasing']);
    if (!ator) return;
    try {
      const { name, cnpj } = req.body;
      if (!name || !cnpj) return res.status(400).json({ message: "Nome e CNPJ são obrigatórios" });
      const company = await storage.createPaymentCompany({ name, cnpj });
      await createAuditLog("create", "payment_company", String(company.id), company, ator.id, ator.name, undefined, req);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating payment company:", error);
      res.status(500).json({ message: "Erro ao criar empresa" });
    }
  });

  app.delete("/api/payment-companies/:id", async (req, res) => {
    const user = await requireRoles(req, res, ["admin"]);
    if (!user) return;
    try {
      const anterior = (await storage.getPaymentCompanies()).find((c) => c.id === Number(req.params.id));
      if (!anterior) return res.status(404).json({ message: "Empresa não encontrada" });
      await storage.deletePaymentCompany(Number(req.params.id));
      await createAuditLog("delete", "payment_company", req.params.id, anterior, user.id, user.name, undefined, req);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment company:", error);
      res.status(500).json({ message: "Erro ao excluir empresa" });
    }
  });
}
