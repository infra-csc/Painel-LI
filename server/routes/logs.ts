/**
 * Logs do sistema (auditoria): listagem paginada com filtros.
 * Papéis: só admin.
 */
import type { Express } from "express";
import { storage, type SystemLogFilters } from "../storage";
import { requireRoles } from "./_compartilhado";

export function registrarLogs(app: Express): void {
  // System Logs route (admin only)
  app.get("/api/system-logs", async (req, res) => {
    // Só admin (usuário efetivo — simulação); requireRoles usa req.user e só
    // volta ao banco quando a identidade efetiva é outra.
    if (!await requireRoles(req, res, ["admin"])) return;
    try {
      // Parse query parameters for filtering
      const { entityType, action, days, search, userId: filterUserId, page = '1', limit = '50' } = req.query;

      // Build filters object
      const filters: SystemLogFilters = {};
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
