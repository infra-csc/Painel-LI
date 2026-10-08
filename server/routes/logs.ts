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
      const { entityType, action, days, search, userId: filterUserId, userName: filterUserName, page = '1', limit = '50' } = req.query;

      // Build filters object
      const filters: SystemLogFilters = {};
      if (entityType && entityType !== 'all') {
        filters.entityType = entityType as string;
      }
      // "exclusao" (FILTRO_EXCLUSAO, 08/10): o storage traduz para o que a tela
      // chama de Exclusão — `delete` + evento/vaga excluídos por alteração.
      if (action && action !== 'all') {
        filters.action = action as string;
      }
      if (days) {
        // Inteiro de 1 a 10 anos; lixo vira "sem corte" em vez de NaN no SQL.
        const d = parseInt(days as string, 10);
        if (Number.isFinite(d) && d > 0) filters.days = Math.min(d, 3650);
      }
      if (search) {
        filters.search = search as string;
      }
      if (filterUserId) {
        filters.userId = filterUserId as string;
      }
      // Pessoa pelo nome gravado (08/10): sem cadastro ou ação do sistema.
      if (typeof filterUserName === "string" && filterUserName.trim()) {
        filters.userName = filterUserName;
      }

      // Página resolvida no banco (auditoria 28/08): a rota devolvia 50 linhas
      // mas baixava o log inteiro do Neon a cada visita ao Histórico.
      // Validados (08/10): página ≥ 1 e no máximo 200 linhas por vez.
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
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

  // Quem aparece no log (08/10): o filtro de pessoa passa a oferecer também
  // quem não tem mais cadastro e as ações do sistema (userId nulo).
  app.get("/api/system-logs/pessoas", async (req, res) => {
    if (!await requireRoles(req, res, ["admin"])) return;
    try {
      res.json(await storage.getPessoasDoLog());
    } catch (error) {
      console.error("Error fetching system log people:", error);
      res.status(500).json({ message: "Erro ao buscar as pessoas do log" });
    }
  });
}
