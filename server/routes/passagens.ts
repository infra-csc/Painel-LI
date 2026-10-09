/**
 * Passagens (tickets): listagem, registro, carimbo de emissão em lote e edição.
 * Papéis: logística (admin/Compras/Produção) registra e edita; só admin e
 * Compras carimbam a emissão. O status da vaga é derivado após cada escrita.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db, linhasDe } from "../db";
import { tickets as ticketsTable, insertTicketSchema } from "@shared/schema";
import { and, inArray, isNull, sql as drizzleSql } from "drizzle-orm";
import { analisarPassagens, diaISO, somarDias, type PassagemParaAnalise } from "@shared/analise-de-passagens";
import { hojeISO } from "@shared/hoje-sp";
import {
  errosDeDataDaPassagem,
  mensagemDeViagemCruzada,
  passagemTemIda,
  passagemTemVolta,
  marcoEmTexto,
  cidadeDoEvento,
  janelaDaVaga,
  type PassagemDaJanela,
} from "@shared/janela-de-viagem";
import { ocupaAgenda } from "@shared/conflito-de-agenda";
import { assertInclusionEventEditable, newEventCache } from "../event-guard";
import { carregarVagasDeViagem, conflitosDaVagaComPassagem, juntarPassagens, sinaisDeViagem } from "../viagens";
import {
  montarLogDeAuditoria,
  createAuditLog,
  createAuditLogsBatch,
  responderErroComStatus,
  requireRoles,
  LOGISTICA_ROLES,
  eventIdDaQuery,
  recalcularStatusDeLogistica,
} from "./_compartilhado";

/** Campos que mudam a janela da viagem: editar só os outros não reconfere nada (09/10). */
const CAMPOS_DA_VIAGEM = [
  "actualDepartureDate", "actualDepartureTime", "actualArrivalTime",
  "actualReturnDate", "actualReturnTime", "returnArrivalTime", "idaVemDeInclusionId",
] as const;
/** Campos de data conferidos por `errosDeDataDaPassagem`. */
const CAMPOS_DE_DATA = [...CAMPOS_DA_VIAGEM, "purchaseDate"] as const;

const mesmoValor = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? "");

interface ConferenciaDaPassagem {
  /** Resposta de recusa (400/409) — nada é gravado. */
  recusa?: { status: number; body: Record<string, unknown> };
  /** A vaga de onde sai o trecho direto ainda tem volta própria registrada: Compras cancela/edita. */
  voltaParaCancelar?: { inclusionId: string; numero: number; eventName: string; quando: string };
}

/**
 * Regras da passagem que o servidor garante (09/10), antes de gravar:
 *  1. datas plausíveis (volta ≥ ida; anos de 2024 a hoje+2);
 *  2. trecho direto: a vaga indicada é do MESMO colaborador, de OUTRO evento,
 *     ativa, e esta passagem tem a perna de ida;
 *  3. a viagem não pode cruzar outra viagem do colaborador sem encadeamento —
 *     bloqueio sem "registrar mesmo assim" (decisão do dono).
 * `outrasLinhas` = as outras passagens atuais da vaga (ida e volta podem ser
 * linhas separadas): a janela considera a viagem inteira.
 */
