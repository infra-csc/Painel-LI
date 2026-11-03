/**
 * Pré-preenchimento do passo 2 do "Dividir escalação" para o NOVO colaborador
 * (29/10 — reclamação do dono: "para o novo colaborador só aparece a diária").
 *
 * Antes, alimentação e mobilidade do novo eram a média por dia do TITULAR ×
 * dias escolhidos. Titular freela (não recebe alimentação, regra 26/08) ou sem
 * mobilidade ⇒ o novo nascia só com a diária, mesmo sendo casa/local.
 *
 * Agora:
 * - ALIMENTAÇÃO segue as regras do NOVO colaborador, com as funções puras de
 *   shared/alimentacao.ts (nada de regra duplicada aqui):
 *     · perfil da refeição pela função da vaga (`refeicaoPerfil`: demais /
 *       ceno / gestão) e o valor do dia pelo tipo dele (`refeicaoCentsDia`:
 *       freela → 0; casa em dia útil → almoço reduzido ou o que falta do VR
 *       cadastrado; fim de semana e local → valor cheio), lendo o Valores Padrão;
 *     · DIAS INTEIROS (almoço + jantar) em cada dia escolhido. Os horários de
 *       voo da vaga são da viagem do titular — o novo colaborador não tem
 *       passagem própria aqui —, então nenhum corte de chegada/partida é
 *       aplicado (é o "dia de meio" de `calcAlimentacao`, e é também como o
 *       editor do Realizado trata um pedaço da divisão que não é a ponta da
 *       viagem). Quem precisar do corte ajusta o campo ou usa "Recalcular" no
 *       editor da prestação depois;
 *     · sem alimentação nos casos que o Planejado já zera: percurso (pacote
 *       fechado), função local e vaga com empreita (shared/budget-engine.ts).
 * - DIÁRIA (decisão do dono, 29/10): segue o tipo do NOVO colaborador, igual
 *   ao Planejado (`regraDiariaPorTipo`; percurso = todos os dias): casa (CLT) →
 *   sem diária em dia útil e a diária no fim de semana; cenotécnica de casa →
 *   sem diária; freela/local → todos os dias. O VALOR por dia é o da diária do
 *   titular (o que a vaga paga hoje).
 * - MOBILIDADE: proporção do titular (total dele × dias escolhidos ÷ dias
 *   dele) quando ele tem; sem mobilidade no titular, 0 — o usuário digita.
 *
 * Os valores continuam editáveis no passo 2; `origem*` é o texto curto que a
 * tela mostra para dizer de onde veio cada número.
 */
import { refeicaoCentsDia, refeicaoPerfil, vrValido, type RefeicaoPerfil } from "@shared/alimentacao";
import { isFuncaoLocal, isPercursoFunction, regraDiariaPorTipo, type RegraDiaria } from "@shared/calculation-rules";
import { formatarMoeda } from "@/lib/format";
import { isWeekend } from "./split-shared";

export interface EntradaDoNovo {
  /** Dias escolhidos para o novo colaborador (YYYY-MM-DD). */
  dias: string[];
  /** `collaborators.type` do NOVO colaborador: casa | freela | local. */
  tipoColaborador: string | null | undefined;
  /** VR diário do cadastro do novo colaborador (centavos) — só vale para casa. */
  vrDiarioCents?: number | null;
  /** Nome da função da vaga dividida. */
  functionName?: string | null;
  /** `atendimentoTipo` da vaga (Key Account vira perfil "gestão"). */
  atendimentoTipo?: string | null;
  /** A vaga tem empreita por empresa (`vagaComEmpreita`)? */
  empreita?: boolean;
  /** Valores Padrão (`/api/system-settings`). */
  settings?: Record<string, number | string | undefined> | null;
  /** Mobilidade total do titular (centavos) e quantos dias ele tinha. */
  mobilidadeTitular: number;
  diasTitular: number;
  /** Diária (centavos/dia) da prestação do titular — o valor por dia do novo. */
  diariaTitular: number;
  /** 29/10: sem logística não entra janta (shared/regras-de-29-10); os dias de carregamento têm. */
  semJanta?: boolean;
  diasCarregamento?: readonly (string | null | undefined)[] | null;
}

export interface PreenchimentoDoNovo {
  /** Diária por dia útil / por dia de fim de semana (centavos). */
  valorDiariaUtil: number;
  valorDiariaFds: number;
  /** Ex.: "Casa (CLT): sem diária em dia útil; fim de semana R$ 150,00 por dia (diária do titular)." */
  origemDiarias: string;
  weekdayLunch: number;
  weekdayDinner: number;
  weekendLunch: number;
  weekendDinner: number;
  mobility: number;
  /** Ex.: "Pela regra do colaborador: casa · dia útil R$ 5,00 + R$ 40,00". */
  origemAlimentacao: string;
  /** Ex.: "Proporcional ao titular: 2 de 5 dias". */
  origemMobilidade: string;
}

const NOME_DO_PERFIL: Record<RefeicaoPerfil, string> = { demais: "", ceno: "cenotécnica", gestao: "gestão" };
const NOME_DO_TIPO: Record<string, string> = { casa: "casa", freela: "freela", local: "local" };
const NOME_DO_TIPO_TITULO: Record<string, string> = { casa: "Casa", freela: "Freela", local: "Local" };

const dia = (n: number) => (n === 1 ? "dia" : "dias");

/**
 * A janta que fica com o titular num grupo de dias (útil ou fim de semana). Com
 * dia de carregamento marcado, a janta é só desses dias (29/10); sem marca, o
 * rateio por dia de sempre (janta lançada à mão).
 */
