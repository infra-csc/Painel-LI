/**
 * Expurgo das selfies da presença (28/10, Fase 2 dos Honorários — LGPD).
 *
 * Política já configurada em `presenca_retencao_dias` (padrão 365): as fotos
 * de check-in/out das prestações PAGAS há mais que o prazo saem do storage; a
 * presença fica marcada "foto expurgada" (`foto_expurgada_em`) e os horários
 * continuam. Rotina diária registrada no boot (server/index.ts) — SÓ com o
 * storage real (nunca em teste nem na demo) e desligável pela chave
 * `presenca_expurgo_automatico` (Tabela de valores → só o admin). Com várias
 * instâncias (autoscale), o lock é a chave `presenca_expurgo_ultimo_dia` em
 * system_settings: só quem gravar o dia de hoje roda. O admin/DP também roda
 * na hora (POST /api/presenca/expurgo, com prévia ?simular=1).
 */
import type { Request } from "express";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { budgetActual, presencas, systemSettings, type User } from "@shared/schema";
import { CHAVE_DO_EXPURGO_AUTOMATICO, CHAVE_DO_ULTIMO_EXPURGO, dataLimiteDoExpurgo, expurgoAutomaticoLigado } from "@shared/honorarios-pagamento";
import { FUSO_DA_OPERACAO, hojeISO } from "@shared/hoje-sp";
import { lerConfiguracaoDoBanco } from "./presenca-servico";
import { createAuditLog } from "./routes/_compartilhado";

export interface ResumoDoExpurgo {
  simulacao: boolean;
  retencaoDias: number;
  /** Pagas ANTES deste dia saem. */
  dataLimite: string;
  presencas: number;
  fotos: number;
  prestacoes: number;
  /** Só na execução: fotos apagadas e as que o storage não apagou (ficam para o próximo dia). */
  apagadas: number;
  falhas: number;
}

/** O storage é o de verdade? (fora da demo, fora dos testes, com o bucket configurado.) */
export function temStorageReal(): boolean {
  return !!process.env.PRIVATE_OBJECT_DIR
    && process.env.PAINEL_DEMO !== "1"
    && process.env.PAINEL_DB !== "pglite"
    && process.env.NODE_ENV !== "test"
    && !process.env.VITEST;
}

export async function expurgoAutomaticoEstaLigado(): Promise<boolean> {
  const settings = await storage.getSystemSettings();
  return expurgoAutomaticoLigado(settings.find((s) => s.key === CHAVE_DO_EXPURGO_AUTOMATICO)?.value);
}

/** Presenças com selfie ainda no storage, de prestações pagas antes do limite. */
async function candidatos(dataLimite: string) {
  return db.select({
    id: presencas.id, actualId: presencas.actualId, checkinFotoId: presencas.checkinFotoId, checkoutFotoId: presencas.checkoutFotoId,
  }).from(presencas)
    .innerJoin(budgetActual, eq(budgetActual.id, presencas.actualId))
    .where(and(
      isNotNull(budgetActual.pagoEm), lt(budgetActual.pagoEm, dataLimite), isNull(presencas.fotoExpurgadaEm),
      or(isNotNull(presencas.checkinFotoId), isNotNull(presencas.checkoutFotoId)),
    ));
}

/**
 * Prévia (`simular`) ou execução. Uma presença só é marcada "expurgada"
 * quando TODAS as fotos dela saíram do storage; falha fica para o próximo dia.
 */
