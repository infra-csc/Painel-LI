/**
 * "Evento em foco" — o evento corrente, compartilhado entre telas (23/09).
 *
 * Por quê: o Financeiro pedia o mesmo evento 4 a 5 vezes (Planejado → Realizado
 * → Controle RH → Comparativo → Notas), e a Escala já tinha a sua própria
 * memória (`use-scaling-event.ts`, chave única `scaling:last-event`). Agora há
 * UMA fonte de verdade para o sistema inteiro:
 *   1. a URL (`?event=` no Financeiro/Passagens, `?eventId=` na Escala e no
 *      Espelho — os dois nomes são lidos para não quebrar link antigo);
 *   2. o último evento usado, em `localStorage` POR USUÁRIO
 *      (`evento-em-foco:<userId>`), para máquina compartilhada não vazar o
 *      contexto de um para o outro.
 * Ao escolher, grava nos dois — copiar o link carrega o contexto e trocar de
 * tela mantém o evento; o seletor da próxima tela já aparece preenchido.
 *
 * Este arquivo tem só as funções PURAS (testáveis em node); o hook React mora em
 * `use-evento-em-foco.tsx`. `useScalingEvent` virou um invólucro daquele hook
 * (parâmetro `eventId`, modo "substituir" para manter o comportamento da Escala).
 */

export type ParametroDeEvento = "event" | "eventId";

/** Chave antiga da Escala — lida como último recurso para não perder o contexto na migração. */
export const CHAVE_LEGADA_ESCALA = "scaling:last-event";

export function chaveDoEventoEmFoco(userId?: string | null): string {
  return `evento-em-foco:${userId || "anonimo"}`;
}

/** Lê o evento de uma query string, aceitando `event` e `eventId`. */
export function lerEventoDaBusca(busca: string): string {
  const p = new URLSearchParams(busca);
  return p.get("event") || p.get("eventId") || "";
}

/**
 * Devolve a query string (sem `?`) com o evento no parâmetro pedido.
 * - "preservar": mantém os demais parâmetros (filtros da tela, por exemplo);
 * - "substituir": zera tudo e escreve só evento + extras (comportamento da Escala).
 * Os dois nomes de parâmetro são removidos antes de escrever, para nunca sobrar
 * `?event=A&eventId=B` apontando para eventos diferentes.
 */
export function buscaComEvento(
  busca: string,
  eventId: string,
  parametro: ParametroDeEvento = "event",
  modo: "preservar" | "substituir" = "preservar",
  extras?: Record<string, string>,
): string {
  const p = modo === "substituir" ? new URLSearchParams() : new URLSearchParams(busca);
  p.delete("event");
  p.delete("eventId");
  if (eventId) p.set(parametro, eventId);
  for (const [k, v] of Object.entries(extras ?? {})) if (v) p.set(k, v);
  return p.toString();
}

/** Monta o `href` de uma tela já com o evento em foco (deep-link entre telas). */
export function hrefComEvento(caminho: string, eventId?: string | null, parametro: ParametroDeEvento = "event", extras?: Record<string, string>): string {
  const qs = buscaComEvento("", eventId ?? "", parametro, "substituir", extras);
  return qs ? `${caminho}?${qs}` : caminho;
}

function armazenamento(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Último evento usado por este usuário (ou o da Escala antiga, se ainda não migrou). */
export function lerEventoGuardado(userId?: string | null): string {
  const ls = armazenamento();
  if (!ls) return "";
  return ls.getItem(chaveDoEventoEmFoco(userId)) || ls.getItem(CHAVE_LEGADA_ESCALA) || "";
}

export function guardarEventoEmFoco(userId: string | null | undefined, eventId: string): void {
  const ls = armazenamento();
  if (!ls) return;
  if (eventId) ls.setItem(chaveDoEventoEmFoco(userId), eventId);
  else ls.removeItem(chaveDoEventoEmFoco(userId));
  // A chave antiga da Escala deixa de mandar assim que a nova existe.
  ls.removeItem(CHAVE_LEGADA_ESCALA);
}
