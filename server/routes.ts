/**
 * Composição das rotas da API (24/09).
 *
 * Cada domínio vive em server/routes/<dominio>.ts e exporta um
 * `registrar<Dominio>(app)`; os helpers que as rotas compartilham (papéis,
 * auditoria, erros, upload, máquina de estados da vaga, guardas do financeiro)
 * estão em server/routes/_compartilhado.ts. Este arquivo só decide a ORDEM de
 * registro — que é a mesma do routes.ts monolítico de antes, porque no Express
 * a ordem define qual rota atende quando os caminhos se sobrepõem.
 */
import type { Express } from "express";
import { createServer, type Server } from "http";
import { protegerRotas } from "./http";
import { registerScalingValidationRoutes } from "./scaling-validation";
import { registerSimulationRoutes } from "./simulation";
import { createAuditLog, requireRoles } from "./routes/_compartilhado";
import { registrarIntegracaoMaratona } from "./routes/integracao-maratona";
import { registrarPortal } from "./routes/portal";
import { registrarAuth } from "./routes/auth";
import { registrarUsuarios } from "./routes/usuarios";
import { registrarEventos } from "./routes/eventos";
import { registrarFuncoesEResponsaveis } from "./routes/funcoes-e-responsaveis";
import { registrarColaboradores } from "./routes/colaboradores";
import { registrarEscalacao } from "./routes/escalacao";
import { registrarPassagens } from "./routes/passagens";
import { registrarTransporteTerrestre } from "./routes/transporte-terrestre";
import { registrarBuscaDePassagens } from "./busca-de-passagens/rotas";
import { registrarHospedagem } from "./routes/hospedagem";
import { registrarAvisosDeAlteracao } from "./routes/avisos-de-alteracao";
import { registrarEspelhoOperacional } from "./routes/espelho-operacional";
import { registrarFinanceiroLegado } from "./routes/financeiro-legado";
import { registrarComentarios } from "./routes/comentarios";
import { registrarAnexos } from "./routes/anexos";
import { registrarLogs } from "./routes/logs";
import { registrarValoresPorFuncao } from "./routes/valores-por-funcao";
import { registrarOrcamentoPlanejado } from "./routes/orcamento-planejado";
import { registrarOrcamentoRealizado } from "./routes/orcamento-realizado";
import { registrarOrcamentoComparativo } from "./routes/orcamento-comparativo";
import { registrarConfiguracoes } from "./routes/configuracoes";
import { registrarNotasFiscais } from "./routes/notas-fiscais";
import { registrarEmpresasPagadoras } from "./routes/empresas-pagadoras";
import { registrarFlash } from "./routes/flash";
import { registrarBagagem } from "./routes/bagagem";
import { registrarNotasEHistorico } from "./routes/notas-e-historico";
import { registrarTrocas } from "./routes/trocas";
import { registrarControleRh } from "./routes/rh-controle";
import { registrarHonorariosFluxo } from "./routes/honorarios-fluxo";
import { registrarHonorariosCeno } from "./routes/honorarios-ceno";
import { registrarContratos } from "./routes/contratos";
import { registrarPagamentoColaborador } from "./routes/pagamento-colaborador";
import { registrarColaboradorPortal } from "./routes/colaborador-portal";
import { registrarPresenca } from "./routes/presenca";
import { registrarHonorariosPagamento } from "./routes/honorarios-pagamento";
import { registrarArquivosDeCompra } from "./routes/arquivos-de-compra";
import { registrarRetornoM4 } from "./routes/retorno-m4";
import { registrarVoltarAoPlanejado } from "./routes/voltar-ao-planejado";
import { registrarPaineis } from "./routes/paineis";

