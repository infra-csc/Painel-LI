/**
 * Valores do hotel na aba Quartos do Espelho (20/10, pedido do dono): "a ideia
 * é colocar o valor total que estou pagando e ele distribuir, para saber
 * quanto estamos gastando com cada [apartamento]".
 *
 * 21/10 — MUDANÇA DE REGRA (dono, com print de produção: "o duplo é uma vez
 * só, pois é duas pessoas em um quarto duplo"). Até o dia 20 a tarifa era
 * lida POR PESSOA (Duplo R$ 200 → R$ 200 de cada um, R$ 400 o quarto por
 * noite); agora ela é o preço do APARTAMENTO por noite, DIVIDIDO entre quem
 * dorme nele. Nada foi migrado: os valores já gravados (ex.: R$ 200 no Duplo)
 * passam a ser lidos como preço do apartamento, que é o que o dono quis dizer.
 *
 * Regras:
 *  - a tarifa de cada tipo (Individual, Duplo, Triplo) é o preço do
 *    APARTAMENTO por noite. O custo do quarto numa noite é a tarifa do tipo
 *    daquela noite; cada pessoa paga tarifa ÷ pessoas da noite;
 *  - o tipo de cada NOITE vem de quantas pessoas dormem no quarto naquela
 *    noite (shared/ocupacao-por-noite.ts): no duplo em que um chega antes, as
 *    noites sozinho são Individual — e ele paga o apartamento Individual
 *    inteiro ("tem single até o Edney chegar");
 *  - um quarto pode ter a SUA diária (negociada à parte): é o preço DAQUELE
 *    apartamento por noite, em todas as noites dele, qualquer que seja a
 *    ocupação, dividido entre os ocupantes de cada noite. É um valor só (não
 *    um por tipo) porque é o mesmo apartamento alugado por um preço fechado —
 *    e assim o que já está gravado continua valendo sem migração;
 *  - noite com 4+ pessoas (o limite é 3, 09/10) não tem tarifa própria: usa a
 *    do Triplo (o apartamento) ÷ o número real de pessoas e vira AVISO;
 *  - hotel sem duplo ou sem triplo (22/10): a noite é cobrada pelo
 *    APARTAMENTO que o hotel usa — o menor tipo que ele tem e que comporta
 *    quem dorme (`apartamentoParaPessoas`): sem duplo, duas pessoas de um
 *    triplo pagam o Triplo. Tipo que o hotel não tem não tem tarifa (o valor
 *    gravado fica guardado, mas não entra na conta): a noite fica "sem tarifa"
 *    e o quarto aparece marcado na tela;
 *  - late check-out é um valor POR PESSOA marcada; sem valor escrito, vale a
 *    PARTE dela na última noite (tarifa ÷ ocupantes) — "igual à diária";
 *  - custo da pessoa = Σ a parte dela em cada trecho + late check-out — o
 *    "Hotel TT" da planilha.
 *
 * Centavos que não dividem certo (triplo de R$ 100 = 10.000 ÷ 3): a divisão é
 * feita no total do TRECHO (tarifa × noites) e o resto vai, 1 centavo cada,
 * para os primeiros da lista do trecho (a ordem dos ocupantes no quarto). A
 * soma das partes bate EXATAMENTE com o total do quarto.
 *
 * Tudo em CENTAVOS inteiros. O valor pago ao hotel (fatura do evento e,
 * opcionalmente, de cada quarto) só é COMPARADO com o calculado — nada é
 * redistribuído aqui.
 *
 * Puro e compartilhado: o servidor usa para o "Hotel" de cada pessoa no custo
 * do Espelho (`hotelTotalCents`) e a tela, para o detalhe de cada quarto — as
 * mesmas entradas dão os mesmos números nos dois lados.
 */
import { ocupacaoPorNoite, type TipoDoTrecho } from "./ocupacao-por-noite";
import { apartamentoParaPessoas, hotelTemOTipo, tiposDoHotelOuPadrao, type TiposDoHotel } from "./room-pairing";

export const TIPOS_DE_APARTAMENTO: readonly TipoDoTrecho[] = ["single", "double", "triple"];

/** "Individual" · "Duplo" · "Triplo" — como o dono chama os apartamentos. */
export function rotuloDoApartamento(tipo: TipoDoTrecho): string {
  return tipo === "single" ? "Individual" : tipo === "double" ? "Duplo" : "Triplo";
}

