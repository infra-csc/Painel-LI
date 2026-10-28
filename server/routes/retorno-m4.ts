/**
 * Importação do RETORNO DO M4 por planilha (28/10, Honorários — "Plano B":
 * enquanto não houver API, o app exporta o arquivo de OC e importa o que o M4
 * devolve). Layout PROVISÓRIO (`FORMATO_RETORNO_M4` em
 * shared/formatos-de-arquivo.ts); leitura e regra da prévia em
 * shared/retorno-m4.ts.
 *
 *   POST /api/ordens-de-compra/retorno-m4/previa   { matriz }                  → a prévia por linha (NÃO grava)
 *   POST /api/ordens-de-compra/retorno-m4          { matriz, justificativa? }  → aplica as linhas aptas
 *
 * `matriz`: as células da planilha (o navegador lê o CSV/XLSX; o arquivo não
 * sobe). A confirmação RELÊ a matriz contra o banco de agora — a prévia nunca
 * é confiada — e aplica só as linhas "aplicar", numa transação (um savepoint
 * por linha: a linha que mudou no meio fica de fora sem desfazer as outras),
 * pelos MESMOS caminhos das ações manuais: `gravarOc` (origem "m4"),
 * `lancarNotaNoM4` (programado), `gravarPagos` (pago) e `marcarLotePago`
 * (lote Flash). Reimportar o mesmo arquivo não muda nada ("sem mudança — já
 * estava assim"). Auditoria igual à das ações manuais, com "(retorno do M4)".
 *
 * Papéis: admin e DP (`requireFinanceUser`, o mesmo das rotas de pagamento).
 * O perfil Honorários não passa (server/perfil-honorarios.ts nega por padrão).
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { budgetActual as budgetActualTable, flashCompras, type BudgetActual, type InsertSystemLog, type User } from "@shared/schema";
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN } from "@shared/honorarios-pagamento";
import { ehEventoLegado } from "@shared/legado-honorarios";
import { hojeISO } from "@shared/hoje-sp";
import {
  RETORNO_MAX_COLUNAS, lerRetornoM4, numeroDoLoteFlash, proporRetornoM4,
  type CelulaDoRetorno, type EstadoDoRetorno, type LinhaPropostaDoRetorno, type LoteFlashNoRetorno, type PrestacaoNoRetorno, type PreviaDoRetorno,
} from "@shared/retorno-m4";
import { FORMATO_RETORNO_M4 } from "@shared/formatos-de-arquivo";
import { lerDataDeCorteDoBanco } from "./honorarios-fluxo";
import { gravarOc, gravarPagos, lancarNotaNoM4, montar, resumoDaOc } from "../honorarios-pagamento-servico";
import { marcarLotePago } from "../arquivos-de-compra-servico";
import { reconhecerFornecedores } from "../fornecedor-automatico";
import { HttpError } from "../http";
import { createAuditLogsBatch, montarLogDeAuditoria, requireFinanceUser, responderErroComStatus } from "./_compartilhado";

const nomeDe = (u: User) => u.name || u.email || "Usuário";
const dia = (v: Date | string | null | undefined) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const OBS_DO_PAGO = "Liquidado no M4 (retorno importado).";

const celula = z.union([z.string().max(2000), z.number(), z.null()]);
const corpoDoRetorno = z.object({
  matriz: z.array(z.array(celula).max(RETORNO_MAX_COLUNAS)).min(1).max(FORMATO_RETORNO_M4.maxLinhas + 50),
  justificativa: z.string().trim().max(JUSTIFICATIVA_MAX).nullish(),
});
const MSG_DO_CORPO = "Envie as células da planilha do retorno do M4 (até 5.000 linhas).";

/** O estado do app para as referências do arquivo: prestações (com nota, evento e legado) e lotes Flash. */
async function estadoDoRetorno(referencias: readonly string[]): Promise<EstadoDoRetorno> {
  const numeros = new Set<number>();
  const ids = new Set<string>();
  for (const r of referencias) {
    if (!r) continue;
    const n = numeroDoLoteFlash(r);
    if (n != null) numeros.add(n);
    else if (r.length <= 100) { ids.add(r); ids.add(r.toLowerCase()); }
  }
  const actuals = ids.size ? await db.select().from(budgetActualTable).where(inArray(budgetActualTable.id, Array.from(ids))) : [];
  const [montadas, corte, eventos, lotes] = await Promise.all([
    montar(actuals),
    lerDataDeCorteDoBanco(),
    storage.getEventsByIds(Array.from(new Set(actuals.map((a) => a.eventId)))),
    numeros.size ? db.select().from(flashCompras).where(inArray(flashCompras.numero, Array.from(numeros))) : Promise.resolve([]),
  ]);
  const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
  const prestacoes = new Map<string, PrestacaoNoRetorno>();
  for (const m of montadas) {
    const a = m.actual;
    const evento = eventoPorId.get(a.eventId);
    prestacoes.set(a.id.toLowerCase(), {
      id: a.id, colaboradorNome: m.colaborador?.fullName ?? null, eventoNome: evento?.name ?? null,
      legado: !evento || ehEventoLegado(evento.endDate, corte), emiteNf: m.emiteNf,
      rhStatus: a.rhStatus, splitParentId: a.splitParentId, collaboratorId: a.collaboratorId, didNotAttend: a.didNotAttend,
      ocNumero: a.ocNumero, ocValor: a.ocValor, totalValue: a.totalValue, pagoEm: dia(a.pagoEm), situacaoDoCnpj: m.cnpj.situacao,
      nota: m.nota ? { id: m.nota.id, status: m.nota.status, checkinAt: m.nota.checkinAt, paymentDate: dia(m.nota.paymentDate) } : null,
    });
  }
  const porNumero = new Map<number, LoteFlashNoRetorno>(lotes.map((l) => [l.numero, {
    id: l.id, numero: l.numero, status: l.status, totalCents: l.totalCents, pagoEm: dia(l.pagoEm),
  }]));
  return { prestacoes, lotes: porNumero };
}