export async function expurgarSelfies(a: { simular: boolean; ator: User | null; req?: Request; origem: "manual" | "automatico"; hoje?: string }): Promise<ResumoDoExpurgo> {
  const { retencaoDias } = await lerConfiguracaoDoBanco();
  const hoje = a.hoje ?? hojeISO();
  const dataLimite = dataLimiteDoExpurgo(hoje, retencaoDias);
  const lista = await candidatos(dataLimite);
  const fotosDe = (p: (typeof lista)[number]) => [p.checkinFotoId, p.checkoutFotoId].filter((v): v is string => !!v);
  const resumo: ResumoDoExpurgo = {
    simulacao: a.simular, retencaoDias, dataLimite,
    presencas: lista.length, fotos: lista.reduce((s, p) => s + fotosDe(p).length, 0),
    prestacoes: new Set(lista.map((p) => p.actualId)).size, apagadas: 0, falhas: 0,
  };
  if (a.simular) return resumo;

  const { ObjectStorageService } = await import("./objectStorage");
  const servico = new ObjectStorageService();
  for (const p of lista) {
    let todas = true;
    for (const id of fotosDe(p)) {
      if (await servico.apagarAnexo(id)) resumo.apagadas += 1;
      else { resumo.falhas += 1; todas = false; }
    }
    if (!todas) continue;
    await db.update(presencas)
      .set({ checkinFotoId: null, checkoutFotoId: null, fotoExpurgadaEm: new Date(), atualizadoEm: new Date() })
      .where(and(eq(presencas.id, p.id), isNull(presencas.fotoExpurgadaEm)));
  }
  // Auditoria: só quantas (nunca os ids das fotos).
  if (a.origem === "manual" || resumo.fotos > 0) {
    await createAuditLog("delete", "presenca", "expurgo-de-selfies", {
      acao: a.origem === "manual" ? "expurgo das selfies (rodado na hora)" : "expurgo diário das selfies",
      retencaoDias, pagasAntesDe: dataLimite, presencas: resumo.presencas, prestacoes: resumo.prestacoes,
      fotosApagadas: resumo.apagadas, falhas: resumo.falhas,
    }, a.ator?.id, a.ator ? a.ator.name || a.ator.email || "Usuário" : "Sistema", undefined, a.req);
  }
  return resumo;
}

/** Lock do dia: true = esta instância roda o expurgo de hoje. */
export async function pegarODiaDoExpurgo(dia: string): Promise<boolean> {
  const r = await db.insert(systemSettings).values({ key: CHAVE_DO_ULTIMO_EXPURGO, value: dia })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: dia, updatedAt: new Date() }, setWhere: lt(systemSettings.value, dia) })
    .returning({ key: systemSettings.key });
  return r.length > 0;
}

const DE_HORA_EM_HORA = 60 * 60_000;
let relogio: ReturnType<typeof setInterval> | null = null;
let rodando = false;

/** Uma volta do relógio: ligado, dia livre → expurga. */
export async function talvezExpurgar(): Promise<"desligado" | "ja_rodou" | "rodou" | "ocupado"> {
  if (rodando) return "ocupado";
  if (!(await expurgoAutomaticoEstaLigado())) return "desligado";
  if (!(await pegarODiaDoExpurgo(hojeISO(FUSO_DA_OPERACAO)))) return "ja_rodou";
  rodando = true;
  try {
    const r = await expurgarSelfies({ simular: false, ator: null, origem: "automatico" });
    if (r.fotos > 0) console.warn(`[expurgo] selfies de prestações pagas antes de ${r.dataLimite}: ${r.apagadas} apagadas, ${r.falhas} falhas.`);
    return "rodou";
  } finally {
    rodando = false;
  }
}

/**
 * Liga a rotina diária no boot (idempotente). Só com o storage REAL — em
 * teste e na demo nunca roda. `PAINEL_SEM_AGENDADOR=1` também desliga.
 */
export function iniciarExpurgoDiario(): void {
  if (relogio || process.env.PAINEL_SEM_AGENDADOR === "1" || !temStorageReal()) return;
  const volta = () => { void talvezExpurgar().catch((e) => console.error("[expurgo] rotina diária:", e instanceof Error ? e.message : e)); };
  setTimeout(volta, 5 * 60_000).unref?.();
  relogio = setInterval(volta, DE_HORA_EM_HORA);
  relogio.unref?.();
}
