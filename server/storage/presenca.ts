/**
 * Presença no evento e acesso do colaborador ao portal (27/10, Fase 1 do
 * Módulo de Honorários) — acesso a dados. Regras em shared/presenca.ts;
 * autorização e HTTP em server/routes/colaborador-portal.ts e
 * server/routes/presenca.ts; a montagem das prestações em server/presenca-servico.ts.
 *
 * Fora do objeto `storage` (como contratos e honorários): só estas rotas leem.
 * `colaboradores_acesso` guarda senha/código só como hash e nunca sai por rota.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  collaborators, colaboradoresAcesso, events, presencas, presencaOcorrencias, presencaConfirmacoes, teamInclusions,
  type Collaborator, type ColaboradorAcesso, type Presenca, type PresencaOcorrencia, type PresencaConfirmacao,
} from "@shared/schema";
import { idsUnicos } from "./_comum";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Colaborador pelo CPF ────────────────────────────────────────────────────

/**
 * Colaboradores cujo CPF (só dígitos) casa com o documento principal
 * (documentType "cpf") ou com o secundário (secondaryDocumentType "cpf").
 */
export async function colaboradoresPorCpf(cpf: string): Promise<Collaborator[]> {
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return [];
  return db.select().from(collaborators).where(or(
    and(sql`lower(${collaborators.documentType}) = 'cpf'`, sql`regexp_replace(${collaborators.officialDocument}, '[^0-9]', '', 'g') = ${digitos}`),
    and(sql`lower(coalesce(${collaborators.secondaryDocumentType}, '')) = 'cpf'`, sql`regexp_replace(coalesce(${collaborators.secondaryDocument}, ''), '[^0-9]', '', 'g') = ${digitos}`),
  ));
}

// ── Acesso ──────────────────────────────────────────────────────────────────

export async function obterAcesso(collaboratorId: string): Promise<ColaboradorAcesso | null> {
  const [a] = await db.select().from(colaboradoresAcesso).where(eq(colaboradoresAcesso.collaboratorId, collaboratorId)).limit(1);
  return a ?? null;
}

export async function acessosDosColaboradores(ids: readonly string[]): Promise<Map<string, ColaboradorAcesso>> {
  const unicos = idsUnicos([...ids]);
  if (unicos.length === 0) return new Map();
  const linhas = await db.select().from(colaboradoresAcesso).where(inArray(colaboradoresAcesso.collaboratorId, unicos));
  return new Map(linhas.map((l) => [l.collaboratorId, l]));
}

type CamposDoAcesso = Partial<Omit<ColaboradorAcesso, "collaboratorId" | "criadoEm" | "atualizadoEm">>;

/** Cria a linha do acesso ou atualiza os campos dados. */
export async function salvarAcesso(collaboratorId: string, campos: CamposDoAcesso): Promise<ColaboradorAcesso> {
  const agora = new Date();
  const [a] = await db.insert(colaboradoresAcesso)
    .values({ collaboratorId, ...campos, atualizadoEm: agora })
    .onConflictDoUpdate({ target: colaboradoresAcesso.collaboratorId, set: { ...campos, atualizadoEm: agora } })
    .returning();
  return a;
}

/**
 * Soma um erro de login; no `limite`-ésimo dentro da janela, bloqueia até o
 * FIM da janela. Atômico.
 *
 * 28/10 (revisão S3): a MESMA regra do CPF sem cadastro (contador do
 * rate_limits, janela fixa que começa no 1º erro): a janela começa no 1º erro
 * (`falhas_desde`) e dura o mesmo que o bloqueio (`bloquearAte` − agora);
 * passada a janela — e com ela o bloqueio —, a contagem recomeça do 1. Antes
 * o contador nunca zerava: depois do 1º bloqueio, cada erro novo bloqueava de
 * novo (trava sem fim) e a resposta diferente da do CPF sem cadastro revelava
 * quem tem senha.
 */
export async function registrarFalha(collaboratorId: string, limite: number, bloquearAte: Date): Promise<ColaboradorAcesso | null> {
  const janelaMs = Math.max(1, bloquearAte.getTime() - Date.now());
  const janela = sql`(${janelaMs}::int * interval '1 millisecond')`;
  const novaJanela = sql`(${colaboradoresAcesso.falhasDesde} IS NULL OR ${colaboradoresAcesso.tentativasFalhas} = 0 OR ${colaboradoresAcesso.falhasDesde} + ${janela} <= now())`;
  const tentativas = sql`(CASE WHEN ${novaJanela} THEN 1 ELSE ${colaboradoresAcesso.tentativasFalhas} + 1 END)`;
  const inicio = sql`(CASE WHEN ${novaJanela} THEN now() ELSE ${colaboradoresAcesso.falhasDesde} END)`;
  const [a] = await db.update(colaboradoresAcesso)
    .set({
      tentativasFalhas: tentativas,
      falhasDesde: inicio,
      bloqueadoAte: sql`CASE WHEN ${tentativas} >= ${limite} THEN ${inicio} + ${janela} WHEN ${novaJanela} THEN NULL ELSE ${colaboradoresAcesso.bloqueadoAte} END`,
      atualizadoEm: new Date(),
    })
    .where(eq(colaboradoresAcesso.collaboratorId, collaboratorId))
    .returning();
  return a ?? null;
}

