/**
 * Preferências LOCAIS da casca (menu + topo), por usuário: favoritos, grupos
 * fechados e avisos já vistos. Tudo em localStorage — é conforto de navegação,
 * nunca regra de negócio, e some sem prejuízo se o navegador limpar.
 *
 * A chave carrega o id do usuário porque a mesma máquina é compartilhada
 * (produção/compras usam o mesmo computador em evento): os favoritos de um não
 * podem aparecer para o outro.
 */

const FAVORITES = "shell:favorites";
const CLOSED_GROUPS = "shell:closed-groups";
const SEEN_NOTIFS = "shell:seen-notifs";

/** Evento disparado quando as preferências mudam em outra parte da casca. */
export const SHELL_PREFS_EVENT = "shellPrefsUpdated";

function key(base: string, userId: string | undefined) {
  return `${base}:${userId || "anon"}`;
}

function readList(base: string, userId: string | undefined): string[] {
  try {
    const raw = localStorage.getItem(key(base, userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(base: string, userId: string | undefined, value: string[]) {
  try {
    localStorage.setItem(key(base, userId), JSON.stringify(value));
  } catch {
    // Modo privado / cota cheia: a casca continua funcionando sem persistir.
  }
  window.dispatchEvent(new CustomEvent(SHELL_PREFS_EVENT));
}

/** Ids das telas favoritas (ordem de inclusão). */
export const getFavorites = (userId?: string) => readList(FAVORITES, userId);
export const setFavorites = (userId: string | undefined, ids: string[]) => writeList(FAVORITES, userId, ids);

/** Títulos dos grupos do menu que estão recolhidos. */
export const getClosedGroups = (userId?: string) => readList(CLOSED_GROUPS, userId);
export const setClosedGroups = (userId: string | undefined, titles: string[]) => writeList(CLOSED_GROUPS, userId, titles);

/** Ids de pendências já marcadas como vistas (só apagam o ponto de "novo"). */
export const getSeenNotifications = (userId?: string) => readList(SEEN_NOTIFS, userId);
export function markNotificationsSeen(userId: string | undefined, ids: string[]) {
  // Guarda no máximo 200 ids: sem o corte, a chave cresceria para sempre.
  const merged = Array.from(new Set([...getSeenNotifications(userId), ...ids])).slice(-200);
  writeList(SEEN_NOTIFS, userId, merged);
}