async function previaDoRetorno(matriz: readonly (readonly CelulaDoRetorno[])[]): Promise<PreviaDoRetorno> {
  const leitura = lerRetornoM4(matriz);
  const estado = await estadoDoRetorno(leitura.linhas.map((l) => l.referencia));
  return proporRetornoM4(leitura, estado, hojeISO());
}

/** A linha mudou entre a prévia e a gravação (a guarda do banco não pegou): sai do savepoint. */
class LinhaMudou extends Error {}

interface Gravado {
  linha: LinhaPropostaDoRetorno;
  oc: { depois: BudgetActual } | null;
  programada: { invoiceId: string; paymentDate: string } | null;
  paga: BudgetActual | null;
  lote: { numero: number; antes: string; id: string; pagoEm: string } | null;
}

function logsDoGravado(g: Gravado, user: User, req: Request): InsertSystemLog[] {
  const logs: InsertSystemLog[] = [];
  const l = g.linha;
  if (g.oc) {
    logs.push(montarLogDeAuditoria("update", "budget_actual", g.oc.depois.id, resumoDaOc(g.oc.depois, {
      acao: "OC registrada (retorno do M4)", linhaDoArquivo: l.linha, valorAprovado: g.oc.depois.totalValue,
    }), user.id, nomeDe(user), { ocNumero: null }, req));
  }
  if (g.programada) {
    logs.push(montarLogDeAuditoria("checkin", "invoice", g.programada.invoiceId, {
      acao: "NF lançada no M4 (retorno do M4)", paymentDate: g.programada.paymentDate, prestacao: l.alvoId, oc: l.numeroOc, linhaDoArquivo: l.linha,
    }, user.id, nomeDe(user), { checkinAt: null, paymentDate: null }, req));
  }
  if (g.paga) {
    logs.push(montarLogDeAuditoria("update", "budget_actual", g.paga.id, {
      acao: "marcada como paga (retorno do M4)", pagoEm: g.paga.pagoEm, observacao: g.paga.pagamentoObs, comprovante: false,
      ocNumero: g.paga.ocNumero, linhaDoArquivo: l.linha,
    }, user.id, nomeDe(user), { pagoEm: null }, req));
  }
  if (g.lote) {
    logs.push(montarLogDeAuditoria("update", "flash_compra", g.lote.id, {
      acao: "marcou o lote de compra Flash como pago à Flash (retorno do M4)", lote: g.lote.numero, pagoEm: g.lote.pagoEm, status: "pago",
      ocNumero: l.numeroOc, linhaDoArquivo: l.linha,
    }, user.id, nomeDe(user), { status: g.lote.antes, pagoEm: null }, req));
  }
  return logs;
}

