/**
 * Controle RH agregado (25/09): GET /api/rh/controle?eventId=&status=
 *
 * Devolve as linhas já cruzadas (prestação × planejado × NF × isenção de NF
 * pela escalação) para a tela client/src/pages/rh-control.tsx não baixar
 * quatro tabelas inteiras. O cruzamento é a função pura
 * `montarControleRh` (shared/controle-rh.ts) — os tipos de lá são o contrato.
 *
 * Recorte: com `eventId`, tudo (vagas, planejado, realizado, notas) é lido só
 * daquele evento e os contadores valem para ele; sem `eventId`, o recorte é o
 * sistema inteiro (eventos não excluídos). `status` filtra só `itens`;
 * `contadores` (inclusive `totalParaProgresso`, o denominador da barra de
 * progresso) valem para o recorte inteiro. `actual` sai com a linha completa
 * de budget_actual — alimentação e mobilidade fazem parte do contrato
 * (`RealizadoParaControle`) porque o card mostra Planejado × Realizado.
 * Papéis: financeiro (admin/RH), como as quatro rotas que ele substitui.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { ehFiltroDeStatus, montarControleRh } from "@shared/controle-rh";
import { requireFinanceUser } from "./_compartilhado";

export function registrarControleRh(app: Express): void {
  app.get("/api/rh/controle", async (req, res) => {
    if (!await requireFinanceUser(req, res)) return;
    const eventId = typeof req.query.eventId === "string" && req.query.eventId ? req.query.eventId : undefined;
    const statusBruto = req.query.status;
    if (statusBruto !== undefined && statusBruto !== "" && statusBruto !== "all" && !ehFiltroDeStatus(statusBruto)) {
      return res.status(400).json({ message: "Filtro de status inválido" });
    }
    const filtro = ehFiltroDeStatus(statusBruto) ? statusBruto : null;

    const [eventos, vagas, planejados, realizados, notas, colaboradores, funcoes, usuarios] = await Promise.all([
      eventId ? storage.getEvent(eventId).then((e) => (e ? [e] : [])) : storage.getEvents(false),
      // Mesmo recorte que a tela pedia em /api/team-inclusions: sem sugestões (phase padrão), sem excluídas.
      storage.getTeamInclusions(false, undefined, eventId ? { eventId } : {}),
      eventId ? storage.getBudgetPlanned(eventId) : storage.getAllBudgetPlanned(),
      eventId ? storage.getBudgetActual(eventId) : storage.getAllBudgetActual(),
      storage.getInvoices(eventId),
      storage.getCollaborators(),
      storage.getFunctions(),
      storage.getUsers(),
    ]);
    if (eventId && eventos.length === 0) {
      return res.status(404).json({ message: "Evento não encontrado" });
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(montarControleRh({
      eventos,
      vagas,
      planejados,
      realizados,
      notas,
      nomesDeColaboradores: new Map(colaboradores.map((c) => [c.id, c.fullName])),
      nomesDeFuncoes: new Map(funcoes.map((f) => [f.id, f.name])),
      nomesDeUsuarios: new Map(usuarios.map((u) => [u.id, u.name])),
    }, filtro));
  });
}
