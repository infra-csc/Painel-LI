/**
 * Regras da função "atendimento" e da ajuda de custo de mobilidade.
 *
 * O slide "Ações de melhoria APP LI" (CASA) define DUAS tarifas de atendimento
 * — Key Account e Executivo de Contas — mas o sistema tem uma única função
 * "atendimento". A escolha é feita na escalação (atendimentoTipo) e os valores
 * são editáveis no Valores Padrão (system_settings). Funções puras, testáveis.
 */

export type AtendimentoTipo = "key_account" | "executivo_contas";

export const ATENDIMENTO_TIPOS: { value: AtendimentoTipo; label: string }[] = [
  { value: "key_account", label: "Key Account" },
  { value: "executivo_contas", label: "Executivo de Contas" },
];

// Valores padrão (centavos) usados só como seed/fallback — a fonte de verdade
// são as chaves de system_settings abaixo, editáveis no Valores Padrão.
export const ATENDIMENTO_DEFAULTS_CENTS: Record<AtendimentoTipo, number> = {
  key_account: 58000,        // R$ 580,00
  executivo_contas: 46500,   // R$ 465,00
};

export const ATENDIMENTO_SETTING_KEY: Record<AtendimentoTipo, string> = {
  key_account: "atendimento_key_account",
  executivo_contas: "atendimento_executivo_contas",
};

/** A função é de atendimento? (o sistema tem uma única função "atendimento"). */
export function isAtendimentoFunction(functionName: string | null | undefined): boolean {
  if (!functionName) return false;
  return functionName.toLowerCase().includes("atend");
}

/** Diária de atendimento (centavos) para o tipo, lendo os Valores Padrão. */
export function atendimentoDailyCents(
  tipo: AtendimentoTipo | null | undefined,
  settings?: Record<string, number | string | undefined> | null,
): number | null {
  if (tipo !== "key_account" && tipo !== "executivo_contas") return null;
  const raw = settings?.[ATENDIMENTO_SETTING_KEY[tipo]];
  const fromSettings = typeof raw === "string" ? parseInt(raw, 10) : raw;
  if (typeof fromSettings === "number" && Number.isFinite(fromSettings) && fromSettings > 0) {
    return fromSettings;
  }
  return ATENDIMENTO_DEFAULTS_CENTS[tipo];
}

// ── Mobilidade automatizada por horário de voo (slide "Ajuda de custo") ──────
// Por trecho: R$ 58 se o voo PARTE entre 23h30 e 09h30, OU CHEGA entre 20h00 e
// 05h00; senão R$ 29. (O ticket guarda só o horário de partida de cada trecho;
// o de chegada, quando existe, vem dos horários sugeridos da escalação.)
export const MOBILIDADE_TRECHO_PADRAO_CENTS = 2900;    // R$ 29,00
export const MOBILIDADE_TRECHO_MADRUGADA_CENTS = 5800; // R$ 58,00

/** "HH:MM" -> minutos desde a meia-noite, ou null se inválido/vazio. */
export function parseHoraMin(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Está no intervalo [ini, fim] em minutos, tratando janelas que cruzam a meia-noite. */
function dentroJanela(min: number, ini: number, fim: number): boolean {
  return ini <= fim ? (min >= ini && min <= fim) : (min >= ini || min <= fim);
}

// Janelas do slide
const PARTINDO_INI = 23 * 60 + 30; // 23:30
const PARTINDO_FIM = 9 * 60 + 30;  // 09:30 (cruza a meia-noite)
const CHEGANDO_INI = 20 * 60;      // 20:00
const CHEGANDO_FIM = 5 * 60;       // 05:00 (cruza a meia-noite)

/** Valor (centavos) de UM trecho a partir dos horários de partida/chegada. */
export function mobilidadeTrechoCents(
  horaPartida: string | null | undefined,
  horaChegada?: string | null | undefined,
): number {
  const p = parseHoraMin(horaPartida);
  const c = parseHoraMin(horaChegada);
  const madrugada =
    (p !== null && dentroJanela(p, PARTINDO_INI, PARTINDO_FIM)) ||
    (c !== null && dentroJanela(c, CHEGANDO_INI, CHEGANDO_FIM));
  return madrugada ? MOBILIDADE_TRECHO_MADRUGADA_CENTS : MOBILIDADE_TRECHO_PADRAO_CENTS;
}
