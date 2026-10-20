/**
 * Valores do hotel na aba Quartos do Espelho (20/10, pedido do dono): "a ideia
 * é colocar o valor total que estou pagando e ele distribuir, para saber
 * quanto estamos gastando com cada [apartamento]".
 *
 * Regras (respostas do dono):
 *  - a tarifa é POR PESSOA, POR NOITE e por tipo de apartamento (Individual,
 *    Duplo, Triplo) — a planilha deles: duplo R$ 138, triplo R$ 132;
 *  - o tipo de cada NOITE vem de quantas pessoas dormem no quarto naquela
 *    noite (shared/ocupacao-por-noite.ts): no duplo em que um chega antes, as
 *    noites sozinho usam a tarifa Individual ("tem single até o Edney chegar");
 *  - um quarto pode ter a SUA diária por pessoa (negociada à parte): ela vale
 *    para todas as noites daquele quarto, qualquer que seja a ocupação;
 *  - late check-out é um valor POR PESSOA marcada; sem valor escrito, vale a
 *    diária da última noite dela (a sugestão do dono: "igual à diária");
 *  - custo da pessoa = Σ noites × tarifa da noite (ou a do quarto) + late
 *    check-out — o "Hotel TT" da planilha;
 *  - noite com 4+ pessoas (o limite é 3, 09/10) não tem tarifa própria: usa a
 *    do Triplo e vira AVISO, para alguém conferir o quarto.
 *
 * Tudo em CENTAVOS inteiros (tarifa × pessoas × noites nunca arredonda). O
 * valor pago ao hotel (fatura do evento e, opcionalmente, de cada quarto) só
 * é COMPARADO com o calculado — nada é redistribuído aqui.
 *
 * Puro e compartilhado: o servidor usa para o "Hotel" de cada pessoa no custo
 * do Espelho (`hotelTotalCents`) e a tela, para o detalhe de cada quarto — as
 * mesmas entradas dão os mesmos números nos dois lados.
 */
import { ocupacaoPorNoite, type TipoDoTrecho } from "./ocupacao-por-noite";

export const TIPOS_DE_APARTAMENTO: readonly TipoDoTrecho[] = ["single", "double", "triple"];

/** "Individual" · "Duplo" · "Triplo" — como o dono chama os apartamentos. */
export function rotuloDoApartamento(tipo: TipoDoTrecho): string {
  return tipo === "single" ? "Individual" : tipo === "double" ? "Duplo" : "Triplo";
}

/** Tarifa por pessoa por noite de cada tipo, em centavos (`null` = não definida). */
export type TarifasDoHotel = Record<TipoDoTrecho, number | null>;
export const SEM_TARIFAS: TarifasDoHotel = { single: null, double: null, triple: null };

/** Valores acima disto não são uma diária: são erro de digitação (R$ 100 mil). */
export const LIMITE_DA_DIARIA_CENTAVOS = 10_000_000;
/** Fatura/valor pago acima disto é erro de digitação (R$ 10 milhões). */
export const LIMITE_DO_VALOR_PAGO_CENTAVOS = 1_000_000_000;

/** Centavos válidos: inteiro, ≥ 0. Zero vale (cortesia); `null`/lixo = não definido. */
export const centavosValidos = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

export interface LateCheckoutDaPessoa {
  ativo: boolean;
  /** `null` = igual à diária da última noite da pessoa. */
  valorCentavos: number | null;
  /** "quartos": marcado na aba Quartos; "hospedagem": vem da hospedagem da vaga (grade). */
  origem: "quartos" | "hospedagem";
}

export interface OcupanteParaCusto {
  /** Identidade da pessoa no evento (collaboratorId): soma o custo de quem troca de quarto. */
  chave: string;
  checkIn: string | null | undefined;
  checkOut: string | null | undefined;
}

export interface QuartoParaCusto {
  id: string;
  /** Diária por pessoa só deste quarto — vence a tarifa do evento em todas as noites dele. */
  diariaPropriaCentavos?: number | null;
  /** O que o hotel cobrou por este quarto (opcional) — só para comparar. */
  valorPagoCentavos?: number | null;
  ocupantes: readonly OcupanteParaCusto[];
}

export interface EntradaDoCustoDoHotel {
  tarifas: TarifasDoHotel;
  quartos: readonly QuartoParaCusto[];
  /** Late check-out efetivo de cada pessoa (chave → marcação). */
  lateCheckouts?: ReadonlyMap<string, LateCheckoutDaPessoa>;
  /** Valor total pago ao hotel (fatura do evento). */
  faturaCentavos?: number | null;
}

