/**
 * Transporte terrestre da vaga (16/10) — "vai de carro ou van" em Passagens.
 *
 *   GET    /api/transportes-terrestres[?eventId= | ?futuros=1]
 *   POST   /api/transportes-terrestres            { itens: [{ teamInclusionId, trecho, modo, empresa?, valorCentavos }], tudoOuNada?, agrupar? }
 *   DELETE /api/transportes-terrestres/:inclusionId[?trecho=ida|volta]
 *   PUT    /api/transportes-terrestres/grupos/:grupoId   { modo, empresa?, totalCentavos }   (a van inteira, 21/10)
 *   DELETE /api/transportes-terrestres/grupos/:grupoId                                      (desfazer a van inteira, 21/10)
 *
 * Quem registra passagem (logística: admin, Compras, Produção) registra e
 * desfaz. Uma vaga com TODAS as pernas terrestres sai da fila "Comprar" e o
 * status anda como se a passagem estivesse comprada (logisticaDaVaga). Perna
 * que já tem passagem registrada não vira terrestre (o mesmo trecho não paga
 * duas vezes) — e vice-versa, ver server/routes/passagens.ts.
 *
 * 21/10: só carro e van se registram (o ônibus antigo continua legível e
 * pode ser desfeito). O total dividido entre várias vagas (`agrupar`) grava
 * todas as linhas com o mesmo `grupo_id`; o GET devolve, em cada linha, o
 * total e o número de vagas do grupo.
 *
 * O valor é registrado e mostrado; NÃO entra no Planejado nem no Realizado.
 */
import type { Express, Request } from "express";
import { randomUUID } from "node:crypto";
import { storage } from "../storage";
import { hojeISO } from "@shared/hoje-sp";
import { passagemTemIda, passagemTemVolta } from "@shared/janela-de-viagem";
import {
  NOME_DA_PERNA,
  VALOR_MAXIMO_CENTAVOS,
  ehPerna,
  ordenarParaRateio,
  pernasDaVaga,
  ratearTotal,
  validarEdicaoDoGrupo,
  validarTrechoTerrestre,
  type ItemTerrestre,
  type PernaDaViagem,
} from "@shared/transporte-terrestre";
import { faseParaStatus, normalizarStatus } from "@shared/vaga-status";
import { tickets as ticketsTable, type TeamInclusion, type TransporteTerrestre } from "@shared/schema";
import { passagemSoComCarimbo } from "@shared/passagem-so-com-carimbo";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { assertInclusionEventEditable, newEventCache } from "../event-guard";
import { hospedagemConta, passagemConta, statusDepoisDePassagemParaHistorico } from "../vaga-guards";
import {
  comResumoDosGrupos,
  gravarTrecho,
  listarTerrestres,
  regravarGrupo,
  removerGrupo,
  removerTrechos,
  terrestreCobreAVaga,
  terrestresDaVaga,
  terrestresDoGrupo,
} from "../transporte-terrestre";
import {
  createAuditLogsBatch,
  eventIdDaQuery,
  LOGISTICA_ROLES,
  montarLogDeAuditoria,
  recalcularStatusDeLogistica,
  requireRoles,
  responderErroComStatus,
} from "./_compartilhado";

/** Itens por pedido: 200 vagas × ida e volta (o mesmo teto do "Marcar como emitida"). */
const MAX_ITENS = 400;

export interface FalhaDoTerrestre { teamInclusionId: string; numero: number | null; mensagem: string }

type Ator = NonNullable<Awaited<ReturnType<typeof requireRoles>>>;

/**
 * Desfazer devolve a vaga à fila: se nada mais cobre o transporte (nem
 * passagem viva, nem o terrestre que sobrou), o "passagem comprada" que o
 * terrestre deu volta atrás — a mesma regressão da troca aprovada. Só desfaz
 * o que o terrestre fez (revisão 16/10): se ele NÃO cobria a vaga antes (só
 * uma perna registrada), o "passagem comprada" veio de outro lugar — status
 * antigo, passagem cancelada — e não é este clique que o tira.
 */