export function registrarRetornoM4(app: Express): void {
  app.post("/api/ordens-de-compra/retorno-m4/previa", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoRetorno.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: MSG_DO_CORPO });
    try {
      res.set("Cache-Control", "no-store");
      res.json(await previaDoRetorno(corpo.data.matriz));
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao ler o retorno do M4", 500);
    }
  });

  app.post("/api/ordens-de-compra/retorno-m4", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const corpo = corpoDoRetorno.safeParse(req.body ?? {});
    if (!corpo.success) return res.status(400).json({ message: MSG_DO_CORPO });
    const justificativa = corpo.data.justificativa && corpo.data.justificativa.length >= JUSTIFICATIVA_MIN ? corpo.data.justificativa : null;
    try {
      // A prévia NUNCA é confiada: a matriz é relida aqui, contra o banco de agora.
      const previa = await previaDoRetorno(corpo.data.matriz);
      if (previa.erro) return res.status(400).json({ message: previa.erro, codigo: "arquivo" });
      const recusadas: { linha: number; referencia: string; motivos: string[] }[] = [];
      const aptas: LinhaPropostaDoRetorno[] = [];
      for (const l of previa.linhas) {
        if (l.resultado !== "aplicar") continue;
        if (l.exigeJustificativa && !justificativa) {
          recusadas.push({ linha: l.linha, referencia: l.referencia, motivos: ["CNPJ emissor sem contrato ativo — escreva a justificativa da importação."] });
        } else aptas.push(l);
      }
      const hoje = hojeISO();
      const gravados = aptas.length === 0 ? [] : await db.transaction(async (tx) => {
        const feitos: Gravado[] = [];
        for (const l of aptas) {
          try {
            const g = await tx.transaction(async (sp): Promise<Gravado> => {
              const r: Gravado = { linha: l, oc: null, programada: null, paga: null, lote: null };
              if (l.tipo === "flash") {
                const { antes, depois } = await marcarLotePago(l.alvoId!, l.gravar.pagoEm!, user, sp);
                r.lote = { numero: depois.numero, antes: antes.status, id: depois.id, pagoEm: l.gravar.pagoEm! };
                return r;
              }
              const actualId = l.alvoId!;
              if (l.acoes.includes("registrar_oc") && l.gravar.oc) {
                const depois = await gravarOc(sp, user, {
                  actualId, origem: "m4", numero: l.gravar.oc.numero, valor: l.gravar.oc.valor, data: l.gravar.oc.data,
                  justificativa: l.exigeJustificativa ? justificativa : null,
                });
                if (!depois) throw new LinhaMudou("A prestação mudou enquanto o retorno era gravado (a OC já foi registrada ou a aprovação mudou).");
                r.oc = { depois };
              }
              if (l.acoes.includes("programar") && l.gravar.notaId && l.gravar.programarPara) {
                const nota = await lancarNotaNoM4(sp, l.gravar.notaId, user.id, l.gravar.programarPara, { origem: "retorno do M4" });
                if (!nota) throw new LinhaMudou("A nota fiscal mudou enquanto o retorno era gravado (já lançada no M4 ou mudou de status).");
                r.programada = { invoiceId: nota.id, paymentDate: l.gravar.programarPara };
              }
              if (l.acoes.includes("marcar_pago") && l.gravar.pagoEm) {
                const [paga] = await gravarPagos(sp, user, [actualId], { pagoEm: l.gravar.pagoEm, observacao: OBS_DO_PAGO, comprovanteId: null });
                if (!paga) throw new LinhaMudou("A prestação mudou enquanto o pagamento era registrado (já paga ou deixou de estar programada).");
                r.paga = paga;
              }
              return r;
            });
            feitos.push(g);
          } catch (e) {
            if (e instanceof LinhaMudou) recusadas.push({ linha: l.linha, referencia: l.referencia, motivos: [e.message] });
            else if (e instanceof HttpError && e.status < 500) recusadas.push({ linha: l.linha, referencia: l.referencia, motivos: [e.message] });
            else throw e;
          }
        }
        return feitos;
      });

      const logs = gravados.flatMap((g) => logsDoGravado(g, user, req));
      logs.push(montarLogDeAuditoria("import", "budget_actual", "retorno-m4", {
        acao: "importou o retorno do M4", layout: FORMATO_RETORNO_M4.id, linhas: previa.resumo.total, aplicadas: gravados.length,
        semMudanca: previa.resumo.semMudanca, comProblema: previa.resumo.problema, recusadas: recusadas.length, dia: hoje,
      }, user.id, nomeDe(user), undefined, req));
      await createAuditLogsBatch(logs);
      // Igual ao "Marcar como pago" manual: o pagamento aprova o fornecedor (idempotente).
      const pagas = gravados.flatMap((g) => (g.paga ? [g.paga.id] : []));
      if (pagas.length) await reconhecerFornecedores({ actualIds: pagas }, { id: user.id, name: nomeDe(user) }, "pagamento marcado (retorno do M4)", req);

      recusadas.sort((a, b) => a.linha - b.linha);
      res.json({
        aplicadas: gravados.length,
        ocsRegistradas: gravados.filter((g) => g.oc).length,
        programadas: gravados.filter((g) => g.programada).length,
        pagas: gravados.filter((g) => g.paga).length,
        lotesFlashPagos: gravados.filter((g) => g.lote).length,
        semMudanca: previa.resumo.semMudanca,
        comProblema: previa.resumo.problema,
        recusadas,
      });
    } catch (error) {
      responderErroComStatus(res, error, "Erro ao aplicar o retorno do M4", 500);
    }
  });
}
