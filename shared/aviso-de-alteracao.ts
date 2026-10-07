/**
 * AVISO DE ALTERAÇÃO PARA COMPRAS (02/10).
 *
 * Pedido de Compras: "Quando o Pedro aprovar alguma alteração de data/horário
 * em alguma prova, o sistema precisa me trazer essa informação. Ex.: bilhete já
 * emitido, pediram ajuste pelo sistema, o Pedro aprovou — quando voltar,
 * preciso saber o que mudou e em qual prova para poder atuar."
 *
 * Até aqui a aprovação aplicava o ajuste na vaga e só o histórico da vaga
 * registrava — Compras só descobria abrindo a vaga. Agora, quando a vaga já
 * tem passagem (ou hospedagem) registrada e o ajuste mexe no que ela depende,
 * nasce um aviso que fica na tela de Passagens/Hospedagem e no sino até alguém
 * de Compras marcar "Já atuei".
 *
 * Este módulo decide SE vira aviso e monta o "de → para" já em texto pt-BR
 * (o aviso guarda o texto — não depende de reformatar depois).
 */
import {
  TRANSPORT_MODE_LABELS,
  type InclusionDiffEntry,
  type ProposedField,
} from "./scaling-validation-rules";

/** Uma linha do aviso: "Ida · data: 29/10/2026 → 30/10/2026". */
export interface MudancaDoAviso {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
}

/** Campos que mexem na PASSAGEM já comprada/registrada. */
const CAMPOS_DE_PASSAGEM: ReadonlySet<ProposedField> = new Set<ProposedField>([
  "workDays",
  "flightDepartureDate",
  "flightDepartureSuggestedTime",
  "flightArrivalSuggestedTime",
  "flightReturnDate",
  "flightReturnSuggestedTime",
  "transportModeIda",
  "transportModeVolta",
  "needsTicket",
]);

/** Campos que mexem na HOSPEDAGEM já registrada (noites). */
const CAMPOS_DE_HOSPEDAGEM: ReadonlySet<ProposedField> = new Set<ProposedField>([
  "workDays",
  "flightDepartureDate",
  "flightReturnDate",
  "needsAccommodation",
]);

const ddmm = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}/${m[2]}` : ymd;
};
const ddmmaaaa = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
};

/** Valor de um campo do pedido em texto para Compras ler. Vazio vira "—". */
export function textoDoValor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((d) => ddmm(String(d))).join(", ") : "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (campo === "flightDepartureDate" || campo === "flightReturnDate") return ddmmaaaa(String(v));
  if (campo === "transportModeIda" || campo === "transportModeVolta") {
    return (TRANSPORT_MODE_LABELS as Record<string, string>)[String(v)] ?? String(v);
  }
  return String(v);
}

export interface AvisoMontado {
  mudancas: MudancaDoAviso[];
  afetaPassagem: boolean;
  afetaHospedagem: boolean;
}

/**
 * Vira aviso quando a vaga já tem passagem registrada e mudou algo da viagem,
 * ou já tem hospedagem registrada e mudou algo das noites. Sem nada registrado
 * não há o que refazer — Compras compra já com os dados novos da vaga.
 *
 * O aviso leva TODAS as mudanças aprovadas (inclusive observações e diárias),
 * para Compras ver o pedido inteiro; o gatilho é que só olha os campos acima.
 */
export function montarAvisoDeAlteracao(
  diff: readonly InclusionDiffEntry[],
  vaga: { temPassagem: boolean; temHospedagem: boolean },
): AvisoMontado | null {
  if (diff.length === 0) return null;
  const afetaPassagem = vaga.temPassagem && diff.some((d) => CAMPOS_DE_PASSAGEM.has(d.field));
  const afetaHospedagem = vaga.temHospedagem && diff.some((d) => CAMPOS_DE_HOSPEDAGEM.has(d.field));
  if (!afetaPassagem && !afetaHospedagem) return null;
  return {
    afetaPassagem,
    afetaHospedagem,
    mudancas: diff.map((d) => ({
      campo: d.field,
      rotulo: d.label,
      de: textoDoValor(d.field, d.from),
      para: textoDoValor(d.field, d.to),
    })),
  };
}

/** "Passagem", "Hospedagem" ou "Passagem e hospedagem" — o que Compras precisa rever. */
export function oQueRever(a: { afetaPassagem?: boolean | null; afetaHospedagem?: boolean | null }): string {
  if (a.afetaPassagem && a.afetaHospedagem) return "Passagem e hospedagem";
  return a.afetaPassagem ? "Passagem" : "Hospedagem";
}
