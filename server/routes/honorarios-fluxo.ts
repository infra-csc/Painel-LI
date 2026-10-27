/**
 * Módulo de Honorários, Fase 0 (26/10) — as rotas novas do fluxo:
 *
 *  - Pré-aprovação do DP no Planejado (ata de 22/10: "nenhum registro é
 *    liberado para a Produção sem a pré-aprovação do DP"):
 *      POST /api/budget-planned/pre-aprovar            (uma linha ou o lote)
 *      POST /api/budget-planned/desfazer-pre-aprovacao
 *    O envio ao Realizado (POST /api/budget-actual) passa a exigir a linha
 *    pré-aprovada — ver server/routes/orcamento-realizado.ts.
 *  - "Não exibir valores" ao colaborador, por evento (padrão ligado, até a OC):
 *      PATCH /api/events/:id/ocultar-valores
 *  - Data de corte do legado (system_settings.honorarios_data_corte):
 *      GET/PUT /api/honorarios/data-de-corte   (escrita só do administrador)
 *  - Legado concluído fora do fluxo, no Painel de honorários:
 *      POST /api/rh/controle/legado/concluir
 *
 * Papéis: o DP é o papel `financial` (rótulo "Financeiro / DP") e o
 * administrador — `requireFinanceUser`, a mesma guarda do resto do módulo.
 * Tudo vai para o log de auditoria.
 */
import type { Express } from "express";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  budgetActual as budgetActualTable,
  budgetPlanned as budgetPlannedTable,
  events as eventsTable,
  honorariosLegadoConcluidos,
  teamInclusions as teamInclusionsTable,
  type BudgetPlanned,
  type User,
} from "@shared/schema";
import { isFinanceRole, normalizeRole } from "@shared/roles";
// A trava de evento encerrado (20/08) é da escala/logística; o DP trabalha os
// honorários DEPOIS do evento (28/10) — pré-aprovar e desfazer seguem abertos a ele.
const travadoParaHonorarios = (ev: Parameters<typeof isEventBlockedForActor>[0], user: { role?: string | null }) =>
  !isFinanceRole(user.role) && isEventBlockedForActor(ev, user);
import { isEventBlockedForActor } from "../event-guard";
import { HttpError } from "../http";
import { STATUS_PENDENTE, STATUS_PRE_APROVADO, estaPreAprovado } from "@shared/pre-aprovacao";
import { linhaDaVagaSemColaborador } from "@shared/casamento-do-planejado";
import {
  CHAVE_DATA_DE_CORTE, DATA_DE_CORTE_PADRAO, LIMITE_DO_LOTE_DO_LEGADO, MOTIVO_MAXIMO, MOTIVO_MINIMO,
  dataDeCorteValida, ehEventoLegado, lerDataDeCorte,
} from "@shared/legado-honorarios";
import {
  createAuditLog, createAuditLogsBatch, montarLogDeAuditoria, requireFinanceUser, responderErroComStatus,
} from "./_compartilhado";

/** Data de corte gravada (ou a padrão, 01/11/2026). */
export async function lerDataDeCorteDoBanco(): Promise<string> {
  const settings = await storage.getSystemSettings();
  return lerDataDeCorte(settings.find((s) => s.key === CHAVE_DATA_DE_CORTE)?.value);
}

const centavos = z.number().int().min(0).max(1_000_000_000);
/** Uma linha a pré-aprovar: os MESMOS campos que o "Enviar ao Realizado" grava no Planejado. */
const linhaParaPreAprovar = z.object({
  // Nulo: vaga sem colaborador (empreita por empresa, "a definir") — o envio ao Realizado já aceitava.
  collaboratorId: z.string().min(1).max(100).nullable(),
  functionId: z.string().min(1).max(100),
  collaboratorType: z.string().max(40).nullish(),
  dailyQuantity: z.number().int().min(0).max(10_000),
  dailyValue: centavos,
  costAssistance: centavos.default(0),
  weekdayLunch: centavos,
  weekdayDinner: centavos,
  weekendLunch: centavos,
  weekendDinner: centavos,
  mobility: centavos,
  mobilityIda: centavos.nullish(),
  mobilityVolta: centavos.nullish(),
  transport: centavos.default(0),
  totalValue: centavos,
  // 27/10: a vaga da linha (gravada em budget_planned.team_inclusion_id) e a
  // linha que a tela mostra para ela — casam as vagas sem colaborador da mesma
  // função (shared/casamento-do-planejado.ts).
  teamInclusionId: z.string().min(1).max(100).nullish(),
  plannedId: z.string().min(1).max(100).nullish(),
  // 28/10: dias com 1,5 diária (o ½ já está na diária média e no total).
  diasMeiaExtra: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400).nullish(),
});
const corpoDaPreAprovacao = z.object({
  eventId: z.string().min(1).max(100),
  linhas: z.array(linhaParaPreAprovar).min(1).max(2000),
});
const corpoDoDesfazer = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(2000) });

