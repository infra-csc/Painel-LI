/**
 * Vagas canceladas no Espelho Operacional (23/10) — regra pura, sem banco.
 *
 * Caso real (Night Run Curitiba, 23/10): o evento mudou de data, as vagas
 * antigas foram canceladas com a passagem das datas antigas ainda registrada,
 * e o Espelho continuava com elas na grade, nos quartos e no Uber — o
 * "Quarto 1" juntou quem viajava 14→19/10 (cancelada) com quem viaja
 * 28/10→02/11. Dono: "Sistema está misturando prova que foi cancelada com
 * provas novas".
 *
 * Decisões:
 *  - vaga cancelada (status ou fase, `ehVagaCancelada`) e vaga excluída saem
 *    das listas operacionais: grade, pessoas, departamentos, pendências,
 *    quartos e carros;
 *  - quarto/carro JÁ GRAVADO com alguém que não tem mais vaga ativa no evento:
 *    a pessoa sai na LEITURA (`tirarQuemSaiuDoEspelho`); o vínculo no banco
 *    não é apagado — o "Refazer sugestões" refaz os não confirmados, e o
 *    confirmado avisa ("uma vaga deste quarto foi cancelada") até alguém
 *    reabrir. Grupo que fica vazio some da tela;
 *  - o dinheiro já gasto na vaga cancelada (passagem, inclusive a de
 *    histórico de troca, hospedagem, bagagem, Uber, locação) CONTINUA no
 *    custo do evento, como já somava antes — agora num bloco à parte, "Vagas
 *    canceladas com custo", para revisar reembolso/remarcação.
 */
import { hotelTotalCents, type LinhaDoHotel } from "./operational-mirror-types";

/** Quem saiu de um quarto/carro na leitura, e por quê. */
export interface OcupanteForaDoEspelho {
  collaboratorId: string;
  nome: string;
  motivo: "cancelada" | "excluida";
}

/**
 * Tira dos grupos (quartos ou carros) quem não tem vaga ATIVA no evento.
 * `foraDoEspelho` diz quem saiu; grupo que tinha gente e ficou vazio some.
 * Grupo que já vinha vazio do banco fica como estava (não é desta regra).
 */
export function tirarQuemSaiuDoEspelho<M extends { collaboratorId: string }, G extends { members: M[] }>(
  grupos: readonly G[],
  ativos: ReadonlySet<string>,
  cancelados: ReadonlyMap<string, string>,
  nomeDe: (collaboratorId: string) => string = () => "—",
): (G & { foraDoEspelho: OcupanteForaDoEspelho[] })[] {
  const saida: (G & { foraDoEspelho: OcupanteForaDoEspelho[] })[] = [];
  for (const g of grupos) {
    const ficam = g.members.filter((m) => ativos.has(m.collaboratorId));
    const sairam = g.members.filter((m) => !ativos.has(m.collaboratorId));
    if (sairam.length > 0 && ficam.length === 0) continue;
    saida.push({
      ...g,
      members: ficam,
      foraDoEspelho: sairam.map((m) => ({
        collaboratorId: m.collaboratorId,
        nome: cancelados.get(m.collaboratorId) ?? nomeDe(m.collaboratorId),
        motivo: cancelados.has(m.collaboratorId) ? "cancelada" as const : "excluida" as const,
      })),
    });
  }
  return saida;
}

/** O aviso de um quarto/carro CONFIRMADO de onde alguém saiu. `null` = nada a avisar. */
export function avisoDeQuemSaiu(fora: readonly OcupanteForaDoEspelho[] | null | undefined, tipo: "quarto" | "carro"): string | null {
  if (!fora || fora.length === 0) return null;
  const canceladas = fora.filter((o) => o.motivo === "cancelada");
  const excluidas = fora.filter((o) => o.motivo === "excluida");
  const deste = tipo === "quarto" ? "deste quarto" : "deste carro";
  const partes: string[] = [];
  if (canceladas.length === 1) partes.push(`Uma vaga ${deste} foi cancelada (${canceladas[0].nome})`);
  else if (canceladas.length > 1) partes.push(`${canceladas.length} vagas ${deste} foram canceladas (${canceladas.map((o) => o.nome).join(", ")})`);
  if (excluidas.length === 1) partes.push(`${canceladas.length ? "e uma" : "Uma"} vaga ${deste} foi excluída (${excluidas[0].nome})`);
  else if (excluidas.length > 1) partes.push(`${canceladas.length ? "e" : ""} ${excluidas.length} vagas ${deste} foram excluídas`.trim());
  return `${partes.join(" ")} — a pessoa saiu da lista. ${tipo === "quarto" ? "Avise o hotel e reabra o quarto" : "Ajuste o carro e reabra-o"} para refazer.`;
}

// ── Custo da vaga cancelada ─────────────────────────────────────────────────

export interface PassagemParaCusto {
  value?: number | null;
  ticketStatus?: string | null;
  actualDepartureDate?: string | null;
  actualReturnDate?: string | null;
}
export interface HospedagemParaCusto {
  hotelName?: string | null;
  hotelStatus?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  totalCents?: number | null;
  dailyRate?: number | null;
  nightsCount?: number | null;
}

