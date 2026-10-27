/**
 * Fornecedor aprovado automaticamente pelo histórico (28/10) — regra pura.
 *
 * Pedido do DP (27/10, item 5): "validação de contrato mais automática — se
 * algum dia passou o CNPJ, que seja aprovado o fornecedor automaticamente".
 *
 * Quando um CNPJ "passou" por um pagamento de honorário:
 *  - "oc"            → a prestação teve OC registrada (`budget_actual.oc_numero`);
 *  - "nota_aprovada" → a nota fiscal foi APROVADA pelo DP (`invoices.status =
 *                      'aprovada'`) — vale também a nota do fluxo antigo,
 *                      quando ela tem CNPJ (o da nota, `nf_cnpj`, ou o da
 *                      prestação ligada); nota antiga sem CNPJ não conta;
 *  - "pago"          → o pagamento foi marcado (`budget_actual.pago_em`).
 * O CNPJ da prestação é o do check-out final (`cnpj_emissor`) ou, sem ele, o
 * da confirmação do colaborador; o da nota é o `nf_cnpj` ou, sem ele, o da
 * prestação. Só CNPJ VÁLIDO (dígitos verificadores) conta.
 *
 * O efeito (planejarAprovacao): o CNPJ vira contrato ATIVO ligado a quem
 * passou com ele —
 *  - sem contrato do CNPJ          → CRIA um, origem "automatico", vigência
 *                                    aberta (desde o início do 1º evento em
 *                                    que passou, sem fim);
 *  - contrato vigente hoje         → só VINCULA quem ainda não está ligado;
 *  - contrato sem vigência (sem as → ABRE a vigência (mesmo início, sem fim) e
 *    duas datas) e não encerrado     vincula quem faltar;
 *  - contrato ENCERRADO à mão      → nada: a decisão do DP vale (encerrado não
 *                                    volta a ser aprovado sozinho);
 *  - contrato com datas do DP que  → nada: o DP pôs o fim (ou o começo) de
 *    não valem hoje (vencido ou      propósito; reaprovar todo CNPJ já pago
 *    futuro)                         tornaria a vigência letra morta.
 * Idempotente: rodar de novo sobre o mesmo histórico não muda nada.
 */
import { cnpjValido, digitosDoCnpj, mascararCnpj } from "./cnpj";
import { contratoVigenteEm } from "./contratos";

export const GATILHOS_DA_APROVACAO = ["oc", "nota_aprovada", "pago"] as const;
export type GatilhoDaAprovacao = (typeof GATILHOS_DA_APROVACAO)[number];

export const GATILHO_DA_APROVACAO_LABEL: Record<GatilhoDaAprovacao, string> = {
  oc: "OC registrada",
  nota_aprovada: "nota fiscal aprovada",
  pago: "pagamento marcado",
};

/** Origem do contrato: cadastrado pelo DP (à mão ou planilha) ou aprovado pelo histórico. */
export const ORIGENS_DO_CONTRATO = ["cadastro", "automatico"] as const;
export type OrigemDoContrato = (typeof ORIGENS_DO_CONTRATO)[number];
export const ORIGEM_DO_CONTRATO_LABEL: Record<OrigemDoContrato, string> = {
  cadastro: "Cadastrado pelo DP",
  automatico: "Aprovado automaticamente",
};

/** Nome que aparece no histórico do contrato e na auditoria como autor. */
export const AUTOR_DA_APROVACAO_AUTOMATICA = "Aprovação automática";
/** Razão social de quem passou sem informá-la (o DP completa). */
export const RAZAO_SOCIAL_NAO_INFORMADA = "Razão social não informada";

/** Uma vez em que o CNPJ "passou" por um pagamento, com quem e onde. */
export interface PassagemDoCnpj {
  /** 14 dígitos. */
  cnpj: string;
  collaboratorId: string;
  gatilho: GatilhoDaAprovacao;
  /** Quando passou (AAAA-MM-DD). */
  data: string;
  eventoId: string;
  eventoNome: string;
  /** Início do evento (AAAA-MM-DD) — a vigência aberta começa nele. */
  eventoInicio: string | null;
  razaoSocial: string | null;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const diaDe = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return RE_DATA.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
};
const cnpjOk = (v: string | null | undefined): string | null => (cnpjValido(v) ? digitosDoCnpj(v) : null);

/** O CNPJ da prestação: o do check-out final ou, sem ele, o da confirmação. */
export function cnpjDaPrestacao(cnpjEmissor: string | null | undefined, cnpjDaConfirmacao: string | null | undefined): string | null {
  return cnpjOk(cnpjEmissor) ?? cnpjOk(cnpjDaConfirmacao);
}

interface EventoDaPassagem { id: string; nome: string; inicio: string | null }

