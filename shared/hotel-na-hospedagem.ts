/**
 * Quarto CONFIRMADO no Espelho → HOSPEDAGEM da vaga (23/10) — regra pura, sem
 * banco, usada pelo servidor (server/hotel-na-hospedagem.ts) e pela aba
 * Quartos.
 *
 * Pedido do dono: "no espelho operacional, quando colocarmos o hotel, refletir
 * na passagem" — e, esclarecido: "basicamente, quando confirmar, deve
 * preencher lá na aba de Hospedagem com os dados". Antes o quarto vivia só em
 * `hotel_room_groups`; a hospedagem da vaga (`accommodations`), que Passagens,
 * Hospedagens, a Escalação e o status da vaga leem, continuava vazia.
 *
 * O que o "Confirmar" preenche, para cada pessoa do quarto (campos que a
 * hospedagem já tem — nenhuma coluna nova):
 *  - hotelName ............ o hotel do quarto;
 *  - checkInDate/OutDate .. o período DESTA pessoa no quarto (da passagem,
 *                           pela regra do Espelho — `periodoNoQuarto`);
 *  - roomType ............. Individual/Duplo/Triplo pela ocupação;
 *  - nightsCount .......... noites da pessoa no quarto;
 *  - totalCents ........... a parte dela pelos valores do hotel (só com todas
 *                           as noites com tarifa);
 *  - accommodationObservations "Divide o quarto com …" (não há campo próprio).
 *
 * Campo a campo:
 *  - vazio, ou igual ao que o Espelho escreveu da última vez
 *    (`hospedagens_do_espelho.campos`) → recebe o do quarto;
 *  - lançado à mão e diferente → FICA. Hotel, datas, tipo e valor viram
 *    "diferença" (a aba mostra, com "Usar os dados do quarto" = `forcar`);
 *    diárias e observações ficam sem aviso (texto livre / derivado).
 *  - o quarto deixou de ter o dado (ficou sozinho, tarifa apagada) e o valor
 *    era do Espelho → sai.
 * Quarto sem hotel não preenche nada. Hospedagem cancelada não é tocada.
 *
 * "Reservada" segue a regra que já existia (server/vaga-guards.ts →
 * `hospedagemConta`): hospedagem com hotel e não cancelada — então o status da
 * vaga anda (hospedagem_comprada / hospedagem_passagem_comprada) no Confirmar.
 */
import { chaveDoHotel, nomeDeHotelLimpo } from "./rooming-list";
import { tipoPorOcupantes } from "./room-pairing";
import { periodoNoQuarto } from "./custo-dos-quartos";
import type { MirrorRow, RoomGroup } from "./operational-mirror-types";

export const CAMPOS_DO_QUARTO = [
  "hotelName", "checkInDate", "checkOutDate", "roomType", "nightsCount", "totalCents", "accommodationObservations",
] as const;
export type CampoDoQuarto = (typeof CAMPOS_DO_QUARTO)[number];
export type ValorDoCampo = string | number | null;
/** O que o quarto confirmado diz para UMA pessoa. */
export type DadosDoQuarto = Record<CampoDoQuarto, ValorDoCampo>;
/** O que o Espelho escreveu (campo → valor). */
export type CamposDoEspelho = Partial<Record<CampoDoQuarto, ValorDoCampo>>;

/** Rótulo do campo e se a diferença à mão é mostrada (os outros ficam sem aviso). */
export const ROTULO_DO_CAMPO: Record<CampoDoQuarto, { rotulo: string; confere: boolean }> = {
  hotelName: { rotulo: "Hotel", confere: true },
  checkInDate: { rotulo: "Check-in", confere: true },
  checkOutDate: { rotulo: "Check-out", confere: true },
  roomType: { rotulo: "Tipo de quarto", confere: true },
  nightsCount: { rotulo: "Diárias", confere: false },
  totalCents: { rotulo: "Valor", confere: true },
  accommodationObservations: { rotulo: "Observações", confere: false },
};

/** A hospedagem da vaga como está no banco (só o que a regra lê). */
export type HospedagemParaReflexo = Partial<Record<CampoDoQuarto, ValorDoCampo | undefined>> & { hotelStatus?: string | null };

