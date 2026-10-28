/**
 * Presença no evento — regras de TELA (27/10, Fase 1 do Módulo de Honorários).
 * Só leitura do que o servidor já decidiu (estado de cada dia, dias
 * pendentes, faixa do ajuste): aqui é a situação de cada pessoa para a fila,
 * a busca, os textos e as contas do diálogo do check-out final.
 */
import { FUSO_DA_OPERACAO } from "@shared/hoje-sp";
import { ajusteEmPct, reaisDaPresenca, type SituacaoDoCnpjInformado } from "@shared/presenca";
import type { SituacaoContratualDoColaborador } from "@shared/contratos";
import type { DiaDaPresenca, MarcacaoDaPresenca, PrestacaoDaPresenca } from "./tipos";

// ── Datas e horas ───────────────────────────────────────────────────────────

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "25/10" de "2026-10-25". */
export const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "sáb" de "2026-10-25" (data de calendário, sem fuso). */
export function diaDaSemana(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

/** "sáb 25/10". */
export const diaComSemana = (iso: string) => `${diaDaSemana(iso)} ${diaCurto(iso)}`;

/** Lista legível de dias: "25/10, 26/10 e 27/10". */
export function listaDeDias(dias: readonly string[]): string {
  const curtos = dias.map(diaCurto);
  if (curtos.length <= 1) return curtos.join("");
  return `${curtos.slice(0, -1).join(", ")} e ${curtos[curtos.length - 1]}`;
}

const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_DA_OPERACAO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "27/10 14:05" (horário de Brasília) de um instante ISO. */
export function dataHoraBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatadorDataHora.format(d).replace(",", "");
}

// ── Marcações ───────────────────────────────────────────────────────────────

/** Link do mapa para a localização registrada. */
export const linkDoMapa = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Quem registrou, por extenso, para a dica da marcação. */
export function quemRegistrou(m: MarcacaoDaPresenca): string {
  if (m.por === "representante") return `pelo representante${m.porUsuario?.nome ? ` (${m.porUsuario.nome})` : ""}`;
  if (m.por === "produtor_correcao") return `corrigido${m.porUsuario?.nome ? ` por ${m.porUsuario.nome}` : " pela produção"}`;
  return "pelo colaborador";
}

/** Todas as selfies da prestação, na ordem dos dias (entrada antes da saída). */
export interface SelfieDaPrestacao {
  dia: string;
  lado: "entrada" | "saida";
  marcacao: MarcacaoDaPresenca;
}

export function selfiesDaPrestacao(p: Pick<PrestacaoDaPresenca, "dias">): SelfieDaPrestacao[] {
  const lista: SelfieDaPrestacao[] = [];
  for (const d of p.dias) {
    if (d.entrada?.fotoUrl) lista.push({ dia: d.dia, lado: "entrada", marcacao: d.entrada });
    if (d.saida?.fotoUrl) lista.push({ dia: d.dia, lado: "saida", marcacao: d.saida });
  }
  return lista;
}

/** Quantas marcações têm selfie (vale também para quem não vê as fotos). */
export function contarSelfies(p: Pick<PrestacaoDaPresenca, "dias">): number {
  return p.dias.reduce((n, d) => n + (d.entrada?.comSelfie ? 1 : 0) + (d.saida?.comSelfie ? 1 : 0), 0);
}

// ── Situação da pessoa (fila e selo) ────────────────────────────────────────

// 28/10 (Fase 3): "checkout_atrasado" — o prazo do check-out final (ou da
// correção depois da devolução) venceu (shared/prazos-honorarios).
export type FiltroDaPresenca = "pendente_dia" | "sem_saida" | "nao_confirmou" | "confirmou" | "pronto" | "enviado" | "checkout_atrasado";

export const ROTULO_DO_FILTRO: Record<FiltroDaPresenca, string> = {
  pendente_dia: "Pendente de dia",
  sem_saida: "Sem saída",
  nao_confirmou: "Não confirmou",
  confirmou: "Confirmou",
  pronto: "Pronto para fechar",
  enviado: "Enviado ao DP",
  checkout_atrasado: "Check-out final atrasado",
};

/** Já foi para o DP (em análise ou aprovado) — o check-out final não abre. */
export const foiParaODp = (p: PrestacaoDaPresenca) => !p.checkoutFinal.podeFazer;
/** O DP devolveu ou recusou: volta para a produção refazer o check-out final. */
export const voltouDoDp = (p: PrestacaoDaPresenca) =>
  !!p.realizado.sentForReview && (p.realizado.rhStatus === "devolvido" || p.realizado.rhStatus === "rejeitado");

