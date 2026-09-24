/**
 * Integração Maratona — API somente leitura consumida server-to-server.
 * Rotas: GET /api/integration/{employees,events,participations}.
 * Autenticação: Bearer MARATONA_API_TOKEN (fora do gate de sessão). Entrega
 * colaboradores, eventos e participações com ids estáveis para a Maratona.
 */
import type { Express, Request, Response } from "express";
import { storage, normalizarDataIso } from "../storage";
import { safeTokenEqual } from "./_compartilhado";

export function registrarIntegracaoMaratona(app: Express): void {
  // ── Maratona — API de Integração (somente leitura) ────────────────────────
  // Endpoints GET consumidos server-to-server pelo sistema "Maratona".
  // Autenticação: Authorization: Bearer <MARATONA_API_TOKEN>
  // Os externalId são os IDs estáveis (uuid) das tabelas, garantindo que a
  // Maratona reconheça e atualize registros em vez de duplicar.
  const validateMaratonaToken = (req: Request, res: Response): boolean => {
    const authHeader = req.headers["authorization"] as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const secret = process.env.MARATONA_API_TOKEN;
    if (!secret) {
      console.error("[Maratona API] MARATONA_API_TOKEN não configurado");
      res.status(503).json({ message: "Integração não configurada" });
      return false;
    }
    if (!token || !safeTokenEqual(token, secret)) {
      res.status(401).json({ message: "Não autorizado" });
      return false;
    }
    return true;
  };

  // 1. GET /api/integration/employees — todos os colaboradores
  app.get("/api/integration/employees", async (req, res) => {
    if (!validateMaratonaToken(req, res)) return;
    try {
      const collaborators = await storage.getCollaborators();
      const payload = collaborators.map((c) => ({
        externalId: c.id,
        name: c.fullName,
        document: c.officialDocument ?? undefined,
        phone: c.phone ?? undefined,
        active: c.active !== false && c.status !== "inativo",
        // "freela" → Freela; "casa"/"local" → Casa (colaborador fixo/local é tratado como Casa)
        employmentType: c.type === "freela" ? "Freela" : "Casa",
      }));
      return res.json(payload);
    } catch (err) {
      console.error("[Maratona API] Erro ao listar colaboradores:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // 2. GET /api/integration/events — todos os eventos
  app.get("/api/integration/events", async (req, res) => {
    if (!validateMaratonaToken(req, res)) return;
    try {
      const events = await storage.getEvents();
      const payload = events.map((e) => ({
        externalId: e.id,
        name: e.name,
        location: e.location ?? undefined,
        startDate: e.startDate ?? undefined,
        endDate: e.endDate ?? undefined,
      }));
      return res.json(payload);
    } catch (err) {
      console.error("[Maratona API] Erro ao listar eventos:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });

  // Normaliza qualquer valor de data (Date, string ISO, etc.) → "YYYY-MM-DD".
  // Mesma função que o storage usa no histórico da vaga (server/storage/_comum.ts).
  const toIsoDateStr = normalizarDataIso;

  // 3. GET /api/integration/participations — participações (colaborador x evento x função)
  app.get("/api/integration/participations", async (req, res) => {
    if (!validateMaratonaToken(req, res)) return;
    try {
      const [inclusions, functions] = await Promise.all([
        storage.getTeamInclusions(),
        storage.getFunctions(),
      ]);
      const functionNameById = new Map(functions.map((f) => [f.id, f.name]));
      const payload = inclusions
        .filter((ti) => ti.collaboratorId)
        .map((ti) => {
          // Dias de trabalho específicos (não consecutivos) têm prioridade sobre o período agendado
          const workDaysIso = (ti.workDays || [])
            .map(toIsoDateStr)
            .filter((d): d is string => !!d)
            .sort();

          const diariaCount = workDaysIso.length > 0 ? workDaysIso.length : (ti.dailyRates ?? undefined);
          const diariaStartDate = workDaysIso.length > 0 ? workDaysIso[0] : toIsoDateStr(ti.scheduleStartDate);
          const diariaEndDate = workDaysIso.length > 0 ? workDaysIso[workDaysIso.length - 1] : toIsoDateStr(ti.scheduleEndDate);

          return {
            eventExternalId: ti.eventId,
            employeeExternalId: ti.collaboratorId,
            functionName: functionNameById.get(ti.functionId) ?? undefined,
            teamName: ti.area ?? undefined,
            // "confirmado" = qualquer status que não seja apenas planejado ou cancelado
            confirmed: ti.status !== "planejado" && ti.status !== "cancelado",
            diariaCount,
            diariaStartDate,
            diariaEndDate,
          };
        });
      return res.json(payload);
    } catch (err) {
      console.error("[Maratona API] Erro ao listar participações:", err);
      return res.status(500).json({ message: "Erro interno" });
    }
  });
}