type Ignorada = { collaboratorId: string | null; functionId: string | null; motivo: string };

const chave = (r: { collaboratorId: string | null; functionId: string | null }) => `${r.collaboratorId}|${r.functionId}`;

function nomeDe(user: User): string {
  return user.name || user.email || "Sistema";
}

export function registrarHonorariosFluxo(app: Express): void {
  // ── Pré-aprovação do DP ───────────────────────────────────────────────────
  /**
   * POST /api/budget-planned/pre-aprovar — grava a linha do Planejado com os
   * valores de agora e marca "pré-aprovado pelo DP" (quem e quando). Uma
   * linha ou o evento inteiro, numa transação. Não mexe no que já foi para o
   * Realizado nem em quem não participou (volta em `ignoradas`, com o motivo).
   */
  app.post("/api/budget-planned/pre-aprovar", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDaPreAprovacao.safeParse(req.body ?? {});
    if (!corpo.success) {
      return res.status(400).json({ message: "Dados inválidos: envie o evento e as linhas com os valores em centavos." });
    }
    const { eventId, linhas } = corpo.data;
    try {
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Evento não encontrado" });
      if (travadoParaHonorarios(event, user)) {
        return res.status(403).json({ message: "Evento encerrado — só o administrador pré-aprova valores." });
      }
      const chaves = new Set<string>();
      for (const l of linhas) {
        if (!l.collaboratorId) continue; // várias vagas sem colaborador na mesma função são legítimas
        const k = chave(l);
        if (chaves.has(k)) return res.status(400).json({ message: "O mesmo colaborador e função vieram mais de uma vez." });
        chaves.add(k);
      }
      // A vaga de cada linha (27/10): uma vez só no pedido, e do MESMO evento.
      const vagasDoPedido = linhas.map((l) => l.teamInclusionId).filter((v): v is string => !!v);
      if (new Set(vagasDoPedido).size !== vagasDoPedido.length) return res.status(400).json({ message: "A mesma vaga veio mais de uma vez." });
      if (vagasDoPedido.length > 0) {
        const doEvento = await db.select({ id: teamInclusionsTable.id }).from(teamInclusionsTable)
          .where(and(inArray(teamInclusionsTable.id, vagasDoPedido), eq(teamInclusionsTable.eventId, eventId)));
        if (doEvento.length !== vagasDoPedido.length) return res.status(400).json({ message: "Alguma vaga não é deste evento." });
      }

      const agora = new Date();
      const resultado = await db.transaction(async (tx) => {
        const [existentes, realizados] = await Promise.all([
          tx.select().from(budgetPlannedTable).where(eq(budgetPlannedTable.eventId, eventId)),
          tx.select({ plannedId: budgetActualTable.plannedId, collaboratorId: budgetActualTable.collaboratorId, functionId: budgetActualTable.functionId })
            .from(budgetActualTable).where(eq(budgetActualTable.eventId, eventId)),
        ]);
        const planejadoPorChave = new Map<string, BudgetPlanned>();
        for (const p of existentes) if (p.collaboratorId && !planejadoPorChave.has(chave(p))) planejadoPorChave.set(chave(p), p);
        // Sem colaborador (empreita por empresa, "a definir") não há chave única (27/10): a
        // linha da MESMA vaga (team_inclusion_id); sem ela, adota uma antiga da função — a
        // que a tela mostra, senão a primeira por created_at, id. Nunca a de outra vaga.
        const usadas = new Set<string>();
        const enviados = new Set(realizados.map((a) => chave(a)));
        const enviadosPorPlanejado = new Set(realizados.map((a) => a.plannedId).filter((v): v is string => !!v));

        const gravadas: { antes: BudgetPlanned | null; depois: BudgetPlanned }[] = [];
        const ignoradas: Ignorada[] = [];
        for (const l of linhas) {
          const k = chave(l);
          if (l.collaboratorId && enviados.has(k)) { ignoradas.push({ collaboratorId: l.collaboratorId, functionId: l.functionId, motivo: "já está no Realizado" }); continue; }
          const antes = l.collaboratorId
            ? planejadoPorChave.get(k) ?? null
            : linhaDaVagaSemColaborador({ teamInclusionId: l.teamInclusionId, functionId: l.functionId, sugestaoId: l.plannedId }, existentes, usadas);
          if (antes) usadas.add(antes.id);
          if (antes && enviadosPorPlanejado.has(antes.id)) { ignoradas.push({ collaboratorId: l.collaboratorId, functionId: l.functionId, motivo: "já está no Realizado" }); continue; }
          if (antes?.didNotAttend) { ignoradas.push({ collaboratorId: l.collaboratorId, functionId: l.functionId, motivo: "marcado como não participou" }); continue; }
          const valores = {
            collaboratorType: l.collaboratorType ?? antes?.collaboratorType ?? "freela",
            dailyQuantity: l.dailyQuantity, dailyValue: l.dailyValue, costAssistance: l.costAssistance,
            weekdayLunch: l.weekdayLunch, weekdayDinner: l.weekdayDinner, weekendLunch: l.weekendLunch, weekendDinner: l.weekendDinner,
            mobility: l.mobility, mobilityIda: l.mobilityIda ?? null, mobilityVolta: l.mobilityVolta ?? null,
            transport: l.transport, totalValue: l.totalValue,
            diasMeiaExtra: l.diasMeiaExtra?.length ? Array.from(new Set(l.diasMeiaExtra)).sort() : null,
            status: STATUS_PRE_APROVADO, approvedBy: user.id, approvedAt: agora,
            // Grava a vaga na linha (inclusive na antiga adotada): o casamento deixa de depender da ordem.
            ...(l.teamInclusionId ? { teamInclusionId: l.teamInclusionId } : {}),
          };
          if (antes) {
            const [depois] = await tx.update(budgetPlannedTable)
              .set({ ...valores, updatedAt: agora, updatedBy: user.id })
              .where(eq(budgetPlannedTable.id, antes.id)).returning();
            gravadas.push({ antes, depois });
          } else {
            const [depois] = await tx.insert(budgetPlannedTable)
              .values({ ...valores, eventId, collaboratorId: l.collaboratorId, functionId: l.functionId, createdBy: user.id, updatedBy: user.id })
              .returning();
            gravadas.push({ antes: null, depois });
          }
        }
        return { gravadas, ignoradas };
      });

      // Auditoria depois do COMMIT: uma linha por registro (quem, quando, valor).
      await createAuditLogsBatch(resultado.gravadas.map(({ antes, depois }) => montarLogDeAuditoria(
        antes ? "update" : "create", "budget_planned", depois.id,
        { ...depois, acao: "pré-aprovação do DP", lote: linhas.length > 1 },
        user.id, nomeDe(user), antes ?? undefined, req,
      )));
      res.json({
        preAprovadas: resultado.gravadas.length,
        total: resultado.gravadas.reduce((s, g) => s + (g.depois.totalValue || 0), 0),
        linhas: resultado.gravadas.map((g) => g.depois),
        ignoradas: resultado.ignoradas,
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao pré-aprovar os valores", 500);
    }
  });

  /**
   * POST /api/budget-planned/desfazer-pre-aprovacao — a linha volta a
   * "pendente de pré-aprovação". Só antes do envio ao Realizado: depois dele
   * a prestação já está com a Produção (volta em `ignoradas`).
   */
  app.post("/api/budget-planned/desfazer-pre-aprovacao", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoDesfazer.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Informe as linhas (ids do Planejado) para desfazer." });
    try {
      const ids = Array.from(new Set(corpo.data.ids));
      const resultado = await db.transaction(async (tx) => {
        const linhas = await tx.select().from(budgetPlannedTable).where(inArray(budgetPlannedTable.id, ids));
        if (linhas.length === 0) throw new HttpError(404, "Nenhuma das linhas foi encontrada.");
        const eventIds = Array.from(new Set(linhas.map((l) => l.eventId)));
        const eventos = await tx.select().from(eventsTable).where(inArray(eventsTable.id, eventIds));
        for (const ev of eventos) {
          if (travadoParaHonorarios(ev, user)) throw new HttpError(403, "Evento encerrado — só o administrador desfaz a pré-aprovação.");
        }
        const realizados = await tx.select({ plannedId: budgetActualTable.plannedId, eventId: budgetActualTable.eventId, collaboratorId: budgetActualTable.collaboratorId, functionId: budgetActualTable.functionId })
          .from(budgetActualTable).where(inArray(budgetActualTable.eventId, eventIds));
        const enviadosPorPlanejado = new Set(realizados.map((a) => a.plannedId).filter(Boolean));
        const enviadosPorChave = new Set(realizados.map((a) => `${a.eventId}|${chave(a)}`));

        const desfeitas: { antes: BudgetPlanned; depois: BudgetPlanned }[] = [];
        const ignoradas: Ignorada[] = [];
        const agora = new Date();
        for (const antes of linhas) {
          if (enviadosPorPlanejado.has(antes.id) || enviadosPorChave.has(`${antes.eventId}|${chave(antes)}`)) {
            ignoradas.push({ collaboratorId: antes.collaboratorId, functionId: antes.functionId, motivo: "já está no Realizado" });
            continue;
          }
          if (!estaPreAprovado(antes.status)) {
            ignoradas.push({ collaboratorId: antes.collaboratorId, functionId: antes.functionId, motivo: "não estava pré-aprovada" });
            continue;
          }
          const [depois] = await tx.update(budgetPlannedTable)
            .set({ status: STATUS_PENDENTE, approvedBy: null, approvedAt: null, updatedAt: agora, updatedBy: user.id })
            .where(eq(budgetPlannedTable.id, antes.id)).returning();
          desfeitas.push({ antes, depois });
        }
        return { desfeitas, ignoradas };
      });
      await createAuditLogsBatch(resultado.desfeitas.map(({ antes, depois }) => montarLogDeAuditoria(
        "update", "budget_planned", depois.id, { ...depois, acao: "pré-aprovação do DP desfeita" }, user.id, nomeDe(user), antes, req,
      )));
      res.json({ desfeitas: resultado.desfeitas.length, linhas: resultado.desfeitas.map((d) => d.depois), ignoradas: resultado.ignoradas });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao desfazer a pré-aprovação", 500);
    }
  });

  // ── "Não exibir valores" por evento ───────────────────────────────────────
  app.patch("/api/events/:id/ocultar-valores", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = z.object({ ocultar: z.boolean() }).safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: "Informe { ocultar: true | false }." });
    try {
      const [antes] = await db.select().from(eventsTable).where(eq(eventsTable.id, req.params.id));
      if (!antes) return res.status(404).json({ message: "Evento não encontrado" });
      if (antes.ocultarValoresColaborador === corpo.data.ocultar) return res.json(antes);
      const [depois] = await db.update(eventsTable)
        .set({ ocultarValoresColaborador: corpo.data.ocultar })
        .where(eq(eventsTable.id, antes.id)).returning();
      await createAuditLog("update", "event", antes.id, {
        acao: corpo.data.ocultar ? "não exibir valores ao colaborador (até a OC)" : "exibir valores ao colaborador",
        ocultarValoresColaborador: corpo.data.ocultar,
      }, user.id, nomeDe(user), { ocultarValoresColaborador: antes.ocultarValoresColaborador }, req);
      res.json(depois);
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao salvar a opção de exibir valores", 500);
    }
  });

  // ── Data de corte do legado ───────────────────────────────────────────────
  app.get("/api/honorarios/data-de-corte", async (req, res) => {
    // Qualquer tela do Financeiro precisa saber o que é legado (filtros) —
    // mesma guarda das leituras do módulo.
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    try {
      res.set("Cache-Control", "no-store");
      res.json({ dataDeCorte: await lerDataDeCorteDoBanco(), padrao: DATA_DE_CORTE_PADRAO, podeEditar: normalizeRole(user.role) === "admin" });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao ler a data de corte", 500);
    }
  });

  app.put("/api/honorarios/data-de-corte", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    if (normalizeRole(user.role) !== "admin") {
      return res.status(403).json({ message: "Só o administrador muda a data de corte do legado." });
    }
    const dataDeCorte = (req.body ?? {}).dataDeCorte;
    if (!dataDeCorteValida(dataDeCorte)) {
      return res.status(400).json({ message: "Data de corte inválida — use uma data real no formato AAAA-MM-DD." });
    }
    try {
      const antes = await lerDataDeCorteDoBanco();
      await storage.upsertSystemSetting(CHAVE_DATA_DE_CORTE, dataDeCorte, user.id);
      await createAuditLog("update", "system_settings", CHAVE_DATA_DE_CORTE, { [CHAVE_DATA_DE_CORTE]: dataDeCorte }, user.id, nomeDe(user), { [CHAVE_DATA_DE_CORTE]: antes }, req);
      res.json({ dataDeCorte, padrao: DATA_DE_CORTE_PADRAO, podeEditar: true });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao salvar a data de corte", 500);
    }
  });

  // ── Legado: concluir em lote, fora do fluxo ───────────────────────────────
  /**
   * POST /api/rh/controle/legado/concluir { ids, motivo } — `ids` são os ids
   * das linhas do Painel (`pl-<planejado>` ou `ti-<vaga>`). Só entram linhas
   * de evento legado (fim antes da data de corte); o resto volta em
   * `recusadas`. Nada é apagado nem alterado na prestação/nota/planejado.
   */
  app.post("/api/rh/controle/legado/concluir", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = z.object({
      ids: z.array(z.string().regex(/^(pl|ti)-[^\s]{1,100}$/)).min(1).max(LIMITE_DO_LOTE_DO_LEGADO),
      motivo: z.string().trim().min(MOTIVO_MINIMO).max(MOTIVO_MAXIMO),
    }).safeParse(req.body ?? {});
    if (!corpo.success) {
      return res.status(400).json({ message: `Escolha as linhas e escreva o motivo (de ${MOTIVO_MINIMO} a ${MOTIVO_MAXIMO} caracteres).` });
    }
    try {
      const ids = Array.from(new Set(corpo.data.ids));
      const idsPlanejado = ids.filter((i) => i.startsWith("pl-")).map((i) => i.slice(3));
      const idsVaga = ids.filter((i) => i.startsWith("ti-")).map((i) => i.slice(3));
      const [planejados, vagas] = await Promise.all([
        idsPlanejado.length ? db.select({ id: budgetPlannedTable.id, eventId: budgetPlannedTable.eventId }).from(budgetPlannedTable).where(inArray(budgetPlannedTable.id, idsPlanejado)) : Promise.resolve([]),
        idsVaga.length ? db.select({ id: teamInclusionsTable.id, eventId: teamInclusionsTable.eventId }).from(teamInclusionsTable).where(inArray(teamInclusionsTable.id, idsVaga)) : Promise.resolve([]),
      ]);
      const eventoDaLinha = new Map<string, string>([
        ...planejados.map((p) => [`pl-${p.id}`, p.eventId] as const),
        ...vagas.map((v) => [`ti-${v.id}`, v.eventId] as const),
      ]);
      const eventIds = Array.from(new Set(eventoDaLinha.values()));
      const eventos = eventIds.length ? await db.select({ id: eventsTable.id, endDate: eventsTable.endDate }).from(eventsTable).where(inArray(eventsTable.id, eventIds)) : [];
      const dataDeCorte = await lerDataDeCorteDoBanco();
      const legado = new Set(eventos.filter((e) => ehEventoLegado(e.endDate, dataDeCorte)).map((e) => e.id));

      const aceitas: { linhaId: string; eventId: string }[] = [];
      const recusadas: { id: string; motivo: string }[] = [];
      for (const id of ids) {
        const ev = eventoDaLinha.get(id);
        if (!ev) recusadas.push({ id, motivo: "linha não encontrada" });
        else if (!legado.has(ev)) recusadas.push({ id, motivo: "o evento não é legado" });
        else aceitas.push({ linhaId: id, eventId: ev });
      }
      const nome = nomeDe(user);
      const gravadas = aceitas.length === 0 ? [] : await db.insert(honorariosLegadoConcluidos)
        .values(aceitas.map((a) => ({ ...a, motivo: corpo.data.motivo, porId: user.id, porNome: nome })))
        .onConflictDoNothing({ target: honorariosLegadoConcluidos.linhaId })
        .returning({ linhaId: honorariosLegadoConcluidos.linhaId });
      if (gravadas.length > 0) {
        await createAuditLog("create", "honorarios_legado", "lote", {
          acao: "legado concluído fora do fluxo", motivo: corpo.data.motivo, quantidade: gravadas.length,
          dataDeCorte, linhas: gravadas.map((g) => g.linhaId),
        }, user.id, nome, undefined, req);
      }
      res.json({ concluidas: gravadas.length, jaConcluidas: aceitas.length - gravadas.length, recusadas });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao concluir o legado", 500);
    }
  });
}

/** Conclusões do legado gravadas (todas ou de um evento), pelo id da linha. */
export async function conclusoesDoLegado(eventId?: string): Promise<Map<string, { motivo: string; porNome: string | null; em: string | null }>> {
  const rows = await db.select().from(honorariosLegadoConcluidos)
    .where(eventId ? eq(honorariosLegadoConcluidos.eventId, eventId) : undefined);
  return new Map(rows.map((r) => [r.linhaId, { motivo: r.motivo, porNome: r.porNome, em: r.em ? new Date(r.em).toISOString() : null }]));
}

