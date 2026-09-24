/**
 * Logs do sistema (auditoria): listagem paginada com filtros.
 * Papéis: só admin.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { normalizeRole } from "@shared/roles";
import { effectiveUserId } from "../simulation";

export function registrarLogs(app: Express): void {
  // System Logs route (admin only)
  app.get("/api/system-logs", async (req, res) => {
    try {
      // Check authentication and authorization (usuário efetivo — simulação)
      const userId = effectiveUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Usuário não autenticado" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "Usuário não encontrado" });
      }

      // Only admins can access system logs
      const isAdmin = normalizeRole(currentUser.role) === 'admin';
      if (!isAdmin) {
        return res.status(403).json({ message: "Sem permissão para acessar logs do sistema. Apenas administradores podem acessar esta funcionalidade." });
      }

      // Parse query parameters for filtering
      const { entityType, action, days, search, userId: filterUserId, page = '1', limit = '50' } = req.query;

      // Build filters object
      const filters: any = {};
      if (entityType && entityType !== 'all') {
        filters.entityType = entityType as string;
      }
      if (action && action !== 'all') {
        filters.action = action as string;
      }
      if (days) {
        filters.days = parseInt(days as string, 10);
      }
      if (search) {
        filters.search = search as string;
      }
      if (filterUserId) {
        filters.userId = filterUserId as string;
      }

      // Página resolvida no banco (auditoria 28/08): a rota devolvia 50 linhas
      // mas baixava o log inteiro do Neon a cada visita ao Histórico.
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const { logs: paginatedLogs, total } = await storage.getSystemLogs({
        ...filters,
        limit: limitNum,
        offset: (pageNum - 1) * limitNum,
      });

      res.json({
        logs: paginatedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error("Error fetching system logs:", error);
      res.status(500).json({ message: "Erro ao buscar logs do sistema" });
    }
  });
}