export interface TrechoComValor {
  de: string;
  ate: string;
  noites: number;
  /** Tipo pela ocupação da noite (4+ pessoas → "triple"). */
  tipo: TipoDoTrecho;
  pessoas: number;
  chaves: string[];
  /** Por pessoa por noite; `null` = sem tarifa para este tipo. */
  tarifaCentavos: number | null;
  origem: "quarto" | "evento" | null;
  /** 4 ou mais pessoas na mesma noite: tarifa do Triplo e aviso. */
  acimaDoTriplo: boolean;
  /** tarifa × pessoas × noites; `null` sem tarifa. */
  totalCentavos: number | null;
}

export interface CustoDaPessoaNoQuarto {
  chave: string;
  noites: number;
  /** Só as noites com tarifa. */
  diariasCentavos: number;
  noitesSemTarifa: number;
  /** Tarifa da última noite dela neste quarto — a sugestão do late check-out. */
  ultimaDiariaCentavos: number | null;
  lateCheckout: { valorCentavos: number | null; sugerido: boolean; origem: LateCheckoutDaPessoa["origem"] } | null;
  totalCentavos: number;
  /** Todas as noites (e o late check-out, se houver) têm valor. */
  completo: boolean;
}

export interface CustoDoQuarto {
  id: string;
  trechos: TrechoComValor[];
  pessoas: CustoDaPessoaNoQuarto[];
  diariasCentavos: number;
  lateCheckoutCentavos: number;
  totalCentavos: number;
  completo: boolean;
  /** Noites de quarto (room-nights) sem tarifa. */
  noitesSemTarifa: number;
  noitesDeQuarto: number;
  usaDiariaPropria: boolean;
  diariaPropriaCentavos: number | null;
  acimaDoTriplo: boolean;
  valorPagoCentavos: number | null;
  /** pago − calculado (positivo: o hotel cobrou mais). `null` sem valor pago. */
  diferencaCentavos: number | null;
}

export interface CustoDaPessoa {
  chave: string;
  noites: number;
  diariasCentavos: number;
  lateCheckoutCentavos: number;
  totalCentavos: number;
  completo: boolean;
  quartos: string[];
}

export interface ResumoDoTipo {
  tipo: TipoDoTrecho;
  /** Diárias por pessoa (pessoas × noites) — a unidade da tarifa. */
  diarias: number;
  noitesDeQuarto: number;
  centavos: number;
  /** Diárias deste tipo sem tarifa definida. */
  diariasSemTarifa: number;
}

