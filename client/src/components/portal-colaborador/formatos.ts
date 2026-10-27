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
  | { tipo: "confirmar"; prestacao: PrestacaoDoPortal };

/**
 * O destaque do topo de "Meus eventos": primeiro um check-in de hoje, depois
 * um check-out de hoje, depois uma confirmação ainda não feita.
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
  const aConfirmar = prestacoes.find((p) => p.podeConfirmar && !p.confirmacao);
  return aConfirmar ? { tipo: "confirmar", prestacao: aConfirmar } : null;
}

/** Linha de situação do cartão do evento na lista. */
export function situacaoDaPrestacao(p: PrestacaoDoPortal, hoje: string): { texto: string; tom: TomDoEstado } {
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
