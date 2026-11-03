/**
 * Histórico de emissões (29/10, deck do dono — slide "CNPJ e contratos") —
 * regra pura. Tela de CONSULTA dentro de Contratos (CNPJ): as empresas pelas
 * quais um colaborador já emitiu nota.
 *
 * O que conta como emissão: a nota fiscal ENVIADA ou APROVADA (as duas
 * existem de verdade — a nota está no sistema). Pendente (rascunho), devolvida
 * (voltou para corrigir) e recusada (definitiva) ficam de fora.
 *
 * Qual é a empresa da emissão: o CNPJ que a NOTA diz (`nf_cnpj`) e, sem ele,
 * o da prestação (check-out final → confirmação do colaborador). Só CNPJ
 * válido conta. "NF emitida por terceiro": a nota é do colaborador da
 * prestação (é ele a referência do histórico), mesmo que o CNPJ seja de uma
 * empresa que atende mais gente — o contrato continua ligado a ele.
 *
 * Quando: aprovada → dia da aprovação; enviada → dia do último envio (ou
 * reenvio); sem esses, o dia em que a nota nasceu. Sempre no fuso da operação.
 * Valor: o da nota (`nf_valor`) ou, sem ele, o total da prestação; sem
 * nenhum dos dois a emissão conta mas não soma.
 */
import { cnpjValido, digitosDoCnpj, mascararCnpj } from "./cnpj";
import { FUSO_DA_OPERACAO, hojeISO } from "./hoje-sp";

export const STATUS_DE_EMISSAO = ["enviada", "aprovada"] as const;
export type StatusDeEmissao = (typeof STATUS_DE_EMISSAO)[number];
export const STATUS_DE_EMISSAO_LABEL: Record<StatusDeEmissao, string> = { enviada: "Enviada", aprovada: "Aprovada" };

/** Teto de notas lidas por colaborador (a consulta nunca devolve tudo do banco). */
export const EMISSOES_MAX_NOTAS = 1000;

export const RAZAO_SOCIAL_DA_EMISSAO_NAO_INFORMADA = "Razão social não informada";

/** Uma nota (enviada/aprovada) com o que a regra precisa — montada pelo servidor. */
export interface NotaParaHistorico {
  notaId: string;
  eventoId: string;
  eventoNome: string;
  status: string;
  nfCnpj: string | null;
  /** CNPJ do check-out final da prestação. */
  cnpjEmissor: string | null;
  /** CNPJ da confirmação do colaborador. */
  cnpjConfirmacao: string | null;
  razaoSocialEmissor: string | null;
  razaoSocialConfirmacao: string | null;
  /** Centavos. */
  nfValor: number | null;
  /** Total da prestação, centavos. */
  valorPrestacao: number | null;
  aprovadaEm: string | Date | null;
  enviadaEm: string | Date | null;
  criadaEm: string | Date | null;
}

export interface EmissaoDoEvento {
  notaId: string;
  eventoId: string;
  eventoNome: string;
  /** Dia da emissão (AAAA-MM-DD). */
  data: string;
  /** Centavos; null = a nota e a prestação não trazem valor. */
  valor: number | null;
  status: StatusDeEmissao;
}

export interface EmpresaEmitente {
  /** 14 dígitos. */
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  /** Há contrato cadastrado para este CNPJ? */
  contratoId: string | null;
  eventos: number;
  notas: number;
  primeiraData: string;
  ultimaData: string;
  /** Soma dos valores conhecidos, centavos. */
  valorTotal: number;
  /** Notas sem valor (não entram na soma). */
  semValor: number;
  emissoes: EmissaoDoEvento[];
}

export interface ContratoParaRazao { id: string; razaoSocial: string }

const diaDe = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Texto só com a data (AAAA-MM-DD) já é o dia; com hora, converte para o fuso da operação.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return hojeISO(FUSO_DA_OPERACAO, d);
};

const cnpjOk = (v: string | null | undefined): string | null => (cnpjValido(v) ? digitosDoCnpj(v) : null);
const textoOuNull = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ") || null;

/** O CNPJ da emissão: o da nota; sem ele, o da prestação. null = sem CNPJ válido. */
export function cnpjDaEmissao(n: Pick<NotaParaHistorico, "nfCnpj" | "cnpjEmissor" | "cnpjConfirmacao">): string | null {
  return cnpjOk(n.nfCnpj) ?? cnpjOk(n.cnpjEmissor) ?? cnpjOk(n.cnpjConfirmacao);
}

