/**
 * Fornecedor aprovado automaticamente pelo histórico (28/10) — o que lê o
 * banco e aplica a regra pura de shared/fornecedor-automatico.ts.
 *
 *  - `reconhecerFornecedores({ actualIds, invoiceIds }, ator, req)`: chamado
 *    DEPOIS de aprovar a nota fiscal e marcar o pagamento (28/10, R6: a OC
 *    registrada não aprova mais). Idempotente e à prova de falha: um erro aqui não
 *    desfaz a ação principal (fica no log do servidor; a varredura recupera);
 *  - `aprovarPeloHistorico({ simular }, ator, req)`: a varredura única do
 *    passado (POST /api/contratos/aprovacao-automatica[?simular=1]).
 *
 * Auditoria: uma linha por contrato criado/atualizado (CNPJ mascarado, razão
 * social, evento, gatilho, nomes dos vinculados) — sem CPF e sem dado bancário.
 */
import type { Request } from "express";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { budgetActual, invoices, presencaConfirmacoes, type BudgetActual, type Event, type Invoice } from "@shared/schema";
import {
  AUTOR_DA_APROVACAO_AUTOMATICA, GATILHO_DA_APROVACAO_LABEL, MOTIVO_IGNORADO_LABEL, MOTIVO_PENDENTE_LABEL, RAZAO_SOCIAL_NAO_INFORMADA, cnpjDaPrestacao,
  passagemDaNota, passagensDaPrestacao, planejarAprovacao, planoGrava, resumoDosPlanos, type PassagemDoCnpj, type PlanoDoCnpj,
} from "@shared/fornecedor-automatico";
import { mascararCnpj } from "@shared/cnpj";
import { hojeISO } from "@shared/hoje-sp";
import { aplicarAprovacaoAutomatica, contratosParaAprovacao, nomesDosColaboradores, type Autor } from "./storage/contratos";
import { createAuditLog } from "./routes/_compartilhado";

// ── Leitura do histórico ────────────────────────────────────────────────────

type Filtro = { actualIds?: readonly string[]; invoiceIds?: readonly string[] } | "tudo";

/**
 * As passagens de CNPJ do histórico. "tudo" = toda prestação PAGA e toda nota
 * aprovada (inclusive do fluxo antigo — conta quando há CNPJ). 28/10 (R6): a
 * OC registrada não entra.
 */
export async function carregarPassagens(filtro: Filtro): Promise<PassagemDoCnpj[]> {
  const tudo = filtro === "tudo";
  const actualIds = tudo ? [] : Array.from(new Set(filtro.actualIds ?? []));
  const invoiceIds = tudo ? [] : Array.from(new Set(filtro.invoiceIds ?? []));
  if (!tudo && actualIds.length === 0 && invoiceIds.length === 0) return [];

  const notas: Invoice[] = tudo
    ? await db.select().from(invoices).where(eq(invoices.status, "aprovada"))
    : await db.select().from(invoices).where(and(eq(invoices.status, "aprovada"), or(
      actualIds.length ? inArray(invoices.budgetActualId, actualIds) : undefined,
      invoiceIds.length ? inArray(invoices.id, invoiceIds) : undefined,
    )));
  const pagas: BudgetActual[] = tudo
    ? await db.select().from(budgetActual).where(isNotNull(budgetActual.pagoEm))
    : actualIds.length ? await db.select().from(budgetActual).where(inArray(budgetActual.id, actualIds)) : [];
  // As prestações das notas (para o CNPJ do check-out final / da confirmação).
  const jaLidas = new Set(pagas.map((a) => a.id));
  const faltam = Array.from(new Set(notas.map((n) => n.budgetActualId).filter((v): v is string => !!v && !jaLidas.has(v))));
  const dasNotas = faltam.length ? await db.select().from(budgetActual).where(inArray(budgetActual.id, faltam)) : [];
  const actuals = [...pagas, ...dasNotas];
  const confirmacoes = actuals.length
    ? await db.select({ actualId: presencaConfirmacoes.actualId, cnpj: presencaConfirmacoes.cnpj, razaoSocial: presencaConfirmacoes.razaoSocial })
      .from(presencaConfirmacoes).where(inArray(presencaConfirmacoes.actualId, actuals.map((a) => a.id)))
    : [];
  const confirmacaoDe = new Map(confirmacoes.map((c) => [c.actualId, c]));
  const eventoIds = Array.from(new Set([...actuals.map((a) => a.eventId), ...notas.map((n) => n.eventId)]));
  const eventos = new Map<string, Event>((eventoIds.length ? await storage.getEventsByIds(eventoIds) : []).map((e) => [e.id, e]));
  const eventoDa = (id: string) => {
    const e = eventos.get(id);
    return { id, nome: e?.name ?? "evento", inicio: e?.startDate ? String(e.startDate).slice(0, 10) : null };
  };

  const actualPorId = new Map(actuals.map((a) => [a.id, a]));
  const cnpjDe = (a: BudgetActual | undefined) => {
    if (!a) return { cnpj: null, razaoSocial: null };
    const conf = confirmacaoDe.get(a.id);
    const doCheckout = cnpjDaPrestacao(a.cnpjEmissor, null);
    if (doCheckout) return { cnpj: doCheckout, razaoSocial: a.razaoSocialEmissor };
    return { cnpj: cnpjDaPrestacao(null, conf?.cnpj), razaoSocial: conf?.razaoSocial ?? null };
  };

  const passagens: PassagemDoCnpj[] = [];
  for (const a of pagas) {
    const { cnpj, razaoSocial } = cnpjDe(a);
    passagens.push(...passagensDaPrestacao({ collaboratorId: a.collaboratorId, evento: eventoDa(a.eventId), cnpj, razaoSocial, pagoEm: a.pagoEm }));
  }
  for (const n of notas) {
    const daPrestacao = n.budgetActualId ? cnpjDe(actualPorId.get(n.budgetActualId)) : { cnpj: null, razaoSocial: null };
    const p = passagemDaNota({
      collaboratorId: n.collaboratorId, evento: eventoDa(n.eventId), status: n.status, nfCnpj: n.nfCnpj,
      cnpjDaPrestacao: daPrestacao.cnpj, razaoSocial: daPrestacao.razaoSocial, aprovadaEm: n.approvedAt, atualizadaEm: n.updatedAt,
    });
    if (p) passagens.push(p);
  }
  return passagens;
}

