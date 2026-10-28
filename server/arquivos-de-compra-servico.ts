/**
 * Honorários, Fase 3 — ARQUIVOS (28/10): o que as rotas de
 * server/routes/arquivos-de-compra.ts usam.
 *
 *  - Compra de créditos Flash em LOTE: prévia (o que está "a comprar"),
 *    geração do lote numa transação (o mesmo crédito não entra em dois lotes),
 *    lista dos lotes, arquivo do lote (relê o CPF do cadastro), cancelar e
 *    marcar como pago à Flash.
 *  - Arquivo de OC do M4: prestações aprovadas sem OC (por evento ou período)
 *    + uma linha por lote Flash.
 *
 * Os dois arquivos saem pelo formato declarativo de
 * shared/formatos-de-arquivo.ts (layout PROVISÓRIO até o oficial chegar —
 * o TODO único está lá). Regras puras em shared/flash-compras.ts.
 */
import type { Response } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "./db";
import {
  budgetActual as budgetActualTable, collaborators as collaboratorsTable, events as eventsTable, flashCompras, flashMovements,
  type Collaborator, type Event, type FlashCompra, type User,
} from "@shared/schema";
import {
  FLASH_SOURCE_COMPARATIVO, FLASH_SOURCE_MANUAL,
} from "@shared/flash-rules";
import {
  ROTULO_DO_STATUS_DO_LOTE, itemDoLote, loteTemArquivo, montarPreviaDaCompra, podeCancelarLote, podeMarcarLotePago,
  type ColaboradorDaCompra, type CreditoDoFlash, type FiltroDaCompra, type PreviaDaCompra, type StatusDoLoteFlash,
} from "@shared/flash-compras";
import {
  FORMATO_COMPRA_FLASH, FORMATO_OC_M4, FORNECEDOR_FLASH, ROTULO_DO_TIPO_DE_OC, csvDoArquivo, descricaoDaOcDoLoteFlash,
  descricaoDaOcDoPrestador, matrizDoArquivo, nomeDoArquivo, type FormatoDeArquivo, type LinhaDoArquivoDeOc, type LinhaDoArquivoFlash,
} from "@shared/formatos-de-arquivo";
import { cpfDoCadastro, cpfMascarado } from "@shared/presenca";
import { FUSO_DA_OPERACAO, hojeISO } from "@shared/hoje-sp";
import { ehEventoLegado } from "@shared/legado-honorarios";
import { HttpError } from "./http";
import { montar } from "./honorarios-pagamento-servico";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Leitor = Pick<Tx, "select">;

const nomeDe = (u: Pick<User, "name" | "email">) => u.name || u.email || "Usuário";
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const dia = (v: Date | string | null | undefined) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
/** O dia (São Paulo) de um instante — "gerado em" do lote. */
export const diaEmSaoPaulo = (v: Date | string): string => hojeISO(FUSO_DA_OPERACAO, new Date(v));

// ── Envio do arquivo (CSV ou XLSX) ──────────────────────────────────────────

export type ExtensaoDoArquivo = "csv" | "xlsx";
export const extensaoDaQuery = (v: unknown): ExtensaoDoArquivo => (v === "csv" ? "csv" : "xlsx");