async function conferirPassagem(
  vagaId: string,
  colaboradorId: string | null,
  proposta: PassagemDaJanela,
  outrasLinhas: readonly PassagemDaJanela[],
  /** Edição: só o que mudou é conferido (passagem antiga já errada continua editável no resto). */
  alterados?: ReadonlySet<string>,
): Promise<ConferenciaDaPassagem> {
  const mudou = (c: string) => !alterados || alterados.has(c);
  const todosOsErros = errosDeDataDaPassagem(proposta, hojeISO());
  const idaMudou = mudou("actualDepartureDate") || mudou("actualDepartureTime");
  const erros = Object.fromEntries(Object.entries(todosOsErros).filter(([campo]) =>
    mudou(campo) || (campo.startsWith("actualReturn") && idaMudou)));
  const primeiro = Object.values(erros)[0];
  if (primeiro) return { recusa: { status: 400, body: { message: primeiro, errors: erros } } };
  if (alterados && !CAMPOS_DA_VIAGEM.some((c) => alterados.has(c))) return {};

  const anteriorId = proposta.idaVemDeInclusionId ?? null;
  if (anteriorId) {
    if (anteriorId === vagaId) return { recusa: { status: 400, body: { message: "O trecho direto precisa vir de OUTRA vaga do colaborador." } } };
    if (!passagemTemIda(proposta)) {
      return { recusa: { status: 400, body: { message: "O trecho direto é a IDA desta vaga — registre como \"Só ida\" ou \"Ida e volta\", com os dados da ida." } } };
    }
  }
  if (!colaboradorId) {
    if (anteriorId) return { recusa: { status: 400, body: { message: "A vaga ainda não tem colaborador — não há de onde vir direto." } } };
    return {};
  }
  const vagas = await carregarVagasDeViagem([colaboradorId]);
  const vaga = vagas.find((v) => v.id === vagaId);
  let voltaParaCancelar: ConferenciaDaPassagem["voltaParaCancelar"];
  if (anteriorId) {
    const anterior = vagas.find((v) => v.id === anteriorId);
    if (!anterior || !ocupaAgenda(anterior) || (vaga && anterior.eventId === vaga.eventId)) {
      return { recusa: { status: 400, body: { message: "A vaga de onde sai o trecho direto não é deste colaborador, está em outro estado ou é do mesmo evento. Escolha outra na lista." } } };
    }
    if (passagemTemVolta(anterior.passagem)) {
      voltaParaCancelar = {
        inclusionId: anterior.id, numero: anterior.inclusionNumber, eventName: anterior.eventName,
        quando: marcoEmTexto(janelaDaVaga({ ...anterior, flightReturnDate: null, scheduleEndDate: null }).fim),
      };
    }
  }
  // Vaga fora da lista (cancelada, ainda em validação): não ocupa agenda, nada a cruzar.
  if (!vaga) return { voltaParaCancelar };
  const viagem = juntarPassagens([...outrasLinhas, proposta]) ?? proposta;
  const { bloqueia } = conflitosDaVagaComPassagem(vaga, { ...viagem, idaVemDeInclusionId: anteriorId }, vagas);
  if (bloqueia.length > 0) {
    const c = bloqueia[0];
    const nome = (await storage.getCollaborator(colaboradorId))?.fullName ?? null;
    return {
      recusa: {
        status: 409,
        body: {
          message: mensagemDeViagemCruzada(nome, c),
          code: "viagem_cruzada",
          conflito: {
            inclusionId: c.outra.id, numero: c.outra.inclusionNumber, eventName: c.outra.eventName,
            outraVemAntes: c.outraVemAntes, podeEncadear: c.outraVemAntes, cidade: cidadeDoEvento(c.outra.eventLocation),
          },
        },
      },
    };
  }
  return { voltaParaCancelar };
}

