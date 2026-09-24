/**
 * Camada de dados do Painel-LI (24/09).
 *
 * Até 23/09 tudo vivia em server/storage.ts: uma classe `DatabaseStorage`
 * (133 métodos, 1.875 linhas) atrás de uma interface `IStorage` com uma
 * única implementação — e que já não batia com a classe. Agora cada domínio
 * é um módulo de funções soltas em server/storage/<dominio>.ts, e este
 * índice monta o objeto `storage` com a MESMA superfície (mesmos nomes de
 * método): os consumidores continuam escrevendo `storage.getUser(...)` e
 * importando de "./storage" / "../storage" — o caminho resolve para esta
 * pasta sem que nenhum import precise mudar.
 *
 * O tipo do objeto (`typeof storage`) substitui a interface. Para usar uma
 * função direto (sem passar pelo objeto), importe do módulo do domínio.
 *
 * Domínios que NÃO têm métodos aqui porque consultam o banco direto:
 * trocas (routes/trocas.ts, SQL cru), espelho operacional (grupos Uber,
 * quartos, custos — server/operational-mirror.ts e
 * routes/espelho-operacional.ts), simulação e portal (server/simulation.ts,
 * routes/portal.ts) e crédito Flash automático (server/flash-credit.ts).
 */
import * as usuarios from "./usuarios";
import * as eventos from "./eventos";
import * as funcoes from "./funcoes";
import * as responsaveis from "./responsaveis";
import * as colaboradores from "./colaboradores";
import * as vagas from "./vagas";
import * as passagens from "./passagens";
import * as hospedagem from "./hospedagem";
import * as financeiroLegado from "./financeiro-legado";
import * as comentarios from "./comentarios";
import * as logsDoSistema from "./logs-do-sistema";
import * as valoresPorFuncao from "./valores-por-funcao";
import * as orcamento from "./orcamento";
import * as configuracoes from "./configuracoes";
import * as notasFiscais from "./notas-fiscais";
import * as empresasPagadoras from "./empresas-pagadoras";
import * as flash from "./flash";
import * as bagagem from "./bagagem";
import * as validacaoDeEscala from "./validacao-de-escala";

// `excludeSuggestions` (vagas) e `COLUNAS_DA_FUNCAO` (funcoes) são exports
// auxiliares, não métodos do storage — ficam de fora do objeto.
const { excludeSuggestions: _excludeSuggestions, ...metodosDeVagas } = vagas;
const { COLUNAS_DA_FUNCAO: _colunas, ...metodosDeFuncoes } = funcoes;

export const storage = {
  ...usuarios,
  ...eventos,
  ...metodosDeFuncoes,
  ...responsaveis,
  ...colaboradores,
  ...metodosDeVagas,
  ...passagens,
  ...hospedagem,
  ...financeiroLegado,
  ...comentarios,
  ...logsDoSistema,
  ...valoresPorFuncao,
  ...orcamento,
  ...configuracoes,
  ...notasFiscais,
  ...empresasPagadoras,
  ...flash,
  ...bagagem,
  ...validacaoDeEscala,
};

/** Superfície da camada de dados (o que era `IStorage`). */
export type Storage = typeof storage;

// Exports nomeados que os consumidores já importavam de "./storage".
export { StorageHttpError, normalizarDataIso, type FunctionManagerRole } from "./_comum";
export { excludeSuggestions } from "./vagas";
export type { TeamInclusionPhaseFilter, TeamInclusionListOptions, UpdateTeamInclusionOptions } from "./vagas";
export type { FunctionManagerSummary, FunctionWithManagers } from "./funcoes";
export type { InsertFlashMovementWithSource } from "./flash";
export type { InsertScalingChangeRequestRow, CancelSuggestionSendParams, CancelSuggestionSendResult } from "./validacao-de-escala";
export type { SystemLogFilters } from "./logs-do-sistema";
export { mapSwapRequestRow } from "./trocas";