/** Monta e envia o arquivo no formato dado (o chamador já auditou). */
export async function enviarArquivo<L>(
  res: Response, formato: FormatoDeArquivo<L>, linhas: readonly L[], complemento: string, extensao: ExtensaoDoArquivo, geradoEm: string,
): Promise<void> {
  const nome = nomeDoArquivo(formato as FormatoDeArquivo<unknown>, complemento, extensao);
  res.set("Cache-Control", "no-store");
  res.set("X-Formato-Do-Arquivo", `${formato.id}${formato.provisorio ? "; provisorio" : ""}`);
  if (extensao === "xlsx") {
    const XLSX = await import("xlsx");
    const planilha = XLSX.utils.aoa_to_sheet(matrizDoArquivo(formato, linhas, geradoEm));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, formato.nomeDaAba.slice(0, 31));
    const buffer: Buffer = XLSX.write(livro, { type: "buffer", bookType: "xlsx" });
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nome}"` });
    res.send(buffer);
    return;
  }
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` });
  res.send(csvDoArquivo(formato, linhas, geradoEm));
}

// ── Compra Flash: leitura dos créditos ──────────────────────────────────────

/** Os créditos "a comprar" do filtro, já filtrados no banco (a regra pura confere de novo). */
async function creditosAComprar(exec: Leitor, f: FiltroDaCompra, travar = false): Promise<CreditoDoFlash[]> {
  const origens = f.incluirManuais ? [FLASH_SOURCE_COMPARATIVO, FLASH_SOURCE_MANUAL] : [FLASH_SOURCE_COMPARATIVO];
  const filtros = [
    isNull(flashMovements.compraId), eq(flashMovements.type, "credito"), inArray(flashMovements.sourceType, origens),
    gte(flashMovements.movementDate, f.inicio), lte(flashMovements.movementDate, f.fim),
  ];
  if (f.eventId) filtros.push(eq(flashMovements.eventId, f.eventId));
  const consulta = exec.select().from(flashMovements).where(and(...filtros));
  // Na geração: trava as linhas — um "Ressincronizar Flash" no meio não muda o valor por baixo.
  const rows = travar ? await consulta.for("update") : await consulta;
  return rows.map((m) => ({
    id: m.id, collaboratorId: m.collaboratorId, eventId: m.eventId, category: m.category, type: m.type, amountCents: m.amountCents,
    movementDate: String(m.movementDate).slice(0, 10), sourceType: m.sourceType, compraId: m.compraId,
  }));
}

async function colaboradoresDaCompra(exec: Leitor, ids: readonly string[]): Promise<Map<string, ColaboradorDaCompra & { cadastro: Collaborator }>> {
  if (ids.length === 0) return new Map();
  const rows = await exec.select().from(collaboratorsTable).where(inArray(collaboratorsTable.id, [...ids]));
  return new Map(rows.map((c) => [c.id, {
    id: c.id, nome: c.fullName, cpf: cpfDoCadastro(c), ativo: c.active !== false && c.status !== "inativo", cadastro: c,
  }]));
}

async function previaNoBanco(exec: Leitor, f: FiltroDaCompra, travar = false): Promise<PreviaDaCompra> {
  const creditos = await creditosAComprar(exec, f, travar);
  const colabs = await colaboradoresDaCompra(exec, Array.from(new Set(creditos.map((c) => c.collaboratorId))));
  return montarPreviaDaCompra(creditos, colabs, f);
}

/** A prévia como a tela recebe: CPF só MASCARADO. */
export async function previaDaCompraParaATela(f: FiltroDaCompra) {
  const p = await previaNoBanco(db, f);
  const proximo = await proximoNumero(db);
  return {
    filtro: f,
    proximoNumero: proximo,
    assinatura: p.assinatura,
    totais: p.totais,
    foraDoLote: p.foraDoLote,
    formato: { id: FORMATO_COMPRA_FLASH.id, nome: FORMATO_COMPRA_FLASH.nome, provisorio: FORMATO_COMPRA_FLASH.provisorio },
    linhas: p.linhas.map((l) => ({
      collaboratorId: l.collaboratorId, nome: l.nome, cpfMascarado: l.cpf ? cpfMascarado(l.cpf) : null, ativo: l.ativo,
      alimentacaoCents: l.alimentacaoCents, mobilidadeCents: l.mobilidadeCents, totalCents: l.totalCents,
      lancamentos: l.lancamentos.length, avisos: l.avisos, entra: l.entra,
    })),
  };
}

async function proximoNumero(exec: Leitor): Promise<number> {
  const [r] = await exec.select({ max: sql<number | null>`max(${flashCompras.numero})` }).from(flashCompras);
  return Number(r?.max ?? 0) + 1;
}

// ── Compra Flash: o lote ────────────────────────────────────────────────────

/**
 * Gera o lote numa transação travada (advisory lock da compra Flash):
 * relê os créditos (travando as linhas), confere a assinatura da prévia, grava
 * o lote e amarra os lançamentos. Dois cliques → o segundo acha a assinatura
 * mudada (os créditos já estão no lote) e recebe 409.
 */
export async function gerarLoteDeCompra(f: FiltroDaCompra, assinatura: string, user: User): Promise<FlashCompra> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('flash:compras'))`);
    const p = await previaNoBanco(tx, f, true);
    if (p.assinatura !== assinatura) {
      throw new HttpError(409, "Os créditos a comprar mudaram desde a prévia (outro lote foi gerado ou o comparativo foi ressincronizado). Confira a prévia de novo.", { codigo: "mudou" });
    }
    const entram = p.linhas.filter((l) => l.entra);
    if (entram.length === 0) throw new HttpError(409, "Não há crédito a comprar neste período.", { codigo: "nada_a_comprar" });
    const numero = await proximoNumero(tx);
    const [lote] = await tx.insert(flashCompras).values({
      numero, periodoInicio: f.inicio, periodoFim: f.fim, eventId: f.eventId || null, incluiManuais: !!f.incluirManuais,
      status: "gerado", formato: FORMATO_COMPRA_FLASH.id, colaboradores: p.totais.colaboradores, lancamentos: p.totais.lancamentos,
      totalAlimentacaoCents: p.totais.alimentacaoCents, totalMobilidadeCents: p.totais.mobilidadeCents, totalCents: p.totais.totalCents,
      itens: entram.map(itemDoLote), geradoPor: user.id, geradoPorNome: nomeDe(user),
    }).returning();
    const ids = entram.flatMap((l) => l.lancamentos);
    let amarrados = 0;
    for (let i = 0; i < ids.length; i += 1000) {
      const r = await tx.update(flashMovements).set({ compraId: lote.id })
        .where(and(inArray(flashMovements.id, ids.slice(i, i + 1000)), isNull(flashMovements.compraId)))
        .returning({ id: flashMovements.id });
      amarrados += r.length;
    }
    if (amarrados !== ids.length) {
      throw new HttpError(409, "Algum crédito entrou em outro lote no meio da geração. Confira a prévia de novo.", { codigo: "mudou" });
    }
    return lote;
  });
}