/** Passagens de uma prestação: a OC registrada e o pagamento marcado. */
export function passagensDaPrestacao(p: {
  collaboratorId: string | null;
  evento: EventoDaPassagem;
  cnpj: string | null;
  razaoSocial: string | null;
  ocNumero: string | null;
  ocData: string | Date | null;
  ocRegistradaEm: string | Date | null;
  pagoEm: string | Date | null;
}): PassagemDoCnpj[] {
  const cnpj = cnpjOk(p.cnpj);
  if (!cnpj || !p.collaboratorId) return [];
  const base = { cnpj, collaboratorId: p.collaboratorId, eventoId: p.evento.id, eventoNome: p.evento.nome, eventoInicio: diaDe(p.evento.inicio), razaoSocial: p.razaoSocial?.trim() || null };
  const saida: PassagemDoCnpj[] = [];
  const dataDaOc = diaDe(p.ocData) ?? diaDe(p.ocRegistradaEm);
  if (p.ocNumero && dataDaOc) saida.push({ ...base, gatilho: "oc", data: dataDaOc });
  const dataDoPago = diaDe(p.pagoEm);
  if (dataDoPago) saida.push({ ...base, gatilho: "pago", data: dataDoPago });
  return saida;
}

/** Passagem de uma nota fiscal: só APROVADA e com CNPJ (o da nota ou o da prestação). */
export function passagemDaNota(n: {
  collaboratorId: string | null;
  evento: EventoDaPassagem;
  status: string;
  nfCnpj: string | null;
  cnpjDaPrestacao: string | null;
  razaoSocial: string | null;
  aprovadaEm: string | Date | null;
  atualizadaEm: string | Date | null;
}): PassagemDoCnpj | null {
  if (n.status !== "aprovada" || !n.collaboratorId) return null;
  const cnpj = cnpjOk(n.nfCnpj) ?? cnpjOk(n.cnpjDaPrestacao);
  const data = diaDe(n.aprovadaEm) ?? diaDe(n.atualizadaEm);
  if (!cnpj || !data) return null;
  return {
    cnpj, collaboratorId: n.collaboratorId, gatilho: "nota_aprovada", data,
    eventoId: n.evento.id, eventoNome: n.evento.nome, eventoInicio: diaDe(n.evento.inicio), razaoSocial: n.razaoSocial?.trim() || null,
  };
}

const ORDEM_DO_GATILHO: Record<GatilhoDaAprovacao, number> = { oc: 0, nota_aprovada: 1, pago: 2 };
const antes = (a: PassagemDoCnpj, b: PassagemDoCnpj) =>
  a.data.localeCompare(b.data) || ORDEM_DO_GATILHO[a.gatilho] - ORDEM_DO_GATILHO[b.gatilho] || a.eventoNome.localeCompare(b.eventoNome, "pt-BR");

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "Aprovado automaticamente: CNPJ já pago em NR São Luís em 12/10/2026 (OC registrada)." */
export function fraseDaAprovacao(p: Pick<PassagemDoCnpj, "eventoNome" | "data" | "gatilho">): string {
  return `Aprovado automaticamente: CNPJ já pago em ${p.eventoNome} em ${dataBr(p.data)} (${GATILHO_DA_APROVACAO_LABEL[p.gatilho]}).`;
}

/** O que o plano precisa saber de um contrato existente. */
export interface ContratoParaAprovacao {
  id: string;
  cnpj: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  encerradoEm: string | Date | null;
  colaboradorIds: readonly string[];
}

export type MotivoIgnorado = "encerrado" | "vigencia_do_dp";
export const MOTIVO_IGNORADO_LABEL: Record<MotivoIgnorado, string> = {
  encerrado: "Contrato encerrado pelo DP — não é reaprovado automaticamente.",
  vigencia_do_dp: "Contrato com vigência definida pelo DP que não vale hoje (vencido ou ainda não começou) — renove à mão.",
};

export type DecisaoDoCnpj =
  | { tipo: "criar" }
  | { tipo: "atualizar"; contratoId: string; vincular: string[]; abrirVigencia: boolean }
  | { tipo: "ja_aprovado"; contratoId: string }
  | { tipo: "ignorado"; contratoId: string; motivo: MotivoIgnorado };

export interface PlanoDoCnpj {
  cnpj: string;
  /** A passagem mais antiga — a que dá a frase do histórico. */
  primeira: PassagemDoCnpj;
  /** Quem passou com este CNPJ (ordem de chegada). */
  colaboradorIds: string[];
  /** A razão social informada mais recente (ou null). */
  razaoSocial: string | null;
  /** Início da vigência aberta: o menor entre o início do evento e a data de cada passagem. */
  vigenciaInicio: string;
  decisao: DecisaoDoCnpj;
  frase: string;
}