/** Dias que já passaram sem check-in nem falta (o "pendente de dia"). */
export const diasSemRegistro = (p: PrestacaoDaPresenca) => p.dias.filter((d) => d.estado === "ausente").map((d) => d.dia);
/** Dias com entrada e sem saída (check-out esquecido). */
export const diasSemSaida = (p: PrestacaoDaPresenca) => p.dias.filter((d) => d.estado === "sem_checkout").map((d) => d.dia);
/** Ainda tem dia por vir ou acontecendo (hoje). */
const temDiaEmAberto = (p: PrestacaoDaPresenca) => p.dias.some((d) => d.estado === "futuro" || d.estado === "hoje_sem_checkin" || d.estado === "em_andamento");

/** A confirmação do colaborador já abriu (último dia passou, ou saiu no último dia). */
export const confirmacaoAberta = (p: PrestacaoDaPresenca) => p.podeConfirmar || (p.dias.length > 0 && !temDiaEmAberto(p));

/** Todos os dias resolvidos (presença ou falta), nada em aberto e ainda com a produção. */
export const prontoParaFechar = (p: PrestacaoDaPresenca) =>
  !foiParaODp(p) && p.dias.length > 0 && p.diasPendentes.length === 0 && !temDiaEmAberto(p);

export function atendeAoFiltro(p: PrestacaoDaPresenca, f: FiltroDaPresenca): boolean {
  switch (f) {
    case "pendente_dia": return !foiParaODp(p) && diasSemRegistro(p).length > 0;
    case "sem_saida": return !foiParaODp(p) && diasSemSaida(p).length > 0;
    // Só conta quem JÁ podia confirmar (a confirmação abre depois do último dia).
    case "nao_confirmou": return !foiParaODp(p) && !p.confirmacao && confirmacaoAberta(p);
    case "confirmou": return !!p.confirmacao;
    case "pronto": return prontoParaFechar(p);
    case "enviado": return foiParaODp(p);
    case "checkout_atrasado": return !foiParaODp(p) && p.prazos?.checkoutFinal?.situacao === "atrasado";
  }
}

export const FILTROS: readonly FiltroDaPresenca[] = ["pendente_dia", "sem_saida", "nao_confirmou", "confirmou", "pronto", "enviado", "checkout_atrasado"];

export function contarPorFiltro(prestacoes: readonly PrestacaoDaPresenca[]): Record<FiltroDaPresenca, number> {
  const c = { pendente_dia: 0, sem_saida: 0, nao_confirmou: 0, confirmou: 0, pronto: 0, enviado: 0, checkout_atrasado: 0 } as Record<FiltroDaPresenca, number>;
  for (const p of prestacoes) for (const f of FILTROS) if (atendeAoFiltro(p, f)) c[f]++;
  return c;
}

/** Busca sem acento e sem caixa. */
export const normalizar = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filtrarPrestacoes(prestacoes: readonly PrestacaoDaPresenca[], busca: string, filtro: FiltroDaPresenca | null): PrestacaoDaPresenca[] {
  const q = normalizar(busca);
  return prestacoes.filter((p) => {
    if (filtro && !atendeAoFiltro(p, filtro)) return false;
    if (!q) return true;
    return normalizar(p.colaborador?.nome).includes(q)
      || normalizar(p.funcao.nome).includes(q)
      || (p.colaborador?.numero != null && String(p.colaborador.numero) === busca.trim());
  });
}