async function devolverAFila(vaga: TeamInclusion, removidos: readonly TransporteTerrestre[], ator: Ator, req: Request): Promise<string | undefined> {
  const passagensVivas = (await storage.getTicketsByInclusionId(vaga.id)).some(passagemConta);
  const restantes = await terrestresDaVaga(vaga.id);
  const cobriaAntes = terrestreCobreAVaga(vaga, [...restantes, ...removidos]);
  if (!cobriaAntes || passagensVivas || terrestreCobreAVaga(vaga, restantes)) return undefined;
  const temHospedagem = (await storage.getAccommodationsByInclusionId(vaga.id)).some(hospedagemConta);
  const novo = statusDepoisDePassagemParaHistorico(vaga.status, temHospedagem);
  if (!novo || novo === normalizarStatus(vaga.status)) return undefined;
  try {
    const atualizada = await storage.updateTeamInclusion(vaga.id, { status: novo, phase: faseParaStatus(novo) ?? vaga.phase, updatedBy: ator.id }, {
      expectedStatus: vaga.status,
      auditFor: (u) => montarLogDeAuditoria("update", "team_inclusion", vaga.id, u, ator.id, ator.name, vaga, req),
    });
    return atualizada?.status;
  } catch (erro) {
    // Perdeu a corrida (409): a outra decisão vale; o terrestre já saiu.
    if ((erro as { status?: unknown } | null)?.status !== 409) throw erro;
    return undefined;
  }
}

