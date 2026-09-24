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
import { registrarHospedagem } from "./routes/hospedagem";
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

  // ── Cadastros ─────────────────────────────────────────────────────────────
  registrarUsuarios(app);
  registrarEventos(app);
  registrarFuncoesEResponsaveis(app);
  registrarColaboradores(app);

  // ── Escalação e logística ─────────────────────────────────────────────────
  registrarEscalacao(app);
  registrarPassagens(app);
  registrarHospedagem(app);
  registrarEspelhoOperacional(app);

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
  registrarConfiguracoes(app);
  registrarNotasFiscais(app);
  registrarEmpresasPagadoras(app);
  registrarFlash(app);
  registrarBagagem(app);
  registrarNotasEHistorico(app);

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
