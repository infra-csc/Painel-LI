/**
 * Regras de TELA do portal do colaborador — puras (sem React, sem navegador),
 * testadas em formatos.test.ts. As regras de negócio (janela do check-in,
 * estado do dia, quem pode confirmar) moram no servidor e em shared/presenca.ts;
 * aqui só se decide o que mostrar e como escrever.
 */
import type { EstadoDoDia } from "@shared/presenca";
import type { DiaDoPortal, PrestacaoDoPortal, TipoDeMarcacao } from "./tipos";

export const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** Máscara progressiva 000.000.000-00. */
export function mascararCpf(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Os 6 números do código (aceita colar "123 456", "123-456" ou o texto inteiro da mensagem). */
export const codigoDeSeisDigitos = (valor: string) => soDigitos(valor).slice(0, 6);

/** Regra da senha, item por item, para mostrar ao vivo (a mesma de shared/presenca `erroDaSenha`). */
export function regrasDaSenha(senha: string): { id: string; texto: string; ok: boolean }[] {
  return [
    { id: "tamanho", texto: "Pelo menos 8 caracteres", ok: senha.length >= 8 && senha.length <= 72 },
    { id: "letra-numero", texto: "Letras e números", ok: /[A-Za-z]/.test(senha) && /\d/.test(senha) },
  ];
}

// ── Datas ───────────────────────────────────────────────────────────────────

const meioDia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: "UTC" });
const F_DIA_SEMANA = fmt({ weekday: "long" });
const F_DIA_SEMANA_CURTO = fmt({ weekday: "short" });
const F_DIA_MES = fmt({ day: "numeric", month: "long" });
const F_MES_CURTO = fmt({ month: "short" });

const semPonto = (s: string) => s.replace(/\.$/, "");

/** "Terça-feira" (só a primeira letra maiúscula; o CSS capitalize faria "Terça-Feira") */
export const comMaiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** "segunda-feira" */
export const diaDaSemana = (iso: string) => F_DIA_SEMANA.format(meioDia(iso));
/** "seg" */
export const diaDaSemanaCurto = (iso: string) => semPonto(F_DIA_SEMANA_CURTO.format(meioDia(iso)));
/** "27 de outubro" */
export const diaEMes = (iso: string) => F_DIA_MES.format(meioDia(iso));
/** "27/10" */
export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "27" (sem zero à esquerda) */
export const numeroDoDia = (iso: string) => String(Number(iso.slice(8, 10)));
/** "out" */
export const mesCurto = (iso: string) => semPonto(F_MES_CURTO.format(meioDia(iso)));

/** "25 a 29 de out" · "30 de out a 2 de nov" · "27 de out" */
export function periodo(inicio: string, fim: string): string {
  const a = inicio.slice(0, 10);
  const b = (fim || inicio).slice(0, 10);
  if (a === b) return `${numeroDoDia(a)} de ${mesCurto(a)}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${numeroDoDia(a)} a ${numeroDoDia(b)} de ${mesCurto(b)}`;
  return `${numeroDoDia(a)} de ${mesCurto(a)} a ${numeroDoDia(b)} de ${mesCurto(b)}`;
}

