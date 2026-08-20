/**
 * Janela de ação do evento — "evento que já passou".
 *
 * Regra do usuário (20/08): em evento que já terminou, ninguém troca
 * colaborador nem faz qualquer ação de escalação — SÓ O ADMINISTRADOR.
 * (A versão anterior desta regra também liberava RH/Financeiro, mas esse papel
 * não tem permissão de escalação em evento NENHUM: prometer "fale com o RH"
 * era beco sem saída.) O trabalho pós-evento (Realizado, Comparativo, Notas
 * Fiscais, Flash e o módulo de Escala) segue liberado; esta regra vale para
 * ESCALAÇÃO e para o que depende dela (passagem/hospedagem/troca).
 *
 * Decisões já fechadas:
 * - "já passou" = a partir do DIA SEGUINTE ao `events.endDate`. No próprio
 *   último dia do evento ainda é permitido mexer.
 * - evento sem data de término NÃO bloqueia (não há como saber que passou).
 *
 * Mora em `shared/` porque servidor e client precisam da MESMA resposta: o
 * servidor é a trava (403) e o client só esconde/desabilita o que a API vai
 * recusar. Arquivo próprio (e não dentro de `scaling-rules`/`roles`) porque a
 * regra não é sobre a máquina de estados da escalação nem sobre a tabela de
 * papéis — é sobre a janela de tempo do evento cruzada com o papel.
 */
import { normalizeRole } from "./roles";

/** Mensagem única de bloqueio — servidor (403) e client usam esta string. */
export const PAST_EVENT_BLOCK_MSG =
  "Evento encerrado — só o administrador pode alterar. Fale com o administrador se precisar de um acerto.";

/** Banner discreto no topo das telas em modo somente leitura. */
export const PAST_EVENT_BANNER_MSG =
  "Evento encerrado — somente leitura. Alterações agora só pelo administrador.";

/**
 * A operação é toda no Brasil e `events.endDate` é uma data pura (sem hora).
 * O servidor pode rodar em UTC (Replit) — perto da meia-noite, "hoje" em UTC
 * já é o dia seguinte enquanto no Brasil ainda é o último dia do evento. Fixar
 * o fuso faz servidor e navegador concordarem sobre qual dia é hoje.
 */
export const APP_TIMEZONE = "America/Sao_Paulo";

/** "Hoje" no fuso da operação, no formato YYYY-MM-DD. */
export function todayIsoDate(now: Date = new Date()): string {
  // "en-CA" formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Normaliza para YYYY-MM-DD. Aceita o que sai do banco (string "2026-08-20"),
 * o que vem do JSON ("2026-08-20T00:00:00.000Z") e um Date.
 * Datas puras viram Date à meia-noite UTC — por isso lê os componentes em UTC,
 * senão "2026-08-20" viraria 19/08 num fuso negativo.
 */
export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value).trim());
  return match ? match[1] : null;
}

/**
 * O evento já passou? "Passou" = hoje > data de término.
 * Sem data de término (ou data ilegível) → false: não bloqueia.
 */
export function isEventPast(
  endDate: string | Date | null | undefined,
  hoje: string | Date = new Date(),
): boolean {
  const end = toIsoDate(endDate);
  if (!end) return false;
  const today = typeof hoje === "string" ? toIsoDate(hoje) : todayIsoDate(hoje);
  if (!today) return false;
  return today > end; // comparação lexicográfica vale para YYYY-MM-DD
}

/**
 * Quem continua agindo depois que o evento termina: SÓ o administrador.
 * RH/Financeiro NÃO entra — esse papel não tem permissão de escalação em
 * evento nenhum, então liberá-lo aqui não daria a ninguém uma saída real.
 */
export function canActOnPastEvent(role: string | null | undefined): boolean {
  return normalizeRole(role) === "admin";
}

/**
 * Atalho para telas e rotas: o evento está travado para ESTE ator?
 * true = esconder/desabilitar a ação no client e responder 403 no servidor.
 */
export function isEventLockedFor(
  endDate: string | Date | null | undefined,
  role: string | null | undefined,
  hoje: string | Date = new Date(),
): boolean {
  if (canActOnPastEvent(role)) return false;
  return isEventPast(endDate, hoje);
}
