/**
 * "Confirmar" o quarto (aba Quartos do Espelho) preenche a HOSPEDAGEM de cada
 * pessoa do quarto (23/10, dono: "basicamente, quando confirmar, deve
 * preencher lá na aba de Hospedagem com os dados"). A regra de cada campo
 * está em shared/hotel-na-hospedagem.ts; aqui, quem chama, o banco e os efeitos:
 *
 *  - lê o Espelho do evento (o MESMO cálculo da tela: quartos sem quem saiu,
 *    a linha de cada pessoa, o período dela no quarto e a parte dela no valor
 *    do hotel) e monta os dados de cada ocupante dos quartos CONFIRMADOS;
 *  - numa transação com o lock do Espelho, relê as hospedagens e o que o
 *    Espelho escreveu nelas (`hospedagens_do_espelho`) e cria/atualiza;
 *  - depois: uma auditoria por hospedagem tocada (+ uma do lote) e o status da
 *    vaga pelo caminho de sempre (`recalcularStatusDeLogistica`).
 *
 * Só quarto confirmado preenche. Reabrir não apaga nada (a aba avisa
 * "quarto reaberto — confira a hospedagem"); mover alguém reabre os dois
 * quartos, e o próximo Confirmar atualiza quem estiver neles.
 */
import type { Request } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { accommodations, hospedagensDoEspelho, type Accommodation, type User } from "@shared/schema";
import { linhaPorColaborador } from "@shared/custo-dos-quartos";
import { decidirReflexo, ocupantesDoQuarto, type CamposDoEspelho, type DadosDoQuarto, type DiferencaDoQuarto } from "@shared/hotel-na-hospedagem";
import { carregarHospedagensDoEspelho, getOperationalMirror } from "./operational-mirror";
import { createAuditLog, recalcularStatusDeLogistica } from "./routes/_compartilhado";

export interface DiferencaDaVaga {
  teamInclusionId: string;
  nome: string;
  diferencas: DiferencaDoQuarto[];
}

export interface ResumoDoPreenchimento {
  criadas: number;
  atualizadas: number;
  /** Dados lançados à mão diferentes do quarto — não sobrescritos. */
  diferem: DiferencaDaVaga[];
  /** Hospedagens canceladas (não tocadas). */
  canceladas: number;
  /** Ocupantes de quarto confirmado SEM hotel — nada preenchido. */
  semHotel: number;
  /** Status de vaga que mudou por causa disto. */
  statusAlterados: number;
}

export interface OpcoesDoPreenchimento {
  /** Só estes quartos (padrão: todos os confirmados do evento). */
  quartos?: readonly string[] | null;
  /** Só estas vagas. */
  vagas?: ReadonlySet<string> | null;
  /** "Usar os dados do quarto": estas vagas recebem os dados mesmo sobre o lançado à mão. */
  forcar?: ReadonlySet<string> | null;
}

/** Campos da regra (texto/número) → colunas tipadas de `accommodations`. */
function paraColunas(c: CamposDoEspelho): Partial<typeof accommodations.$inferInsert> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === undefined) continue;
    out[k] = v === null ? null : k === "nightsCount" || k === "totalCents" ? Math.round(Number(v)) : String(v);
  }
  return out as Partial<typeof accommodations.$inferInsert>;
}

const vazio = (): ResumoDoPreenchimento => ({ criadas: 0, atualizadas: 0, diferem: [], canceladas: 0, semHotel: 0, statusAlterados: 0 });

