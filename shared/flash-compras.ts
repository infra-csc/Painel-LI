/**
 * Compra de créditos Flash em LOTE (28/10, Honorários — Fase 3, arquivos).
 *
 * O DP escolhe um período (e, se quiser, um evento) e o app junta, por
 * colaborador, os créditos de alimentação e mobilidade da Conta Corrente
 * Flash que AINDA NÃO entraram em nenhuma compra. Gerar o arquivo grava o
 * LOTE (`flash_compras`) e amarra cada lançamento a ele
 * (`flash_movements.compra_id`): o mesmo crédito não entra em dois lotes.
 * Cancelar o lote (com motivo, só antes de "pago à Flash") devolve os
 * créditos para "a comprar".
 *
 * O que entra:
 *  - só CRÉDITO (débito é gasto, não compra) de alimentação ou mobilidade;
 *  - os automáticos do comparativo (`source_type = 'comparativo'`) sempre; os
 *    manuais (crédito inicial da admissão, ajustes) só com "incluir manuais"
 *    — muitos já foram comprados fora do app antes deste módulo; o legado
 *    'oc' nunca (congelado desde 19/08);
 *  - data do lançamento dentro do período; evento, quando escolhido.
 *
 * Avisos por colaborador: sem CPF e valor zero BLOQUEIAM a linha (fica fora
 * do lote e continua "a comprar" — a Flash não credita sem CPF); colaborador
 * inativo só AVISA (o crédito é devido; o DP decide na Flash).
 *
 * Funções puras — servidor, tela e testes.
 */
import { FLASH_SOURCE_COMPARATIVO, FLASH_SOURCE_MANUAL } from "./flash-rules";
import { lerDataDaPlanilha } from "./importacao-contratos";

export const STATUS_DO_LOTE_FLASH = ["gerado", "pago", "cancelado"] as const;
export type StatusDoLoteFlash = (typeof STATUS_DO_LOTE_FLASH)[number];
export const ROTULO_DO_STATUS_DO_LOTE: Record<StatusDoLoteFlash, string> = {
  gerado: "Gerado — a pagar à Flash",
  pago: "Pago à Flash",
  cancelado: "Cancelado",
};

/** Período máximo de uma compra (um ano e um dia — cobre "o ano todo"). */
export const PERIODO_MAXIMO_DIAS = 366;
export const MOTIVO_DO_CANCELAMENTO_MIN = 5;
export const MOTIVO_DO_CANCELAMENTO_MAX = 1000;

/** O lançamento do Flash como a compra o enxerga. */
export interface CreditoDoFlash {
  id: string;
  collaboratorId: string;
  eventId?: string | null;
  category: string;
  type: string;
  amountCents: number;
  movementDate: string;
  sourceType?: string | null;
  compraId?: string | null;
}

export interface FiltroDaCompra {
  inicio: string;
  fim: string;
  eventId?: string | null;
  incluirManuais?: boolean;
}

/** O colaborador como a prévia precisa. */
export interface ColaboradorDaCompra {
  id: string;
  nome: string;
  /** Só dígitos, ou null quando o cadastro não tem CPF. */
  cpf: string | null;
  ativo: boolean;
}

export type CodigoDoAviso = "sem_cpf" | "valor_zero" | "inativo";
export interface AvisoDaCompra { codigo: CodigoDoAviso; texto: string; bloqueia: boolean }

export const AVISOS_DA_COMPRA: Record<CodigoDoAviso, AvisoDaCompra> = {
  sem_cpf: { codigo: "sem_cpf", texto: "Sem CPF no cadastro — fica fora do lote", bloqueia: true },
  valor_zero: { codigo: "valor_zero", texto: "Valor zero — fica fora do lote", bloqueia: true },
  inativo: { codigo: "inativo", texto: "Colaborador inativo", bloqueia: false },
};

export interface LinhaDaPreviaDaCompra {
  collaboratorId: string;
  nome: string;
  /** Só dígitos — o servidor NUNCA devolve este campo para a tela (só o mascarado). */
  cpf: string | null;
  ativo: boolean;
  alimentacaoCents: number;
  mobilidadeCents: number;
  totalCents: number;
  /** ids dos lançamentos somados nesta linha */
  lancamentos: string[];
  avisos: AvisoDaCompra[];
  /** false = algum aviso bloqueia: fica fora do lote */
  entra: boolean;
}