export function registrarTransporteTerrestre(app: Express): void {
  app.get("/api/transportes-terrestres", async (req, res) => {
    try {
      const eventId = eventIdDaQuery(req);
      const linhas = await listarTerrestres(eventId, req.query.futuros === "1" ? { eventoTerminaDesde: hojeISO() } : {});
      res.set("Cache-Control", "no-store");
      res.json(await comResumoDosGrupos(linhas));
    } catch {
      res.status(500).json({ message: "Erro ao buscar o transporte terrestre" });
    }
  });

  app.post("/api/transportes-terrestres", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    const brutos: unknown[] = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (brutos.length === 0) return res.status(400).json({ message: "Nada a registrar." });
    if (brutos.length > MAX_ITENS) return res.status(400).json({ message: "Registre no máximo 200 vagas por vez." });
    /** Total dividido entre as vagas (21/10): as linhas ganham o mesmo grupo. */
    const agrupar = req.body?.agrupar === true;
    /** Lote "o total, dividido" (revisão 16/10): grava todos os itens ou nenhum. O grupo também. */
    const tudoOuNada = req.body?.tudoOuNada === true || agrupar;

    // 1. Formato de cada item — tudo ou nada (é erro de quem montou o pedido).
    const itens: ItemTerrestre[] = [];
    const vistos = new Set<string>();
    for (let i = 0; i < brutos.length; i++) {
      const b = (brutos[i] ?? {}) as Record<string, unknown>;
      const vagaId = typeof b.teamInclusionId === "string" ? b.teamInclusionId : "";
      const v = validarTrechoTerrestre(b);
      if (!vagaId || !v.ok) {
        const erros = v.ok ? { teamInclusionId: "Vaga não informada." } : v.erros;
        return res.status(400).json({ message: Object.values(erros)[0] ?? "Dados inválidos", erros, indice: i });
      }
      const chave = `${vagaId}|${v.valor.trecho}`;
      if (vistos.has(chave)) return res.status(400).json({ message: "A mesma perna da mesma vaga veio duas vezes.", indice: i });
      vistos.add(chave);
      itens.push({ teamInclusionId: vagaId, ...v.valor });
    }

    try {
      // 2. Por vaga: existe, está viva, o evento aceita mudança e a perna não tem passagem.
      const ids = Array.from(new Set(itens.map((i) => i.teamInclusionId)));
      const vagas = new Map((await storage.getTeamInclusionsByIds(ids)).map((v) => [v.id, v]));
      const eventCache = newEventCache();
      const falhas: FalhaDoTerrestre[] = [];
      const aceitos: ItemTerrestre[] = [];
      for (const id of ids) {
        const vaga = vagas.get(id);
        const doVaga = itens.filter((i) => i.teamInclusionId === id);
        const falhar = (mensagem: string) => falhas.push({ teamInclusionId: id, numero: vaga?.inclusionNumber ?? null, mensagem });
        if (!vaga || vaga.deletedAt) { falhar("vaga não encontrada ou excluída"); continue; }
        // Evento encerrado: só o administrador (a resposta 403 sai daqui, como no
        // resto da logística). Vem ANTES do "cancelada": permissão primeiro, como
        // no POST /api/tickets (revisão 16/10).
        if (!await assertInclusionEventEditable(id, ator, res, vaga, eventCache)) return;
        if (vaga.status === "cancelado") { falhar("a escalação está cancelada"); continue; }
        const pernas = pernasDaVaga(vaga);
        const foraDaVaga = doVaga.find((i) => !pernas.includes(i.trecho));
        if (foraDaVaga) { falhar(`a vaga não tem ${foraDaVaga.trecho === "ida" ? "ida" : "volta"} (trecho sugerido)`); continue; }
        const passagens = (await storage.getTicketsByInclusionId(id)).filter(passagemConta);
        const comPassagem = doVaga.find((i) => passagens.some((t) => (i.trecho === "ida" ? passagemTemIda(t) : passagemTemVolta(t))));
        if (comPassagem) {
          falhar(`a ${NOME_DA_PERNA[comPassagem.trecho].toLowerCase()} já tem passagem registrada — edite a passagem antes`);
          continue;
        }
        aceitos.push(...doVaga);
      }
      if (aceitos.length === 0) {
        return res.status(409).json({ message: falhas[0]?.mensagem ? primeiraLetraMaiuscula(falhas[0].mensagem) : "Nada foi registrado.", falhas });
      }
      // Lote com o TOTAL dividido (revisão 16/10): cada parte foi calculada para
      // N vagas — gravar só algumas deixaria a soma diferente do total da van.
      // Tudo ou nada: com qualquer falha, nada é gravado.
      if (tudoOuNada && falhas.length > 0) {
        return res.status(409).json({
          code: "lote_dividido_incompleto",
          message: `Nada foi registrado: o total dividido precisa valer para todas as vagas, e ${falhas.length === 1 ? "1 vaga não pode" : `${falhas.length} vagas não podem`} receber o transporte. Desmarque ${falhas.length === 1 ? "essa vaga" : "essas vagas"} e registre de novo.`,
          falhas,
        });
      }

      // 3. Grava (insere ou substitui a perna), audita e refaz o status de cada vaga.
      // Grupo só com 2 vagas ou mais; sem `agrupar`, a perna sai de qualquer grupo.
      const grupoId = agrupar && new Set(aceitos.map((i) => i.teamInclusionId)).size > 1 ? randomUUID() : null;
      const logs = [];
      for (const item of aceitos) {
        const { gravado, anterior } = await gravarTrecho(item, ator.id, grupoId);
        logs.push(montarLogDeAuditoria(anterior ? "update" : "create", "transporte_terrestre", gravado.id, gravado, ator.id, ator.name, anterior ?? undefined, req));
      }
      // Passagem que era SÓ o carimbo (22/10, vaga #4724): "Marcar como
      // emitida" numa vaga que ia de carro/van deixou uma passagem aérea em
      // branco. Com o terrestre cobrindo a vaga inteira, ela não é bilhete de
      // nada — sai, com auditoria. Passagem com qualquer dado fica.
      const vagasDoPedido = Array.from(new Set(aceitos.map((i) => i.teamInclusionId)));
      const vaziasRemovidas: string[] = [];
      for (const id of vagasDoPedido) {
        const vaga = vagas.get(id);
        if (!vaga) continue;
        const vazias = (await storage.getTicketsByInclusionId(id)).filter((t) => passagemSoComCarimbo(t));
        if (vazias.length === 0 || !terrestreCobreAVaga(vaga, await terrestresDaVaga(id))) continue;
        const apagadas = await db.delete(ticketsTable).where(inArray(ticketsTable.id, vazias.map((t) => t.id))).returning();
        await createAuditLogsBatch(apagadas.map((t) => montarLogDeAuditoria("delete", "ticket", t.id, t, ator.id, ator.name, undefined, req)));
        if (apagadas.length > 0) vaziasRemovidas.push(id);
      }
      const statusPorVaga: Record<string, string> = {};
      for (const id of vagasDoPedido) {
        const atualizada = await recalcularStatusDeLogistica(id, ator, req);
        if (atualizada) statusPorVaga[id] = atualizada.status;
      }
      res.json({ gravados: aceitos.length, vagas: vagasDoPedido.length, falhas, statusPorVaga, grupoId, vaziasRemovidas });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao registrar o transporte terrestre", 500);
    }
  });

  app.delete("/api/transportes-terrestres/:inclusionId", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    const { inclusionId } = req.params;
    const trecho = req.query.trecho;
    if (trecho !== undefined && !ehPerna(trecho)) return res.status(400).json({ message: "Trecho inválido: use ida ou volta." });
    try {
      const vaga = await storage.getTeamInclusion(inclusionId);
      if (!vaga || vaga.deletedAt) return res.status(404).json({ message: "Vaga não encontrada ou excluída" });
      if (!await assertInclusionEventEditable(inclusionId, ator, res, vaga)) return;
      const pernas: PernaDaViagem[] = trecho ? [trecho as PernaDaViagem] : ["ida", "volta"];
      const removidos = await removerTrechos(inclusionId, pernas);
      if (removidos.length === 0) return res.status(404).json({ message: "Esta vaga não tem transporte terrestre registrado." });
      await createAuditLogsBatch(removidos.map((r) => montarLogDeAuditoria("delete", "transporte_terrestre", r.id, r, ator.id, ator.name, r, req)));
      const inclusionStatus = await devolverAFila(vaga, removidos, ator, req);
      res.json({ removidos: removidos.length, inclusionStatus });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao desfazer o transporte terrestre", 500);
    }
  });

  /**
   * A van inteira (21/10): outro valor total, empresa ou modo para todas as
   * vagas do grupo. As mesmas linhas (vagas e trechos não mudam); o total é
   * repartido de novo, na mesma regra do lote (`ratearTotal`).
   */
  app.put("/api/transportes-terrestres/grupos/:grupoId", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    const v = validarEdicaoDoGrupo(req.body);
    if (!v.ok) return res.status(400).json({ message: Object.values(v.erros)[0] ?? "Dados inválidos", erros: v.erros });
    try {
      const linhas = await terrestresDoGrupo(req.params.grupoId);
      if (linhas.length === 0) return res.status(404).json({ message: "Este grupo não existe mais — a van foi desfeita ou editada vaga a vaga." });
      const ids = Array.from(new Set(linhas.map((l) => l.teamInclusionId)));
      const vagas = await storage.getTeamInclusionsByIds(ids);
      const eventCache = newEventCache();
      for (const vaga of vagas) if (!await assertInclusionEventEditable(vaga.id, ator, res, vaga, eventCache)) return;
      // Mesma ordem do lote: pelo número da vaga.
      const ordem = ordenarParaRateio(ids.map((id) => ({ id, inclusionNumber: vagas.find((x) => x.id === id)?.inclusionNumber ?? null })));
      const partes = ratearTotal(v.valor.totalCentavos, ordem.map((o) => ({ id: o.id, pernas: linhas.filter((l) => l.teamInclusionId === o.id).map((l) => l.trecho as PernaDaViagem) })));
      if (partes.some((p) => p.valorCentavos <= 0)) return res.status(400).json({ message: "O total dividido entre as vagas fica abaixo de R$ 0,01 por trecho.", erros: { totalCentavos: "baixo demais" } });
      if (partes.some((p) => p.valorCentavos > VALOR_MAXIMO_CENTAVOS)) return res.status(400).json({ message: "Valor alto demais — confira os centavos.", erros: { totalCentavos: "alto demais" } });
      const porLinha = partes.map((p) => ({ id: linhas.find((l) => l.teamInclusionId === p.teamInclusionId && l.trecho === p.trecho)!.id, valorCentavos: p.valorCentavos }));
      const mudancas = await regravarGrupo(req.params.grupoId, porLinha, { modo: v.valor.modo, empresa: v.valor.empresa }, ator.id);
      await createAuditLogsBatch(mudancas.map(({ anterior, gravado }) => montarLogDeAuditoria("update", "transporte_terrestre", gravado.id, gravado, ator.id, ator.name, anterior, req)));
      res.json({ atualizados: mudancas.length, vagas: ids.length });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao editar a van inteira", 500);
    }
  });

  /** Desfazer a van inteira (21/10): todas as vagas do grupo voltam para a fila Comprar. */
  app.delete("/api/transportes-terrestres/grupos/:grupoId", async (req, res) => {
    const ator = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!ator) return;
    try {
      const linhas = await terrestresDoGrupo(req.params.grupoId);
      if (linhas.length === 0) return res.status(404).json({ message: "Este grupo não existe mais — a van já foi desfeita." });
      const ids = Array.from(new Set(linhas.map((l) => l.teamInclusionId)));
      const vagas = await storage.getTeamInclusionsByIds(ids);
      const eventCache = newEventCache();
      for (const vaga of vagas) if (!await assertInclusionEventEditable(vaga.id, ator, res, vaga, eventCache)) return;
      const removidos = await removerGrupo(req.params.grupoId);
      await createAuditLogsBatch(removidos.map((r) => montarLogDeAuditoria("delete", "transporte_terrestre", r.id, r, ator.id, ator.name, r, req)));
      const statusPorVaga: Record<string, string> = {};
      for (const vaga of vagas) {
        if (vaga.deletedAt) continue;
        const novo = await devolverAFila(vaga, removidos.filter((r) => r.teamInclusionId === vaga.id), ator, req);
        if (novo) statusPorVaga[vaga.id] = novo;
      }
      res.json({ removidos: removidos.length, vagas: ids.length, statusPorVaga });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao desfazer a van inteira", 500);
    }
  });
}

const primeiraLetraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