export async function preencherHospedagensDosQuartos(eventId: string, ator: User, req: Request, opcoes: OpcoesDoPreenchimento = {}): Promise<ResumoDoPreenchimento> {
  const resumo = vazio();
  const espelho = await getOperationalMirror(eventId);
  if (!espelho) return resumo;
  // Sem a tabela de controle não dá para separar o "do Espelho" do lançado à
  // mão — escrever sem esse registro faria o próximo Confirmar tratar o que o
  // Espelho escreveu como manual. Não preenche até o boot criar a tabela.
  if (!(await carregarHospedagensDoEspelho(eventId))) return resumo;

  const daPessoa = linhaPorColaborador(espelho.rows);
  const filtro = opcoes.quartos ? new Set(opcoes.quartos) : null;
  const alvos = new Map<string, { nome: string; dados: DadosDoQuarto; precisa: boolean; quartoId: string }>();
  for (const g of espelho.roomGroups) {
    if (!g.confirmed || (filtro && !filtro.has(g.id))) continue;
    for (const o of ocupantesDoQuarto(g, daPessoa)) {
      if (opcoes.vagas && !opcoes.vagas.has(o.teamInclusionId)) continue;
      if (!o.dados.hotelName) { resumo.semHotel += 1; continue; }
      alvos.set(o.teamInclusionId, { nome: o.nome, dados: o.dados, precisa: o.precisa, quartoId: g.id });
    }
  }
  if (alvos.size === 0) return resumo;

  type Mudanca = { acao: "create" | "update"; antes: Accommodation | undefined; depois: Accommodation; teamInclusionId: string };
  const mudancas = await db.transaction(async (tx) => {
    // Mesmo lock do "Refazer sugestões" e do hotel do evento: dois Confirmar
    // ao mesmo tempo criariam duas hospedagens para a mesma vaga.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"mirror:" + eventId}))`);
    const ids = Array.from(alvos.keys());
    const [linhasDeHospedagem, linhasDoEspelho] = await Promise.all([
      tx.select().from(accommodations).where(inArray(accommodations.teamInclusionId, ids)).orderBy(asc(accommodations.createdAt), asc(accommodations.id)),
      tx.select().from(hospedagensDoEspelho).where(eq(hospedagensDoEspelho.eventId, eventId)),
    ]);
    // Uma por vaga; com mais de uma, a mais recente — a mesma que o Espelho lê e edita.
    const hospedagemDa = new Map<string, Accommodation>();
    for (const a of linhasDeHospedagem) hospedagemDa.set(a.teamInclusionId, a);
    const doEspelho = new Map(linhasDoEspelho.map((l) => [l.accommodationId, l]));

    const feitas: Mudanca[] = [];
    const agora = new Date();
    for (const [teamInclusionId, alvo] of Array.from(alvos.entries())) {
      const antes = hospedagemDa.get(teamInclusionId);
      const gravado = antes ? doEspelho.get(antes.id) : undefined;
      const anterior: CamposDoEspelho | null = gravado ? gravado.campos : null;
      const d = decidirReflexo({ hospedagem: antes, reflexo: anterior, dados: alvo.dados, forcar: opcoes.forcar?.has(teamInclusionId) });

      if (d.motivo === "cancelada") { resumo.canceladas += 1; continue; }
      if (d.diferencas.length) resumo.diferem.push({ teamInclusionId, nome: alvo.nome, diferencas: d.diferencas });

      if (d.criar) {
        // Vaga marcada como "não precisa de hospedagem" não ganha uma só por estar num quarto.
        if (!alvo.precisa) continue;
        const [criada] = await tx.insert(accommodations).values({ teamInclusionId, ...paraColunas(d.campos), updatedBy: ator.id }).returning();
        await tx.insert(hospedagensDoEspelho).values({
          accommodationId: criada.id, eventId, teamInclusionId, hotelRoomGroupId: alvo.quartoId,
          campos: d.reflexo as Record<string, string | number | null>, criadaPeloEspelho: true, updatedAt: agora, updatedBy: ator.id,
        });
        feitas.push({ acao: "create", antes: undefined, depois: criada, teamInclusionId });
        resumo.criadas += 1;
        continue;
      }
      if (!antes) continue;

      if (Object.keys(d.campos).length > 0) {
        const [depois] = await tx.update(accommodations).set({ ...paraColunas(d.campos), updatedAt: agora, updatedBy: ator.id }).where(eq(accommodations.id, antes.id)).returning();
        feitas.push({ acao: "update", antes, depois, teamInclusionId });
        resumo.atualizadas += 1;
      }
      // O registro do que é "do Espelho" acompanha a decisão.
      const campos = d.reflexo as Record<string, string | number | null>;
      if (Object.keys(campos).length > 0) {
        await tx.insert(hospedagensDoEspelho)
          .values({ accommodationId: antes.id, eventId, teamInclusionId, hotelRoomGroupId: alvo.quartoId, campos, updatedAt: agora, updatedBy: ator.id })
          .onConflictDoUpdate({ target: hospedagensDoEspelho.accommodationId, set: { campos, hotelRoomGroupId: alvo.quartoId, updatedAt: agora, updatedBy: ator.id } });
      } else if (gravado) {
        await tx.delete(hospedagensDoEspelho).where(and(eq(hospedagensDoEspelho.accommodationId, antes.id), eq(hospedagensDoEspelho.eventId, eventId)));
      }
    }
    return feitas;
  });

  // Auditoria e status DEPOIS da transação (como as rotas de hospedagem).
  for (const m of mudancas) {
    await createAuditLog(m.acao, "accommodation", m.depois.id, { ...m.depois, origem: "Espelho Operacional (quarto confirmado)" }, ator.id, ator.name || "Sistema", m.antes, req);
  }
  for (const id of Array.from(new Set(mudancas.map((m) => m.teamInclusionId)))) {
    if (await recalcularStatusDeLogistica(id, ator, req)) resumo.statusAlterados += 1;
  }
  if (mudancas.length > 0 || opcoes.forcar?.size) {
    await createAuditLog("update", "operational_mirror", eventId, {
      eventId, acao: "quarto confirmado → hospedagens",
      quartos: opcoes.quartos ?? "todos os confirmados",
      criadas: resumo.criadas, atualizadas: resumo.atualizadas, diferem: resumo.diferem.length,
      ...(opcoes.forcar?.size ? { usarDadosDoQuarto: Array.from(opcoes.forcar) } : {}),
      statusAlterados: resumo.statusAlterados,
    }, ator.id, ator.name, undefined, req);
  }
  return resumo;
}

/**
 * Para as rotas que já gravaram a mudança do quarto: preenche e, se falhar,
 * registra e devolve `null` — a resposta continua 200 (o Confirmar vale; o
 * "Usar os dados do quarto" da aba refaz o preenchimento depois).
 */
export async function preencherSemDerrubar(eventId: string, ator: User, req: Request, opcoes: OpcoesDoPreenchimento = {}): Promise<ResumoDoPreenchimento | null> {
  try {
    return await preencherHospedagensDosQuartos(eventId, ator, req, opcoes);
  } catch (erro) {
    console.error("[espelho] não foi possível preencher as hospedagens do quarto —", erro instanceof Error ? erro.message : erro);
    return null;
  }
}