// ── Aplicação ───────────────────────────────────────────────────────────────

export interface ItemDaAprovacao {
  cnpj: string;
  razaoSocial: string;
  contratoId: string | null;
  decisao: PlanoDoCnpj["decisao"]["tipo"];
  /** O que muda (criar, abrir vigência), por que foi ignorado ou a pendência do DP. */
  descricao: string;
  frase: string;
  evento: string;
  data: string;
  gatilho: string;
  colaboradores: { id: string; nome: string }[];
  /** 28/10 (S1): quem passou com o CNPJ e NÃO foi vinculado — o DP decide à mão. */
  pendentes: { id: string; nome: string }[];
}

const listaDeNomes = (ns: readonly string[]) => (ns.length <= 1 ? ns.join("") : `${ns.slice(0, -1).join(", ")} e ${ns[ns.length - 1]}`);

function descricaoDoPlano(p: PlanoDoCnpj, nomes: ReadonlyMap<string, string>): string {
  const d = p.decisao;
  const nomesDe = (ids: readonly string[]) => listaDeNomes(ids.map((id) => nomes.get(id) ?? "colaborador"));
  // 28/10 (S1): quem passou e não entra sozinho no contrato — pendência do DP.
  const um = p.pendentes.length === 1;
  const pendencia = p.pendentes.length
    ? ` CNPJ já é de outro contrato: ${nomesDe(p.pendentes)} ${um ? "passou" : "passaram"} com ele e não ${um ? "foi vinculado" : "foram vinculados"} — se for a mesma empresa, vincule à mão em Contratos.`
    : "";
  if (d.tipo === "criar") return `Cria o contrato (vigência aberta) e vincula ${nomesDe(d.vincular)}.${pendencia}`;
  if (d.tipo === "atualizar") {
    const partes = [
      d.abrirVigencia ? "abre a vigência do contrato sem datas" : null,
      d.vincular.length ? `vincula ${nomesDe(d.vincular)}` : null,
    ].filter(Boolean).join(" e ");
    return `${partes.charAt(0).toUpperCase()}${partes.slice(1)}.${pendencia}`;
  }
  if (d.tipo === "ignorado") return MOTIVO_IGNORADO_LABEL[d.motivo];
  if (d.tipo === "pendente") return `${MOTIVO_PENDENTE_LABEL[d.motivo]} ${nomesDe(p.pendentes)} ${um ? "passou" : "passaram"} com este CNPJ e não ${um ? "está" : "estão"} no contrato.`;
  const donos = p.colaboradorIds.filter((id) => !p.pendentes.includes(id));
  return p.pendentes.length ? `Contrato ativo de ${nomesDe(donos)}.${pendencia}` : "Já tem contrato ativo com quem passou.";
}

async function auditar(r: NonNullable<Awaited<ReturnType<typeof aplicarAprovacaoAutomatica>>>, ator: Autor, origem: string, req?: Request) {
  if (r.feito === "nada" || !r.contratoId) return;
  const p = r.plano;
  await createAuditLog(r.feito === "criado" ? "create" : "update", "contrato", r.contratoId, {
    acao: r.feito === "criado" ? "Fornecedor aprovado automaticamente (contrato criado)" : "Fornecedor aprovado automaticamente (contrato atualizado)",
    origem, frase: p.frase, cnpj: mascararCnpj(p.cnpj), razaoSocial: p.razaoSocial ?? RAZAO_SOCIAL_NAO_INFORMADA,
    evento: p.primeira.eventoNome, data: p.primeira.data, gatilho: GATILHO_DA_APROVACAO_LABEL[p.primeira.gatilho],
    vigenciaAberta: r.feito === "criado" || r.abriuVigencia ? `desde ${p.vigenciaInicio}, sem fim` : null,
    colaboradoresVinculados: r.vinculados.map((id) => r.nomes.get(id) ?? id).join(", "),
  }, ator.id, `${AUTOR_DA_APROVACAO_AUTOMATICA} · ${ator.name}`, undefined, req);
}