export function registrarPassagens(app: Express): void {
  // Tickets routes
  app.get("/api/tickets", async (req, res) => {
    try {
      const eventId = eventIdDaQuery(req);
      const tickets = await storage.getTickets(eventId);
      res.set("Cache-Control", "no-store"); // dados do passageiro
      res.json(tickets);
    } catch {
      res.status(500).json({ message: "Erro ao buscar passagens" });
    }
  });

  // GET /api/tickets/historico[?teamInclusionId= | ?eventId=] (01/10): passagens
  // de quem saiu numa troca aprovada — com o nome de quem era a passagem. Sem
  // filtro, todo o histórico (só as de troca — poucas linhas), para o card
  // "Compradas" da tela de Passagens com "Todos os eventos".
  app.get("/api/tickets/historico", async (req, res) => {
    try {
      const teamInclusionId = typeof req.query.teamInclusionId === "string" && req.query.teamInclusionId ? req.query.teamInclusionId : undefined;
      const eventId = eventIdDaQuery(req);
      const historico = await storage.getTicketHistory({ teamInclusionId, eventId });
      res.set("Cache-Control", "no-store"); // dados do passageiro
      res.json(historico);
    } catch {
      res.status(500).json({ message: "Erro ao buscar o histórico de passagens" });
    }
  });

  /**
   * GET /api/tickets/analises?de=&ate=&eventId=&companhia=&transporte= (07/10)
   *
   * Aba Análises de passagens — SÓ ADMIN (dono: "pode começar, só aparecer
   * para admin"). Lê passagens atuais E do histórico de troca (o custo de
   * quem saiu continua no evento), ligadas à vaga e ao evento, só as colunas
   * que o cálculo usa. O período é pelo INÍCIO do evento; datas saem em texto
   * (`to_char`) para não depender de fuso — produção ainda tem `timestamp`.
   * O cálculo mora em shared/analise-de-passagens.ts (testado).
   */
  app.get("/api/tickets/analises", async (req, res) => {
    const admin = await requireRoles(req, res, ["admin"]);
    if (!admin) return;
    const texto = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string).trim() : "");
    const deTxt = texto("de"), ateTxt = texto("ate");
    const de = deTxt ? diaISO(deTxt) : null;
    const ate = ateTxt ? diaISO(ateTxt) : null;
    if ((deTxt && !de) || (ateTxt && !ate)) return res.status(400).json({ message: "Período inválido: use datas no formato AAAA-MM-DD." });
    if (de && ate && de > ate) return res.status(400).json({ message: "Período inválido: a data inicial é depois da final." });
    const eventId = eventIdDaQuery(req) ?? null;
    const companhia = req.query.companhia === undefined ? null : texto("companhia");
    const transporte = req.query.transporte === undefined ? null : texto("transporte");
    try {
      const periodo = drizzleSql.join([
        drizzleSql`TRUE`,
        ...(de ? [drizzleSql`e.start_date >= ${de}::date`] : []),
        ...(ate ? [drizzleSql`e.start_date < (${ate}::date + 1)`] : []),
      ], drizzleSql` AND `);
      const [passagensRes, avisosRes] = await Promise.all([
        db.execute(drizzleSql`
          SELECT t.id AS ticket_id, t.team_inclusion_id, ti.event_id, e.name AS event_name,
            to_char(e.start_date, 'YYYY-MM-DD') AS event_start,
            CASE WHEN t.archived_at IS NULL THEN ti.collaborator_id ELSE t.archived_collaborator_id END AS pessoa_id,
            (t.archived_at IS NOT NULL) AS arquivada,
            t.value, t.baggage_total_cents,
            to_char(t.purchase_date, 'YYYY-MM-DD') AS data_compra,
            to_char(t.actual_departure_date, 'YYYY-MM-DD') AS data_ida,
            to_char(t.actual_return_date, 'YYYY-MM-DD') AS data_volta,
            t.ticket_company, t.transport_type,
            (t.ida_vem_de_inclusion_id IS NOT NULL) AS trecho_direto,
            COALESCE(NULLIF(trim(t.departure_airport), ''), t.departure_city_origin) AS origem,
            COALESCE(NULLIF(trim(t.destination_airport), ''), t.departure_city_destination) AS destino
          FROM tickets t
          JOIN team_inclusions ti ON ti.id = t.team_inclusion_id
          JOIN events e ON e.id = ti.event_id
          WHERE ti.deleted_at IS NULL
            AND ti.phase <> 'sugestao'
            AND e.status NOT IN ('excluido', 'excluído')
            AND ${periodo}
        `),
        // Remarcação = ajuste aprovado que mexeu em passagem já registrada.
        db.execute(drizzleSql`
          SELECT a.event_id, (a.resolvido_em IS NOT NULL) AS resolvido
          FROM avisos_de_alteracao a
          JOIN events e ON e.id = a.event_id
          WHERE a.afeta_passagem = TRUE AND ${periodo}
        `),
      ]);
      type Linha = {
        ticket_id: string; team_inclusion_id: string; event_id: string; event_name: string; event_start: string | null;
        pessoa_id: string | null; arquivada: boolean; value: number | null; baggage_total_cents: number | null;
        data_compra: string | null; data_ida: string | null; data_volta: string | null;
        ticket_company: string | null; transport_type: string | null; origem: string | null; destino: string | null;
        trecho_direto: boolean | string | null;
      };
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      const passagens: PassagemParaAnalise[] = linhasDe<Linha>(passagensRes).map((l) => ({
        ticketId: l.ticket_id,
        teamInclusionId: l.team_inclusion_id,
        eventId: l.event_id,
        eventName: l.event_name,
        eventStartDate: l.event_start,
        pessoaId: l.pessoa_id,
        arquivada: l.arquivada === true || String(l.arquivada) === "t",
        valor: num(l.value),
        bagagem: num(l.baggage_total_cents),
        dataCompra: l.data_compra,
        dataIda: l.data_ida,
        dataVolta: l.data_volta,
        companhia: l.ticket_company,
        transporte: l.transport_type,
        origem: l.origem,
        destino: l.destino,
        trechoDireto: l.trecho_direto === true || String(l.trecho_direto) === "t",
      }));
      const avisos = linhasDe<{ event_id: string; resolvido: boolean | string }>(avisosRes)
        .map((a) => ({ eventId: a.event_id, resolvido: a.resolvido === true || a.resolvido === "t" }));
      res.set("Cache-Control", "no-store");
      res.json(analisarPassagens(passagens, avisos, { de, ate, eventId, companhia, transporte }));
    } catch (error) {
      console.error("erro nas análises de passagens:", error);
      res.status(500).json({ message: "Erro ao calcular as análises de passagens" });
    }
  });

  /**
   * GET /api/shell/sem-passagem-30d → { count } (07/10) — SÓ ADMIN.
   *
   * Alerta do sino: vagas escaladas (com colaborador), que precisam de
   * passagem, ainda SEM passagem atual, com a ida (ou o início da escala, se a
   * ida estiver vazia) entre hoje e hoje + 30 dias — data de São Paulo. Fora:
   * excluídas, canceladas e as que ainda estão na Validação de Escala.
   */
  app.get("/api/shell/sem-passagem-30d", async (req, res) => {
    const admin = await requireRoles(req, res, ["admin"]);
    if (!admin) return;
    try {
      const hoje = hojeISO();
      const limite = somarDias(hoje, 30);
      const rows = await db.execute(drizzleSql`
        SELECT count(*)::int AS n
        FROM team_inclusions ti
        JOIN events e ON e.id = ti.event_id
        WHERE ti.deleted_at IS NULL
          AND ti.phase <> 'sugestao'
          AND ti.status <> 'cancelado'
          AND ti.collaborator_id IS NOT NULL
          AND ti.needs_ticket = TRUE
          AND e.status NOT IN ('excluido', 'excluído')
          AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.team_inclusion_id = ti.id AND t.archived_at IS NULL)
          AND COALESCE(ti.flight_departure_date, ti.schedule_start_date)::date BETWEEN ${hoje}::date AND ${limite}::date
      `);
      res.set("Cache-Control", "no-store");
      res.json({ count: Number(linhasDe<{ n: number }>(rows)[0]?.n ?? 0) });
    } catch {
      res.status(500).json({ message: "Erro ao contar escalações sem passagem" });
    }
  });

  /**
   * GET /api/tickets/sinais-de-viagem → { porVaga, totais } (09/10).
   *
   * Por vaga ativa com colaborador: viagem que cruza outra (sem encadeamento),
   * passagem com data impossível, trecho direto (confirmado ou indicado) e a
   * sugestão "pode ir direto de <cidade>" para Compras. Calculado sobre TODAS
   * as vagas do colaborador (a vaga de outro evento é o que importa aqui),
   * por isso não aceita recorte de evento. Quem registra passagem (logística).
   */
  app.get("/api/tickets/sinais-de-viagem", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const sinais = sinaisDeViagem(await carregarVagasDeViagem(), hojeISO());
      res.set("Cache-Control", "no-store");
      res.json(sinais);
    } catch (error) {
      console.error("erro nos sinais de viagem:", error);
      res.status(500).json({ message: "Erro ao conferir as viagens" });
    }
  });

  /**
   * GET /api/shell/viagens-e-datas → { cruzam, datasImpossiveis } (09/10).
   * Pendências: viagens que se cruzam (pares NÃO encadeados) e passagens com
   * data impossível. Só admin e Compras. Nada é corrigido sozinho (dono).
   */
  app.get("/api/shell/viagens-e-datas", async (req, res) => {
    const ator = await requireRoles(req, res, ["admin", "purchasing"]);
    if (!ator) return;
    try {
      const { totais } = sinaisDeViagem(await carregarVagasDeViagem(), hojeISO());
      res.set("Cache-Control", "no-store");
      res.json({ cruzam: totais.viagensQueSeCruzam, datasImpossiveis: totais.passagensComDataImpossivel });
    } catch {
      res.status(500).json({ message: "Erro ao contar viagens e datas" });
    }
  });

  app.post("/api/tickets", async (req, res) => {
    const ticketCreator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ticketCreator) return;
    try {
      // Não logar o corpo: passagens contêm dados pessoais do passageiro
      const ticketData = insertTicketSchema.parse(req.body);
      const vaga = await storage.getTeamInclusion(ticketData.teamInclusionId);
      if (!vaga || vaga.deletedAt) return res.status(404).json({ message: "Vaga não encontrada ou excluída" });
      // Evento encerrado: só o administrador
      if (!await assertInclusionEventEditable(ticketData.teamInclusionId, ticketCreator, res, vaga)) return;
      // Datas plausíveis, trecho direto válido e viagem sem cruzar outra (09/10).
      const outrasLinhas = await storage.getTicketsByInclusionId(ticketData.teamInclusionId);
      const conferencia = await conferirPassagem(vaga.id, vaga.collaboratorId ?? null, ticketData, outrasLinhas);
      if (conferencia.recusa) return res.status(conferencia.recusa.status).json(conferencia.recusa.body);
      const ticket = await storage.createTicket({ ...ticketData, updatedBy: ticketCreator.id });
      await createAuditLog('create', 'ticket', ticket.id, ticket, ticketCreator.id, ticketCreator.name || 'Sistema', undefined, req);
      // Status da vaga DERIVADO pelo servidor (23/09): o client não manda mais
      // passagem_comprada pelo PATCH.
      const inclusion = await recalcularStatusDeLogistica(ticketData.teamInclusionId, ticketCreator, req);
      const extra = conferencia.voltaParaCancelar ? { voltaParaCancelar: conferencia.voltaParaCancelar } : {};
      res.json(inclusion ? { ...ticket, ...extra, inclusionStatus: inclusion.status } : { ...ticket, ...extra });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dados inválidos", error: error.message });
      responderErroComStatus(res, error, "Erro ao registrar passagem");
    }
  });

  /**
   * POST /api/tickets/emitidas — body { inclusionIds: string[], emitida: boolean }
   *
   * "O bilhete saiu" dito à mão por quem compra (regra do dono, 26/08), uma
   * vaga ou várias de uma vez. A partir do carimbo a área não pede mais ajuste
   * naquela vaga; preencher os dados da passagem continua liberado — por isso
   * marcar NÃO exige passagem preenchida: se a vaga ainda não tem linha de
   * passagem, uma é criada só com o carimbo.
   *
   * Desmarcar existe porque erro de clique acontece: reabre a janela de ajuste.
   * Tudo vai para a auditoria, com quem marcou e quando.
   */
  app.post("/api/tickets/emitidas", async (req, res) => {
    // Só ADMIN e COMPRAS carimbam a emissão (decisão do dono, 26/08) — quem
    // preenche a passagem não decide quando a janela de ajuste fecha.
    const actor = await requireRoles(req, res, ["admin", "purchasing"]);
    if (!actor) return;
    const ids: string[] = Array.isArray(req.body?.inclusionIds) ? req.body.inclusionIds.filter((x: unknown) => typeof x === "string") : [];
    const emitida = req.body?.emitida !== false;
    if (ids.length === 0) return res.status(400).json({ message: "Escolha ao menos uma vaga." });
    if (ids.length > 200) return res.status(400).json({ message: "Marque no máximo 200 vagas por vez." });
    try {
      const agora = new Date();
      const ok: string[] = [];
      const pulados: { id: string; motivo: string }[] = [];
      // Leituras EM LOTE (auditoria 28/08): 1 SELECT de vagas + 1 de passagens
      // + cache de evento. Escritas EM LOTE (23/09): um UPDATE … WHERE id IN
      // para as passagens existentes, um INSERT multi-linha para as que faltam
      // e um INSERT de auditoria.
      const vagas = await storage.getTeamInclusionsByIds(ids);
      const vagaPorId = new Map(vagas.map((v) => [v.id, v]));
      // Só as passagens ATUAIS: a de histórico (troca aprovada) não é carimbada.
      const passagens = await db.select().from(ticketsTable).where(and(inArray(ticketsTable.teamInclusionId, ids), isNull(ticketsTable.archivedAt)));
      const passagensPorVaga = new Map<string, typeof passagens>();
      for (const t of passagens) {
        const lista = passagensPorVaga.get(t.teamInclusionId) ?? [];
        lista.push(t);
        passagensPorVaga.set(t.teamInclusionId, lista);
      }
      const eventCache = newEventCache();
      const patch = { emittedAt: emitida ? agora : null, emittedBy: emitida ? actor.id : null, updatedAt: agora, updatedBy: actor.id };
      const idsParaAtualizar: string[] = [];
      const vagasSemPassagem: string[] = [];
      for (const inclusionId of ids) {
        const inclusion = vagaPorId.get(inclusionId);
        if (!inclusion || inclusion.deletedAt) { pulados.push({ id: inclusionId, motivo: "vaga não encontrada" }); continue; }
        // Evento encerrado: mesma trava do resto da escalação (evento em cache).
        if (!await assertInclusionEventEditable(inclusionId, actor, res, inclusion, eventCache)) return;
        const doVaga = passagensPorVaga.get(inclusionId) ?? [];
        if (doVaga.length === 0) {
          if (!emitida) { pulados.push({ id: inclusionId, motivo: "sem passagem para desmarcar" }); continue; }
          vagasSemPassagem.push(inclusionId);
        } else {
          idsParaAtualizar.push(...doVaga.map((t) => t.id));
        }
        ok.push(inclusionId);
      }
      const anteriorPorTicket = new Map(passagens.map((t) => [t.id, t]));
      const { atualizadas, criadas } = await db.transaction(async (tx) => {
        const atualizadas = idsParaAtualizar.length > 0
          ? await tx.update(ticketsTable).set(patch).where(inArray(ticketsTable.id, idsParaAtualizar)).returning()
          : [];
        const criadas = vagasSemPassagem.length > 0
          ? await tx.insert(ticketsTable).values(vagasSemPassagem.map((teamInclusionId) => ({ teamInclusionId, ...patch }))).returning()
          : [];
        return { atualizadas, criadas };
      });
      await createAuditLogsBatch([
        ...criadas.map((t) => montarLogDeAuditoria("emitir", "ticket", t.id, t, actor.id, actor.name, undefined, req)),
        ...atualizadas.map((t) => montarLogDeAuditoria(emitida ? "emitir" : "desfazer_emissao", "ticket", t.id, t, actor.id, actor.name, anteriorPorTicket.get(t.id), req)),
      ]);
      // Uma vaga que ganhou a primeira linha de passagem passa a "passagem comprada"
      for (const inclusionId of vagasSemPassagem) await recalcularStatusDeLogistica(inclusionId, actor, req);
      res.json({ ok, pulados, emitida });
    } catch (error) {
      console.error("erro ao marcar passagem emitida:", error);
      res.status(500).json({ message: "Erro ao marcar as passagens" });
    }
  });

  app.patch("/api/tickets/:id", async (req, res) => {
    const ticketEditor = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ticketEditor) return;
    try {
      const { id } = req.params;
      // Allowlist via schema: só colunas conhecidas de tickets entram. A passagem
      // nunca troca de inclusão pelo corpo (teamInclusionId) e o ator vem da
      // sessão (updatedBy) — antes o body inteiro ia direto para o UPDATE.
      const parsed = insertTicketSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados inválidos", error: parsed.error.message });
      }
      const { teamInclusionId: _ignoredInclusion, updatedBy: _ignoredActor, ...allowed } = parsed.data;
      const updates = {
        ...allowed,
        updatedAt: new Date(),
        updatedBy: ticketEditor.id,
      };
      const prev = await storage.getTicket(id);
      if (!prev) return res.status(404).json({ message: "Passagem não encontrada" });
      // Histórico de troca não se edita: é o registro do que foi comprado (01/10).
      if (prev.archivedAt) return res.status(409).json({ message: "Esta passagem é histórico de uma troca aprovada e não pode ser alterada. Registre a passagem do novo colaborador." });
      // Evento encerrado: só o administrador
      if (!await assertInclusionEventEditable(prev.teamInclusionId, ticketEditor, res)) return;
      // Só datas/encadeamento NOVOS são conferidos (09/10): editar o LOC ou o
      // valor de uma passagem antiga que já cruza outra não é bloqueado.
      const alterados = new Set<string>(CAMPOS_DE_DATA.filter((c) =>
        c in allowed && !mesmoValor((allowed as Record<string, unknown>)[c], (prev as Record<string, unknown>)[c])));
      let extra: Record<string, unknown> = {};
      if (alterados.size > 0) {
        const vaga = await storage.getTeamInclusion(prev.teamInclusionId);
        const outrasLinhas = (await storage.getTicketsByInclusionId(prev.teamInclusionId)).filter((t) => t.id !== id);
        const conferencia = await conferirPassagem(prev.teamInclusionId, vaga?.collaboratorId ?? null, { ...prev, ...allowed }, outrasLinhas, alterados);
        if (conferencia.recusa) return res.status(conferencia.recusa.status).json(conferencia.recusa.body);
        if (conferencia.voltaParaCancelar && alterados.has("idaVemDeInclusionId")) extra = { voltaParaCancelar: conferencia.voltaParaCancelar };
      }
      const ticket = await storage.updateTicket(id, updates);
      await createAuditLog('update', 'ticket', id, ticket, ticketEditor.id, ticketEditor.name || 'Sistema', prev, req);
      const inclusion = await recalcularStatusDeLogistica(prev.teamInclusionId, ticketEditor, req);
      res.json(inclusion ? { ...ticket, ...extra, inclusionStatus: inclusion.status } : { ...ticket, ...extra });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao atualizar passagem");
    }
  });
}