/** Tarifa de cada tipo = preço do APARTAMENTO por noite, em centavos (`null` = não definida). */
export type TarifasDoHotel = Record<TipoDoTrecho, number | null>;
export const SEM_TARIFAS: TarifasDoHotel = { single: null, double: null, triple: null };

/** Valores acima disto não são uma diária: são erro de digitação (R$ 100 mil). */
export const LIMITE_DA_DIARIA_CENTAVOS = 10_000_000;
/** Fatura/valor pago acima disto é erro de digitação (R$ 10 milhões). */
export const LIMITE_DO_VALOR_PAGO_CENTAVOS = 1_000_000_000;

/** Centavos válidos: inteiro, ≥ 0. Zero vale (cortesia); `null`/lixo = não definido. */
export const centavosValidos = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Divide `total` centavos entre `partes` pessoas sem perder nem criar
 * centavo: cada um fica com a divisão inteira e o resto vai, 1 centavo cada,
 * para os PRIMEIROS. 10.000 ÷ 3 → [3.334, 3.333, 3.333]. Soma = total, sempre.
 */
export function dividirCentavos(total: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.floor(total / partes);
  const resto = total - base * partes;
  return Array.from({ length: partes }, (_, i) => base + (i < resto ? 1 : 0));
}

export interface LateCheckoutDaPessoa {
  ativo: boolean;
  /** `null` = igual à parte da pessoa na última noite (tarifa ÷ ocupantes). */
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
  /** Preço deste apartamento por noite (negociado à parte) — vence a tarifa do evento em todas as noites dele. */
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
  /** Apartamentos que o hotel tem (22/10). Ausente = todos. */
  tipos?: Partial<TiposDoHotel> | null;
}

export interface TrechoComValor {
  de: string;
  ate: string;
  noites: number;
  /**
   * Apartamento da noite: pela ocupação (4+ pessoas → "triple") e, desde
   * 22/10, pelo que o hotel tem (sem duplo, 2 pessoas → "triple").
   */
  tipo: TipoDoTrecho;
  /** O hotel não tem apartamento para esta ocupação (ex.: 3 pessoas sem triplo) — a noite fica sem tarifa. */
  hotelNaoTem: boolean;
  pessoas: number;
  chaves: string[];
  /** Preço do APARTAMENTO por noite; `null` = sem tarifa para este tipo. */
  tarifaCentavos: number | null;
  origem: "quarto" | "evento" | null;
  /** 4 ou mais pessoas na mesma noite: tarifa do Triplo (o apartamento) ÷ pessoas, e aviso. */
  acimaDoTriplo: boolean;
  /** tarifa × noites (o apartamento no trecho); `null` sem tarifa. */
  totalCentavos: number | null;
  /** Parte de cada pessoa no trecho, alinhada com `chaves` (soma = total); `null` sem tarifa. */
  partesCentavos: number[] | null;
}

