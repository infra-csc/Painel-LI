/**
 * Portal do colaborador (/colaborador) — o formato das respostas da API
 * (server/routes/colaborador-portal.ts, Fase 1 do Módulo de Honorários).
 */
import type { EstadoDoDia, ModoDeLocalizacao } from "@shared/presenca";
import type { EstadoDoPagamento } from "@shared/honorarios-pagamento";

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
  /** 28/10: a selfie saiu do storage pela política de guarda (o horário fica). */
  fotoExpurgada?: boolean;
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
  /** 28/10 (Fase 3): a resposta do DP à contestação ("Algo não bate?"). Ausente num servidor antigo. */
  respostaDoDp?: { texto: string; em: string | null } | null;
}

/**
 * 28/10 (Fase 3): o prazo do que é do colaborador agora — confirmar a
 * presença, enviar (ou reenviar) a nota. Datas em "AAAA-MM-DD" de Brasília.
 */
export interface PrazoDoPortal {
  etapa: "confirmar_presenca" | "enviar_nf" | "reenviar_nf" | string;
  venceEm: string;
  situacao: "no_prazo" | "vence_hoje" | "atrasado";
  /** Atrasado: dias de atraso; no prazo: dias que faltam. */
  dias: number;
}

export interface ValoresDoPortal {
  valorCalculado: number;
  valorDaDiaria: number;
  memoria: string[];
  valorFinal: number | null;
}

export interface PrestacaoDoPortal {
  id: string;
  /**
   * 28/10 (R7): ele trabalhou como SUBSTITUTO (divisão da vaga) — a presença e
   * a confirmação ficam com o titular; a nota e o pagamento são dele.
   */
  divisao?: boolean;
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
  /** Etapas 4–7 (28/10): OC, nota fiscal, programado e pago. Ausente num servidor antigo. */
  notaEPagamento?: NotaEPagamentoDoPortal | null;
  /** Fase 3 (28/10): o prazo do que é dele agora; null quando nada espera por ele. */
  prazo?: PrazoDoPortal | null;
}

/** A nota fiscal da prestação, como o colaborador vê. */
export interface NotaDoPortal {
  status: "pendente" | "enviada" | "devolvida" | "aprovada" | "recusada" | string;
  enviadaEm: string | null;
  atualizadaEm?: string | null;
  arquivoNome: string | null;
  temArquivo: boolean;
  numero: string | null;
  /** Centavos. */
  valor: number | null;
  /** Só quando o DP devolve ou recusa. */
  comentarioDoDp: string | null;
}

/** A conta do CNPJ — nunca em claro. */
export interface ContaDoPortal {
  cadastrada: boolean;
  mascarada: Partial<Record<"banco" | "agencia" | "conta" | "tipoConta" | "pixTipo" | "pixChave" | "titular", string | null>> | null;
  /** Sem conta nem PIX gravados: o colaborador informa no envio da NF. */
  podeInformar: boolean;
}

/** GET /api/colaborador/prestacoes → `notaEPagamento` de cada prestação. */
export interface NotaEPagamentoDoPortal {
  estado: EstadoDoPagamento;
  rotulo: string;
  /** "Pagamento programado para dd/mm.", "Pago em dd/mm." … */
  frase: string;
  oc: { numero: string; valor: number | null; data: string | null } | null;
  nota: NotaDoPortal | null;
  programadoPara: string | null;
  pagoEm: string | null;
  podeEnviarNf: boolean;
  motivoNaoPodeEnviar: string | null;
  /** O que deve constar na nota (só com OC). */
  instrucoes: {
    tomador: { nome: string | null; cnpj: string | null };
    valor: number;
    oc: string;
    descricaoSugerida: string;
  } | null;
  contaBancaria: ContaDoPortal;
}

/** POST /api/colaborador/prestacoes/:id/nota-fiscal */
export interface RespostaDaNotaFiscal {
  prestacao: PrestacaoDoPortal;
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