export function jantaQueFica(a: { totalCents: number; dias: readonly string[]; ficam: readonly string[]; carregamento?: readonly (string | null | undefined)[] | null }): number {
  if (a.dias.length === 0 || a.totalCents <= 0) return 0;
  const marcas = new Set((a.carregamento ?? []).map((d) => String(d ?? "").slice(0, 10)));
  const marcadosDoGrupo = a.dias.filter((d) => marcas.has(d));
  if (marcadosDoGrupo.length === 0) return Math.round((a.totalCents / a.dias.length) * a.ficam.length);
  return Math.round((a.totalCents / marcadosDoGrupo.length) * a.ficam.filter((d) => marcas.has(d)).length);
}

export function preencherValoresDoNovo(e: EntradaDoNovo): PreenchimentoDoNovo {
  const uteis = e.dias.filter(d => !isWeekend(d)).length;
  const fds = e.dias.length - uteis;

  // ── Mobilidade: proporção do titular (ou 0) ────────────────────────────────
  const mobTitular = Math.max(0, e.mobilidadeTitular || 0);
  const mobility = mobTitular > 0 && e.diasTitular > 0
    ? Math.round(mobTitular * e.dias.length / e.diasTitular)
    : 0;
  const origemMobilidade = mobility > 0
    ? `Proporcional ao titular: ${e.dias.length} de ${e.diasTitular} ${dia(e.diasTitular)} (${formatarMoeda(mobTitular)} no total).`
    : "O titular não tem mobilidade — preencha se o novo colaborador tiver.";

  // ── Diária: quantos dias recebem pelo tipo do NOVO (igual ao Planejado) ────
  const diaria = Math.max(0, e.diariaTitular || 0);
  const regra: RegraDiaria = isPercursoFunction(e.functionName) ? "todos" : regraDiariaPorTipo(e.tipoColaborador, e.functionName);
  const valorDiariaUtil = regra === "todos" ? diaria : 0;
  const valorDiariaFds = regra === "nenhuma" ? 0 : diaria;
  const porDia = `${formatarMoeda(diaria)} por dia (diária do titular)`;
  const origemDiarias =
    regra === "nenhuma" ? "Casa (CLT) na cenotécnica: sem diária."
    : regra === "fds" ? `Casa (CLT): sem diária em dia útil${fds > 0 ? `; fim de semana ${porDia}` : ""}.`
    : `${NOME_DO_TIPO_TITULO[e.tipoColaborador ?? ""] ?? "Diária"}: ${porDia}.`;
  const diarias = { valorDiariaUtil, valorDiariaFds, origemDiarias };

  const zerada = (origemAlimentacao: string): PreenchimentoDoNovo => ({
    ...diarias,
    weekdayLunch: 0, weekdayDinner: 0, weekendLunch: 0, weekendDinner: 0, mobility, origemAlimentacao, origemMobilidade,
  });

  // ── Alimentação: casos em que a vaga não tem (mesmos do Planejado) ─────────
  if (isPercursoFunction(e.functionName)) return zerada("Percurso: a alimentação está dentro do pacote.");
  if (isFuncaoLocal(e.functionName)) return zerada("Função local: sem alimentação (só diária).");
  if (e.empreita) return zerada("Vaga com empreita: sem alimentação.");
  if (e.tipoColaborador === "freela") return zerada("Freela não recebe alimentação (o cachê já cobre).");

  // ── Pela regra do colaborador: dias inteiros (almoço + jantar) ─────────────
  const perfil = refeicaoPerfil(e.functionName, e.atendimentoTipo);
  const vr = e.tipoColaborador === "casa" ? vrValido(e.vrDiarioCents) : null;
  const util = refeicaoCentsDia(perfil, e.settings, { tipoColaborador: e.tipoColaborador, isWeekend: false, vrDiarioCents: vr });
  const fimDeSemana = refeicaoCentsDia(perfil, e.settings, { tipoColaborador: e.tipoColaborador, isWeekend: true });

  const quem = [
    NOME_DO_TIPO[e.tipoColaborador ?? ""] ?? "",
    vr !== null ? `VR ${formatarMoeda(vr)}` : "",
    NOME_DO_PERFIL[perfil],
  ].filter(Boolean).join(" · ");
  const comJanta = (d: string) => !e.semJanta || (e.diasCarregamento ?? []).some((c) => String(c ?? "").slice(0, 10) === d);
  const jantasUteis = e.dias.filter((d) => !isWeekend(d) && comJanta(d)).length;
  const jantasFds = e.dias.filter((d) => isWeekend(d) && comJanta(d)).length;
  const par = (r: { almocoCents: number; jantarCents: number }) => (e.semJanta ? formatarMoeda(r.almocoCents) : `${formatarMoeda(r.almocoCents)} + ${formatarMoeda(r.jantarCents)}`);
  const partes: string[] = [];
  if (uteis > 0) partes.push(`dia útil ${par(util)}`);
  if (fds > 0) partes.push(`fim de semana ${par(fimDeSemana)}`);
  const origemAlimentacao = `Pela regra do colaborador${quem ? ` (${quem})` : ""}: ${partes.join(" · ")} por dia (${e.semJanta ? "só almoço: sem logística não entra janta" : "almoço + jantar"}).`;

  return {
    ...diarias,
    weekdayLunch: uteis * util.almocoCents,
    weekdayDinner: jantasUteis * util.jantarCents,
    weekendLunch: fds * fimDeSemana.almocoCents,
    weekendDinner: jantasFds * fimDeSemana.jantarCents,
    mobility,
    origemAlimentacao,
    origemMobilidade,
  };
}