export interface EntradaDaVagaCancelada {
  teamInclusionId: string;
  inclusionNumber: number | null;
  collaborator: { id: string | null; fullName: string };
  function: { name: string | null; area: string | null; costCenter: string | null };
  schedule: { startDate: string | null; endDate: string | null; dailyRates: number | null };
  passagem: PassagemParaCusto | null;
  /** Passagens de HISTÓRICO (troca aprovada) desta vaga, em centavos. */
  historicoCentavos: number;
  hospedagem: HospedagemParaCusto | null;
  bagagemCentavos: number;
  uberCentavos: number;
  locacaoCentavos: number;
}

export interface VagaCanceladaComCusto {
  teamInclusionId: string;
  inclusionNumber: number | null;
  collaborator: { id: string | null; fullName: string };
  function: { name: string | null; area: string | null; costCenter: string | null };
  schedule: { startDate: string | null; endDate: string | null };
  passagem: {
    valorCentavos: number;
    historicoCentavos: number;
    ida: string | null;
    volta: string | null;
    status: string | null;
    /** Registrada e não cancelada — ainda vale (regra de `passagemConta`). */
    viva: boolean;
  } | null;
  hospedagem: {
    valorCentavos: number;
    hotelName: string | null;
    checkIn: string | null;
    checkOut: string | null;
    status: string | null;
    viva: boolean;
  } | null;
  passagemCentavos: number;
  hotelCentavos: number;
  bagagemCentavos: number;
  uberCentavos: number;
  locacaoCentavos: number;
  totalCentavos: number;
  /** Ainda tem passagem ou hospedagem valendo — é o que o aviso do topo conta. */
  revisar: boolean;
}

const dia = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
const centavos = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * O custo de uma vaga cancelada, pelas MESMAS regras do Espelho: passagem
 * (valor da linha + histórico de troca), hotel pela regra única
 * `hotelTotalCents` (lançado; senão diária × noites — a vaga saiu dos
 * quartos, então não há conta por noite), bagagem, Uber e locação.
 * `null` = a vaga não tem nada (nem registro, nem dinheiro) — não entra no bloco.
 */
export function custoDaVagaCancelada(e: EntradaDaVagaCancelada): VagaCanceladaComCusto | null {
  const t = e.passagem;
  const a = e.hospedagem;
  const passagemViva = !!t && t.ticketStatus !== "cancelada";
  // Hospedagem "valendo": registrada com algum dado (hotel, entrada ou valor) e
  // não cancelada. Mais larga que hospedagemConta (que exige o hotel) de
  // propósito: reserva com "hotel a definir" também precisa ser desfeita.
  const temDado = !!a && (!!(a.hotelName && String(a.hotelName).trim()) || !!a.checkInDate || centavos(a.totalCents) > 0 || centavos(a.dailyRate) > 0);
  const hospedagemViva = temDado && a?.hotelStatus !== "cancelada";
  const passagemCentavos = centavos(t?.value) + centavos(e.historicoCentavos);
  const hotelCentavos = a
    // A regra única do hotel (lançado; senão diária × noites). Só os campos que ela lê.
    ? hotelTotalCents({ accommodation: a, schedule: { dailyRates: e.schedule.dailyRates } } as unknown as LinhaDoHotel)
    : 0;
  const totalCentavos = passagemCentavos + hotelCentavos + centavos(e.bagagemCentavos) + centavos(e.uberCentavos) + centavos(e.locacaoCentavos);
  if (!t && !a && totalCentavos === 0) return null;
  return {
    teamInclusionId: e.teamInclusionId,
    inclusionNumber: e.inclusionNumber,
    collaborator: e.collaborator,
    function: e.function,
    schedule: { startDate: e.schedule.startDate, endDate: e.schedule.endDate },
    passagem: t || e.historicoCentavos ? {
      valorCentavos: passagemCentavos,
      historicoCentavos: centavos(e.historicoCentavos),
      ida: dia(t?.actualDepartureDate),
      volta: dia(t?.actualReturnDate),
      status: t?.ticketStatus ?? null,
      viva: passagemViva,
    } : null,
    hospedagem: a ? {
      valorCentavos: hotelCentavos,
      hotelName: a.hotelName ?? null,
      checkIn: dia(a.checkInDate),
      checkOut: dia(a.checkOutDate),
      status: a.hotelStatus ?? null,
      viva: hospedagemViva,
    } : null,
    passagemCentavos,
    hotelCentavos,
    bagagemCentavos: centavos(e.bagagemCentavos),
    uberCentavos: centavos(e.uberCentavos),
    locacaoCentavos: centavos(e.locacaoCentavos),
    totalCentavos,
    revisar: passagemViva || hospedagemViva,
  };
}

/** "2 vagas canceladas ainda têm passagem ou hospedagem — revisar". `null` sem nenhuma. */
export function avisoDasCanceladas(revisar: number): string | null {
  if (revisar <= 0) return null;
  return revisar === 1
    ? "1 vaga cancelada ainda tem passagem ou hospedagem — revisar"
    : `${revisar} vagas canceladas ainda têm passagem ou hospedagem — revisar`;
}