/** O selo principal da pessoa (um só), do mais urgente ao mais calmo. */
export type TomDoSelo = "ok" | "alerta" | "perigo" | "info" | "neutro" | "marca";
export function seloPrincipal(p: PrestacaoDaPresenca, hoje: string): { rotulo: string; tom: TomDoSelo; dica: string } {
  if (p.realizado.rhStatus === "aprovado") return { rotulo: "Aprovado pelo DP", tom: "ok", dica: "O DP aprovou a prestação." };
  if (foiParaODp(p)) return { rotulo: "Enviado ao DP", tom: "info", dica: `Check-out final feito${p.checkoutFinal.em ? ` em ${dataHoraBr(p.checkoutFinal.em)}` : ""}${p.checkoutFinal.por?.nome ? ` por ${p.checkoutFinal.por.nome}` : ""} — aguardando a conferência do DP.` };
  if (voltouDoDp(p)) return { rotulo: p.realizado.rhStatus === "rejeitado" ? "Recusado pelo DP" : "Devolvido pelo DP", tom: "perigo", dica: "O DP devolveu: confira a presença e refaça o check-out final." };
  const semRegistro = diasSemRegistro(p);
  if (semRegistro.length > 0) return { rotulo: semRegistro.length === 1 ? `Sem registro em ${diaCurto(semRegistro[0])}` : `${semRegistro.length} dias sem registro`, tom: "perigo", dica: `Dia que passou sem check-in nem falta: ${listaDeDias(semRegistro)}. Registre a falta ou corrija o horário.` };
  const semSaida = diasSemSaida(p);
  if (semSaida.length > 0) return { rotulo: semSaida.length === 1 ? `Sem saída em ${diaCurto(semSaida[0])}` : `${semSaida.length} dias sem saída`, tom: "alerta", dica: `Entrou e não registrou a saída: ${listaDeDias(semSaida)}. A produção corrige o horário.` };
  const diaDeHoje = p.dias.find((d) => d.dia === hoje);
  if (diaDeHoje?.estado === "em_andamento") return { rotulo: `Na arena desde ${diaDeHoje.entrada?.hora ?? ""}`.trim(), tom: "ok", dica: "Fez a entrada hoje e ainda não saiu." };
  if (prontoParaFechar(p)) return { rotulo: "Pronto para fechar", tom: "marca", dica: "Todos os dias resolvidos: falta o check-out final da produção." };
  if (diaDeHoje?.estado === "hoje_sem_checkin") return { rotulo: "Hoje sem entrada", tom: "neutro", dica: "Ainda não fez o check-in de hoje." };
  if (diaDeHoje?.estado === "concluido") return { rotulo: "Saiu hoje", tom: "neutro", dica: "Entrada e saída de hoje registradas." };
  return { rotulo: "Aguardando os dias", tom: "neutro", dica: "Os dias de trabalho ainda não chegaram." };
}

/** Dias da prestação que ainda aceitam entrada/saída pelo representante (só hoje). */
export function diaDeHoje(p: PrestacaoDaPresenca, hoje: string): DiaDaPresenca | undefined {
  return p.dias.find((d) => d.dia === hoje);
}

// ── Check-out final ─────────────────────────────────────────────────────────

/** Valor final dentro da faixa do produtor? (DP/admin: sem limite → sempre.) */
export function dentroDaFaixa(valor: number, limite: PrestacaoDaPresenca["limiteDoAjuste"]): boolean {
  if (!limite) return true;
  return valor >= limite.minimo && valor <= limite.maximo;
}

/** "+5,2%" / "−3%" / "sem ajuste" — o ajuste do valor final sobre o calculado. */
export function textoDoAjuste(calculado: number, final: number): string {
  const pct = ajusteEmPct(calculado, final);
  if (pct === null || pct === 0) return "sem ajuste";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export const reais = reaisDaPresenca;

/**
 * O selo de contrato (`SeloContratoAtivo`) para o CNPJ INFORMADO: contrato
 * ativo → "Contrato ativo"; contrato vencido ou CNPJ sem contrato → "Sem
 * contrato ativo"; nada informado → "Sem CNPJ".
 */
export function seloDoCnpj(s: SituacaoDoCnpjInformado): SituacaoContratualDoColaborador {
  if (s === "contrato_ativo") return "com_contrato_ativo";
  if (s === "sem_cnpj") return "sem_cnpj";
  return "sem_contrato_ativo";
}

// ── Código de acesso ────────────────────────────────────────────────────────

/** "123 456" — o código em dois grupos, para ler em voz alta. */
export const codigoEmGrupos = (codigo: string) => (codigo.length === 6 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo);

/** O texto pronto para o WhatsApp. */
export function mensagemDoCodigo(codigo: string, validoAte: string, origem: string): string {
  return `Seu código de primeiro acesso ao app de honorários é ${codigo}, vale até ${dataHoraBr(validoAte)}. Entre em ${origem.replace(/\/$/, "")}/colaborador com seu CPF.`;
}

// ── Erros do servidor ───────────────────────────────────────────────────────

/** Código e dados extras do 409 (dias_pendentes, fora_do_limite, justificativa_obrigatoria, evento_legado). */
export function codigoDoErro(err: unknown): { codigo: string | null; diasPendentes: string[]; minimo: number | null; maximo: number | null } {
  const body = (err as { body?: Record<string, unknown> | null } | null)?.body ?? null;
  const codigo = typeof body?.codigo === "string" ? body.codigo : null;
  const diasPendentes = Array.isArray(body?.diasPendentes) ? (body!.diasPendentes as unknown[]).filter((d): d is string => typeof d === "string") : [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { codigo, diasPendentes, minimo: num(body?.minimo), maximo: num(body?.maximo) };
}