export interface CustoDaPessoaNoQuarto {
  chave: string;
  noites: number;
  /** A parte dela nas noites com tarifa. */
  diariasCentavos: number;
  noitesSemTarifa: number;
  /** Parte dela na última noite neste quarto (tarifa ÷ ocupantes) — a sugestão do late check-out. */
  parteDaUltimaNoiteCentavos: number | null;
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
  /** Noites de apartamento (room-nights) sem tarifa. */
  noitesSemTarifa: number;
  noitesDeQuarto: number;
  /** Σ pessoas × noites — só informação (a tarifa é por apartamento). */
  pessoasNoite: number;
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
  /** Diárias de APARTAMENTO (room-nights) deste tipo — a unidade da tarifa. */
  noitesDeQuarto: number;
  /** Pessoas × noites deste tipo — só informação. */
  pessoasNoite: number;
  /** Soma dos quartos neste tipo. */
  centavos: number;
  /** Noites de apartamento deste tipo sem tarifa definida. */
  noitesSemTarifa: number;
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

function custoDoQuartoSemLate(q: QuartoParaCusto, tarifas: TarifasDoHotel, tipos: TiposDoHotel) {
  // A mesma pessoa duas vezes no mesmo quarto (dado sujo) conta uma vez.
  const vistos = new Set<string>();
  const ocupantes = q.ocupantes.filter((o) => (vistos.has(o.chave) ? false : (vistos.add(o.chave), true)));
  const propria = centavosValidos(q.diariaPropriaCentavos) ? q.diariaPropriaCentavos : null;
  const trechos: TrechoComValor[] = ocupacaoPorNoite(ocupantes).map((t) => {
    // O apartamento que o hotel usa para esta ocupação (22/10); sem nenhum, o tipo da ocupação, sem tarifa.
    const apartamento = apartamentoParaPessoas(Math.min(t.ocupantes.length, 3), tipos);
    const tipo = apartamento ?? t.tipo;
    const tarifa = propria ?? (apartamento && centavosValidos(tarifas[apartamento]) ? (tarifas[apartamento] as number) : null);
    // O apartamento no trecho = tarifa × noites; dividido entre quem dorme nele.
    const total = tarifa === null ? null : tarifa * t.noites;
    return {
      de: t.de, ate: t.ate, noites: t.noites, tipo, hotelNaoTem: apartamento === null,
      pessoas: t.ocupantes.length,
      chaves: t.ocupantes.map((o) => o.chave),
      tarifaCentavos: tarifa,
      origem: propria !== null ? "quarto" : tarifa !== null ? "evento" : null,
      acimaDoTriplo: t.ocupantes.length > 3,
      totalCentavos: total,
      partesCentavos: total === null ? null : dividirCentavos(total, t.ocupantes.length),
    };
  });
  const pessoas = ocupantes.map((o) => {
    let noites = 0, diarias = 0, semTarifa = 0;
    let ultimo: { trecho: TrechoComValor; indice: number } | null = null;
    for (const t of trechos) {
      const k = t.chaves.indexOf(o.chave);
      if (k < 0) continue;
      noites += t.noites;
      if (t.partesCentavos === null) semTarifa += t.noites;
      else diarias += t.partesCentavos[k];
      if (!ultimo || t.ate > ultimo.trecho.ate) ultimo = { trecho: t, indice: k };
    }
    // Sugestão do late check-out: a parte dela em UMA noite do último trecho
    // (mesma regra do resto: os primeiros da lista ficam com o centavo a mais).
    const u = ultimo as { trecho: TrechoComValor; indice: number } | null;
    const parteDaUltima = u && u.trecho.tarifaCentavos !== null ? dividirCentavos(u.trecho.tarifaCentavos, u.trecho.pessoas)[u.indice] : null;
    return { chave: o.chave, checkOut: dia(o.checkOut), noites, diarias, semTarifa, parteDaUltima };
  });
  return { id: q.id, propria, trechos, pessoas, pago: centavosValidos(q.valorPagoCentavos) ? q.valorPagoCentavos : null };
}

export function custoDoHotel(e: EntradaDoCustoDoHotel): CustoDoHotel {
  const tipos = tiposDoHotelOuPadrao(e.tipos);
  const base = e.quartos.map((q) => custoDoQuartoSemLate(q, e.tarifas, tipos));

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
      const valorDoLate = late ? explicito ?? p.parteDaUltima : null;
      return {
        chave: p.chave,
        noites: p.noites,
        diariasCentavos: p.diarias,
        noitesSemTarifa: p.semTarifa,
        parteDaUltimaNoiteCentavos: p.parteDaUltima,
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
      pessoasNoite: q.trechos.reduce((s, t) => s + t.pessoas * t.noites, 0),
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
    const r: ResumoDoTipo = { tipo, noitesDeQuarto: 0, pessoasNoite: 0, centavos: 0, noitesSemTarifa: 0 };
    for (const q of quartos) {
      for (const t of q.trechos) {
        if (t.tipo !== tipo) continue;
        r.noitesDeQuarto += t.noites;
        r.pessoasNoite += t.pessoas * t.noites;
        if (t.totalCentavos === null) r.noitesSemTarifa += t.noites;
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
    tiposSemTarifa: porTipo.filter((t) => t.noitesSemTarifa > 0).map((t) => t.tipo),
    noitesAcimaDoTriplo: quartos.flatMap((q) => q.trechos.filter((t) => t.acimaDoTriplo).map((t) => ({ quartoId: q.id, de: t.de, ate: t.ate, pessoas: t.pessoas }))),
    temValores: TIPOS_DE_APARTAMENTO.some((t) => hotelTemOTipo(t, tipos) && centavosValidos(e.tarifas[t])) || quartos.some((q) => q.usaDiariaPropria),
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
  /** Apartamentos que o hotel tem (22/10; tem_duplo/tem_triplo). Ausente (servidor antigo) = todos. */
  tipos?: TiposDoHotel;
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
 * igual à parte da pessoa na última noite.
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
    tipos: valores?.tipos ?? null,
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
