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
 * Papéis: financeiro (admin/DP), como as quatro rotas que ele substitui.
 *
 * 26/10 (Honorários, Fase 0): `recorte` = fluxo_novo | legado | todos (sem o
 * parâmetro: todos — o contrato de antes; a tela pede fluxo_novo por padrão) —
 * evento que termina antes da data de corte (system_settings.honorarios_data_corte)
 * é legado; as conclusões do legado fora do fluxo vêm de honorarios_legado_concluidos;
 * cada linha leva a posição na trilha única (shared/trilha-honorarios).
 *
 * 28/10 (Honorários, Fase 3 — prazos e cobranças): cada linha do fluxo novo
 * leva o prazo da etapa atual (quem age, vence em, situação) e a contestação
 * do colaborador; os contadores trazem atrasados/vence hoje e as contestações
 * abertas. A montagem a partir do banco (`carregarControleRh`) também serve o
 * sino do DP (GET /api/shell/honorarios-prazos).
 */
import type { Express } from "express";
import { storage } from "../storage";
import { ehFiltroDeStatus, montarControleRh, type ControleRh, type FiltroDeStatus } from "@shared/controle-rh";
import { requireFinanceUser } from "./_compartilhado";
import { conclusoesDoLegado, lerDataDeCorteDoBanco } from "./honorarios-fluxo";
import { ehEventoLegado, ehRecorteDoLegado, type RecorteDoLegado } from "@shared/legado-honorarios";
import { lerPrazosDosHonorarios } from "@shared/prazos-honorarios";
import { hojeISO } from "@shared/hoje-sp";
import { confirmacoesDasPrestacoes } from "../storage/presenca";

/**
 * Lê do banco e monta o Painel: um evento (`eventId`), alguns eventos
 * (`eventIds` — o sino passa só os do fluxo novo) ou o sistema inteiro.
 * Devolve null quando `eventId` não existe.
 */
export async function carregarControleRh(o: {
  eventId?: string;
  eventIds?: readonly string[];
  recorte: RecorteDoLegado;
  filtro?: FiltroDeStatus | null;
}): Promise<ControleRh | null> {
  const { eventId } = o;
  const doEvento = (id: string) => Promise.all([
    storage.getTeamInclusions(false, undefined, { eventId: id }),
    storage.getBudgetPlanned(id),
    storage.getBudgetActual(id),
    storage.getInvoices(id),
  ]);
  type Tabelas = Awaited<ReturnType<typeof doEvento>>;
  const tabelasDosEventos = async (ids: readonly string[]): Promise<Tabelas> => {
    const porEvento = await Promise.all(ids.map(doEvento));
    return [porEvento.flatMap((t) => t[0]), porEvento.flatMap((t) => t[1]), porEvento.flatMap((t) => t[2]), porEvento.flatMap((t) => t[3])];
  };

  const [eventos, tabelas, colaboradores, funcoes, usuarios, dataDeCorte, conclusoes, settings] = await Promise.all([
    eventId ? storage.getEvent(eventId).then((e) => (e ? [e] : []))
      : o.eventIds ? (o.eventIds.length ? storage.getEventsByIds([...o.eventIds]) : Promise.resolve([]))
      : storage.getEvents(false),
    eventId ? doEvento(eventId)
      : o.eventIds ? tabelasDosEventos(o.eventIds)
      : Promise.all([
        // Mesmo recorte que a tela pedia em /api/team-inclusions: sem sugestões (phase padrão), sem excluídas.
        storage.getTeamInclusions(false, undefined, {}),
        storage.getAllBudgetPlanned(),
        storage.getAllBudgetActual(),
        storage.getInvoices(undefined),
      ]),
    storage.getCollaborators(),
    storage.getFunctions(),
    storage.getUsers(),
    lerDataDeCorteDoBanco(),
    conclusoesDoLegado(eventId),
    storage.getSystemSettings(),
  ]);
  if (eventId && eventos.length === 0) return null;
  const [vagas, planejados, realizados, notas] = tabelas;
  // Confirmações (e contestações) só das prestações do fluxo novo — o legado não tem presença.
  const novos = new Set(eventos.filter((e) => !ehEventoLegado(e.endDate, dataDeCorte)).map((e) => e.id));
  const confirmacoes = await confirmacoesDasPrestacoes(realizados.filter((a) => novos.has(a.eventId) && !a.splitParentId).map((a) => a.id));

  return montarControleRh({
    eventos,
    vagas,
    planejados,
    realizados,
    notas,
    nomesDeColaboradores: new Map(colaboradores.map((c) => [c.id, c.fullName])),
    nomesDeFuncoes: new Map(funcoes.map((f) => [f.id, f.name])),
    nomesDeUsuarios: new Map(usuarios.map((u) => [u.id, u.name])),
    dataDeCorte,
    recorte: o.recorte,
    conclusoes,
    prazos: lerPrazosDosHonorarios(settings),
    hoje: hojeISO(),
    confirmacoes: new Map(confirmacoes.map((c) => [c.actualId, c])),
  }, o.filtro ?? null);
}

export function registrarControleRh(app: Express): void {
  app.get("/api/rh/controle", async (req, res) => {
    if (!await requireFinanceUser(req, res)) return;
    const eventId = typeof req.query.eventId === "string" && req.query.eventId ? req.query.eventId : undefined;
    const statusBruto = req.query.status;
    if (statusBruto !== undefined && statusBruto !== "" && statusBruto !== "all" && !ehFiltroDeStatus(statusBruto)) {
      return res.status(400).json({ message: "Filtro de status inválido" });
    }
    const filtro = ehFiltroDeStatus(statusBruto) ? statusBruto : null;
    const recorteBruto = req.query.recorte;
    if (recorteBruto !== undefined && recorteBruto !== "" && !ehRecorteDoLegado(recorteBruto)) {
      return res.status(400).json({ message: "Recorte inválido (fluxo_novo, legado ou todos)" });
    }
    const recorte = ehRecorteDoLegado(recorteBruto) ? recorteBruto : "todos";

    const controle = await carregarControleRh({ eventId, recorte, filtro });
    if (!controle) {
      return res.status(404).json({ message: "Evento não encontrado" });
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(controle);
  });
}