async function aplicar(passagens: readonly PassagemDoCnpj[], ator: Autor, origem: string, req?: Request) {
  const hoje = hojeISO();
  const porCnpj = new Map<string, PassagemDoCnpj[]>();
  for (const p of passagens) porCnpj.set(p.cnpj, [...(porCnpj.get(p.cnpj) ?? []), p]);
  const feitos: NonNullable<Awaited<ReturnType<typeof aplicarAprovacaoAutomatica>>>[] = [];
  for (const lista of Array.from(porCnpj.values())) {
    const r = await aplicarAprovacaoAutomatica(lista, hoje, ator);
    if (!r) continue;
    await auditar(r, ator, origem, req);
    feitos.push(r);
  }
  return feitos;
}

/**
 * Gatilho na hora (nota aprovada, pagamento marcado — 28/10, R6: a OC não).
 * Nunca lança: a ação principal já foi gravada.
 */
export async function reconhecerFornecedores(
  alvo: { actualIds?: readonly string[]; invoiceIds?: readonly string[] }, ator: Autor, origem: string, req?: Request,
): Promise<number> {
  try {
    const passagens = await carregarPassagens(alvo);
    if (passagens.length === 0) return 0;
    // Atalho: nada a fazer quando todos os CNPJs já estão aprovados para quem passou.
    const planos = planejarAprovacao(passagens, await contratosParaAprovacao(passagens.map((p) => p.cnpj)), hojeISO());
    const gravar = new Set(planos.filter(planoGrava).map((p) => p.cnpj));
    if (gravar.size === 0) return 0;
    const feitos = await aplicar(passagens.filter((p) => gravar.has(p.cnpj)), ator, origem, req);
    return feitos.filter((f) => f.feito !== "nada").length;
  } catch (erro) {
    console.error("[fornecedor-automatico] falha ao aprovar pelo histórico:", erro instanceof Error ? erro.message : erro);
    return 0;
  }
}

/** A varredura do passado: prévia (`simular`) ou execução. */
export async function aprovarPeloHistorico(o: { simular: boolean }, ator: Autor, req?: Request) {
  const passagens = await carregarPassagens("tudo");
  const planos = planejarAprovacao(passagens, await contratosParaAprovacao(passagens.map((p) => p.cnpj)), hojeISO());
  const nomes = await nomesDosColaboradores(Array.from(new Set(planos.flatMap((p) => p.colaboradorIds))));
  // 28/10 (S1): o "já aprovado" com pendência também aparece (o DP decide o vínculo).
  const visiveis = planos.filter((p) => p.decisao.tipo !== "ja_aprovado" || p.pendentes.length > 0);
  const itens = (lista: readonly PlanoDoCnpj[]): ItemDaAprovacao[] => lista.map((p) => ({
    cnpj: mascararCnpj(p.cnpj),
    razaoSocial: p.razaoSocial ?? RAZAO_SOCIAL_NAO_INFORMADA,
    contratoId: p.decisao.tipo === "criar" ? null : p.decisao.contratoId,
    decisao: p.decisao.tipo,
    descricao: descricaoDoPlano(p, nomes),
    frase: p.frase,
    evento: p.primeira.eventoNome,
    data: p.primeira.data,
    gatilho: GATILHO_DA_APROVACAO_LABEL[p.primeira.gatilho],
    colaboradores: p.colaboradorIds.map((id) => ({ id, nome: nomes.get(id) ?? "colaborador" })),
    pendentes: p.pendentes.map((id) => ({ id, nome: nomes.get(id) ?? "colaborador" })),
  }));
  const resumo = resumoDosPlanos(planos);
  if (o.simular) return { simulado: true as const, resumo, itens: itens(visiveis), aprovados: 0 };
  const gravar = new Set(planos.filter(planoGrava).map((p) => p.cnpj));
  const feitos = await aplicar(passagens.filter((p) => gravar.has(p.cnpj)), ator, "varredura do histórico", req);
  const aprovados = feitos.filter((f) => f.feito !== "nada").length;
  await createAuditLog("update", "contrato", "aprovacao-automatica", {
    acao: "Aprovar fornecedores pelo histórico (varredura)", cnpjsNoHistorico: resumo.total,
    criados: feitos.filter((f) => f.feito === "criado").length, atualizados: feitos.filter((f) => f.feito === "atualizado").length,
    jaAprovados: resumo.jaAprovados, ignorados: resumo.ignorados, pendentes: resumo.pendentes,
  }, ator.id, ator.name, undefined, req);
  // Depois de gravar, a lista mostra o que foi feito (e os ignorados, que continuam).
  const depois = planejarAprovacao(passagens, await contratosParaAprovacao(passagens.map((p) => p.cnpj)), hojeISO());
  return { simulado: false as const, resumo, itens: itens(visiveis), aprovados, restantes: resumoDosPlanos(depois) };
}