/**
 * Plano por CNPJ, dado o histórico e os contratos de hoje. `hoje` decide se
 * um contrato do DP "vale" (o mesmo critério das telas: contrato ativo na data).
 */
export function planejarAprovacao(passagens: readonly PassagemDoCnpj[], contratos: readonly ContratoParaAprovacao[], hoje: string): PlanoDoCnpj[] {
  const porCnpj = new Map<string, PassagemDoCnpj[]>();
  for (const p of passagens) {
    const d = cnpjOk(p.cnpj);
    if (!d) continue;
    porCnpj.set(d, [...(porCnpj.get(d) ?? []), { ...p, cnpj: d }]);
  }
  const contratoDo = new Map(contratos.map((c) => [digitosDoCnpj(c.cnpj), c]));
  const planos: PlanoDoCnpj[] = [];
  for (const [cnpj, lista] of Array.from(porCnpj.entries())) {
    const ordenadas = [...lista].sort(antes);
    const primeira = ordenadas[0];
    const colaboradorIds = Array.from(new Set(ordenadas.map((p) => p.collaboratorId)));
    const razaoSocial = [...ordenadas].reverse().find((p) => p.razaoSocial)?.razaoSocial ?? null;
    const vigenciaInicio = ordenadas.map((p) => (p.eventoInicio && p.eventoInicio < p.data ? p.eventoInicio : p.data)).sort()[0];
    const c = contratoDo.get(cnpj);
    let decisao: DecisaoDoCnpj;
    if (!c) {
      decisao = { tipo: "criar" };
    } else if (c.encerradoEm) {
      decisao = { tipo: "ignorado", contratoId: c.id, motivo: "encerrado" };
    } else {
      const semDatas = !c.vigenciaInicio && !c.vigenciaFim;
      const vale = contratoVigenteEm(c, hoje);
      if (!semDatas && !vale) {
        decisao = { tipo: "ignorado", contratoId: c.id, motivo: "vigencia_do_dp" };
      } else {
        const vincular = colaboradorIds.filter((id) => !c.colaboradorIds.includes(id));
        decisao = vincular.length === 0 && !semDatas
          ? { tipo: "ja_aprovado", contratoId: c.id }
          : { tipo: "atualizar", contratoId: c.id, vincular, abrirVigencia: semDatas };
      }
    }
    planos.push({ cnpj, primeira, colaboradorIds, razaoSocial, vigenciaInicio, decisao, frase: fraseDaAprovacao(primeira) });
  }
  return planos.sort((a, b) => antes(a.primeira, b.primeira) || a.cnpj.localeCompare(b.cnpj));
}

/** O plano muda algo no banco? */
export const planoGrava = (p: PlanoDoCnpj): boolean => p.decisao.tipo === "criar" || p.decisao.tipo === "atualizar";

/** Contagens da prévia ("Aprovar fornecedores pelo histórico"). */
export function resumoDosPlanos(planos: readonly PlanoDoCnpj[]) {
  const r = { criar: 0, atualizar: 0, jaAprovados: 0, ignorados: 0, total: planos.length };
  for (const p of planos) {
    if (p.decisao.tipo === "criar") r.criar++;
    else if (p.decisao.tipo === "atualizar") r.atualizar++;
    else if (p.decisao.tipo === "ja_aprovado") r.jaAprovados++;
    else r.ignorados++;
  }
  return r;
}

/** Observação gravada no contrato criado automaticamente. */
export function observacaoDoContratoAutomatico(p: PlanoDoCnpj): string {
  return `${p.frase} Confira tipo, razão social e vigência (nasceu como Empresa, desde ${dataBr(p.vigenciaInicio)}, sem fim). Se não deve valer, encerre: contrato encerrado não volta a ser aprovado sozinho.`;
}

/** Linhas do histórico do contrato para o plano aplicado (nomes dos vinculados já resolvidos). */
export function detalhesDoHistorico(p: PlanoDoCnpj, nomes: ReadonlyMap<string, string>, vinculados: readonly string[], abriuVigencia: boolean): string[] {
  const linhas = [p.frase];
  if (p.decisao.tipo === "criar") linhas.push(`Contrato criado com vigência desde ${dataBr(p.vigenciaInicio)}, sem fim (CNPJ ${mascararCnpj(p.cnpj)}).`);
  if (abriuVigencia) linhas.push(`Vigência aberta: desde ${dataBr(p.vigenciaInicio)}, sem fim.`);
  for (const id of vinculados) linhas.push(`Colaborador vinculado automaticamente: ${nomes.get(id) ?? "colaborador"}.`);
  return linhas;
}