export async function lerLote(id: string): Promise<FlashCompra | null> {
  const [l] = await db.select().from(flashCompras).where(eq(flashCompras.id, id));
  return l ?? null;
}

/** O lote como a tela recebe (sem os itens; com a divergência, se houver). */
export function loteParaATela(l: FlashCompra, ctx: { eventos: Map<string, Event>; atuais: Map<string, { total: number; n: number }>; hoje: string }) {
  const status = l.status as StatusDoLoteFlash;
  const atual = ctx.atuais.get(l.id) ?? { total: 0, n: 0 };
  // Os créditos amarrados mudaram depois da compra (comparativo ressincronizado
  // ou reaberto)? O arquivo continua o que foi comprado; a tela avisa.
  const divergencia = status !== "cancelado" && (atual.total !== l.totalCents || atual.n !== l.lancamentos)
    ? { totalAtualCents: atual.total, lancamentosAtuais: atual.n }
    : null;
  const evento = l.eventId ? ctx.eventos.get(l.eventId) : undefined;
  return {
    id: l.id, numero: l.numero, periodoInicio: dia(l.periodoInicio)!, periodoFim: dia(l.periodoFim)!,
    evento: l.eventId ? { id: l.eventId, nome: evento?.name ?? "Evento removido" } : null,
    incluiManuais: l.incluiManuais, status, rotuloDoStatus: ROTULO_DO_STATUS_DO_LOTE[status] ?? l.status,
    formato: l.formato, colaboradores: l.colaboradores, lancamentos: l.lancamentos,
    totalAlimentacaoCents: l.totalAlimentacaoCents, totalMobilidadeCents: l.totalMobilidadeCents, totalCents: l.totalCents,
    geradoPorNome: l.geradoPorNome, geradoEm: iso(l.geradoEm)!, pagoEm: dia(l.pagoEm),
    cancelamento: l.canceladoEm ? { em: iso(l.canceladoEm)!, porNome: l.canceladoPorNome, motivo: l.motivoCancelamento } : null,
    divergencia,
    acoes: {
      baixar: loteTemArquivo(l),
      cancelar: podeCancelarLote(l).ok,
      marcarPago: podeMarcarLotePago(l, ctx.hoje, ctx.hoje).ok,
    },
  };
}
export type LoteParaATela = ReturnType<typeof loteParaATela>;