const F_DATA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
/** "26/10 às 17:20" (horário de Brasília) */
export function dataEHora(isoInstante: string): string {
  const partes = Object.fromEntries(F_DATA_HORA.formatToParts(new Date(isoInstante)).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month} às ${partes.hour}:${partes.minute}`;
}

// ── Estado do dia, na língua de quem está na arena ─────────────────────────

export type TomDoEstado = "neutro" | "acao" | "andamento" | "ok" | "atencao" | "falta";

export const ESTADO_PARA_O_COLABORADOR: Record<EstadoDoDia, { rotulo: string; tom: TomDoEstado; dica?: string }> = {
  futuro: { rotulo: "Ainda não chegou", tom: "neutro" },
  hoje_sem_checkin: { rotulo: "Hoje · falta o check-in", tom: "acao" },
  em_andamento: { rotulo: "Na arena · falta o check-out", tom: "andamento" },
  concluido: { rotulo: "Concluído", tom: "ok" },
  sem_checkout: { rotulo: "Sem check-out", tom: "atencao", dica: "Esqueceu o check-out? O produtor do evento corrige o horário." },
  ausente: { rotulo: "Sem registro", tom: "atencao", dica: "Trabalhou neste dia? Fale com o produtor do evento." },
  falta: { rotulo: "Falta registrada pelo produtor", tom: "falta" },
};

export const ROTULO_DA_MARCACAO: Record<TipoDeMarcacao, { botao: string; nome: string; feito: string }> = {
  entrada: { botao: "Fazer check-in", nome: "check-in", feito: "Check-in registrado" },
  saida: { botao: "Fazer check-out", nome: "check-out", feito: "Check-out registrado" },
};

/** Ocorrência lançada pelo produtor, em frase: "Horas extras: 2 h", "Falta registrada pelo produtor". */
export function fraseDaOcorrencia(o: { tipo: string; rotulo: string; horas: number | null }): string {
  if (o.tipo === "horas_extras") return o.horas != null ? `Horas extras: ${o.horas.toLocaleString("pt-BR")} h` : "Horas extras";
  if (o.tipo === "falta") return "Falta registrada pelo produtor";
  if (o.tipo === "diaria_extra") return "Diária extra registrada pelo produtor";
  if (o.tipo === "substituicao") return "Substituição registrada pelo produtor";
  return o.rotulo;
}

// ── O que fazer agora ───────────────────────────────────────────────────────

export type AcaoDeHoje =
  | { tipo: TipoDeMarcacao; prestacao: PrestacaoDoPortal; dia: DiaDoPortal }
  | { tipo: "confirmar" | "enviar_nf" | "reenviar_nf"; prestacao: PrestacaoDoPortal };

/** A prestação espera a NF do colaborador (OC emitida) ou o reenvio (devolvida)? */
export function acaoDaNota(p: PrestacaoDoPortal): "enviar_nf" | "reenviar_nf" | null {
  const n = p.notaEPagamento;
  if (!n?.podeEnviarNf) return null;
  return n.estado === "nf_devolvida" ? "reenviar_nf" : "enviar_nf";
}

/**
 * O destaque do topo de "Meus eventos": primeiro um check-in de hoje, depois
 * um check-out de hoje, depois uma nota devolvida pelo DP, uma nota a enviar
 * (OC emitida) e, por fim, uma confirmação ainda não feita.
 */
export function acaoDeHoje(prestacoes: readonly PrestacaoDoPortal[], hoje: string): AcaoDeHoje | null {
  for (const p of prestacoes) {
    const d = p.dias.find((x) => x.dia === hoje && x.podeEntrar);
    if (d) return { tipo: "entrada", prestacao: p, dia: d };
  }
  for (const p of prestacoes) {
    const d = p.dias.find((x) => x.dia === hoje && x.podeSair);
    if (d) return { tipo: "saida", prestacao: p, dia: d };
  }
  const devolvida = prestacoes.find((p) => acaoDaNota(p) === "reenviar_nf");
  if (devolvida) return { tipo: "reenviar_nf", prestacao: devolvida };
  const aEnviar = prestacoes.find((p) => acaoDaNota(p) === "enviar_nf");
  if (aEnviar) return { tipo: "enviar_nf", prestacao: aEnviar };
  const aConfirmar = prestacoes.find((p) => p.podeConfirmar && !p.confirmacao);
  return aConfirmar ? { tipo: "confirmar", prestacao: aConfirmar } : null;
}

// ── Nota fiscal e pagamento ─────────────────────────────────────────────────

/** Quantos dias o "Pago em dd/mm" fica como novidade no topo de Meus eventos. */
export const DIAS_DA_NOVIDADE_DO_PAGO = 15;

const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

export interface NovidadeDoPagamento { prestacao: PrestacaoDoPortal; tipo: "programado" | "pago"; data: string | null }

/** Pagamentos programados (até sair) e pagos nos últimos 15 dias — a "novidade" de Meus eventos. */
export function novidadesDoPagamento(prestacoes: readonly PrestacaoDoPortal[], hoje: string): NovidadeDoPagamento[] {
  const lista: NovidadeDoPagamento[] = [];
  for (const p of prestacoes) {
    const n = p.notaEPagamento;
    if (n?.estado === "programado") lista.push({ prestacao: p, tipo: "programado", data: n.programadoPara });
    else if (n?.estado === "pago" && n.pagoEm && diasEntre(n.pagoEm, hoje) <= DIAS_DA_NOVIDADE_DO_PAGO) lista.push({ prestacao: p, tipo: "pago", data: n.pagoEm });
  }
  // Pago mais recente primeiro; depois o programado mais próximo.
  return lista.sort((a, b) => (a.tipo === b.tipo ? (a.tipo === "pago" ? (b.data ?? "").localeCompare(a.data ?? "") : (a.data ?? "").localeCompare(b.data ?? "")) : a.tipo === "pago" ? -1 : 1));
}

/** A situação da nota/pagamento em pílula (null = ainda sem OC: vale a situação dos dias). */
export function situacaoDoPagamento(p: PrestacaoDoPortal): { texto: string; tom: TomDoEstado } | null {
  const n = p.notaEPagamento;
  if (!n || n.estado === "sem_oc") return null;
  switch (n.estado) {
    case "com_oc": return n.podeEnviarNf ? { texto: "OC emitida · envie a nota fiscal", tom: "acao" } : { texto: "OC emitida", tom: "neutro" };
    case "nf_enviada": return { texto: "Nota fiscal em conferência no DP", tom: "andamento" };
    case "nf_devolvida": return { texto: "Nota devolvida · envie de novo", tom: "atencao" };
    case "nf_recusada": return { texto: "Nota recusada · fale com o DP", tom: "falta" };
    case "nf_aprovada": return { texto: "Nota aprovada", tom: "ok" };
    case "programado": return { texto: n.programadoPara ? `Pagamento programado para ${dataCurta(n.programadoPara)}` : "Pagamento programado", tom: "ok" };
    case "pago": return { texto: n.pagoEm ? `Pago em ${dataCurta(n.pagoEm)}` : "Pago", tom: "ok" };
    default: return null;
  }
}

/** Máscara de dinheiro digitado no celular: os números entram pelos centavos ("123456" → "1.234,56"). */
export function mascararReais(valor: string): string {
  const d = soDigitos(valor).replace(/^0+/, "").slice(0, 10);
  if (!d) return "";
  const c = d.padStart(3, "0");
  const inteiro = c.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${c.slice(-2)}`;
}