export interface TotaisDaCompra {
  colaboradores: number;
  lancamentos: number;
  alimentacaoCents: number;
  mobilidadeCents: number;
  totalCents: number;
}

export interface PreviaDaCompra {
  linhas: LinhaDaPreviaDaCompra[];
  /** só das linhas que ENTRAM no lote */
  totais: TotaisDaCompra;
  /** as que ficam fora (sem CPF / valor zero) */
  foraDoLote: TotaisDaCompra;
  /** muda se qualquer lançamento do lote mudar (id ou valor) — a geração confere */
  assinatura: string;
}

/** Erro do período (AAAA-MM-DD, início ≤ fim, até 366 dias) ou null. */
export function erroDoPeriodo(inicio: unknown, fim: unknown): string | null {
  const ok = (v: unknown) => {
    if (typeof v !== "string") return false;
    const r = lerDataDaPlanilha(v);
    return !("erro" in r) && r.data === v;
  };
  if (!ok(inicio) || !ok(fim)) return "Informe o período (datas AAAA-MM-DD).";
  if ((inicio as string) > (fim as string)) return "O início do período tem que ser antes do fim.";
  const dias = (Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000;
  if (dias > PERIODO_MAXIMO_DIAS) return `O período tem no máximo ${PERIODO_MAXIMO_DIAS} dias.`;
  return null;
}

/** O lançamento entra na compra deste filtro? */
export function creditoEntraNaCompra(m: CreditoDoFlash, f: FiltroDaCompra): boolean {
  if (m.compraId) return false;
  if (m.type !== "credito") return false;
  if (m.category !== "alimentacao" && m.category !== "mobilidade") return false;
  const origem = m.sourceType ?? FLASH_SOURCE_MANUAL;
  if (origem !== FLASH_SOURCE_COMPARATIVO && !(f.incluirManuais && origem === FLASH_SOURCE_MANUAL)) return false;
  const dia = String(m.movementDate).slice(0, 10);
  if (dia < f.inicio || dia > f.fim) return false;
  if (f.eventId && m.eventId !== f.eventId) return false;
  return true;
}

/** FNV-1a de 32 bits em hex — curto e estável (não é segurança, é "mudou?"). */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Assinatura do conjunto (id:valor ordenado) — a prévia e a geração têm que bater. */
export function assinaturaDaCompra(lancamentos: ReadonlyArray<{ id: string; amountCents: number }>): string {
  const partes = lancamentos.map((m) => `${m.id}:${m.amountCents}`).sort();
  return `${partes.length}-${fnv1a(partes.join("|"))}`;
}

const totaisVazios = (): TotaisDaCompra => ({ colaboradores: 0, lancamentos: 0, alimentacaoCents: 0, mobilidadeCents: 0, totalCents: 0 });

/**
 * A prévia por colaborador: soma os créditos que entram (filtro), marca os
 * avisos e separa o que entra do que fica fora. Ordem: nome (pt-BR).
 */
export function montarPreviaDaCompra(
  creditos: readonly CreditoDoFlash[],
  colaboradores: ReadonlyMap<string, ColaboradorDaCompra>,
  f: FiltroDaCompra,
): PreviaDaCompra {
  const porColab = new Map<string, LinhaDaPreviaDaCompra>();
  for (const m of creditos) {
    if (!creditoEntraNaCompra(m, f)) continue;
    let l = porColab.get(m.collaboratorId);
    if (!l) {
      const c = colaboradores.get(m.collaboratorId);
      l = {
        collaboratorId: m.collaboratorId, nome: c?.nome ?? "Colaborador não encontrado", cpf: c?.cpf ?? null, ativo: c?.ativo ?? false,
        alimentacaoCents: 0, mobilidadeCents: 0, totalCents: 0, lancamentos: [], avisos: [], entra: true,
      };
      porColab.set(m.collaboratorId, l);
    }
    const v = Math.max(0, Math.round(m.amountCents || 0));
    if (m.category === "alimentacao") l.alimentacaoCents += v;
    else l.mobilidadeCents += v;
    l.totalCents += v;
    l.lancamentos.push(m.id);
  }
  const linhas = Array.from(porColab.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const totais = totaisVazios();
  const foraDoLote = totaisVazios();
  const entram: Array<{ id: string; amountCents: number }> = [];
  const valorPorId = new Map(creditos.map((m) => [m.id, Math.max(0, Math.round(m.amountCents || 0))]));
  for (const l of linhas) {
    if (!l.cpf) l.avisos.push(AVISOS_DA_COMPRA.sem_cpf);
    if (l.totalCents <= 0) l.avisos.push(AVISOS_DA_COMPRA.valor_zero);
    if (!l.ativo) l.avisos.push(AVISOS_DA_COMPRA.inativo);
    l.entra = !l.avisos.some((a) => a.bloqueia);
    const t = l.entra ? totais : foraDoLote;
    t.colaboradores += 1;
    t.lancamentos += l.lancamentos.length;
    t.alimentacaoCents += l.alimentacaoCents;
    t.mobilidadeCents += l.mobilidadeCents;
    t.totalCents += l.totalCents;
    if (l.entra) for (const id of l.lancamentos) entram.push({ id, amountCents: valorPorId.get(id) ?? 0 });
  }
  return { linhas, totais, foraDoLote, assinatura: assinaturaDaCompra(entram) };
}

/** O item do lote gravado (sem CPF — o arquivo relê o CPF do cadastro). */
export interface ItemDoLoteFlash {
  collaboratorId: string;
  nome: string;
  alimentacaoCents: number;
  mobilidadeCents: number;
  totalCents: number;
  lancamentos: string[];
  inativo?: boolean;
}

export const itemDoLote = (l: LinhaDaPreviaDaCompra): ItemDoLoteFlash => ({
  collaboratorId: l.collaboratorId, nome: l.nome, alimentacaoCents: l.alimentacaoCents, mobilidadeCents: l.mobilidadeCents,
  totalCents: l.totalCents, lancamentos: [...l.lancamentos], ...(l.ativo ? {} : { inativo: true }),
});

export type PermissaoDoLote = { ok: true } | { ok: false; codigo: string; motivo: string };

/** Cancelar: só lote gerado (o pago à Flash não volta; o cancelado já voltou). */
export function podeCancelarLote(lote: { status: string } | null | undefined): PermissaoDoLote {
  if (!lote) return { ok: false, codigo: "nao_encontrado", motivo: "Lote não encontrado." };
  if (lote.status === "pago") return { ok: false, codigo: "lote_pago", motivo: "Este lote já foi pago à Flash — não dá para cancelar." };
  if (lote.status === "cancelado") return { ok: false, codigo: "lote_cancelado", motivo: "Este lote já foi cancelado." };
  return { ok: true };
}

/** Marcar como pago à Flash: só lote gerado, data real e não no futuro. */
export function podeMarcarLotePago(lote: { status: string } | null | undefined, pagoEm: unknown, hoje: string): PermissaoDoLote {
  if (!lote) return { ok: false, codigo: "nao_encontrado", motivo: "Lote não encontrado." };
  if (lote.status === "pago") return { ok: false, codigo: "lote_pago", motivo: "Este lote já está marcado como pago à Flash." };
  if (lote.status === "cancelado") return { ok: false, codigo: "lote_cancelado", motivo: "Lote cancelado não é pago." };
  if (typeof pagoEm !== "string" || erroDoPeriodo(pagoEm, pagoEm)) return { ok: false, codigo: "data_invalida", motivo: "Informe a data do pagamento (AAAA-MM-DD)." };
  if (pagoEm > hoje) return { ok: false, codigo: "data_futura", motivo: "A data do pagamento não pode ser no futuro." };
  return { ok: true };
}

/** Baixar de novo: lote cancelado não tem arquivo (os créditos voltaram para "a comprar"). */
export const loteTemArquivo = (lote: { status: string }): boolean => lote.status !== "cancelado";

/** "Lote 12 · 01/10 a 31/10/2026". */
export function rotuloDoLote(l: { numero: number; periodoInicio: string; periodoFim: string }): string {
  const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const periodo = l.periodoInicio === l.periodoFim
    ? `${d(l.periodoInicio)}/${l.periodoInicio.slice(0, 4)}`
    : `${d(l.periodoInicio)} a ${d(l.periodoFim)}/${l.periodoFim.slice(0, 4)}`;
  return `Lote ${l.numero} · ${periodo}`;
}