export async function lotesParaATela(lotes: readonly FlashCompra[]): Promise<LoteParaATela[]> {
  if (lotes.length === 0) return [];
  const ids = lotes.map((l) => l.id);
  const eventIds = Array.from(new Set(lotes.map((l) => l.eventId).filter((v): v is string => !!v)));
  const [somas, eventos] = await Promise.all([
    db.select({ compraId: flashMovements.compraId, total: sql<number>`coalesce(sum(${flashMovements.amountCents}), 0)`, n: sql<number>`count(*)` })
      .from(flashMovements).where(inArray(flashMovements.compraId, ids)).groupBy(flashMovements.compraId),
    eventIds.length ? db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds)) : Promise.resolve([] as Event[]),
  ]);
  const atuais = new Map(somas.map((s) => [s.compraId!, { total: Number(s.total), n: Number(s.n) }]));
  const ctx = { eventos: new Map(eventos.map((e) => [e.id, e])), atuais, hoje: hojeISO() };
  return lotes.map((l) => loteParaATela(l, ctx));
}

/** Os lotes, do mais novo para o mais velho (até 300 — a tela pagina pelo período depois, se crescer). */
export async function listarLotes(): Promise<LoteParaATela[]> {
  const lotes = await db.select().from(flashCompras).orderBy(desc(flashCompras.numero)).limit(300);
  return lotesParaATela(lotes);
}

/** As linhas do arquivo do lote — a fotografia gravada + o CPF ATUAL do cadastro. */
export async function linhasDoArquivoDoLote(l: FlashCompra): Promise<LinhaDoArquivoFlash[]> {
  const colabs = await colaboradoresDaCompra(db, l.itens.map((i) => i.collaboratorId));
  return l.itens.map((i) => ({
    cpf: colabs.get(i.collaboratorId)?.cpf ?? "", nome: colabs.get(i.collaboratorId)?.nome ?? i.nome,
    alimentacaoCents: i.alimentacaoCents, mobilidadeCents: i.mobilidadeCents, totalCents: i.totalCents, lote: l.numero,
  }));
}

