/**
 * Filtro de período da Escalação (01/09) — lógica pura, sem React.
 *
 * A tela não tinha NENHUM filtro de data. Numa fila de trabalho em que a
 * compra tem prazo, "o que acontece nos próximos 7 dias" era uma pergunta que
 * só se respondia lendo a coluna Período linha por linha.
 *
 * Duas decisões moram aqui, e as duas mudam o resultado:
 *
 * 1. **A janela é por SOBREPOSIÇÃO, não por continência.** A vaga entra quando
 *    o período dela CRUZA a janela. Uma escala de 02/10 a 07/10 aparece em
 *    "próximos 7 dias" no dia 05/10 — é o que a fila precisa. Continência
 *    esconderia justamente as escalas longas, que exigem mais antecedência.
 *
 * 2. **O teste é uma FÁBRICA que recebe a configuração**, não uma função que lê
 *    o estado. É o que permite ao popover mostrar, em cada opção, quantas
 *    linhas sobrariam se ela fosse marcada — contar sem aplicar.
 */

/** Recorte "quando acontece". */
export type PeriodPreset = "todos" | "7" | "30" | "mes" | "proximo" | "andamento" | "custom";

/** Recorte por dia da semana — as três opções são exclusivas entre si. */
export type PeriodSemana = "todos" | "fds" | "uteis";

export interface PeriodConfig {
  preset: PeriodPreset;
  /** ISO "AAAA-MM-DD". Só valem no preset `custom`; um lado vazio deixa a ponta aberta. */
  de: string;
  ate: string;
  semana: PeriodSemana;
  /** A data de INÍCIO cai em sábado ou domingo. Combina com as três acima. */
  inicioFds: boolean;
}

export const DEFAULT_PERIOD: PeriodConfig = {
  preset: "todos", de: "", ate: "", semana: "todos", inicioFds: false,
};

/** Uma linha vista pelo filtro — só as duas datas importam. */
export interface PeriodRow {
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
}

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  todos: "Qualquer data",
  "7": "Próximos 7 dias",
  "30": "Próximos 30 dias",
  mes: "Este mês",
  proximo: "Mês que vem",
  andamento: "Já começou",
  custom: "Datas exatas",
};

/** Ordem dos presets na coluna esquerda do popover. */
export const PRESETS: PeriodPreset[] = ["todos", "7", "30", "mes", "proximo", "andamento"];

export const SEMANA_LABEL: Record<PeriodSemana, string> = {
  todos: "Todos os dias",
  fds: "Pega sábado ou domingo",
  uteis: "Só dias úteis",
};

const MS_DIA = 86_400_000;

/**
 * "2026-09-03" ou "2026-09-03T00:00:00.000Z" → Date na meia-noite LOCAL.
 * `new Date("2026-09-03")` seria interpretada como UTC e voltaria um dia em
 * qualquer fuso a oeste — a data da escala é um dia de calendário, não um
 * instante.
 */
