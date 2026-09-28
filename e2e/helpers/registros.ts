/**
 * Quais registros do seed (server/dev/demo-seed.ts) cada spec MUDA.
 *
 * A suíte roda em série sobre um banco só, então cada arquivo mexe em vagas
 * distintas — mudar uma delas aqui exige conferir que nenhum outro spec a usa.
 * Os nomes são os do seed; os ids mudam a cada subida do PGlite, por isso os
 * testes localizam pelo trio (evento, função, status) com `acharVaga`.
 */
import type { FiltroDeVaga } from "./demo";

export const EVENTO_POA = "Night Run Porto Alegre";
export const EVENTO_RECIFE = "Track & Field Series — Recife";
export const EVENTO_SP = "Maratona Internacional de São Paulo";

/** escalacao.spec — vaga aberta (sem nome) que vira Salvo → Escalado → Cancelada → reativada. */
export const VAGA_ESCALACAO: FiltroDeVaga = { evento: EVENTO_POA, funcao: "Ativação", status: "planejado", comColaborador: false };

/** trocas.spec — troca simples pedida pela Logística e aprovada por Compras (sem passagem). */
export const VAGA_TROCA_SIMPLES: FiltroDeVaga = { evento: EVENTO_POA, funcao: "Produtor", status: "escalado" };

/** trocas.spec — mesma troca, mas com passagem já registrada (aviso de logística). */
export const VAGA_TROCA_COM_PASSAGEM: FiltroDeVaga = { evento: EVENTO_POA, funcao: "Fotografia", status: "escalado" };

/** passagens.spec — vaga escalada que viaja e ganha passagem registrada + emitida. */
export const VAGA_PASSAGEM: FiltroDeVaga = { evento: EVENTO_POA, funcao: "Kit", status: "escalado" };

/** validacao.spec — sugestão pendente de uma função que Bruno Cardoso (function_area) valida. */
export const SUGESTAO_VALIDACAO: FiltroDeVaga = { evento: EVENTO_RECIFE, funcao: "Gerente de Contas", status: "sugestao_pendente" };