/** Cancela (com motivo) e devolve os créditos para "a comprar". */
export async function cancelarLote(id: string, motivo: string, user: User): Promise<{ antes: FlashCompra; depois: FlashCompra; soltos: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('flash:compras'))`);
    const [antes] = await tx.select().from(flashCompras).where(eq(flashCompras.id, id)).for("update");
    const pode = podeCancelarLote(antes);
    if (!pode.ok) throw new HttpError(pode.codigo === "nao_encontrado" ? 404 : 409, pode.motivo, { codigo: pode.codigo });
    const [depois] = await tx.update(flashCompras).set({
      status: "cancelado", canceladoEm: new Date(), canceladoPor: user.id, canceladoPorNome: nomeDe(user), motivoCancelamento: motivo,
    }).where(and(eq(flashCompras.id, id), eq(flashCompras.status, "gerado"))).returning();
    if (!depois) throw new HttpError(409, "O lote mudou enquanto você cancelava. Atualize a lista.", { codigo: "mudou" });
    const soltos = await tx.update(flashMovements).set({ compraId: null }).where(eq(flashMovements.compraId, id)).returning({ id: flashMovements.id });
    return { antes, depois, soltos: soltos.length };
  });
}

/** Marca como pago à Flash (data do pagamento). */
export async function marcarLotePago(id: string, pagoEm: string, user: User): Promise<{ antes: FlashCompra; depois: FlashCompra }> {
  const antes = await lerLote(id);
  const pode = podeMarcarLotePago(antes, pagoEm, hojeISO());
  if (!pode.ok) throw new HttpError(pode.codigo === "nao_encontrado" ? 404 : pode.codigo.startsWith("data") ? 400 : 409, pode.motivo, { codigo: pode.codigo });
  const [depois] = await db.update(flashCompras).set({ status: "pago", pagoEm, pagoRegistradoPor: user.id, pagoRegistradoEm: new Date() })
    .where(and(eq(flashCompras.id, id), eq(flashCompras.status, "gerado"))).returning();
  if (!depois) throw new HttpError(409, "O lote mudou enquanto você marcava. Atualize a lista.", { codigo: "mudou" });
  return { antes: antes!, depois };
}

/** O lote (não cancelado) em que um lançamento manual entrou — editar/excluir fica bloqueado. */
export async function loteVivoDoLancamento(compraId: string | null | undefined): Promise<FlashCompra | null> {
  if (!compraId) return null;
  const l = await lerLote(compraId);
  return l && l.status !== "cancelado" ? l : null;
}

// ── Arquivo de OC do M4 (prestadores + Flash) ───────────────────────────────

export type EscopoDoArquivoDeOc = { tipo: "evento"; evento: Event } | { tipo: "periodo"; inicio: string; fim: string };

export interface ArquivoDeOcMontado {
  linhas: LinhaDoArquivoDeOc[];
  prestadores: { linhas: number; valorCents: number; semCnpj: number; eventos: number };
  flash: { lotes: Array<{ id: string; numero: number; totalCents: number; status: string }>; valorCents: number };
  totalCents: number;
  /** eventos do período que são do fluxo antigo (ficam de fora) */
  legadosIgnorados: number;
}

const EVENTO_FORA = ["cancelado", "excluído", "excluido"];

/** Prestações aprovadas sem OC (e que emitem NF) do escopo + os lotes Flash, já como linhas do arquivo. */
export async function montarArquivoDeOc(escopo: EscopoDoArquivoDeOc, dataDeCorte: string): Promise<ArquivoDeOcMontado> {
  let eventos: Event[];
  let legadosIgnorados = 0;
  if (escopo.tipo === "evento") {
    eventos = [escopo.evento];
  } else {
    const doPeriodo = await db.select().from(eventsTable).where(and(gte(eventsTable.endDate, escopo.inicio), lte(eventsTable.endDate, escopo.fim)));
    const vivos = doPeriodo.filter((e) => !EVENTO_FORA.includes(e.status));
    eventos = vivos.filter((e) => !ehEventoLegado(e.endDate, dataDeCorte));
    legadosIgnorados = vivos.length - eventos.length;
  }
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const actuals = eventos.length
    ? await db.select().from(budgetActualTable).where(and(
      inArray(budgetActualTable.eventId, eventos.map((e) => e.id)), isNull(budgetActualTable.splitParentId), eq(budgetActualTable.didNotAttend, false),
      eq(budgetActualTable.rhStatus, "aprovado"), isNull(budgetActualTable.ocNumero),
    ))
    : [];
  const semOc = (await montar(actuals)).filter((m) => m.emiteNf);
  semOc.sort((a, b) => {
    const ea = eventoPorId.get(a.actual.eventId), eb = eventoPorId.get(b.actual.eventId);
    return (ea?.endDate ?? "").localeCompare(eb?.endDate ?? "") || (ea?.name ?? "").localeCompare(eb?.name ?? "", "pt-BR")
      || (a.colaborador?.fullName ?? "").localeCompare(b.colaborador?.fullName ?? "", "pt-BR");
  });
  const linhas: LinhaDoArquivoDeOc[] = semOc.map((m) => {
    const e = eventoPorId.get(m.actual.eventId);
    return {
      tipo: ROTULO_DO_TIPO_DE_OC.prestador, cnpj: m.cnpj.digitos ?? "", razaoSocial: m.cnpj.razaoSocial ?? "", valorCents: m.actual.totalValue,
      centroDeCusto: m.funcao.centroDeCusto ?? "", evento: e?.name ?? "", data: dia(e?.endDate) ?? "", funcao: m.funcao.nome ?? "",
      descricao: descricaoDaOcDoPrestador({ funcao: m.funcao.nome, evento: e?.name ?? "", inicio: dia(e?.startDate), fim: dia(e?.endDate) }),
      referencia: m.actual.id,
    };
  });
  const prestadores = {
    linhas: linhas.length, valorCents: linhas.reduce((s, l) => s + l.valorCents, 0),
    semCnpj: semOc.filter((m) => !m.cnpj.digitos).length, eventos: new Set(semOc.map((m) => m.actual.eventId)).size,
  };

  // Lotes Flash: do evento (escopo evento) ou GERADOS no período (escopo período) — um lote cai em um período só.
  const lotes = escopo.tipo === "evento"
    ? await db.select().from(flashCompras).where(and(eq(flashCompras.eventId, escopo.evento.id), ne(flashCompras.status, "cancelado"))).orderBy(flashCompras.numero)
    : (await db.select().from(flashCompras).where(ne(flashCompras.status, "cancelado")).orderBy(flashCompras.numero))
      .filter((l) => { const d = diaEmSaoPaulo(l.geradoEm); return d >= escopo.inicio && d <= escopo.fim; });
  const nomesDosEventosDosLotes = new Map<string, string>();
  const faltam = Array.from(new Set(lotes.map((l) => l.eventId).filter((v): v is string => !!v && !eventoPorId.has(v))));
  if (faltam.length) for (const e of await db.select().from(eventsTable).where(inArray(eventsTable.id, faltam))) nomesDosEventosDosLotes.set(e.id, e.name);
  for (const l of lotes) {
    const nomeDoEvento = l.eventId ? eventoPorId.get(l.eventId)?.name ?? nomesDosEventosDosLotes.get(l.eventId) ?? "" : "";
    linhas.push({
      tipo: ROTULO_DO_TIPO_DE_OC.flash, cnpj: FORNECEDOR_FLASH.cnpj, razaoSocial: FORNECEDOR_FLASH.razaoSocial, valorCents: l.totalCents,
      centroDeCusto: "", evento: nomeDoEvento, data: diaEmSaoPaulo(l.geradoEm), funcao: "",
      descricao: descricaoDaOcDoLoteFlash({ numero: l.numero, inicio: dia(l.periodoInicio), fim: dia(l.periodoFim), evento: nomeDoEvento || null }),
      referencia: `Lote ${l.numero}`,
    });
  }
  const flash = {
    lotes: lotes.map((l) => ({ id: l.id, numero: l.numero, totalCents: l.totalCents, status: l.status })),
    valorCents: lotes.reduce((s, l) => s + l.totalCents, 0),
  };
  return { linhas, prestadores, flash, totalCents: prestadores.valorCents + flash.valorCents, legadosIgnorados };
}

export const formatoDoArquivoDeOc = () => ({
  id: FORMATO_OC_M4.id, nome: FORMATO_OC_M4.nome, provisorio: FORMATO_OC_M4.provisorio,
  colunas: FORMATO_OC_M4.colunas.map((c) => c.titulo), cnpjDaFlashConfigurado: !!FORNECEDOR_FLASH.cnpj,
});