export function diaLocal(valor: string | null | undefined): Date | null {
  const m = String(valor ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Meia-noite local do dia de uma Date qualquer. */
export function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function ehFimDeSemana(d: Date): boolean {
  const dia = d.getDay();
  return dia === 0 || dia === 6;
}

/** Período de uma linha, normalizado. Sem início, a linha não tem data. */
export function periodoDaLinha(row: PeriodRow): { ini: Date; fim: Date } | null {
  const ini = diaLocal(row.scheduleStartDate);
  if (!ini) return null;
  const fim = diaLocal(row.scheduleEndDate) ?? ini;
  return fim < ini ? { ini: fim, fim: ini } : { ini, fim };
}

/** Algum dia entre início e fim cai em sábado ou domingo. */
export function pegaFimDeSemana(ini: Date, fim: Date): boolean {
  // Sete dias bastam: qualquer intervalo maior que isso contém um fim de
  // semana inteiro, e varrer escalas longas dia a dia é trabalho jogado fora.
  const dias = Math.round((fim.getTime() - ini.getTime()) / MS_DIA);
  if (dias >= 6) return true;
  for (let i = 0; i <= dias; i++) {
    if (ehFimDeSemana(new Date(ini.getTime() + i * MS_DIA))) return true;
  }
  return false;
}

/** A janela de datas de uma configuração, ou null quando não há recorte. */
export function janelaDoPeriodo(cfg: PeriodConfig, hoje: Date): [Date, Date] | null {
  const base = inicioDoDia(hoje);
  const somaDias = (n: number) => new Date(base.getTime() + n * MS_DIA);
  const mes = (delta: number): [Date, Date] => [
    new Date(base.getFullYear(), base.getMonth() + delta, 1),
    new Date(base.getFullYear(), base.getMonth() + delta + 1, 0),
  ];
  switch (cfg.preset) {
    case "7": return [base, somaDias(7)];
    case "30": return [base, somaDias(30)];
    case "mes": return mes(0);
    case "proximo": return mes(1);
    case "andamento": return [new Date(1900, 0, 1), base];
    case "custom": {
      const de = diaLocal(cfg.de);
      const ate = diaLocal(cfg.ate);
      if (!de && !ate) return null; // "datas exatas" sem nenhuma data não recorta nada
      return [de ?? new Date(1900, 0, 1), ate ?? new Date(2999, 0, 1)];
    }
    default: return null;
  }
}

/**
 * Fábrica do teste de data. Recebe a configuração — nunca lê o estado da tela —
 * para que os contadores do popover possam perguntar "e se eu marcasse ISTO?".
 */
export function fazTesteDePeriodo(cfg: PeriodConfig, hoje: Date): (row: PeriodRow) => boolean {
  const janela = janelaDoPeriodo(cfg, hoje);
  const semRecorte = !janela && cfg.semana === "todos" && !cfg.inicioFds;
  if (semRecorte) return () => true;

  return (row: PeriodRow) => {
    const p = periodoDaLinha(row);
    // Vaga sem data não é escondida por um filtro de data: ela ainda precisa
    // ser escalada, e sumir da fila é pior do que aparecer fora do recorte.
    if (!p) return true;
    if (janela && !(p.ini <= janela[1] && p.fim >= janela[0])) return false;
    if (cfg.semana !== "todos") {
      const pega = pegaFimDeSemana(p.ini, p.fim);
      if (cfg.semana === "fds" && !pega) return false;
      if (cfg.semana === "uteis" && pega) return false;
    }
    if (cfg.inicioFds && !ehFimDeSemana(p.ini)) return false;
    return true;
  };
}

export function temRecorteDePeriodo(cfg: PeriodConfig): boolean {
  if (cfg.semana !== "todos" || cfg.inicioFds) return true;
  if (cfg.preset === "todos") return false;
  if (cfg.preset === "custom") return !!(cfg.de || cfg.ate);
  return true;
}

const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * O rótulo do botão É o recorte ("Próximos 30 dias", "18/09 – 22/09", "Só dias
 * úteis") — nunca a palavra "Período" quando há algo selecionado. Quem passa
 * pela tela precisa ver o corte sem abrir o popover.
 */
export function rotuloDoPeriodo(cfg: PeriodConfig): string {
  const partes: string[] = [];
  if (cfg.preset === "custom") {
    const de = diaLocal(cfg.de);
    const ate = diaLocal(cfg.ate);
    if (de && ate) partes.push(`${dm(de)} – ${dm(ate)}`);
    else if (de) partes.push(`a partir de ${dm(de)}`);
    else if (ate) partes.push(`até ${dm(ate)}`);
  } else if (cfg.preset !== "todos") {
    partes.push(PRESET_LABEL[cfg.preset]);
  }
  if (cfg.semana !== "todos") partes.push(SEMANA_LABEL[cfg.semana]);
  if (cfg.inicioFds) partes.push("Começa no fim de semana");
  if (partes.length === 0) return "Qualquer data";
  return partes.join(" · ");
}