/**
 * Consome o código de primeiro acesso de forma ATÔMICA (28/10, revisão S4):
 * só grava se o hash lido ainda é o da linha e o código não venceu — dois
 * pedidos com o mesmo código, um só passa (o outro recebe null). O código
 * some junto (uso único).
 */
export async function consumirCodigoDeAcesso(collaboratorId: string, codigoHashLido: string, campos: CamposDoAcesso): Promise<ColaboradorAcesso | null> {
  const [a] = await db.update(colaboradoresAcesso)
    .set({ ...campos, codigoHash: null, codigoExpiraEm: null, tentativasFalhas: 0, falhasDesde: null, bloqueadoAte: null, atualizadoEm: new Date() })
    .where(and(
      eq(colaboradoresAcesso.collaboratorId, collaboratorId),
      eq(colaboradoresAcesso.codigoHash, codigoHashLido),
      sql`${colaboradoresAcesso.codigoExpiraEm} > now()`,
    ))
    .returning();
  return a ?? null;
}

/**
 * O colaborador está escalado em alguma vaga NÃO cancelada de evento do fluxo
 * novo (termina a partir da data de corte, não cancelado)? É a régua da
 * produção para gerar o código de acesso (28/10, revisão S4).
 */
export async function colaboradorEscaladoNoFluxoNovo(collaboratorId: string, dataDeCorte: string): Promise<boolean> {
  const [v] = await db.select({ id: teamInclusions.id }).from(teamInclusions)
    .innerJoin(events, eq(events.id, teamInclusions.eventId))
    .where(and(
      eq(teamInclusions.collaboratorId, collaboratorId),
      isNull(teamInclusions.deletedAt),
      sql`coalesce(${teamInclusions.status}, '') <> 'cancelado'`,
      sql`coalesce(${events.status}, '') <> 'cancelado'`,
      sql`(${events.endDate} IS NULL OR ${events.endDate} >= ${dataDeCorte})`,
    ))
    .limit(1);
  return !!v;
}

// ── Presenças, ocorrências e confirmações ───────────────────────────────────

export async function presencasDasPrestacoes(actualIds: readonly string[]): Promise<Presenca[]> {
  const unicos = idsUnicos([...actualIds]);
  if (unicos.length === 0) return [];
  return db.select().from(presencas).where(inArray(presencas.actualId, unicos));
}

/** Ocorrências ATIVAS (sem remoção lógica). */
export async function ocorrenciasDasPrestacoes(actualIds: readonly string[]): Promise<PresencaOcorrencia[]> {
  const unicos = idsUnicos([...actualIds]);
  if (unicos.length === 0) return [];
  return db.select().from(presencaOcorrencias)
    .where(and(inArray(presencaOcorrencias.actualId, unicos), isNull(presencaOcorrencias.removidoEm)))
    .orderBy(presencaOcorrencias.criadoEm);
}

export async function obterOcorrencia(id: string): Promise<PresencaOcorrencia | null> {
  const [o] = await db.select().from(presencaOcorrencias).where(eq(presencaOcorrencias.id, id)).limit(1);
  return o ?? null;
}

export async function confirmacoesDasPrestacoes(actualIds: readonly string[]): Promise<PresencaConfirmacao[]> {
  const unicos = idsUnicos([...actualIds]);
  if (unicos.length === 0) return [];
  return db.select().from(presencaConfirmacoes).where(inArray(presencaConfirmacoes.actualId, unicos));
}

/** O anexo é a selfie de alguma presença (entrada ou saída)? */
export async function ehFotoDePresenca(anexoId: string): Promise<boolean> {
  const [p] = await db.select({ id: presencas.id }).from(presencas)
    .where(or(eq(presencas.checkinFotoId, anexoId), eq(presencas.checkoutFotoId, anexoId))).limit(1);
  return !!p;
}

/** A selfie é de uma presença DESTE colaborador? (o portal só abre as próprias) */
export async function fotoEhDoColaborador(anexoId: string, collaboratorId: string): Promise<boolean> {
  const [p] = await db.select({ id: presencas.id }).from(presencas)
    .where(and(eq(presencas.collaboratorId, collaboratorId), or(eq(presencas.checkinFotoId, anexoId), eq(presencas.checkoutFotoId, anexoId)))).limit(1);
  return !!p;
}