/** "1.234,56" → 123456 (centavos); vazio ou zero → null. */
export function centavosDoTexto(valor: string): number | null {
  const d = soDigitos(valor);
  const n = d ? Number(d) : 0;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** "320 KB", "1,4 MB" */
export function tamanhoDoArquivo(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Linha de situação do cartão do evento na lista. */
export function situacaoDaPrestacao(p: PrestacaoDoPortal, hoje: string): { texto: string; tom: TomDoEstado } {
  const pagamento = situacaoDoPagamento(p);
  if (pagamento) return pagamento;
  if (p.checkoutFinalFeito) return { texto: "Fechado pelo produtor", tom: "ok" };
  const deHoje = p.dias.find((d) => d.dia === hoje);
  if (deHoje?.podeEntrar) return { texto: "Hoje · falta o check-in", tom: "acao" };
  if (deHoje?.podeSair) return { texto: "Na arena · falta o check-out", tom: "andamento" };
  if (p.confirmacao) return { texto: "Você confirmou", tom: "ok" };
  if (p.podeConfirmar) return { texto: "Falta confirmar os dias", tom: "acao" };
  const inicio = p.dias[0]?.dia ?? p.evento.inicio;
  if (inicio > hoje) return { texto: `Começa em ${dataCurta(inicio)}`, tom: "neutro" };
  const feitos = p.dias.filter((d) => d.entrada).length;
  return { texto: `${feitos} de ${p.dias.length} ${p.dias.length === 1 ? "dia registrado" : "dias registrados"}`, tom: "neutro" };
}

// ── Valores e confirmação ───────────────────────────────────────────────────

/** A memória de cálculo do servidor, sem o jargão interno ("Realizado"). */
export function linhaDaMemoria(linha: string): string {
  return linha
    .replace(/^Realizado:\s*/, "Previsto: ")
    .replace("o valor é o do Realizado", "o valor é o previsto");
}

/** Dias que já vêm marcados na confirmação: o que ele confirmou antes, ou os dias com presença + as diárias extras. */
export function diasSugeridos(p: PrestacaoDoPortal): string[] {
  if (p.confirmacao) return [...p.confirmacao.dias].sort();
  const trabalhados = p.dias.filter((d) => d.estado === "concluido" || d.estado === "sem_checkout" || d.estado === "em_andamento").map((d) => d.dia);
  return Array.from(new Set([...trabalhados, ...p.diasExtras])).sort();
}
