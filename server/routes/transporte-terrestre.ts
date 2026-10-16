/**
 * Transporte terrestre da vaga (16/10) — "vai de carro ou van" em Passagens.
 *
 *   GET    /api/transportes-terrestres[?eventId= | ?futuros=1]
 *   POST   /api/transportes-terrestres            { itens: [{ teamInclusionId, trecho, modo, empresa?, valorCentavos }] }
 *   DELETE /api/transportes-terrestres/:inclusionId[?trecho=ida|volta]
 *
 * Quem registra passagem (logística: admin, Compras, Produção) registra e
 * desfaz. Uma vaga com TODAS as pernas terrestres sai da fila "Comprar" e o
 * status anda como se a passagem estivesse comprada (logisticaDaVaga). Perna
 * que já tem passagem registrada não vira terrestre (o mesmo trecho não paga
 * duas vezes) — e vice-versa, ver server/routes/passagens.ts.
 *
 * O valor é registrado e mostrado; NÃO entra no Planejado nem no Realizado.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { hojeISO } from "@shared/hoje-sp";
import { passagemTemIda, passagemTemVolta } from "@shared/janela-de-viagem";
import { NOME_DA_PERNA, ehPerna, pernasDaVaga, validarTrechoTerrestre, type ItemTerrestre, type PernaDaViagem } from "@shared/transporte-terrestre";
import { faseParaStatus, normalizarStatus } from "@shared/vaga-status";
import { assertInclusionEventEditable, newEventCache } from "../event-guard";
import { hospedagemConta, passagemConta, statusDepoisDePassagemParaHistorico } from "../vaga-guards";
import { gravarTrecho, listarTerrestres, removerTrechos, terrestreCobreAVaga, terrestresDaVaga } from "../transporte-terrestre";
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

export function registrarTransporteTerrestre(app: Express): void {
  app.get("/api/transportes-terrestres", async (req, res) => {
    try {
      const eventId = eventIdDaQuery(req);
      const linhas = await listarTerrestres(eventId, req.query.futuros === "1" ? { eventoTerminaDesde: hojeISO() } : {});
      res.set("Cache-Control", "no-store");
      res.json(linhas);
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
        if (vaga.status === "cancelado") { falhar("a escalação está cancelada"); continue; }
        // Evento encerrado: só o administrador (a resposta 403 sai daqui, como no resto da logística).
        if (!await assertInclusionEventEditable(id, ator, res, vaga, eventCache)) return;
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

      // 3. Grava (insere ou substitui a perna), audita e refaz o status de cada vaga.
      const logs = [];
      for (const item of aceitos) {
        const { gravado, anterior } = await gravarTrecho(item, ator.id);
        logs.push(montarLogDeAuditoria(anterior ? "update" : "create", "transporte_terrestre", gravado.id, gravado, ator.id, ator.name, anterior ?? undefined, req));
      }
      await createAuditLogsBatch(logs);
      const statusPorVaga: Record<string, string> = {};
      for (const id of Array.from(new Set(aceitos.map((i) => i.teamInclusionId)))) {
        const atualizada = await recalcularStatusDeLogistica(id, ator, req);
        if (atualizada) statusPorVaga[id] = atualizada.status;
      }
      res.json({ gravados: aceitos.length, vagas: new Set(aceitos.map((i) => i.teamInclusionId)).size, falhas, statusPorVaga });
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

      // Desfazer devolve a vaga à fila: se nada mais cobre o transporte (nem
      // passagem viva, nem o terrestre que sobrou), o "passagem comprada" que
      // o terrestre deu volta atrás — a mesma regressão da troca aprovada.
      let inclusionStatus: string | undefined;
      const passagensVivas = (await storage.getTicketsByInclusionId(inclusionId)).some(passagemConta);
      const restantes = await terrestresDaVaga(inclusionId);
      if (!passagensVivas && !terrestreCobreAVaga(vaga, restantes)) {
        const temHospedagem = (await storage.getAccommodationsByInclusionId(inclusionId)).some(hospedagemConta);
        const novo = statusDepoisDePassagemParaHistorico(vaga.status, temHospedagem);
        if (novo && novo !== normalizarStatus(vaga.status)) {
          try {
            const atualizada = await storage.updateTeamInclusion(inclusionId, { status: novo, phase: faseParaStatus(novo) ?? vaga.phase, updatedBy: ator.id }, {
              expectedStatus: vaga.status,
              auditFor: (u) => montarLogDeAuditoria("update", "team_inclusion", inclusionId, u, ator.id, ator.name, vaga, req),
            });
            inclusionStatus = atualizada?.status;
          } catch (erro) {
            // Perdeu a corrida (409): a outra decisão vale; o terrestre já saiu.
            if ((erro as { status?: unknown } | null)?.status !== 409) throw erro;
          }
        }
      }
      res.json({ removidos: removidos.length, inclusionStatus });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao desfazer o transporte terrestre", 500);
    }
  });
}

const primeiraLetraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
