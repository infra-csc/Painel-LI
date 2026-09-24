/**
 * Espelho Operacional (logística do evento): grade do espelho, edição de
 * célula, recálculo de sugestões, importação/exportação de planilha, quartos
 * de hotel (confirmar, separar, mover, estadia por pessoa), carros de Uber
 * (confirmar, reabrir, mover, dispensar pessoa) e custos extras.
 * Papéis: logística (admin/Compras/Produção); leitura aberta a qualquer sessão.
 * Toda escrita passa pela trava de evento encerrado e grava auditoria.
 */
import type { Express, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  teamInclusions as teamInclusionsTable,
  uberGroups as uberGroupsTable,
  hotelRoomGroups as hotelRoomGroupsTable,
  hotelRoomGroupMembers as hotelRoomGroupMembersTable,
  uberGroupMembers as uberGroupMembersTable,
  logisticsExtraCosts as logisticsExtraCostsTable,
  insertLogisticsExtraCostSchema,
  type InsertHotelRoomGroup,
  type InsertUberGroup,
  type InsertLogisticsExtraCost,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { assertEventEditable, assertInclusionEventEditable } from "../event-guard";
import {
  getOperationalMirror,
  recalculateLogisticsSuggestions,
  exportOperationalMirrorExcel,
  patchOperationalMirrorCell,
  lerPlanilhaParaOEspelho,
} from "../operational-mirror";
import { createAuditLog, upload, requireRoles, LOGISTICA_ROLES } from "./_compartilhado";

export function registrarEspelhoOperacional(app: Express): void {
  // ===== Espelho Operacional (Logística do Evento) =====
  // 23/09: toda escrita daqui passa pela trava de evento encerrado
  // (event-guard) e grava auditoria — antes o Espelho, quartos, Uber e custos
  // extras eram os únicos caminhos de escrita sem as duas coisas.
  app.get("/api/events/:eventId/operational-mirror", async (req, res) => {
    try {
      const data = await getOperationalMirror(req.params.eventId);
      if (!data) return res.status(404).json({ message: "Evento não encontrado" });
      res.set("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      console.error("Erro espelho operacional:", error);
      res.status(500).json({ message: "Erro ao carregar espelho operacional" });
    }
  });

  /** Campos do espelho que mexem no PERÍODO da vaga — travados por pedido de ajuste pendente. */
  const CAMPOS_DE_DATA_DO_ESPELHO = new Set(["schedule.startDate", "schedule.endDate"]);
  const travaDePedidoPendente = async (rowId: string, res: Response): Promise<boolean> => {
    const pendente = (await storage.getScalingChangeRequestsByInclusion(rowId)).find((r) => r.status === "pendente");
    if (!pendente) return true;
    res.status(409).json({ message: `Há um pedido de ${pendente.requestType} aguardando o aprovador — as datas desta vaga ficam travadas até a decisão.` });
    return false;
  };

  app.patch("/api/events/:eventId/operational-mirror/rows/:rowId", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { field, value } = req.body || {};
      if (!field) return res.status(400).json({ message: "Campo obrigatório" });
      if (!await assertEventEditable(req.params.eventId, ator, res)) return;
      // Mesma trava do PATCH da vaga (regra do dono, 26/08): datas não mudam
      // por baixo de um pedido de ajuste em análise.
      if (CAMPOS_DE_DATA_DO_ESPELHO.has(String(field)) && !await travaDePedidoPendente(req.params.rowId, res)) return;
      const result = await patchOperationalMirrorCell(req.params.eventId, req.params.rowId, field, value);
      await createAuditLog("update", "operational_mirror", req.params.rowId, { eventId: req.params.eventId, field, value }, ator.id, ator.name, undefined, req);
      res.json(result);
    } catch (error) {
      console.error("Erro ao salvar célula do espelho:", error);
      res.status(400).json({ message: (error instanceof Error && error.message) || "Erro ao salvar célula" });
    }
  });

  app.post("/api/events/:eventId/recalculate-logistics-suggestions", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      if (!await assertEventEditable(req.params.eventId, ator, res)) return;
      const result = await recalculateLogisticsSuggestions(req.params.eventId);
      await createAuditLog("update", "operational_mirror", req.params.eventId, { eventId: req.params.eventId, acao: "recalcular sugestões", resultado: result }, ator.id, ator.name, undefined, req);
      res.json(result);
    } catch (error) {
      console.error("Erro ao recalcular sugestões:", error);
      res.status(500).json({ message: "Erro ao recalcular sugestões" });
    }
  });

  /**
   * Lê a planilha e devolve o que mudaria. NÃO grava: aplicar é outra chamada,
   * depois de alguém ver o preview — 200 alterações num evento não podem
   * acontecer por um arquivo solto num campo de upload.
   */
  app.post("/api/events/:eventId/operational-mirror/import/preview", upload.single("file"), async (req, res) => {
    if (!await requireRoles(req, res, LOGISTICA_ROLES)) return;
    try {
      const arquivo = req.file;
      if (!arquivo) return res.status(400).json({ message: "Nenhum arquivo enviado." });
      const leitura = await lerPlanilhaParaOEspelho(req.params.eventId, arquivo.buffer);
      if (!leitura) return res.status(404).json({ message: "Evento não encontrado" });
      res.set("Cache-Control", "no-store");
      res.json(leitura);
    } catch (error) {
      console.error("erro ao ler planilha do espelho:", error);
      res.status(400).json({ message: "Não consegui ler esta planilha. Confira se é o arquivo exportado por esta tela." });
    }
  });

  /**
   * Aplica as alterações confirmadas. O cliente manda o que foi mostrado no
   * preview — assim o que se grava é exatamente o que a pessoa viu e aceitou.
   */
  app.post("/api/events/:eventId/operational-mirror/import/aplicar", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : null;
      if (!linhas) return res.status(400).json({ message: "Nada para aplicar." });
      if (!await assertEventEditable(req.params.eventId, ator, res)) return;

      let gravados = 0;
      const falhas: { nome: string; campo: string; motivo: string }[] = [];
      for (const linha of linhas) {
        const rowId = String(linha?.teamInclusionId ?? "");
        if (!rowId || !Array.isArray(linha?.alteracoes)) continue;
        // Sequencial de propósito, como no saveMany do drawer: o servidor faz
        // "busca a linha; se não existir, insere" a cada campo — em paralelo,
        // dois campos do mesmo bloco criavam registros duplicados.
        for (const alt of linha.alteracoes) {
          try {
            await patchOperationalMirrorCell(req.params.eventId, rowId, String(alt.campo), alt.para);
            gravados += 1;
          } catch (e) {
            falhas.push({ nome: String(linha.nome ?? ""), campo: String(alt.campo), motivo: (e as Error)?.message || "erro" });
          }
        }
      }
      await createAuditLog("update", "operational_mirror", req.params.eventId, { eventId: req.params.eventId, acao: "importar planilha", gravados, falhas: falhas.length }, ator.id, ator.name, undefined, req);
      res.json({ gravados, falhas });
    } catch (error) {
      console.error("erro ao aplicar planilha do espelho:", error);
      res.status(500).json({ message: "Erro ao aplicar as alterações" });
    }
  });

  app.get("/api/events/:eventId/operational-mirror/export", async (req, res) => {
    try {
      const buf = await exportOperationalMirrorExcel(req.params.eventId);
      if (!buf) return res.status(404).json({ message: "Evento não encontrado" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="espelho-operacional.xlsx"`);
      res.send(buf);
    } catch (error) {
      console.error("Erro ao exportar espelho:", error);
      res.status(500).json({ message: "Erro ao exportar" });
    }
  });

  const grupoDeQuarto = async (id: string) => (await db.select().from(hotelRoomGroupsTable).where(eq(hotelRoomGroupsTable.id, id)))[0];
  const grupoDeUber = async (id: string) => (await db.select().from(uberGroupsTable).where(eq(uberGroupsTable.id, id)))[0];

  app.post("/api/hotel-room-groups/:id/confirm", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const grupo = await grupoDeQuarto(req.params.id);
      if (!grupo) return res.status(404).json({ message: "Quarto não encontrado" });
      if (!await assertEventEditable(grupo.eventId, ator, res)) return;
      const [g] = await db.update(hotelRoomGroupsTable)
        .set({ confirmed: true, suggested: false, updatedAt: new Date() })
        .where(eq(hotelRoomGroupsTable.id, req.params.id)).returning();
      await createAuditLog("confirm", "hotel_room_group", req.params.id, g, ator.id, ator.name, grupo, req);
      res.json(g);
    } catch {
      res.status(400).json({ message: "Erro ao confirmar grupo de quarto" });
    }
  });

  /**
   * POST /api/hotel-room-groups/:id/separar — desfaz o quarto compartilhado.
   *
   * Existe porque marcar "single" num quarto de duas pessoas só trocava o
   * rótulo: o quarto seguia com as duas (relato do dono, 28/08). Separar é o
   * que "single" significa de fato — cada ocupante passa a ter o seu.
   *
   * O grupo original fica com o primeiro ocupante; os demais ganham um grupo
   * próprio, herdando hotel e datas. Nada é apagado.
   */
  app.post("/api/hotel-room-groups/:id/separar", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { id } = req.params;
      const grupo = await grupoDeQuarto(id);
      if (!grupo) return res.status(404).json({ message: "Quarto não encontrado" });
      if (!await assertEventEditable(grupo.eventId, ator, res)) return;

      const membros = await db.select().from(hotelRoomGroupMembersTable)
        .where(eq(hotelRoomGroupMembersTable.hotelRoomGroupId, id));
      if (membros.length <= 1) {
        return res.status(400).json({ message: "Este quarto já é individual." });
      }

      const restante = await db.transaction(async (tx) => {
        // O primeiro fica; cada um dos outros ganha o seu.
        for (const m of membros.slice(1)) {
          const [novo] = await tx.insert(hotelRoomGroupsTable).values({
            eventId: grupo.eventId,
            hotelName: grupo.hotelName,
            roomType: "single",
            genderRule: grupo.genderRule,
            checkInDate: grupo.checkInDate,
            checkOutDate: grupo.checkOutDate,
            suggested: grupo.suggested,
            confirmed: false,
          }).returning();
          await tx.update(hotelRoomGroupMembersTable)
            .set({ hotelRoomGroupId: novo.id })
            .where(eq(hotelRoomGroupMembersTable.id, m.id));
        }
        // O que sobrou é um quarto individual — e a observação de datas
        // diferentes perde o sentido quando não há com quem dividir.
        const [r] = await tx.update(hotelRoomGroupsTable)
          .set({ roomType: "single", notes: null, confirmed: false, updatedAt: new Date() })
          .where(eq(hotelRoomGroupsTable.id, id)).returning();
        return r;
      });
      await createAuditLog("update", "hotel_room_group", id, { ...restante, acao: "separar", criados: membros.length - 1 }, ator.id, ator.name, grupo, req);
      res.json({ ok: true, criados: membros.length - 1, grupo: restante });
    } catch (error) {
      console.error("erro ao separar quarto:", error);
      res.status(400).json({ message: "Não foi possível separar o quarto." });
    }
  });

  /**
   * POST /api/hotel-room-groups/mover — tira alguém de um quarto e põe em
   * outro (pedido do dono, 28/08: "puxar uma pessoa para outro").
   *
   * `paraGrupoId` nulo significa "quarto novo, só para essa pessoa". Se o
   * quarto de origem ficar vazio, ele deixa de existir — quarto sem ninguém
   * não é reserva, é lixo na tela. O destino precisa ser do MESMO evento.
   */
  app.post("/api/hotel-room-groups/mover", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { collaboratorId, deGrupoId, paraGrupoId } = req.body ?? {};
      if (!collaboratorId || !deGrupoId) return res.status(400).json({ message: "Informe a pessoa e o quarto de origem." });

      const origem = await grupoDeQuarto(String(deGrupoId));
      if (!origem) return res.status(404).json({ message: "Quarto de origem não encontrado." });
      if (!await assertEventEditable(origem.eventId, ator, res)) return;
      if (paraGrupoId) {
        const destino = await grupoDeQuarto(String(paraGrupoId));
        if (!destino) return res.status(404).json({ message: "Quarto de destino não encontrado." });
        if (destino.eventId !== origem.eventId) return res.status(400).json({ message: "O quarto de destino é de outro evento." });
      }

      const membrosOrigem = await db.select().from(hotelRoomGroupMembersTable)
        .where(eq(hotelRoomGroupMembersTable.hotelRoomGroupId, deGrupoId));
      const membro = membrosOrigem.find((m) => m.collaboratorId === collaboratorId);
      if (!membro) return res.status(404).json({ message: "Esta pessoa não está neste quarto." });

      const destinoId = await db.transaction(async (tx) => {
        let destinoId: string = paraGrupoId ?? "";
        if (!destinoId) {
          const [novo] = await tx.insert(hotelRoomGroupsTable).values({
            eventId: origem.eventId,
            hotelName: origem.hotelName,
            roomType: "single",
            genderRule: origem.genderRule,
            checkInDate: origem.checkInDate,
            checkOutDate: origem.checkOutDate,
            suggested: origem.suggested,
            confirmed: false,
          }).returning();
          destinoId = novo.id;
        }
        await tx.update(hotelRoomGroupMembersTable)
          .set({ hotelRoomGroupId: destinoId, confirmed: false })
          .where(eq(hotelRoomGroupMembersTable.id, membro.id));
        // Origem sem ninguém deixa de existir; com gente, a observação de datas
        // pode ter deixado de valer, então sai junto.
        if (membrosOrigem.length <= 1) {
          await tx.delete(hotelRoomGroupsTable).where(eq(hotelRoomGroupsTable.id, deGrupoId));
        } else {
          await tx.update(hotelRoomGroupsTable)
            .set({ notes: null, confirmed: false, updatedAt: new Date() })
            .where(eq(hotelRoomGroupsTable.id, deGrupoId));
        }
        await tx.update(hotelRoomGroupsTable)
          .set({ notes: null, confirmed: false, updatedAt: new Date() })
          .where(eq(hotelRoomGroupsTable.id, destinoId));
        return destinoId;
      });
      await createAuditLog("update", "hotel_room_group", destinoId, { acao: "mover", collaboratorId, deGrupoId, paraGrupoId: destinoId, eventId: origem.eventId }, ator.id, ator.name, undefined, req);
      res.json({ ok: true, destinoId });
    } catch (error) {
      console.error("erro ao mover pessoa de quarto:", error);
      res.status(400).json({ message: "Não foi possível mover a pessoa." });
    }
  });

  /** Mesma ideia para os carros do Uber. */
  app.post("/api/uber-groups/mover", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { collaboratorId, deGrupoId, paraGrupoId } = req.body ?? {};
      if (!collaboratorId || !deGrupoId) return res.status(400).json({ message: "Informe a pessoa e o carro de origem." });

      const origem = await grupoDeUber(String(deGrupoId));
      if (!origem) return res.status(404).json({ message: "Carro de origem não encontrado." });
      if (!await assertEventEditable(origem.eventId, ator, res)) return;
      if (paraGrupoId) {
        const destino = await grupoDeUber(String(paraGrupoId));
        if (!destino) return res.status(404).json({ message: "Carro de destino não encontrado." });
        if (destino.eventId !== origem.eventId) return res.status(400).json({ message: "O carro de destino é de outro evento." });
      }

      const membrosOrigem = await db.select().from(uberGroupMembersTable)
        .where(eq(uberGroupMembersTable.uberGroupId, deGrupoId));
      const membro = membrosOrigem.find((m) => m.collaboratorId === collaboratorId);
      if (!membro) return res.status(404).json({ message: "Esta pessoa não está neste carro." });

      const destinoId = await db.transaction(async (tx) => {
        let destinoId: string = paraGrupoId ?? "";
        if (!destinoId) {
          const [novo] = await tx.insert(uberGroupsTable).values({
            eventId: origem.eventId,
            groupName: origem.groupName,
            direction: origem.direction,
            origin: origem.origin,
            destination: origem.destination,
            date: origem.date,
            time: origem.time,
            suggested: origem.suggested,
            confirmed: false,
            status: "sugerido",
          }).returning();
          destinoId = novo.id;
        }
        await tx.update(uberGroupMembersTable)
          .set({ uberGroupId: destinoId, confirmed: false })
          .where(eq(uberGroupMembersTable.id, membro.id));
        if (membrosOrigem.length <= 1) {
          await tx.delete(uberGroupsTable).where(eq(uberGroupsTable.id, deGrupoId));
        } else {
          // Quem saiu podia ser o titular: o carro fica sem titular até alguém
          // escolher de novo, em vez de apontar quem não está mais nele.
          const limpaTitular = origem.titularCollaboratorId === collaboratorId ? { titularCollaboratorId: null } : {};
          await tx.update(uberGroupsTable)
            .set({ ...limpaTitular, confirmed: false, updatedAt: new Date() })
            .where(eq(uberGroupsTable.id, deGrupoId));
        }
        await tx.update(uberGroupsTable)
          .set({ confirmed: false, updatedAt: new Date() })
          .where(eq(uberGroupsTable.id, destinoId));
        return destinoId;
      });
      await createAuditLog("update", "uber_group", destinoId, { acao: "mover", collaboratorId, deGrupoId, paraGrupoId: destinoId, eventId: origem.eventId }, ator.id, ator.name, undefined, req);
      res.json({ ok: true, destinoId });
    } catch (error) {
      console.error("erro ao mover pessoa de carro:", error);
      res.status(400).json({ message: "Não foi possível mover a pessoa." });
    }
  });

  app.patch("/api/hotel-room-groups/:id", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const anterior = await grupoDeQuarto(req.params.id);
      if (!anterior) return res.status(404).json({ message: "Quarto não encontrado" });
      if (!await assertEventEditable(anterior.eventId, ator, res)) return;
      const allowed: Partial<InsertHotelRoomGroup> = {};
      for (const k of ["hotelName", "roomType", "genderRule", "checkInDate", "checkOutDate", "notes", "confirmed"] as const) {
        if (k in req.body) allowed[k] = req.body[k];
      }
      const [g] = await db.update(hotelRoomGroupsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(hotelRoomGroupsTable.id, req.params.id)).returning();
      await createAuditLog("update", "hotel_room_group", req.params.id, g, ator.id, ator.name, anterior, req);
      res.json(g);
    } catch {
      res.status(400).json({ message: "Erro ao atualizar grupo de quarto" });
    }
  });

  app.post("/api/uber-groups/:id/confirm", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const anterior = await grupoDeUber(req.params.id);
      if (!anterior) return res.status(404).json({ message: "Carro não encontrado" });
      if (!await assertEventEditable(anterior.eventId, ator, res)) return;
      const [g] = await db.update(uberGroupsTable)
        .set({ confirmed: true, suggested: false, status: "confirmado", updatedAt: new Date() })
        .where(eq(uberGroupsTable.id, req.params.id)).returning();
      await createAuditLog("confirm", "uber_group", req.params.id, g, ator.id, ator.name, anterior, req);
      res.json(g);
    } catch {
      res.status(400).json({ message: "Erro ao confirmar grupo de uber" });
    }
  });

  /**
   * Reabrir o carro (31/08) — o par de confirmar. Sem isto, confirmar por
   * engano travava o grupo para sempre: "Refazer sugestões" preserva o que
   * está confirmado, então nem recalcular desfazia.
   */
  app.post("/api/uber-groups/:id/reabrir", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const anterior = await grupoDeUber(req.params.id);
      if (!anterior) return res.status(404).json({ message: "Carro não encontrado" });
      if (!await assertEventEditable(anterior.eventId, ator, res)) return;
      const [g] = await db.update(uberGroupsTable)
        .set({ confirmed: false, suggested: true, status: "sugerido", updatedAt: new Date() })
        .where(eq(uberGroupsTable.id, req.params.id)).returning();
      await createAuditLog("update", "uber_group", req.params.id, { ...g, acao: "reabrir" }, ator.id, ator.name, anterior, req);
      res.json(g);
    } catch {
      res.status(400).json({ message: "Erro ao reabrir grupo de uber" });
    }
  });

  app.patch("/api/uber-groups/:id", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const atual = await grupoDeUber(req.params.id);
      if (!atual) return res.status(404).json({ message: "Carro não encontrado" });
      if (!await assertEventEditable(atual.eventId, ator, res)) return;
      const allowed: Partial<InsertUberGroup> = {};
      for (const k of ["groupName", "direction", "origin", "destination", "date", "time", "estimatedTotalCents", "notes", "status", "confirmed", "titularCollaboratorId", "manualTime"] as const) {
        if (k in req.body) allowed[k] = req.body[k];
      }
      // Ajustar o horário à mão grava nos DOIS campos: `manualTime` registra que
      // houve decisão humana (e o cálculo original fica em `suggestedTime`, para
      // a tela poder dizer o que o sistema sugeria); `time` continua sendo o que
      // vale. Limpar o campo devolve o carro ao horário calculado.
      if ("manualTime" in allowed) {
        const manual = allowed.manualTime ? String(allowed.manualTime).trim() : null;
        allowed.manualTime = manual;
        allowed.time = manual ? manual : (atual.suggestedTime ?? atual.time ?? null);
      }
      const [g] = await db.update(uberGroupsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(uberGroupsTable.id, req.params.id)).returning();
      await createAuditLog("update", "uber_group", req.params.id, g, ator.id, ator.name, atual, req);
      res.json(g);
    } catch {
      res.status(400).json({ message: "Erro ao atualizar grupo de uber" });
    }
  });

  /**
   * Dispensar (ou trazer de volta) alguém da roteirização de Uber. É por vaga,
   * não por pessoa: quem vai de carro próprio num evento pode precisar de Uber
   * no seguinte.
   */
  app.patch("/api/team-inclusions/:id/skip-uber", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const skip = req.body?.skipUber === true;
      const vaga = await storage.getTeamInclusion(req.params.id);
      if (!vaga || vaga.deletedAt) return res.status(404).json({ message: "Vaga não encontrada" });
      if (!await assertInclusionEventEditable(vaga.id, ator, res, vaga)) return;
      const [ti] = await db.update(teamInclusionsTable)
        .set({ skipUber: skip, updatedAt: new Date(), updatedBy: ator.id })
        .where(eq(teamInclusionsTable.id, req.params.id)).returning();
      if (!ti) return res.status(404).json({ message: "Vaga não encontrada" });
      await createAuditLog("update", "team_inclusion", ti.id, ti, ator.id, ator.name, vaga, req);
      res.json({ id: ti.id, skipUber: ti.skipUber });
    } catch {
      res.status(400).json({ message: "Erro ao atualizar a roteirização desta pessoa" });
    }
  });

  /**
   * Estadia de UMA pessoa dentro do quarto. O período era do grupo, e quem
   * chega antes (montagem) ou sai depois (desmontagem) ficava com a data errada.
   * Vazio devolve a pessoa ao período do grupo.
   */
  app.patch("/api/hotel-room-group-members/:id", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const [anterior] = await db.select().from(hotelRoomGroupMembersTable).where(eq(hotelRoomGroupMembersTable.id, req.params.id));
      if (!anterior) return res.status(404).json({ message: "Ocupante não encontrado" });
      const grupo = await grupoDeQuarto(anterior.hotelRoomGroupId);
      if (grupo && !await assertEventEditable(grupo.eventId, ator, res)) return;
      const allowed: Partial<typeof hotelRoomGroupMembersTable.$inferInsert> = {};
      for (const k of ["checkInDate", "checkOutDate", "notes", "confirmed"] as const) {
        if (k in req.body) allowed[k] = req.body[k] === "" ? null : req.body[k];
      }
      if (allowed.checkInDate && allowed.checkOutDate && allowed.checkOutDate < allowed.checkInDate) {
        return res.status(400).json({ message: "A saída não pode ser antes da entrada." });
      }
      const [m] = await db.update(hotelRoomGroupMembersTable)
        .set(allowed)
        .where(eq(hotelRoomGroupMembersTable.id, req.params.id)).returning();
      if (!m) return res.status(404).json({ message: "Ocupante não encontrado" });
      await createAuditLog("update", "hotel_room_group_member", req.params.id, m, ator.id, ator.name, anterior, req);
      res.json(m);
    } catch {
      res.status(400).json({ message: "Erro ao atualizar a estadia desta pessoa" });
    }
  });

  // Custos extras de logística (bagagem, uber, locação)
  app.post("/api/logistics-extra-costs", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const data = insertLogisticsExtraCostSchema.parse(req.body);
      if (!await assertEventEditable(data.eventId ?? null, ator, res)) return;
      const [created] = await db.insert(logisticsExtraCostsTable).values(data).returning();
      await createAuditLog("create", "logistics_extra_cost", created.id, created, ator.id, ator.name, undefined, req);
      res.json(created);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro";
      res.status(400).json({ message: "Dados inválidos", error: msg });
    }
  });

  app.patch("/api/logistics-extra-costs/:id", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const [anterior] = await db.select().from(logisticsExtraCostsTable).where(eq(logisticsExtraCostsTable.id, req.params.id));
      if (!anterior) return res.status(404).json({ message: "Custo não encontrado" });
      if (!await assertEventEditable(anterior.eventId ?? null, ator, res)) return;
      const allowed: Partial<InsertLogisticsExtraCost> = {};
      for (const k of ["collaboratorId", "type", "description", "amountCents", "oc", "checkInReference", "company", "notes", "attachmentUrl"] as const) {
        if (k in req.body) allowed[k] = req.body[k];
      }
      const [updated] = await db.update(logisticsExtraCostsTable)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(logisticsExtraCostsTable.id, req.params.id)).returning();
      await createAuditLog("update", "logistics_extra_cost", req.params.id, updated, ator.id, ator.name, anterior, req);
      res.json(updated);
    } catch {
      res.status(400).json({ message: "Erro ao atualizar custo" });
    }
  });

  // Exclusão física, mas AUDITADA com o registro apagado (23/09) — a tabela
  // não tem deleted_at; o valor excluído fica em system_logs.previousData.
  app.delete("/api/logistics-extra-costs/:id", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const [anterior] = await db.select().from(logisticsExtraCostsTable).where(eq(logisticsExtraCostsTable.id, req.params.id));
      if (!anterior) return res.status(404).json({ message: "Custo não encontrado" });
      if (!await assertEventEditable(anterior.eventId ?? null, ator, res)) return;
      await db.delete(logisticsExtraCostsTable).where(eq(logisticsExtraCostsTable.id, req.params.id));
      await createAuditLog("delete", "logistics_extra_cost", req.params.id, anterior, ator.id, ator.name, undefined, req);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ message: "Erro ao excluir custo" });
    }
  });
}