/** Dia da emissão (ver o cabeçalho). */
export function dataDaEmissao(n: Pick<NotaParaHistorico, "status" | "aprovadaEm" | "enviadaEm" | "criadaEm">): string | null {
  const base = n.status === "aprovada" ? [n.aprovadaEm, n.enviadaEm, n.criadaEm] : [n.enviadaEm, n.criadaEm];
  for (const v of base) {
    const d = diaDe(v);
    if (d) return d;
  }
  return null;
}

function razaoDaNota(n: NotaParaHistorico, cnpj: string): string | null {
  // A razão da prestação só vale quando o CNPJ dela é o mesmo da emissão.
  if (cnpjOk(n.cnpjEmissor) === cnpj && textoOuNull(n.razaoSocialEmissor)) return textoOuNull(n.razaoSocialEmissor);
  if (cnpjOk(n.cnpjConfirmacao) === cnpj && textoOuNull(n.razaoSocialConfirmacao)) return textoOuNull(n.razaoSocialConfirmacao);
  return null;
}

/**
 * Agrupa as notas por empresa (CNPJ). Razão social: a do contrato cadastrado;
 * sem contrato, a mais recente informada nas prestações. Empresas da mais
 * recente para a mais antiga; emissões de cada uma também.
 */
export function agruparEmissoes(notas: readonly NotaParaHistorico[], contratosPorCnpj: ReadonlyMap<string, ContratoParaRazao>): EmpresaEmitente[] {
  type Parcial = { cnpj: string; razoes: { data: string; razao: string }[]; emissoes: EmissaoDoEvento[] };
  const porCnpj = new Map<string, Parcial>();
  for (const n of notas) {
    if (!(STATUS_DE_EMISSAO as readonly string[]).includes(n.status)) continue;
    const cnpj = cnpjDaEmissao(n);
    const data = dataDaEmissao(n);
    if (!cnpj || !data) continue;
    const valor = n.nfValor != null && n.nfValor > 0 ? n.nfValor : n.valorPrestacao != null && n.valorPrestacao > 0 ? n.valorPrestacao : null;
    let p = porCnpj.get(cnpj);
    if (!p) { p = { cnpj, razoes: [], emissoes: [] }; porCnpj.set(cnpj, p); }
    const razao = razaoDaNota(n, cnpj);
    if (razao) p.razoes.push({ data, razao });
    p.emissoes.push({ notaId: n.notaId, eventoId: n.eventoId, eventoNome: n.eventoNome, data, valor, status: n.status as StatusDeEmissao });
  }
  const empresas: EmpresaEmitente[] = [];
  for (const p of Array.from(porCnpj.values())) {
    const emissoes = [...p.emissoes].sort((a, b) => b.data.localeCompare(a.data) || a.notaId.localeCompare(b.notaId));
    const contrato = contratosPorCnpj.get(p.cnpj) ?? null;
    const razaoRecente = [...p.razoes].sort((a, b) => b.data.localeCompare(a.data))[0]?.razao;
    empresas.push({
      cnpj: p.cnpj,
      cnpjFormatado: mascararCnpj(p.cnpj),
      razaoSocial: contrato?.razaoSocial || razaoRecente || RAZAO_SOCIAL_DA_EMISSAO_NAO_INFORMADA,
      contratoId: contrato?.id ?? null,
      eventos: new Set(emissoes.map((e) => e.eventoId)).size,
      notas: emissoes.length,
      primeiraData: emissoes[emissoes.length - 1].data,
      ultimaData: emissoes[0].data,
      valorTotal: emissoes.reduce((s, e) => s + (e.valor ?? 0), 0),
      semValor: emissoes.filter((e) => e.valor == null).length,
      emissoes,
    });
  }
  return empresas.sort((a, b) => b.ultimaData.localeCompare(a.ultimaData) || a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"));
}

/** A última entrada de envio ("enviado"/"reenviado") do histórico jsonb da nota. */
export function ultimoEnvioDoHistorico(historico: unknown): string | null {
  if (!Array.isArray(historico)) return null;
  let melhor: string | null = null;
  for (const h of historico) {
    const e = h as { type?: unknown; at?: unknown } | null;
    if (!e || (e.type !== "enviado" && e.type !== "reenviado") || typeof e.at !== "string") continue;
    const t = new Date(e.at).getTime();
    if (Number.isNaN(t)) continue;
    if (!melhor || t > new Date(melhor).getTime()) melhor = e.at;
  }
  return melhor;
}