const dia = (v: unknown): string | null => {
  const s = v ? String(v).slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** Forma de comparar cada campo: hotel sem caixa/espaços, data AAAA-MM-DD, número, texto aparado. */
function normal(campo: CampoDoQuarto, v: unknown): string | null {
  if (vazio(v)) return null;
  if (campo === "hotelName") return chaveDoHotel(String(v));
  if (campo === "checkInDate" || campo === "checkOutDate") return dia(v);
  if (campo === "nightsCount" || campo === "totalCents") return Number.isFinite(Number(v)) ? String(Number(v)) : String(v);
  return String(v).trim();
}
const iguais = (campo: CampoDoQuarto, a: unknown, b: unknown) => normal(campo, a) === normal(campo, b);

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
function lista(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Noites entre duas datas AAAA-MM-DD (0 se faltar uma ou estiverem invertidas). */
function noitesEntre(entrada: string | null, saida: string | null): number {
  if (!entrada || !saida) return 0;
  const ms = Date.parse(`${saida}T00:00:00Z`) - Date.parse(`${entrada}T00:00:00Z`);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

/**
 * Os dados do quarto para UMA pessoa. `comQuem`: o nome de quem divide o
 * quarto com ela; `valor`: a parte dela pelos valores do hotel
 * (`row.hotelDosQuartos`).
 */
export function dadosDoQuarto(e: {
  hotelName: string | null | undefined;
  checkIn: string | null | undefined;
  checkOut: string | null | undefined;
  comQuem: readonly string[];
  valor?: { totalCentavos: number; noites: number; completo: boolean } | null;
}): DadosDoQuarto {
  const entrada = dia(e.checkIn);
  const saida = dia(e.checkOut);
  const noites = e.valor && e.valor.noites > 0 ? e.valor.noites : noitesEntre(entrada, saida);
  return {
    hotelName: nomeDeHotelLimpo(e.hotelName) || null,
    checkInDate: entrada,
    checkOutDate: saida,
    roomType: tipoPorOcupantes(e.comQuem.length + 1),
    nightsCount: noites > 0 ? noites : null,
    totalCents: e.valor?.completo && e.valor.totalCentavos > 0 ? e.valor.totalCentavos : null,
    accommodationObservations: e.comQuem.length ? `Divide o quarto com ${lista(e.comQuem)}` : null,
  };
}

export interface OcupanteDoQuarto {
  teamInclusionId: string;
  collaboratorId: string;
  nome: string;
  /** Precisa de hospedagem (ou já tem uma) — o Confirmar não cria para quem não precisa. */
  precisa: boolean;
  dados: DadosDoQuarto;
}

/**
 * Os dados de cada ocupante de um quarto, com a MESMA linha e o MESMO período
 * que a aba Quartos mostra (com duas vagas no evento, a última; estadia
 * própria → passagem → hospedagem → escala → quarto). Servidor e tela usam
 * esta função — o que se grava é o que se vê.
 */
export function ocupantesDoQuarto(
  grupo: Pick<RoomGroup, "hotelName" | "checkInDate" | "checkOutDate" | "members">,
  daPessoa: ReadonlyMap<string, MirrorRow>,
): OcupanteDoQuarto[] {
  const linhas = (grupo.members ?? []).map((m) => ({ m, r: daPessoa.get(m.collaboratorId) })).filter((x): x is { m: (typeof grupo.members)[number]; r: MirrorRow } => !!x.r);
  return linhas.map(({ m, r }) => {
    const periodo = periodoNoQuarto(m, r, grupo);
    return {
      teamInclusionId: r.teamInclusionId,
      collaboratorId: m.collaboratorId,
      nome: r.collaborator.fullName,
      precisa: !!r.accommodation || r.needsAccommodation !== false,
      dados: dadosDoQuarto({
        hotelName: grupo.hotelName, checkIn: periodo.checkIn, checkOut: periodo.checkOut,
        comQuem: linhas.filter((x) => x.r !== r).map((x) => x.r.collaborator.fullName),
        valor: r.hotelDosQuartos ?? null,
      }),
    };
  });
}

export interface DiferencaDoQuarto {
  campo: CampoDoQuarto;
  rotulo: string;
  naHospedagem: ValorDoCampo;
  doQuarto: ValorDoCampo;
}

export type MotivoDoReflexo = "criada" | "atualizada" | "igual" | "cancelada" | "sem-hotel";

export interface DecisaoDoReflexo {
  motivo: MotivoDoReflexo;
  /** Criar a hospedagem (não havia nenhuma). */
  criar: boolean;
  /** O que muda na hospedagem (vazio = nada). */
  campos: CamposDoEspelho;
  /** O que passa a ser "do Espelho" (o registro inteiro, campo → valor). */
  reflexo: CamposDoEspelho;
  /** Lançado à mão e diferente do quarto — NÃO aplicado (sem `forcar`). */
  diferencas: DiferencaDoQuarto[];
}

export function decidirReflexo(e: {
  hospedagem: HospedagemParaReflexo | null | undefined;
  reflexo: CamposDoEspelho | null | undefined;
  dados: DadosDoQuarto;
  /** "Usar os dados do quarto": aplica também sobre o lançado à mão. */
  forcar?: boolean;
}): DecisaoDoReflexo {
  const { dados } = e;
  const anterior = e.reflexo ?? {};
  const h = e.hospedagem;
  if (!dados.hotelName) return { motivo: "sem-hotel", criar: false, campos: {}, reflexo: { ...anterior }, diferencas: [] };

  if (!h) {
    const campos: CamposDoEspelho = {};
    for (const c of CAMPOS_DO_QUARTO) if (dados[c] !== null) campos[c] = dados[c];
    return { motivo: "criada", criar: true, campos, reflexo: { ...campos }, diferencas: [] };
  }
  if (h.hotelStatus === "cancelada") return { motivo: "cancelada", criar: false, campos: {}, reflexo: { ...anterior }, diferencas: [] };

  const campos: CamposDoEspelho = {};
  const reflexo: CamposDoEspelho = {};
  const diferencas: DiferencaDoQuarto[] = [];
  for (const c of CAMPOS_DO_QUARTO) {
    const doQuarto = dados[c];
    const atual = h[c] ?? null;
    const doEspelho = c in anterior && !vazio(atual) && iguais(c, anterior[c], atual);
    if (doQuarto === null) {
      // O quarto não tem mais o dado: sai só o que o Espelho tinha escrito.
      if (doEspelho) campos[c] = null;
      continue;
    }
    if (vazio(atual) || doEspelho) {
      if (!iguais(c, atual, doQuarto) || (c === "hotelName" && atual !== doQuarto)) campos[c] = doQuarto;
      reflexo[c] = doQuarto;
      continue;
    }
    if (iguais(c, atual, doQuarto)) continue; // lançado à mão, igual: nada a fazer
    if (e.forcar) {
      campos[c] = doQuarto;
      reflexo[c] = doQuarto;
    } else if (ROTULO_DO_CAMPO[c].confere) {
      diferencas.push({ campo: c, rotulo: ROTULO_DO_CAMPO[c].rotulo, naHospedagem: atual, doQuarto });
    }
  }
  return { motivo: Object.keys(campos).length ? "atualizada" : "igual", criar: false, campos, reflexo, diferencas };
}

/**
 * A hospedagem frente ao quarto CONFIRMADO — o que a aba Quartos mostra:
 *  - "preenchida": tem os dados do quarto;
 *  - "a-preencher": ainda não tem (sem hospedagem, ou campos vazios);
 *  - "desatualizada": o Espelho preencheu, e o quarto mudou depois (ex.: a
 *    passagem mudou as datas);
 *  - "difere": tem dados lançados à mão diferentes do quarto;
 *  - "cancelada": a hospedagem está cancelada.
 * `null`: quarto sem hotel (não há o que preencher).
 */
export type SituacaoDaHospedagem = "preenchida" | "a-preencher" | "desatualizada" | "difere" | "cancelada";

export function conferirHospedagem(
  hospedagem: HospedagemParaReflexo | null | undefined,
  reflexo: CamposDoEspelho | null | undefined,
  dados: DadosDoQuarto,
): { situacao: SituacaoDaHospedagem | null; diferencas: DiferencaDoQuarto[] } {
  const d = decidirReflexo({ hospedagem, reflexo, dados });
  if (d.motivo === "sem-hotel") return { situacao: null, diferencas: [] };
  if (d.motivo === "cancelada") return { situacao: "cancelada", diferencas: [] };
  if (d.criar) return { situacao: "a-preencher", diferencas: [] };
  if (d.diferencas.length) return { situacao: "difere", diferencas: d.diferencas };
  // Só observações/diárias mudando não pede conferência.
  const relevantes = Object.keys(d.campos).filter((c) => ROTULO_DO_CAMPO[c as CampoDoQuarto].confere);
  if (relevantes.length) return { situacao: reflexo && Object.keys(reflexo).length ? "desatualizada" : "a-preencher", diferencas: [] };
  return { situacao: "preenchida", diferencas: [] };
}

/**
 * Hospedagem "reservada" para as telas (Passagens): com hotel e não
 * cancelada — a MESMA regra de server/vaga-guards.ts → `hospedagemConta`, que
 * decide o status da vaga (o teste confere as duas).
 */
export function hospedagemReservada(a: { hotelName?: string | null; hotelStatus?: string | null } | null | undefined): boolean {
  return !!a && !!nomeDeHotelLimpo(a.hotelName) && a.hotelStatus !== "cancelada";
}

const TIPO: Record<string, string> = { single: "Individual", double: "Duplo", triple: "Triplo" };
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Valor de um campo para a tela ("12/11", "Duplo", "R$ 300,00"). */
export function textoDoCampo(campo: CampoDoQuarto, v: ValorDoCampo | undefined): string {
  if (vazio(v)) return "—";
  if (campo === "checkInDate" || campo === "checkOutDate") {
    const d = dia(v);
    return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : String(v);
  }
  if (campo === "roomType") return TIPO[String(v)] ?? String(v);
  if (campo === "totalCents") return BRL.format(Number(v) / 100);
  return String(v);
}
