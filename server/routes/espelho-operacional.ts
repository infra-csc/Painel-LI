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
  collaborators as collaboratorsTable,
  hotelTarifasEvento as hotelTarifasEventoTable,
  hotelValoresQuarto as hotelValoresQuartoTable,
  hotelLateCheckouts as hotelLateCheckoutsTable,
  insertLogisticsExtraCostSchema,
  type InsertHotelRoomGroup,
  type InsertUberGroup,
  type InsertLogisticsExtraCost,
} from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isValidHhmm } from "@shared/scaling-validation-rules";
import { assertEventEditable, assertInclusionEventEditable } from "../event-guard";
import {
  getOperationalMirror,
  recalculateLogisticsSuggestions,
  exportOperationalMirrorExcel,
  patchOperationalMirrorCell,
  lerPlanilhaParaOEspelho,
  motivoDeLotacaoDoQuarto,
  horariosCalculadosDosCarros,
  colaboradoresComVagaAtiva,
} from "../operational-mirror";
import { tipoPorOcupantes } from "@shared/room-pairing";
import { chaveDoHotel, hotelDoEvento, nomeDeHotelLimpo, planoDoHotelDoEvento } from "@shared/rooming-list";
import { hasRoleIn, ROLE_GROUPS } from "@shared/roles";
import { LIMITE_DA_DIARIA_CENTAVOS, LIMITE_DO_VALOR_PAGO_CENTAVOS } from "@shared/custo-dos-quartos";
import { createAuditLog, upload, requireRoles, recalcularStatusDeLogistica, LOGISTICA_ROLES, PAPEIS_DA_OPERACAO } from "./_compartilhado";
import { preencherHospedagensDosQuartos, preencherSemDerrubar } from "../hotel-na-hospedagem";

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

  /** Campo da grade que grava hospedagem ou passagem — o status da vaga é derivado deles. */
  const mexeNaLogistica = (field: string) => field.startsWith("accommodation.") || field.startsWith("ticket.");

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
      // Hotel/passagem lançados na grade também andam o status da vaga (23/10)
      // — antes só as telas de Hospedagens e Passagens faziam isso.
      if (mexeNaLogistica(String(field))) await recalcularStatusDeLogistica(req.params.rowId, ator, req);
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
      const vagasComLogistica = new Set<string>();
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
            if (mexeNaLogistica(String(alt.campo))) vagasComLogistica.add(rowId);
          } catch (e) {
            falhas.push({ nome: String(linha.nome ?? ""), campo: String(alt.campo), motivo: (e as Error)?.message || "erro" });
          }
        }
      }
      await createAuditLog("update", "operational_mirror", req.params.eventId, { eventId: req.params.eventId, acao: "importar planilha", gravados, falhas: falhas.length }, ator.id, ator.name, undefined, req);
      for (const rowId of Array.from(vagasComLogistica)) await recalcularStatusDeLogistica(rowId, ator, req);
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

  /**
   * Rooming list em PDF para o hotel (09/10). O PDF é desenhado no navegador
   * com os dados que a tela já tem; esta rota só (1) registra a exportação na
   * auditoria — sem CPF no log — e (2) devolve o CPF dos hóspedes DAQUELE hotel
   * quando a pessoa marcou "Incluir CPF" e o papel dela vê dados pessoais.
   */
  app.post("/api/events/:eventId/operational-mirror/rooming-list", async (req, res) => {
    const ator = await requireRoles(req, res, PAPEIS_DA_OPERACAO);
    if (!ator) return;
    try {
      // `semHotel: true` (15/10): o documento dos quartos SEM hotel definido —
      // o dono não quer ser obrigado a definir o hotel para gerar o PDF.
      const semHotel = req.body?.semHotel === true;
      const hotel = !semHotel && typeof req.body?.hotel === "string" ? req.body.hotel.trim() : "";
      const nomeNoPdf = semHotel && typeof req.body?.nomeDoHotelNoPdf === "string" ? nomeDeHotelLimpo(req.body.nomeDoHotelNoPdf).slice(0, 120) : "";
      const incluirCpf = req.body?.incluirCpf === true;
      // "Com valores (uso interno)" (20/10): o PDF que NÃO vai ao hotel — só fica registrado.
      const comValores = req.body?.comValores === true;
      if (!hotel && !semHotel) return res.status(400).json({ message: "Escolha o hotel." });
      if (incluirCpf && !hasRoleIn(ator.role, ROLE_GROUPS.dadosPessoais)) {
        return res.status(403).json({ message: "Seu perfil não vê CPF de colaboradores — exporte sem CPF." });
      }
      const chave = chaveDoHotel(hotel);
      const grupos = (await db.select().from(hotelRoomGroupsTable).where(eq(hotelRoomGroupsTable.eventId, req.params.eventId)))
        .filter((g) => chaveDoHotel(g.hotelName) === chave);
      if (!grupos.length) {
        return res.status(404).json({ message: semHotel ? "Todos os quartos deste evento já têm hotel." : "Nenhum quarto deste evento está neste hotel." });
      }
      const membros = await db.select().from(hotelRoomGroupMembersTable)
        .where(inArray(hotelRoomGroupMembersTable.hotelRoomGroupId, grupos.map((g) => g.id)));
      const ids = Array.from(new Set(membros.map((m) => m.collaboratorId).filter((x): x is string => !!x)));

      const cpfs: Record<string, string> = {};
      if (incluirCpf && ids.length) {
        const pessoas = await db.select({
          id: collaboratorsTable.id,
          officialDocument: collaboratorsTable.officialDocument, documentType: collaboratorsTable.documentType,
          secondaryDocument: collaboratorsTable.secondaryDocument, secondaryDocumentType: collaboratorsTable.secondaryDocumentType,
        }).from(collaboratorsTable).where(inArray(collaboratorsTable.id, ids));
        for (const p of pessoas) {
          const cpf = String(p.documentType).toLowerCase() === "cpf" ? p.officialDocument
            : String(p.secondaryDocumentType ?? "").toLowerCase() === "cpf" ? p.secondaryDocument : null;
          const digitos = String(cpf ?? "").replace(/\D/g, "");
          if (digitos.length === 11) cpfs[p.id] = digitos;
        }
      }
      await createAuditLog("export", "operational_mirror", req.params.eventId, {
        eventId: req.params.eventId, acao: "rooming list (PDF)",
        hotel: semHotel ? null : hotel, ...(semHotel ? { semHotelDefinido: true, nomeNoPdf: nomeNoPdf || null } : {}),
        quartos: grupos.length, hospedes: ids.length, incluiuCpf: incluirCpf, ...(comValores ? { comValores: true } : {}),
      }, ator.id, ator.name, undefined, req);
      res.set("Cache-Control", "no-store");
      res.json({ cpfs });
    } catch (error) {
      console.error("Erro ao preparar a rooming list:", error);
      res.status(500).json({ message: "Não foi possível preparar a rooming list." });
    }
  });

  /**
   * PATCH /api/events/:eventId/operational-mirror/hotel — "Hotel do evento"
   * (15/10, dono: "todos ficam no mesmo hotel por evento"). Grava o hotel em
   * todos os quartos do evento numa transação, pela regra de
   * `planoDoHotelDoEvento` (shared/rooming-list.ts): confirmado fica como
   * está; quarto em OUTRO hotel (exceção feita à mão) só troca com
   * `trocarOutros: true`. Mesma permissão e trava de evento encerrado da
   * edição de hotel de um quarto; uma linha de auditoria com o que mudou.
   */
  app.patch("/api/events/:eventId/operational-mirror/hotel", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const hotel = typeof req.body?.hotelName === "string" ? nomeDeHotelLimpo(req.body.hotelName) : "";
      if (!hotel) return res.status(400).json({ message: "Escreva o nome do hotel." });
      if (hotel.length > 120) return res.status(400).json({ message: "Nome do hotel muito longo (máximo 120 caracteres)." });
      const trocarOutros = req.body?.trocarOutros === true;
      const { eventId } = req.params;
      if (!await assertEventEditable(eventId, ator, res)) return;

      const resultado = await db.transaction(async (tx) => {
        // Mesmo lock do "Refazer sugestões": aplicar o hotel no meio de um
        // recálculo gravaria em quartos que estão sendo apagados.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"mirror:" + eventId}))`);
        const quartos = await tx.select({ id: hotelRoomGroupsTable.id, hotelName: hotelRoomGroupsTable.hotelName, confirmed: hotelRoomGroupsTable.confirmed })
          .from(hotelRoomGroupsTable).where(eq(hotelRoomGroupsTable.eventId, eventId));
        const anterior = hotelDoEvento(quartos);
        const plano = planoDoHotelDoEvento(quartos, hotel, { trocarOutros });
        if (plano.aplicar.length) {
          await tx.update(hotelRoomGroupsTable)
            .set({ hotelName: plano.hotel, updatedAt: new Date() })
            .where(and(eq(hotelRoomGroupsTable.eventId, eventId), eq(hotelRoomGroupsTable.confirmed, false), inArray(hotelRoomGroupsTable.id, plano.aplicar)));
        }
        return { anterior, plano, total: quartos.length };
      });
      const { plano } = resultado;
      await createAuditLog("update", "hotel_room_group", eventId, {
        eventId, acao: "hotel do evento", hotel: plano.hotel, hotelAnterior: resultado.anterior,
        aplicados: plano.aplicar.length, confirmadosMantidos: plano.confirmadosMantidos,
        emOutroHotel: plano.emOutroHotel.length, outrosMantidos: plano.outrosMantidos, trocarOutros,
      }, ator.id, ator.name, undefined, req);
      res.json({
        hotel: plano.hotel,
        aplicados: plano.aplicar.length,
        jaNoHotel: plano.jaNoHotel,
        confirmadosMantidos: plano.confirmadosMantidos,
        outrosMantidos: plano.outrosMantidos,
        totalDeQuartos: resultado.total,
      });
    } catch (error) {
      console.error("erro ao aplicar o hotel do evento:", error);
      res.status(500).json({ message: "Não foi possível aplicar o hotel aos quartos." });
    }
  });

  /**
   * POST /api/events/:eventId/operational-mirror/hospedagens — preenche a
   * hospedagem das vagas com os dados dos quartos CONFIRMADOS (23/10; o mesmo
   * que o "Confirmar" faz). Sem corpo: só o que está vazio ou foi escrito pelo
   * Espelho; o lançado à mão fica e volta em `diferem`.
   * `usarDadosDoQuarto: [teamInclusionId…]` — essas vagas recebem os dados do
   * quarto mesmo sobre o lançado à mão (a tela mostra a diferença antes).
   * Regra em shared/hotel-na-hospedagem.ts; status e auditoria em
   * server/hotel-na-hospedagem.ts.
   */
  app.post("/api/events/:eventId/operational-mirror/hospedagens", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { eventId } = req.params;
      const bruto = req.body?.usarDadosDoQuarto;
      if (bruto !== undefined && (!Array.isArray(bruto) || bruto.length === 0 || bruto.length > 500 || bruto.some((x: unknown) => typeof x !== "string" || !x))) {
        return res.status(400).json({ message: "Informe as vagas que recebem os dados do quarto." });
      }
      if (!await assertEventEditable(eventId, ator, res)) return;
      const forcar = bruto ? new Set<string>(bruto) : null;
      const resumo = await preencherHospedagensDosQuartos(eventId, ator, req, forcar ? { vagas: forcar, forcar } : {});
      res.json(resumo);
    } catch (error) {
      console.error("erro ao preencher as hospedagens dos quartos:", error);
      res.status(500).json({ message: "Não foi possível preencher as hospedagens." });
    }
  });

  // ===== Valores do hotel (20/10) — aba Quartos =====
  // Tarifas por pessoa por noite (Individual/Duplo/Triplo), fatura do hotel,
  // diária própria e valor pago de um quarto, late check-out por pessoa. Regra
  // do cálculo em shared/custo-dos-quartos.ts; o resultado entra no "Hotel" do
  // custo do Espelho (hotelTotalCents), NÃO no Planejado/Realizado. Mesma
  // permissão da edição de quartos (logística) e mesma trava de evento encerrado.

  /**
   * Lê um valor em centavos do corpo: chave ausente → `undefined` (não mexe);
   * `null`/"" → `null` (apaga); inteiro 0..limite → o valor; o resto → erro.
   */
  const lerCentavos = (corpo: Record<string, unknown>, chave: string, limite: number, nome: string):
    { valor: number | null | undefined } | { erro: string } => {
    if (!(chave in corpo)) return { valor: undefined };
    const v = corpo[chave];
    if (v === null || v === "") return { valor: null };
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { erro: `${nome}: informe um valor em reais válido.` };
    if (v > limite) return { erro: `${nome}: valor alto demais — confira a digitação.` };
    return { valor: v };
  };

  /**
   * PUT /api/events/:eventId/operational-mirror/hotel-valores — tarifas do
   * evento e fatura. Só as chaves enviadas mudam; `null` apaga.
   *
   * 22/10 — também `temDuplo`/`temTriplo` (booleanos): o hotel do evento tem
   * esses apartamentos? Individual sempre tem. Mudar a opção NÃO refaz os
   * quartos: a aba avisa dos que excedem e oferece "Refazer sugestões" (que
   * também refaz os carros não confirmados e desfaz ajustes à mão — por isso
   * não roda sozinho). A tarifa gravada do tipo desmarcado fica guardada.
   */
  app.put("/api/events/:eventId/operational-mirror/hotel-valores", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { eventId } = req.params;
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const campos = {
        individualCentavos: lerCentavos(corpo, "individualCentavos", LIMITE_DA_DIARIA_CENTAVOS, "Diária individual"),
        duploCentavos: lerCentavos(corpo, "duploCentavos", LIMITE_DA_DIARIA_CENTAVOS, "Diária do duplo"),
        triploCentavos: lerCentavos(corpo, "triploCentavos", LIMITE_DA_DIARIA_CENTAVOS, "Diária do triplo"),
        faturaCentavos: lerCentavos(corpo, "faturaCentavos", LIMITE_DO_VALOR_PAGO_CENTAVOS, "Valor pago ao hotel"),
      };
      const erro = Object.values(campos).find((c): c is { erro: string } => "erro" in c);
      if (erro) return res.status(400).json({ message: erro.erro });
      const tipos: { temDuplo?: boolean; temTriplo?: boolean } = {};
      for (const [chave, nome] of [["temDuplo", "Duplo"], ["temTriplo", "Triplo"]] as const) {
        if (!(chave in corpo)) continue;
        if (typeof corpo[chave] !== "boolean") return res.status(400).json({ message: `${nome}: informe se o hotel tem (sim ou não).` });
        tipos[chave] = corpo[chave] as boolean;
      }
      const mudancas = {
        ...Object.fromEntries(
          Object.entries(campos).map(([k, c]) => [k, (c as { valor: number | null | undefined }).valor]).filter(([, v]) => v !== undefined),
        ) as Partial<Record<keyof typeof campos, number | null>>,
        ...tipos,
      };
      if (Object.keys(mudancas).length === 0) return res.status(400).json({ message: "Nada para salvar." });
      if (!await assertEventEditable(eventId, ator, res)) return;

      const [anterior] = await db.select().from(hotelTarifasEventoTable).where(eq(hotelTarifasEventoTable.eventId, eventId));
      const agora = new Date();
      const [linha] = await db.insert(hotelTarifasEventoTable)
        .values({ eventId, ...mudancas, updatedAt: agora, updatedBy: ator.id })
        .onConflictDoUpdate({ target: hotelTarifasEventoTable.eventId, set: { ...mudancas, updatedAt: agora, updatedBy: ator.id } })
        .returning();
      await createAuditLog("update", "hotel_valores", eventId,
        { eventId, acao: Object.keys(tipos).length && Object.keys(mudancas).length === Object.keys(tipos).length ? "apartamentos do hotel" : "tarifas do hotel", ...mudancas },
        ator.id, ator.name, anterior, req);
      res.json(linha);
    } catch (error) {
      console.error("erro ao salvar as tarifas do hotel:", error);
      res.status(500).json({ message: "Não foi possível salvar os valores do hotel." });
    }
  });

  /**
   * PUT /api/hotel-room-groups/:id/valores — diária própria (por pessoa por
   * noite) e valor pago de UM quarto. Os dois `null` → volta ao padrão.
   */
  app.put("/api/hotel-room-groups/:id/valores", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const diaria = lerCentavos(corpo, "diariaPropriaCentavos", LIMITE_DA_DIARIA_CENTAVOS, "Diária do quarto");
      const pago = lerCentavos(corpo, "valorPagoCentavos", LIMITE_DO_VALOR_PAGO_CENTAVOS, "Valor pago do quarto");
      if ("erro" in diaria) return res.status(400).json({ message: diaria.erro });
      if ("erro" in pago) return res.status(400).json({ message: pago.erro });
      if (diaria.valor === undefined && pago.valor === undefined) return res.status(400).json({ message: "Nada para salvar." });
      const grupo = await grupoDeQuarto(req.params.id);
      if (!grupo) return res.status(404).json({ message: "Quarto não encontrado" });
      if (!await assertEventEditable(grupo.eventId, ator, res)) return;

      const [anterior] = await db.select().from(hotelValoresQuartoTable).where(eq(hotelValoresQuartoTable.hotelRoomGroupId, grupo.id));
      const final = {
        diariaPropriaCentavos: diaria.valor === undefined ? anterior?.diariaPropriaCentavos ?? null : diaria.valor,
        valorPagoCentavos: pago.valor === undefined ? anterior?.valorPagoCentavos ?? null : pago.valor,
      };
      let linha: unknown = null;
      if (final.diariaPropriaCentavos === null && final.valorPagoCentavos === null) {
        // Nada próprio: o quarto volta a seguir o evento — sem linha vazia guardada.
        await db.delete(hotelValoresQuartoTable).where(eq(hotelValoresQuartoTable.hotelRoomGroupId, grupo.id));
      } else {
        const agora = new Date();
        [linha] = await db.insert(hotelValoresQuartoTable)
          .values({ hotelRoomGroupId: grupo.id, eventId: grupo.eventId, ...final, updatedAt: agora, updatedBy: ator.id })
          .onConflictDoUpdate({ target: hotelValoresQuartoTable.hotelRoomGroupId, set: { ...final, updatedAt: agora, updatedBy: ator.id } })
          .returning();
      }
      await createAuditLog("update", "hotel_room_group", grupo.id, { eventId: grupo.eventId, acao: "valores do quarto", ...final }, ator.id, ator.name, anterior, req);
      res.json(linha ?? { hotelRoomGroupId: grupo.id, ...final });
    } catch (error) {
      console.error("erro ao salvar os valores do quarto:", error);
      res.status(500).json({ message: "Não foi possível salvar os valores do quarto." });
    }
  });

  /**
   * PUT /api/events/:eventId/operational-mirror/late-checkout — late check-out
   * de UMA pessoa do evento. `ativo: true|false` grava a escolha (vence a caixa
   * da hospedagem); `ativo: null` apaga a escolha (volta a seguir a hospedagem).
   * `valorCentavos: null` = igual à diária da pessoa.
   */
  app.put("/api/events/:eventId/operational-mirror/late-checkout", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { eventId } = req.params;
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const collaboratorId = typeof corpo.collaboratorId === "string" ? corpo.collaboratorId : "";
      if (!collaboratorId) return res.status(400).json({ message: "Informe a pessoa." });
      if (!("ativo" in corpo) || (corpo.ativo !== null && typeof corpo.ativo !== "boolean")) {
        return res.status(400).json({ message: "Diga se a pessoa tem late check-out." });
      }
      const valor = lerCentavos(corpo, "valorCentavos", LIMITE_DA_DIARIA_CENTAVOS, "Late check-out");
      if ("erro" in valor) return res.status(400).json({ message: valor.erro });
      if (!await assertEventEditable(eventId, ator, res)) return;

      const [noQuarto] = await db.select({ id: hotelRoomGroupMembersTable.id }).from(hotelRoomGroupMembersTable)
        .innerJoin(hotelRoomGroupsTable, eq(hotelRoomGroupsTable.id, hotelRoomGroupMembersTable.hotelRoomGroupId))
        .where(and(eq(hotelRoomGroupsTable.eventId, eventId), eq(hotelRoomGroupMembersTable.collaboratorId, collaboratorId)))
        .limit(1);
      if (!noQuarto) return res.status(400).json({ message: "Esta pessoa não está em nenhum quarto deste evento." });

      const onde = and(eq(hotelLateCheckoutsTable.eventId, eventId), eq(hotelLateCheckoutsTable.collaboratorId, collaboratorId));
      const [anterior] = await db.select().from(hotelLateCheckoutsTable).where(onde);
      let linha: unknown = null;
      if (corpo.ativo === null) {
        await db.delete(hotelLateCheckoutsTable).where(onde);
      } else {
        const agora = new Date();
        const dados = { ativo: corpo.ativo as boolean, valorCentavos: corpo.ativo ? valor.valor ?? null : null, updatedAt: agora, updatedBy: ator.id };
        [linha] = await db.insert(hotelLateCheckoutsTable)
          .values({ eventId, collaboratorId, ...dados })
          .onConflictDoUpdate({ target: [hotelLateCheckoutsTable.eventId, hotelLateCheckoutsTable.collaboratorId], set: dados })
          .returning();
      }
      await createAuditLog("update", "hotel_valores", eventId, {
        eventId, acao: "late check-out", collaboratorId, ativo: corpo.ativo, valorCentavos: valor.valor ?? null,
      }, ator.id, ator.name, anterior, req);
      res.json(linha ?? { eventId, collaboratorId, ativo: null });
    } catch (error) {
      console.error("erro ao salvar o late check-out:", error);
      res.status(500).json({ message: "Não foi possível salvar o late check-out." });
    }
  });

  /** Hotel do evento lido do banco — para quarto novo nascer nele (Mover para quarto novo). */
  const hotelDoEventoNoBanco = async (eventId: string) =>
    hotelDoEvento(await db.select({ hotelName: hotelRoomGroupsTable.hotelName }).from(hotelRoomGroupsTable).where(eq(hotelRoomGroupsTable.eventId, eventId)));

  const grupoDeQuarto = async (id: string) => (await db.select().from(hotelRoomGroupsTable).where(eq(hotelRoomGroupsTable.id, id)))[0];
  const grupoDeUber = async (id: string) => (await db.select().from(uberGroupsTable).where(eq(uberGroupsTable.id, id)))[0];

  /**
   * O horário do carro foi decidido por alguém? (mover pessoa, 09/10)
   *  1. MARCA explícita: `manualTime` preenchido — é o que o PATCH grava quando
   *     a tela ajusta o horário à mão (e o que o "Refazer sugestões" respeita).
   *  2. Sem marca: `time` diferente do horário CALCULADO antes da mudança. O
   *     PATCH também aceita `time` direto (API, carros antigos sem
   *     `suggestedTime`), e aí a única pista de decisão humana é o horário não
   *     bater com a conta. O calculado é o `suggestedTime` gravado pelo
   *     recálculo; sem ele, a conta refeita com os passageiros de antes.
   * Na dúvida, não sobrescreve: perder um ajuste humano é pior do que deixar
   * um horário para conferir.
   */
  const horarioFoiDecididoAMao = (g: { time: string | null; suggestedTime: string | null; manualTime: string | null }, calculadoAntes: string | null) => {
    if (g.manualTime && g.manualTime.trim()) return true;
    if (!g.time) return false;
    return g.time !== (g.suggestedTime ?? calculadoAntes);
  };

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
      // 23/10, dono: "quando confirmar, deve preencher lá na aba de Hospedagem
      // com os dados" — hotel, datas, tipo, valor e com quem divide.
      const hospedagens = await preencherSemDerrubar(grupo.eventId, ator, req, { quartos: [g.id] });
      res.json({ ...g, hospedagens });
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

      // Quarto sem hotel nasce no hotel do evento (15/10); com hotel, os
      // separados ficam no mesmo hotel de onde saíram.
      const hotelDosNovos = grupo.hotelName || await hotelDoEventoNoBanco(grupo.eventId);
      const restante = await db.transaction(async (tx) => {
        // O primeiro fica; cada um dos outros ganha o seu.
        for (const m of membros.slice(1)) {
          const [novo] = await tx.insert(hotelRoomGroupsTable).values({
            eventId: grupo.eventId,
            hotelName: hotelDosNovos,
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
   *
   * Lotação (09/10): no máximo 3 por quarto, e 3 só com todos de cenotécnica
   * (ou a chave global de triplo ligada). O tipo dos dois quartos passa a
   * seguir quantas pessoas ficam em cada um (1 single, 2 duplo, 3 triplo) —
   * antes o rótulo continuava o antigo.
   *
   * Hotel do evento (22/10): o DESTINO não pode virar um tipo que o hotel não
   * tem (sem duplo, ninguém junta dois; sem triplo, três) — 400 com o motivo.
   * A ORIGEM pode ficar num tipo que o hotel não tem (tirar um de um triplo
   * num hotel sem duplo): é o passo do meio de uma troca, e a aba marca o
   * quarto até ele ser completado ou separado.
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

      let ocupantesNoDestino = 1;
      const membrosDestino = paraGrupoId
        ? await db.select().from(hotelRoomGroupMembersTable).where(eq(hotelRoomGroupMembersTable.hotelRoomGroupId, String(paraGrupoId)))
        : [];
      // Quem só tem vaga cancelada/excluída ainda pode estar gravado no quarto,
      // mas a tela já não o mostra (23/10): o tipo dos quartos conta só quem
      // tem vaga ativa — senão um duplo "de um" virava triplo.
      const ativos = await colaboradoresComVagaAtiva(origem.eventId, Array.from(new Set([...membrosOrigem, ...membrosDestino].map((m) => m.collaboratorId))));
      const ativosNaOrigem = membrosOrigem.filter((m) => m.collaboratorId !== collaboratorId && ativos.has(m.collaboratorId)).length;
      if (paraGrupoId) {
        const juntos = Array.from(new Set([...membrosDestino.map((m) => m.collaboratorId), String(collaboratorId)]));
        const motivo = await motivoDeLotacaoDoQuarto(origem.eventId, juntos);
        if (motivo) return res.status(400).json({ message: motivo });
        ocupantesNoDestino = juntos.filter((c) => c === String(collaboratorId) || ativos.has(c)).length;
      }

      // Quarto novo nasce no hotel do evento (15/10: "todos ficam no mesmo
      // hotel por evento"); sem hotel do evento, o do quarto de origem.
      const hotelDoNovo = paraGrupoId ? null : (await hotelDoEventoNoBanco(origem.eventId)) || origem.hotelName;
      const destinoId = await db.transaction(async (tx) => {
        let destinoId: string = paraGrupoId ?? "";
        if (!destinoId) {
          const [novo] = await tx.insert(hotelRoomGroupsTable).values({
            eventId: origem.eventId,
            hotelName: hotelDoNovo,
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
            .set({ roomType: tipoPorOcupantes(Math.max(1, ativosNaOrigem)), notes: null, confirmed: false, updatedAt: new Date() })
            .where(eq(hotelRoomGroupsTable.id, deGrupoId));
        }
        await tx.update(hotelRoomGroupsTable)
          .set({ roomType: tipoPorOcupantes(ocupantesNoDestino), notes: null, confirmed: false, updatedAt: new Date() })
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

  /**
   * Mesma ideia para os carros do Uber.
   *
   * Horário (09/10): o carro de origem e o de destino são recalculados pela
   * mesma regra do "Refazer sugestões" (`horarioDoCarro`: antecedência antes
   * do voo mais cedo da direção do carro), com os passageiros de DEPOIS da
   * mudança. NÃO recalcula carro que estava confirmado nem carro com horário
   * decidido por alguém — ver `horarioFoiDecididoAMao`.
   */
  app.post("/api/uber-groups/mover", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const { collaboratorId, deGrupoId, paraGrupoId } = req.body ?? {};
      if (!collaboratorId || !deGrupoId) return res.status(400).json({ message: "Informe a pessoa e o carro de origem." });

      const origem = await grupoDeUber(String(deGrupoId));
      if (!origem) return res.status(404).json({ message: "Carro de origem não encontrado." });
      if (!await assertEventEditable(origem.eventId, ator, res)) return;
      const destino = paraGrupoId ? await grupoDeUber(String(paraGrupoId)) : null;
      if (paraGrupoId) {
        if (!destino) return res.status(404).json({ message: "Carro de destino não encontrado." });
        if (destino.eventId !== origem.eventId) return res.status(400).json({ message: "O carro de destino é de outro evento." });
      }

      const membrosOrigem = await db.select().from(uberGroupMembersTable)
        .where(eq(uberGroupMembersTable.uberGroupId, deGrupoId));
      const membro = membrosOrigem.find((m) => m.collaboratorId === collaboratorId);
      if (!membro) return res.status(404).json({ message: "Esta pessoa não está neste carro." });
      const membrosDestino = destino
        ? (await db.select().from(uberGroupMembersTable).where(eq(uberGroupMembersTable.uberGroupId, destino.id))).map((m) => m.collaboratorId)
        : [];

      // Horário calculado ANTES (para reconhecer ajuste à mão sem marca) e
      // DEPOIS da mudança (o que o carro passa a ter), numa leitura só.
      const idsOrigem = membrosOrigem.map((m) => m.collaboratorId);
      const carroNovo = { direction: origem.direction, date: origem.date };
      const calculado = await horariosCalculadosDosCarros(origem.eventId, [
        { chave: "origemAntes", ...carroNovo, membros: idsOrigem },
        { chave: "origemDepois", ...carroNovo, membros: idsOrigem.filter((c) => c !== collaboratorId) },
        ...(destino
          ? [
            { chave: "destinoAntes", direction: destino.direction, date: destino.date, membros: membrosDestino },
            { chave: "destinoDepois", direction: destino.direction, date: destino.date, membros: [...membrosDestino, String(collaboratorId)] },
          ]
          : [{ chave: "novo", ...carroNovo, membros: [String(collaboratorId)] }]),
      ]);
      const recalculaOrigem = membrosOrigem.length > 1 && !origem.confirmed && !horarioFoiDecididoAMao(origem, calculado.get("origemAntes") ?? null);
      const recalculaDestino = !!destino && !destino.confirmed && !horarioFoiDecididoAMao(destino, calculado.get("destinoAntes") ?? null);
      const horarioNovo = (chave: string) => {
        const h = calculado.get(chave) ?? null;
        return { time: h, suggestedTime: h };
      };

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
            // Carro novo: ninguém decidiu o horário dele — vale o calculado
            // pelo voo de quem entra (antes copiava o horário do carro de origem).
            ...horarioNovo("novo"),
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
            .set({ ...limpaTitular, ...(recalculaOrigem ? horarioNovo("origemDepois") : {}), confirmed: false, updatedAt: new Date() })
            .where(eq(uberGroupsTable.id, deGrupoId));
        }
        if (destino) {
          await tx.update(uberGroupsTable)
            .set({ ...(recalculaDestino ? horarioNovo("destinoDepois") : {}), confirmed: false, updatedAt: new Date() })
            .where(eq(uberGroupsTable.id, destinoId));
        }
        return destinoId;
      });
      // O que NÃO foi recalculado, para a tela dizer (carro confirmado ou com
      // horário decidido à mão fica como estava).
      const horarioMantido = [
        ...(membrosOrigem.length > 1 && !recalculaOrigem ? ["origem"] : []),
        ...(destino && !recalculaDestino ? ["destino"] : []),
      ];
      await createAuditLog("update", "uber_group", destinoId, { acao: "mover", collaboratorId, deGrupoId, paraGrupoId: destinoId, eventId: origem.eventId, horarioMantido }, ator.id, ator.name, undefined, req);
      res.json({ ok: true, destinoId, horarioMantido });
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
      // Quarto CONFIRMADO (23/10): confirmar por aqui, ou trocar o hotel/as
      // datas dele, preenche de novo a hospedagem de quem está nele. Reabrir
      // (confirmed: false) não apaga nada — a aba avisa para conferir.
      const mexeNaHospedagem = g.confirmed && ("confirmed" in allowed || "hotelName" in allowed || "checkInDate" in allowed || "checkOutDate" in allowed);
      const hospedagens = mexeNaHospedagem ? await preencherSemDerrubar(anterior.eventId, ator, req, { quartos: [g.id] }) : undefined;
      res.json(hospedagens === undefined ? g : { ...g, hospedagens });
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
      // Horas em "HH:MM" (25/09): o cálculo do carro e o CHECK do banco exigem.
      for (const k of ["time", "manualTime"] as const) {
        const v = allowed[k];
        if (v !== undefined && v !== null && !isValidHhmm(String(v))) {
          return res.status(400).json({ message: "Horário inválido (use HH:MM entre 00:00 e 23:59)" });
        }
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
      // Quarto confirmado: a estadia própria vira as datas da hospedagem (23/10).
      if (grupo?.confirmed && ("checkInDate" in allowed || "checkOutDate" in allowed)) {
        await preencherSemDerrubar(grupo.eventId, ator, req, { quartos: [grupo.id] });
      }
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
