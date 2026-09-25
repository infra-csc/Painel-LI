/**
 * Escalação por Grade — tipos, schema e utilitários puros (25/09, extraídos de
 * grid-team-inclusion-form.tsx). Fiel ao original: esta grade NÃO usa os tetos
 * de dias da Sugestão de escala, então a lista de datas é a versão sem limite.
 */
import { z } from "zod";
import type { Function } from "@shared/schema";

export const FUNCTION_ORDER = [
  'atendimento',
  'dir prova',
  'produção',
  'produção local',
  'ativação sp',
  'ativação local',
  'sup ceno',
  'cenotecnica',
  'cenotecnica local',
  'percurso',
  'kit',
  'kit local',
  'o2 prime'
];

export const sortFunctionsByOrder = (functions: Function[]) => {
  return functions.sort((a, b) => {
    const aIndex = FUNCTION_ORDER.indexOf(a.name.toLowerCase());
    const bIndex = FUNCTION_ORDER.indexOf(b.name.toLowerCase());

    if (aIndex === -1 && bIndex === -1) {
      return a.name.localeCompare(b.name);
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });
};

export const gridFormSchema = z.object({
  eventId: z.string().min(1, "Evento é obrigatório"),
  startDate: z.string().min(1, "Data inicial é obrigatória"),
  endDate: z.string().min(1, "Data final é obrigatória"),
});

export type GridFormData = z.infer<typeof gridFormSchema>;

export interface FunctionRow {
  functionId: string;
  functionName: string;
  dataVooIda: string;
  horarioChegadaSugerido: string;
  dataVooRetorno: string;
  horarioPartidaSugerido: string;
  needsTicket: boolean; // se precisa de passagem
  needsAccommodation: boolean; // se precisa de hospedagem
  dailyRates: { [date: string]: number }; // date -> daily rate (1, 2, or 3)
  isCustom: boolean; // se é uma função adicionada dinamicamente
  selected?: boolean; // para exclusão em lote
  fromExcelPaste?: boolean; // se veio do copy-paste do Excel
  originalFunctionId?: string; // ID original da função (usado para resolver duplicatas)
}

/** Dados de viagem de uma linha — o que "Copiar horários" carrega de uma função para outra. */
export type CopiedSchedule = Pick<FunctionRow, "dataVooIda" | "horarioChegadaSugerido" | "dataVooRetorno" | "horarioPartidaSugerido" | "needsTicket" | "needsAccommodation">;

export interface ProcessedRange {
  functionId: string;
  dailyRate: number;
  dailyRatePerDay: number; // Quantas diárias por dia (para observação correta)
  startDate: string;
  endDate: string;
  workDays: string[]; // dias específicos de trabalho
  travelInfo: {
    dataVooIda: string;
    horarioChegadaSugerido: string;
    dataVooRetorno: string;
    horarioPartidaSugerido: string;
  };
  needsTicket: boolean;
  needsAccommodation: boolean;
  rowOrder: number;
}

/** Linha nova, vazia (0 = "–"), para um catálogo de datas. */
export function emptyFunctionRow(functionId: string, functionName: string, dates: string[]): FunctionRow {
  const dailyRates: { [date: string]: number } = {};
  dates.forEach(date => { dailyRates[date] = 0; });
  return {
    functionId,
    functionName,
    dataVooIda: "",
    horarioChegadaSugerido: "",
    dataVooRetorno: "",
    horarioPartidaSugerido: "",
    needsTicket: false,
    needsAccommodation: false,
    dailyRates,
    isCustom: false,
    selected: false,
  };
}

// Lista "YYYY-MM-DD" entre início e fim (inclusive), sem passar por
// toISOString (que converte para UTC e pode pular/duplicar um dia).
export const buildDateList = (startDate: string, endDate: string): string[] => {
  const list: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    list.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return list;
};

export const formatDateForDisplay = (dateStr: string | undefined | null) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return 'Data inválida';
  }
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
};

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const formatDateHeader = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return { date: `${day}/${month}`, dayName: DAY_NAMES[d.getDay()], isWeekend: d.getDay() === 0 || d.getDay() === 6 };
};

// Normaliza string para comparação: remove acentos, lowercase, trim
export const normalizeStr = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Função para converter datas curtas (15/nov, 16/nov) em datas completas (2025-11-15)
export const parseShortDate = (dateStr: string, year: string): string => {
  if (!dateStr) return "";

  // Se já está no formato YYYY-MM-DD, retornar como está
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Formatos aceitos: "15/nov", "15/11", "15-nov", "15-11"
  const monthMap: { [key: string]: string } = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
    'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
  };

  // Tentar extrair dia e mês
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length >= 2) {
    const day = parts[0].padStart(2, '0');
    let month = parts[1].toLowerCase();

    // Se é nome do mês, converter para número
    if (monthMap[month]) {
      month = monthMap[month];
    } else {
      month = month.padStart(2, '0');
    }

    return `${year}-${month}-${day}`;
  }

  return "";
};