export interface CustoDoHotel {
  quartos: CustoDoQuarto[];
  porQuarto: Map<string, CustoDoQuarto>;
  porPessoa: Map<string, CustoDaPessoa>;
  porTipo: ResumoDoTipo[];
  lateCheckout: { pessoas: number; centavos: number };
  diariasCentavos: number;
  totalCentavos: number;
  completo: boolean;
  /** Pessoas com ao menos uma noite. */
  pessoas: number;
  custoMedioPorPessoaCentavos: number | null;
  /** Tipos com noites sem tarifa do evento (quarto com diária própria não entra). */
  tiposSemTarifa: TipoDoTrecho[];
  noitesAcimaDoTriplo: { quartoId: string; de: string; ate: string; pessoas: number }[];
  /** Há alguma tarifa (do evento ou de um quarto) — sem isso a tela mostra o vazio. */
  temValores: boolean;
  fatura: { pagoCentavos: number; diferencaCentavos: number; percentual: number | null } | null;
  pagoPorQuarto: { quartos: number; pagoCentavos: number; calculadoCentavos: number; diferencaCentavos: number } | null;
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})/;
const dia = (v: string | null | undefined): string | null => {
  const m = v ? String(v).match(DIA) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

function custoDoQuartoSemLate(q: QuartoParaCusto, tarifas: TarifasDoHotel) {
  // A mesma pessoa duas vezes no mesmo quarto (dado sujo) conta uma vez.
  const vistos = new Set<string>();
  const ocupantes = q.ocupantes.filter((o) => (vistos.has(o.chave) ? false : (vistos.add(o.chave), true)));
  const propria = centavosValidos(q.diariaPropriaCentavos) ? q.diariaPropriaCentavos : null;
  const trechos: TrechoComValor[] = ocupacaoPorNoite(ocupantes).map((t) => {
    const tarifa = propria ?? (centavosValidos(tarifas[t.tipo]) ? (tarifas[t.tipo] as number) : null);
    return {
      de: t.de, ate: t.ate, noites: t.noites, tipo: t.tipo,
      pessoas: t.ocupantes.length,
      chaves: t.ocupantes.map((o) => o.chave),
      tarifaCentavos: tarifa,
      origem: propria !== null ? "quarto" : tarifa !== null ? "evento" : null,
      acimaDoTriplo: t.ocupantes.length > 3,
      totalCentavos: tarifa === null ? null : tarifa * t.ocupantes.length * t.noites,
    };
  });
  const pessoas = ocupantes.map((o) => {
    let noites = 0, diarias = 0, semTarifa = 0;
    let ultimo: TrechoComValor | null = null;
    for (const t of trechos) {
      if (!t.chaves.includes(o.chave)) continue;
      noites += t.noites;
      if (t.tarifaCentavos === null) semTarifa += t.noites;
      else diarias += t.tarifaCentavos * t.noites;
      if (!ultimo || t.ate > ultimo.ate) ultimo = t;
    }
    return { chave: o.chave, checkOut: dia(o.checkOut), noites, diarias, semTarifa, ultimaDiaria: ultimo ? (ultimo as TrechoComValor).tarifaCentavos : null };
  });
  return { id: q.id, propria, trechos, pessoas, pago: centavosValidos(q.valorPagoCentavos) ? q.valorPagoCentavos : null };
}

export function custoDoHotel(e: EntradaDoCustoDoHotel): CustoDoHotel {
  const base = e.quartos.map((q) => custoDoQuartoSemLate(q, e.tarifas));

  // Late check-out: uma vez por pessoa, no quarto de onde ela sai por último.
  const lateNoQuarto = new Map<string, string>(); // chave → id do quarto
  for (const [chave, late] of Array.from(e.lateCheckouts?.entries() ?? [])) {
    if (!late.ativo) continue;
    let melhor: { quarto: string; saida: string } | null = null;
    for (const q of base) {
      const p = q.pessoas.find((x) => x.chave === chave && x.noites > 0);
      if (p?.checkOut && (!melhor || p.checkOut > melhor.saida)) melhor = { quarto: q.id, saida: p.checkOut };
    }
    if (melhor) lateNoQuarto.set(chave, melhor.quarto);
  }

  const quartos: CustoDoQuarto[] = base.map((q) => {
    const pessoas: CustoDaPessoaNoQuarto[] = q.pessoas.map((p) => {
      const late = lateNoQuarto.get(p.chave) === q.id ? e.lateCheckouts?.get(p.chave) ?? null : null;
      const explicito = late && centavosValidos(late.valorCentavos) ? late.valorCentavos : null;
      const valorDoLate = late ? explicito ?? p.ultimaDiaria : null;
      return {
        chave: p.chave,
        noites: p.noites,
        diariasCentavos: p.diarias,
        noitesSemTarifa: p.semTarifa,
        ultimaDiariaCentavos: p.ultimaDiaria,
        lateCheckout: late ? { valorCentavos: valorDoLate, sugerido: explicito === null, origem: late.origem } : null,
        totalCentavos: p.diarias + (valorDoLate ?? 0),
        completo: p.semTarifa === 0 && (!late || valorDoLate !== null),
      };
    });
    const diarias = q.trechos.reduce((s, t) => s + (t.totalCentavos ?? 0), 0);
    const lateCentavos = pessoas.reduce((s, p) => s + (p.lateCheckout?.valorCentavos ?? 0), 0);
    const total = diarias + lateCentavos;
    return {
      id: q.id,
      trechos: q.trechos,
      pessoas,
      diariasCentavos: diarias,
      lateCheckoutCentavos: lateCentavos,
      totalCentavos: total,
      completo: pessoas.every((p) => p.completo) && q.trechos.every((t) => t.tarifaCentavos !== null),
      noitesSemTarifa: q.trechos.reduce((s, t) => s + (t.tarifaCentavos === null ? t.noites : 0), 0),
      noitesDeQuarto: q.trechos.reduce((s, t) => s + t.noites, 0),
      usaDiariaPropria: q.propria !== null,
      diariaPropriaCentavos: q.propria,
      acimaDoTriplo: q.trechos.some((t) => t.acimaDoTriplo),
      valorPagoCentavos: q.pago,
      diferencaCentavos: q.pago === null ? null : q.pago - total,
    };
  });

  const porPessoa = new Map<string, CustoDaPessoa>();
  for (const q of quartos) {
    for (const p of q.pessoas) {
      const atual = porPessoa.get(p.chave) ?? { chave: p.chave, noites: 0, diariasCentavos: 0, lateCheckoutCentavos: 0, totalCentavos: 0, completo: true, quartos: [] };
      atual.noites += p.noites;
      atual.diariasCentavos += p.diariasCentavos;
      atual.lateCheckoutCentavos += p.lateCheckout?.valorCentavos ?? 0;
      atual.totalCentavos += p.totalCentavos;
      atual.completo = atual.completo && p.completo;
      if (!atual.quartos.includes(q.id)) atual.quartos.push(q.id);
      porPessoa.set(p.chave, atual);
    }
  }

  const porTipo: ResumoDoTipo[] = TIPOS_DE_APARTAMENTO.map((tipo) => {
    const r: ResumoDoTipo = { tipo, diarias: 0, noitesDeQuarto: 0, centavos: 0, diariasSemTarifa: 0 };
    for (const q of quartos) {
      for (const t of q.trechos) {
        if (t.tipo !== tipo) continue;
        r.diarias += t.pessoas * t.noites;
        r.noitesDeQuarto += t.noites;
        if (t.totalCentavos === null) r.diariasSemTarifa += t.pessoas * t.noites;
        else r.centavos += t.totalCentavos;
      }
    }
    return r;
  });

  const diariasCentavos = quartos.reduce((s, q) => s + q.diariasCentavos, 0);
  const lateCentavos = quartos.reduce((s, q) => s + q.lateCheckoutCentavos, 0);
  const totalCentavos = diariasCentavos + lateCentavos;
  const pessoas = Array.from(porPessoa.values()).filter((p) => p.noites > 0).length;
  const fatura = centavosValidos(e.faturaCentavos) ? e.faturaCentavos : null;
  const comPago = quartos.filter((q) => q.valorPagoCentavos !== null);

  return {
    quartos,
    porQuarto: new Map(quartos.map((q) => [q.id, q])),
    porPessoa,
    porTipo,
    lateCheckout: { pessoas: quartos.reduce((n, q) => n + q.pessoas.filter((p) => p.lateCheckout).length, 0), centavos: lateCentavos },
    diariasCentavos,
    totalCentavos,
    completo: quartos.every((q) => q.completo),
    pessoas,
    custoMedioPorPessoaCentavos: pessoas > 0 && totalCentavos > 0 ? Math.round(totalCentavos / pessoas) : null,
    tiposSemTarifa: porTipo.filter((t) => t.diariasSemTarifa > 0).map((t) => t.tipo),
    noitesAcimaDoTriplo: quartos.flatMap((q) => q.trechos.filter((t) => t.acimaDoTriplo).map((t) => ({ quartoId: q.id, de: t.de, ate: t.ate, pessoas: t.pessoas }))),
    temValores: TIPOS_DE_APARTAMENTO.some((t) => centavosValidos(e.tarifas[t])) || quartos.some((q) => q.usaDiariaPropria),
    fatura: fatura === null ? null : {
      pagoCentavos: fatura,
      diferencaCentavos: fatura - totalCentavos,
      percentual: totalCentavos > 0 ? (fatura - totalCentavos) / totalCentavos : null,
    },
    pagoPorQuarto: comPago.length === 0 ? null : {
      quartos: comPago.length,
      pagoCentavos: comPago.reduce((s, q) => s + (q.valorPagoCentavos ?? 0), 0),
      calculadoCentavos: comPago.reduce((s, q) => s + q.totalCentavos, 0),
      diferencaCentavos: comPago.reduce((s, q) => s + (q.diferencaCentavos ?? 0), 0),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Do Espelho para a entrada do cálculo — a MESMA montagem no servidor e na tela.
// ─────────────────────────────────────────────────────────────────────────────

/** O que fica gravado (tabelas hotel_tarifas_evento, hotel_valores_quarto, hotel_late_checkouts). */
export interface ValoresDoHotelSalvos {
  tarifas: TarifasDoHotel;
  faturaCentavos: number | null;
  quartos: { quartoId: string; diariaPropriaCentavos: number | null; valorPagoCentavos: number | null }[];
  lateCheckouts: { collaboratorId: string; ativo: boolean; valorCentavos: number | null }[];
}

export interface MembroParaCusto {
  id?: string | null;
  collaboratorId?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}
export interface GrupoParaCusto {
  id: string;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  members?: readonly MembroParaCusto[] | null;
}
export interface LinhaParaCusto {
  collaborator: { id: string | null };
  datasDoQuarto?: { checkIn: string | null; checkOut: string | null } | null;
  accommodation?: { checkInDate?: string | null; checkOutDate?: string | null; lateCheckout?: boolean | null } | null;
  schedule?: { startDate: string | null; endDate: string | null } | null;
}

/**
 * Entrada e saída de UMA pessoa num quarto — a mesma ordem que a aba Quartos
 * sempre mostrou: estadia própria no quarto → regra da passagem (09/10) →
 * hospedagem → escala → período do quarto.
 */
export function periodoNoQuarto(
  membro: MembroParaCusto | null | undefined,
  linha: LinhaParaCusto | null | undefined,
  grupo: Pick<GrupoParaCusto, "checkInDate" | "checkOutDate">,
): { checkIn: string | null; checkOut: string | null } {
  const dq = linha?.datasDoQuarto;
  return {
    checkIn: membro?.checkInDate || dq?.checkIn || linha?.accommodation?.checkInDate || linha?.schedule?.startDate || grupo.checkInDate || null,
    checkOut: membro?.checkOutDate || dq?.checkOut || linha?.accommodation?.checkOutDate || linha?.schedule?.endDate || grupo.checkOutDate || null,
  };
}

/** Linha do Espelho de cada colaborador (com duas vagas no evento, vale a última — como a tela). */
export function linhaPorColaborador<L extends LinhaParaCusto>(linhas: readonly L[]): Map<string, L> {
  return new Map(linhas.filter((l) => l.collaborator.id).map((l) => [l.collaborator.id as string, l]));
}

/** Chave da pessoa no cálculo: o colaborador; sem ele, o próprio ocupante. */
export const chaveDoOcupante = (m: MembroParaCusto, indice: number, grupoId: string): string =>
  m.collaboratorId || (m.id ? `ocupante:${m.id}` : `ocupante:${grupoId}:${indice}`);

/**
 * Late check-out efetivo: o marcado na aba Quartos vence; sem marcação lá, a
 * caixa "Late check-out" da hospedagem da vaga (grade) conta, com o valor
 * igual à diária.
 */
export function lateCheckoutsEfetivos(
  linhas: readonly LinhaParaCusto[],
  salvos: ValoresDoHotelSalvos["lateCheckouts"],
): Map<string, LateCheckoutDaPessoa> {
  const m = new Map<string, LateCheckoutDaPessoa>();
  for (const l of linhas) {
    if (l.collaborator.id && l.accommodation?.lateCheckout) m.set(l.collaborator.id, { ativo: true, valorCentavos: null, origem: "hospedagem" });
  }
  for (const s of salvos) {
    if (s.ativo) m.set(s.collaboratorId, { ativo: true, valorCentavos: centavosValidos(s.valorCentavos) ? s.valorCentavos : null, origem: "quartos" });
    else m.delete(s.collaboratorId);
  }
  return m;
}

export function entradaDoCustoDoHotel(
  grupos: readonly GrupoParaCusto[],
  linhas: readonly LinhaParaCusto[],
  valores: ValoresDoHotelSalvos | null | undefined,
): EntradaDoCustoDoHotel {
  const porColab = linhaPorColaborador(linhas);
  const doQuarto = new Map((valores?.quartos ?? []).map((q) => [q.quartoId, q]));
  return {
    tarifas: valores?.tarifas ?? SEM_TARIFAS,
    faturaCentavos: valores?.faturaCentavos ?? null,
    lateCheckouts: lateCheckoutsEfetivos(linhas, valores?.lateCheckouts ?? []),
    quartos: grupos.map((g) => ({
      id: g.id,
      diariaPropriaCentavos: doQuarto.get(g.id)?.diariaPropriaCentavos ?? null,
      valorPagoCentavos: doQuarto.get(g.id)?.valorPagoCentavos ?? null,
      ocupantes: (g.members ?? []).map((m, i) => ({
        chave: chaveDoOcupante(m, i, g.id),
        ...periodoNoQuarto(m, m.collaboratorId ? porColab.get(m.collaboratorId) : undefined, g),
      })),
    })),
  };
}
