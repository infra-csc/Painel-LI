/**
 * Abas de análise da Busca de passagens (etapa 2, 09/10) — SÓ admin (regra
 * única: shared/regras-da-busca.ts · PAPEIS_DAS_ANALISES).
 *
 *  GET /api/busca-de-passagens/analises/melhor-momento?periodo=90|180|365|tudo
 *  GET /api/busca-de-passagens/analises/preco-por-rota?periodo=
 *  GET /api/busca-de-passagens/analises/pago-x-encontrado?periodo=
 *  GET /api/busca-de-passagens/analises/previsao          (pendentes de hoje em diante)
 *  GET /api/busca-de-passagens/analises/orcamento?periodo= (orçamento + custos ocultos)
 *
 * O servidor só lê (historico.ts) e chama as regras puras testadas.
 */
import type { Express, Request, Response } from "express";
import { hojeISO } from "@shared/hoje-sp";
import { PAPEIS_DAS_ANALISES } from "@shared/regras-da-busca";
import { custosOcultos, melhorMomento, pagoXEncontrado, precoPorRota } from "@shared/analise-da-busca";
import { orcamentoPorEvento, preverEscalacoes } from "@shared/previsao-da-busca";
import { requireRoles } from "../routes/_compartilhado";
import { carregarConsultas, carregarHorarioDasOpcoes, carregarPassagens, carregarPendentes, carregarUsos, desdeDoPeriodo, lerPeriodo } from "./historico";
import { diariaMediaPorEvento } from "./servico";

/** A previsão olha um ano de consultas (a curva de antecedência precisa de amostra). */
const UM_ANO = () => new Date(Date.now() - 365 * 86_400_000);

function rota(app: Express, caminho: string, nome: string, montar: (req: Request) => Promise<unknown>) {
  app.get(`/api/busca-de-passagens/analises/${caminho}`, async (req: Request, res: Response) => {
    if (!await requireRoles(req, res, PAPEIS_DAS_ANALISES)) return;
    try {
      res.set("Cache-Control", "no-store");
      res.json(await montar(req));
    } catch (error) {
      console.error(`[busca-de-passagens] análise ${caminho}:`, error instanceof Error ? error.message : error);
      res.status(500).json({ message: `Erro ao calcular ${nome}` });
    }
  });
}

export function registrarAnalisesDaBusca(app: Express): void {
  rota(app, "melhor-momento", "o melhor momento", async (req) => {
    const periodo = lerPeriodo(req.query.periodo);
    const desde = desdeDoPeriodo(periodo);
    const [consultas, horario, passagens] = await Promise.all([carregarConsultas(desde), carregarHorarioDasOpcoes(desde), carregarPassagens(desde)]);
    return { periodo, ...melhorMomento({ consultas, horario, passagens }) };
  });

  rota(app, "preco-por-rota", "o preço por rota", async (req) => {
    const periodo = lerPeriodo(req.query.periodo);
    const desde = desdeDoPeriodo(periodo);
    const [consultas, passagens] = await Promise.all([carregarConsultas(desde), carregarPassagens(desde)]);
    return { periodo, ...precoPorRota({ consultas, passagens }) };
  });

  rota(app, "pago-x-encontrado", "o pago × encontrado", async (req) => {
    const periodo = lerPeriodo(req.query.periodo);
    const desde = desdeDoPeriodo(periodo);
    // O menor encontrado olha TODAS as consultas daquela rota/data, mesmo de antes do período.
    const [usos, consultas] = await Promise.all([carregarUsos(desde), carregarConsultas(null)]);
    return { periodo, ...pagoXEncontrado({ usos, consultas, hoje: hojeISO() }) };
  });

  rota(app, "previsao", "a previsão", async () => {
    const hoje = hojeISO();
    const [pendentes, consultas] = await Promise.all([carregarPendentes(hoje), carregarConsultas(UM_ANO())]);
    return { hoje, consultas: consultas.length, ...preverEscalacoes(pendentes, { consultas, hoje }) };
  });

  rota(app, "orcamento", "o orçamento", async (req) => {
    const periodo = lerPeriodo(req.query.periodo);
    const hoje = hojeISO();
    const [pendentes, consultas, passagensTodas] = await Promise.all([carregarPendentes(hoje), carregarConsultas(UM_ANO()), carregarPassagens(null)]);
    const desde = desdeDoPeriodo(periodo);
    const desdeDia = desde ? desde.toISOString().slice(0, 10) : null;
    const noPeriodo = desdeDia ? passagensTodas.filter((p) => (p.dataCompra ?? p.eventStart ?? "") >= desdeDia) : passagensTodas;
    const diarias = await diariaMediaPorEvento(noPeriodo.map((p) => p.eventId));
    return {
      periodo,
      hoje,
      orcamento: orcamentoPorEvento({ pendentes, passagens: passagensTodas, consultas, hoje }),
      custosOcultos: custosOcultos({ passagens: noPeriodo, diariaPorEvento: Object.fromEntries(diarias) }),
    };
  });
}