export async function registerRoutes(app: Express): Promise<Server> {
  // Toda rota registrada daqui em diante (inclusive as de scaling-validation e
  // simulation) passa pelo asyncHandler — promise rejeitada vira next(err) e
  // cai no tratador global, em vez de derrubar o processo (server/http.ts).
  protegerRotas(app);

  // ETag desligado (23/09): as rotas operacionais mandam Cache-Control
  // no-store e o ETag do Express só gastava CPU (hash do JSON) para um 304 que
  // nunca acontece; os catálogos usam max-age curto em vez de revalidação.
  app.set("etag", false);

  // ── Fora do gate de sessão (server-to-server e autenticação) ─────────────
  registrarIntegracaoMaratona(app);
  registrarPortal(app);
  registrarAuth(app);
  // Portal do colaborador (27/10): sessão própria (CPF + senha), fora do gate
  // do usuário interno — o gate global manda /api/colaborador/* para
  // server/colaborador-sessao.ts.
  registrarColaboradorPortal(app);

  // ── Cadastros ─────────────────────────────────────────────────────────────
  registrarUsuarios(app);
  registrarEventos(app);
  registrarFuncoesEResponsaveis(app);
  registrarColaboradores(app);

  // ── Escalação e logística ─────────────────────────────────────────────────
  registrarEscalacao(app);
  registrarPassagens(app);
  // Vai de carro/van/ônibus em vez de avião (16/10).
  registrarTransporteTerrestre(app);
  // Busca de preços na internet (09/10) — só admin e Compras.
  registrarBuscaDePassagens(app);
  registrarHospedagem(app);
  registrarAvisosDeAlteracao(app);
  registrarEspelhoOperacional(app);
  // Painéis (30/10): atividade recente — o que mudou na escala, passagens e hotéis.
  registrarPaineis(app);

  // ── Transversais ──────────────────────────────────────────────────────────
  registrarFinanceiroLegado(app);
  registrarComentarios(app);
  registrarAnexos(app);
  registrarLogs(app);

  // ── Orçamento e financeiro ────────────────────────────────────────────────
  registrarValoresPorFuncao(app);
  registrarOrcamentoPlanejado(app);
  registrarOrcamentoRealizado(app);
  registrarOrcamentoComparativo(app);
  // "Voltar ao Planejado" (28/10, DP): tira a prestação do Realizado antes da OC/NF.
  registrarVoltarAoPlanejado(app);
  registrarConfiguracoes(app);
  registrarNotasFiscais(app);
  registrarEmpresasPagadoras(app);
  registrarFlash(app);
  registrarBagagem(app);
  registrarNotasEHistorico(app);
  // Controle RH agregado (25/09): as linhas já cruzadas para a tela do RH.
  registrarControleRh(app);
  // Módulo de Honorários, Fase 0 (26/10): pré-aprovação do DP, "não exibir
  // valores" por evento, data de corte e legado concluído fora do fluxo.
  registrarHonorariosFluxo(app);
  // Honorários da cenotécnica (16/10): pedido → aprovação → liberação da verba.
  registrarHonorariosCeno(app);
  // Contratos (CNPJ) e dados de pagamento do colaborador (26/10) — só o DP.
  registrarContratos(app);
  registrarPagamentoColaborador(app);
  // Presença no evento (27/10, Fase 1): check-in/out, ocorrências, check-out
  // final do produtor e o código de acesso do colaborador.
  registrarPresenca(app);
  // Fase 2 MANUAL (28/10): OC, NF pelo representante, conferência OC × NF × CNPJ,
  // pago e o expurgo das selfies.
  registrarHonorariosPagamento(app);
  // Fase 3, arquivos (28/10): compra de créditos Flash em lote e o arquivo de OC
  // do M4 (prestadores + Flash) — layout provisório até o oficial.
  registrarArquivosDeCompra(app);
  // Retorno do M4 por planilha (28/10): nº da OC, programado e liquidado — layout provisório.
  registrarRetornoM4(app);

  // ── Trocas de colaborador ─────────────────────────────────────────────────
  registrarTrocas(app);

  // ── Validação de Escala (sugestões + pedidos de ajuste) ───────────────────
  // Rotas em server/scaling-validation.ts; recebem os helpers de autorização e
  // auditoria daqui para não duplicar lógica nem criar import circular.
  registerScalingValidationRoutes(app, { requireRoles, createAuditLog });

  // ── Modo Simulação — "Ver como usuário" (server/simulation.ts) ────────────
  // POST /api/simulation/start e /stop; o guard de somente leitura vive em
  // server/app.ts. Recebe o createAuditLog daqui pela mesma razão acima.
  registerSimulationRoutes(app, { createAuditLog });

  const httpServer = createServer(app);
  return httpServer;
}
