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

/**
 * Extrai o PRIMEIRO horário de um texto livre -> minutos desde a meia-noite,
 * ou null se não houver horário reconhecível.
 *
 * Os campos de horário sugerido da escalação são texto livre e o time escreve
 * de tudo: "9h", "22h", "20h+", "10h-14h", "onibus - 10h", "carro - 14h",
 * "0900", "09:30". Um parser estrito (só HH:MM) descartava quase todos e o
 * cálculo caía em "estimado" sem necessidade. "carro" (sem horário) -> null.
 */
export function parseHoraMin(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const t = texto.trim();
  // 1) HH:MM em qualquer posição ("chega 09:30")
  let m = /(\d{1,2}):(\d{2})/.exec(t);
  if (m) {
    const h = Number(m[1]), min = Number(m[2]);
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  // 2) "9h", "22h", "9h30" em qualquer posição ("onibus - 10h", "20h+")
  m = /(\d{1,2})h(\d{2})?/i.exec(t);
  if (m) {
    const h = Number(m[1]), min = Number(m[2] ?? 0);
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  // 3) "0900"/"1430" (militar, 3-4 dígitos isolados)
  m = /(?:^|\D)(\d{3,4})(?:\D|$)/.exec(t);
  if (m) {
    const raw = m[1].padStart(4, "0");
    const h = Number(raw.slice(0, 2)), min = Number(raw.slice(2));
    if (h <= 23 && min <= 59) return h * 60 + min;
  }
  return null;
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
// Regra 17/08: no trecho de VOLTA, partida a partir das 20h00 também vale R$ 58
// (o colaborador sai do evento à noite). Na ida a regra continua a das janelas.
export const VOLTA_NOITE_A_PARTIR = 20 * 60; // 20:00

export function mobilidadeTrechoCents(
  horaPartida: string | null | undefined,
  horaChegada?: string | null | undefined,
  opts?: { trecho?: "ida" | "volta" },
): number {
  const p = parseHoraMin(horaPartida);
  const c = parseHoraMin(horaChegada);
  const trecho = opts?.trecho ?? "ida";
  const madrugada =
    (p !== null && dentroJanela(p, PARTINDO_INI, PARTINDO_FIM)) ||
    (c !== null && dentroJanela(c, CHEGANDO_INI, CHEGANDO_FIM)) ||
    (trecho === "volta" && p !== null && p >= VOLTA_NOITE_A_PARTIR);
  return madrugada ? MOBILIDADE_TRECHO_MADRUGADA_CENTS : MOBILIDADE_TRECHO_PADRAO_CENTS;
}

// ── Mobilidade de quem NÃO voa (regra 17/08) ────────────────────────────────
// Evento em SP/Grande SP: sem mobilidade. Evento fora de SP (vai de van,
// ônibus, carro): R$ 29 por trecho (ida + volta) — sem janela de horário,
// porque não há voo. Percurso continua fora (pacote fechado).

/**
 * O local do EVENTO é em São Paulo / Grande São Paulo? Casa a partir do texto
 * livre de events.location ("São Paulo - SP", "SP", "Grande SP", "Osasco/SP"…).
 * Vazio → false (não assume SP para evento; a regra do colaborador é outra).
 */
export function isEventoEmSP(location: string | null | undefined): boolean {
  if (!location) return false;
  const l = location.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (l === "sp" || l.endsWith(" sp") || l.endsWith("-sp") || l.endsWith("/sp") || l.endsWith("- sp") || l.endsWith("(sp)")) return true;
  return l.includes("sao paulo") || l.includes("grande sp") || l.includes("grande sao paulo");
}

/** Mobilidade (ida + volta, centavos) de quem NÃO voa, pelo local do evento. */
export function mobilidadeSemVooCents(eventLocation: string | null | undefined): { ida: number; volta: number } {
  if (isEventoEmSP(eventLocation)) return { ida: 0, volta: 0 };
  return { ida: MOBILIDADE_TRECHO_PADRAO_CENTS, volta: MOBILIDADE_TRECHO_PADRAO_CENTS };
}
