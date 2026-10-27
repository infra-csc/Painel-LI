/**
 * Presença no evento — o formato da resposta do servidor (27/10, Fase 1 do
 * Módulo de Honorários). Espelha `prestacoesParaTela` e GET
 * /api/presenca/eventos/:eventId em server/routes/presenca.ts; se o servidor
 * mudar, mude aqui.
 */
import type { EstadoDoDia, FonteDosDias, ModoDeLocalizacao, SituacaoDoCnpjInformado, TipoDeOcorrencia } from "@shared/presenca";
import type { SituacaoContratualDoColaborador } from "@shared/contratos";
import type { EstadoDoPagamento } from "@shared/honorarios-pagamento";

export type QuemRegistrou = "colaborador" | "representante" | "produtor_correcao";

export interface MarcacaoDaPresenca {
  em: string;
  /** "HH:MM" no horário de Brasília. */
  hora: string;
  por: QuemRegistrou | null;
  porUsuario: { id: string; nome: string | null } | null;
  comSelfie: boolean;
  /** 28/10: a selfie saiu do storage pela política de guarda (LGPD); o horário fica. */
  fotoExpurgada?: boolean;
  /** Só para quem vê as selfies (admin, DP, produção); a Área de Função recebe null. */
  fotoId: string | null;
  fotoUrl: string | null;
  lat: number | null;
  lng: number | null;
  precisaoM: number | null;
}

export interface DiaDaPresenca {
  dia: string;
  estado: EstadoDoDia;
  rotulo: string;
  entrada: MarcacaoDaPresenca | null;
  saida: MarcacaoDaPresenca | null;
  observacao: string | null;
}

export interface OcorrenciaDaPresenca {
  id: string;
  tipo: TipoDeOcorrencia;
  rotulo: string;
  dia: string | null;
  horas: number | null;
  substituto: { id: string; nome: string | null } | null;
  observacao: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
}

export interface ConfirmacaoDaPresenca {
  por: "colaborador" | "representante";
  porUsuario: { id: string; nome: string | null } | null;
  dias: string[];
  valorVisto: number | null;
  cnpj: string | null;
  razaoSocial: string | null;
  contratoId: string | null;
  contestacao: string | null;
  confirmadoEm: string;
}

export interface CalculoDaPrestacao {
  valorBase: number;
  valorCalculado: number;
  linhas: string[];
  diasPagos: string[];
  diasComFalta: string[];
  diasExtras: string[];
  horasExtras: number;
  valorDaHora: number;
  valorHorasExtras: number;
}

export interface PrestacaoDaPresenca {
  actualId: string;
  colaborador: { id: string; nome: string; numero: number | null; tipo: string | null } | null;
  funcao: { id: string | null; nome: string | null };
  fonteDosDias: FonteDosDias;
  dias: DiaDaPresenca[];
  diasExtras: string[];
  ocorrencias: OcorrenciaDaPresenca[];
  confirmacao: ConfirmacaoDaPresenca | null;
  podeConfirmar: boolean;
  calculo: CalculoDaPrestacao;
  /** Faixa do produtor (± pct do calculado); null para o DP/admin (sem limite). */
  limiteDoAjuste: { pct: number; minimo: number; maximo: number } | null;
  diasPendentes: string[];
  checkoutFinal: {
    feito: boolean;
    em: string | null;
    por: { id: string; nome: string | null } | null;
    valorCalculado: number | null;
    valorFinal: number | null;
    ajustePct: number | null;
    horasExtras: number;
    valorHorasExtras: number | null;
    podeFazer: boolean;
  };
  cnpj: {
    informado: string | null;
    razaoSocial: string | null;
    origem: "checkout_final" | "confirmacao" | null;
    situacao: SituacaoDoCnpjInformado;
    rotulo: string;
    contratoId: string | null;
  };
  situacaoContratual: SituacaoContratualDoColaborador;
  acesso: {
    temSenha: boolean;
    codigoValidoAte: string | null;
    bloqueadoAte: string | null;
    termoAceito: boolean;
    ultimoAcessoEm: string | null;
  };
  realizado: { rhStatus: string | null; sentForReview: boolean | null; totalValue: number; dailyValue: number };
  /** Etapas 4–7 (28/10): a OC, a nota e se dá para enviar a NF como representante. */
  notaFiscal?: NotaFiscalDaPresenca;
}

export interface NotaFiscalDaPresenca {
  estado: EstadoDoPagamento;
  rotulo: string;
  oc: { numero: string; valor: number | null; data: string | null } | null;
  nota: { id: string; status: string; numero: string | null; valor: number | null; arquivoNome: string | null; comentarioDoDp: string | null } | null;
  pagoEm: string | null;
  /** Admin, DP e produção, com OC e a nota ainda aceitando envio (sem nota ou devolvida). */
  podeEnviar: boolean;
}

export interface PermissoesDaPresenca {
  verFotos: boolean;
  representante: boolean;
  corrigir: boolean;
  checkoutFinal: boolean;
  gerarCodigo: boolean;
  ajusteSemLimite: boolean;
}

export interface NaArena {
  actualId: string;
  colaborador: string | null;
  funcao: string | null;
  desde: string | null;
}

export interface RespostaDaPresenca {
  evento: { id: string; nome: string; cidade: string | null; inicio: string | null; fim: string | null; ocultarValoresColaborador: boolean | null };
  hoje: string;
  configuracao: {
    selfieObrigatoria: boolean;
    localizacao: ModoDeLocalizacao;
    horaExtraDivisor: number;
    produtorAjusteMaxPct: number;
    provisorio: boolean;
  };
  permissoes: PermissoesDaPresenca;
  naArenaAgora: NaArena[];
  prestacoes: PrestacaoDaPresenca[];
}

/** POST /api/colaboradores/:id/codigo-de-acesso (201). */
export interface CodigoDeAcessoGerado {
  codigo: string;
  validoAte: string;
  colaborador: { id: string; nome: string; cpf: string };
  jaTemSenha: boolean;
}
