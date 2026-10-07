/**
 * Avisos de alteração para Compras (02/10).
 *
 * Quando o aprovador aprova um ajuste (datas, horários, transporte…) numa vaga
 * que já tem passagem ou hospedagem registrada, nasce um aviso — ver
 * shared/aviso-de-alteracao.ts. Aqui Compras lê a fila e marca "Já atuei".
 * Papéis: logística (admin/Compras/Produção), os mesmos que mexem na passagem.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  createAuditLog,
  requireRoles,
  LOGISTICA_ROLES,
  eventIdDaQuery,
  primeiraMensagemDoZod,
} from "./_compartilhado";

const resolverSchema = z.object({
  resolucao: z.string().trim().max(500, "Escreva no máximo 500 caracteres").optional().nullable(),
}).strict();

export function registrarAvisosDeAlteracao(app: Express): void {
  // GET /api/avisos-de-alteracao[?situacao=pendente|resolvido][&eventId=][&teamInclusionId=]
  app.get("/api/avisos-de-alteracao", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    const situacao = req.query.situacao === "resolvido" ? "resolvido" : "pendente";
    const teamInclusionId = typeof req.query.teamInclusionId === "string" && req.query.teamInclusionId ? req.query.teamInclusionId : undefined;
    const avisos = await storage.getAvisosDeAlteracao({ situacao, eventId: eventIdDaQuery(req), teamInclusionId });
    res.set("Cache-Control", "no-store");
    res.json(avisos);
  });

  // POST /api/avisos-de-alteracao/:id/resolver  { resolucao? } — "Já atuei"
  app.post("/api/avisos-de-alteracao/:id/resolver", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    const corpo = resolverSchema.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: primeiraMensagemDoZod(corpo.error) });
    const antes = await storage.getAvisoDeAlteracao(req.params.id);
    if (!antes) return res.status(404).json({ message: "Aviso não encontrado" });
    const resolucao = corpo.data.resolucao?.trim() || null;
    const nome = ator.name ?? "Usuário";
    const aviso = await storage.resolverAvisoDeAlteracao(antes.id, { id: ator.id, nome }, resolucao);
    if (!aviso) {
      return res.status(409).json({
        message: antes.resolvidoPorNome
          ? `${antes.resolvidoPorNome} já marcou este aviso como resolvido.`
          : "Este aviso já foi resolvido.",
      });
    }
    // No histórico da vaga: quem de Compras atuou e o que fez.
    await storage.createTeamInclusionLog({
      teamInclusionId: aviso.teamInclusionId,
      action: "aviso_de_alteracao_resolvido",
      details: `Compras atuou na alteração aprovada por ${aviso.aprovadoPorNome}${resolucao ? ` — "${resolucao}"` : ""}`,
      previousValue: null,
      newValue: null,
      userId: ator.id,
      userName: nome,
    });
    await createAuditLog("resolver", "aviso_de_alteracao", aviso.id, aviso, ator.id, nome, antes, req);
    res.json(aviso);
  });
}
