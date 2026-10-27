/**
 * Portal do colaborador (/colaborador) — o formato das respostas da API
 * (server/routes/colaborador-portal.ts, Fase 1 do Módulo de Honorários).
 */
import type { EstadoDoDia, ModoDeLocalizacao } from "@shared/presenca";

/** GET /api/colaborador/eu (e a resposta de entrar, primeiro acesso e termo). */
export interface EuDoPortal {
  colaborador: { id: string; nome: string; primeiroNome: string };
  termo: { versao: string; texto: string; aceito: boolean; aceitoEm: string | null; versaoAceita: string | null };
  configuracao: { selfieObrigatoria: boolean; localizacao: ModoDeLocalizacao };
}

/** Uma entrada ou saída registrada. `hora` já vem em horário de Brasília (HH:MM). */
export interface MarcacaoDoPortal {
  em: string;
  hora: string;
  comSelfie: boolean;
  fotoId: string | null;
  porRepresentante: boolean;
  comLocalizacao: boolean;
}

export interface DiaDoPortal {
  dia: string;
  estado: EstadoDoDia;
  entrada: MarcacaoDoPortal | null;
  saida: MarcacaoDoPortal | null;
  podeEntrar: boolean;
  podeSair: boolean;
}

export interface OcorrenciaDoPortal {
  id: string;
  tipo: string;
  rotulo: string;
  dia: string | null;
  horas: number | null;
}

export interface ConfirmacaoDoPortal {
  dias: string[];
  cnpj: string | null;
  razaoSocial: string | null;
  contestacao: string | null;
  confirmadoEm: string;
  valorVisto: number | null;
}

export interface ValoresDoPortal {
  valorCalculado: number;
  valorDaDiaria: number;
  memoria: string[];
  valorFinal: number | null;
}

export interface PrestacaoDoPortal {
  id: string;
  evento: { id: string; nome: string; cidade: string | null; inicio: string; fim: string };
  funcao: string | null;
  dias: DiaDoPortal[];
  ocorrencias: OcorrenciaDoPortal[];
  diasExtras: string[];
  confirmacao: ConfirmacaoDoPortal | null;
  podeConfirmar: boolean;
  motivoNaoPodeConfirmar: string | null;
  checkoutFinalFeito: boolean;
  valoresOcultos: boolean;
  valores: ValoresDoPortal | null;
}

export interface CnpjDoPortal {
  /** Já mascarado pelo servidor (XX.XXX.XXX/XXXX-XX). */
  cnpj: string;
  razaoSocial: string | null;
  ativo: boolean;
}

/** GET /api/colaborador/prestacoes */
export interface PrestacoesDoPortal {
  hoje: string;
  prestacoes: PrestacaoDoPortal[];
  cnpjs: CnpjDoPortal[];
}

/** POST .../entrada e .../saida (201). */
export interface RespostaDaMarcacao {
  dia: string;
  entrada: MarcacaoDoPortal | null;
  saida: MarcacaoDoPortal | null;
}

/** POST /api/colaborador/prestacoes/:id/confirmar */
export interface RespostaDaConfirmacao {
  confirmacao: Omit<ConfirmacaoDoPortal, "valorVisto"> & { cnpjComContrato: boolean };
}

export type TipoDeMarcacao = "entrada" | "saida";
