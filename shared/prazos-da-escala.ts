/**
 * Prazos de cada etapa da vaga, contados da DATA DO EVENTO (18/09 — planilha do
 * time: "data de validação, escalação e emissão da passagem de acordo com a data
 * do evento"; "editáveis pelo admin"). Para um evento em 20/10 a planilha pede:
 *   registros 18/09 · validação 25/09 · aprovação 26/09 · escalação 03/10 ·
 *   escalado 03/10 · passagem emitida 10/10.
 * Viram "dias antes do evento" (padrão abaixo). O administrador muda no Quadro
 * das Análises; ficam em system_settings, uma chave por etapa.
 */
export type EtapaComPrazo = "registro" | "validacao" | "aprovacao" | "escalacao" | "escalado" | "passagem";

export const ETAPAS_COM_PRAZO: EtapaComPrazo[] = ["registro", "validacao", "aprovacao", "escalacao", "escalado", "passagem"];

export const ROTULO_DA_ETAPA: Record<EtapaComPrazo, string> = {
  registro: "Registros",
  validacao: "Validação",
  aprovacao: "Aprovação",
  escalacao: "Escalação",
  escalado: "Escalado",
  passagem: "Passagem emitida",
};

export type DiasDosPrazos = Record<EtapaComPrazo, number>;

export const DIAS_PADRAO: DiasDosPrazos = {
  registro: 32,
  validacao: 25,
  aprovacao: 24,
  escalacao: 17,
  escalado: 17,
  passagem: 10,
};

/** Chave de cada etapa em system_settings. */
export const CHAVE_DO_PRAZO: Record<EtapaComPrazo, string> = {
  registro: "prazo_dias_registro",
  validacao: "prazo_dias_validacao",
  aprovacao: "prazo_dias_aprovacao",
  escalacao: "prazo_dias_escalacao",
  escalado: "prazo_dias_escalado",
  passagem: "prazo_dias_passagem",
};

export const DIAS_MAXIMO = 365;

/** Linhas de system_settings → dias por etapa (o que não estiver gravado usa o padrão). */
export function lerDiasDosPrazos(linhas: { key: string; value: string }[]): DiasDosPrazos {
  const porChave = new Map(linhas.map((l) => [l.key, l.value]));
  const out = { ...DIAS_PADRAO };
  for (const etapa of ETAPAS_COM_PRAZO) {
    const n = Number(porChave.get(CHAVE_DO_PRAZO[etapa]));
    if (Number.isInteger(n) && n >= 0 && n <= DIAS_MAXIMO) out[etapa] = n;
  }
  return out;
}

/** Valida o que o administrador mandou; devolve o erro em português ou os dias. */
export function validarDiasDosPrazos(corpo: Record<string, unknown>): { erro: string } | { dias: Partial<DiasDosPrazos> } {
  const dias: Partial<DiasDosPrazos> = {};
  for (const etapa of ETAPAS_COM_PRAZO) {
    if (corpo[etapa] === undefined) continue;
    const n = Number(corpo[etapa]);
    if (!Number.isInteger(n) || n < 0 || n > DIAS_MAXIMO) {
      return { erro: `${ROTULO_DA_ETAPA[etapa]}: informe um número inteiro de 0 a ${DIAS_MAXIMO} dias.` };
    }
    dias[etapa] = n;
  }
  if (Object.keys(dias).length === 0) return { erro: "Nenhum prazo informado." };
  return { dias };
}

/** A partir de quantos dias antes do prazo a célula fica amarela. */
export const DIAS_DE_ALERTA = 3;

const MS_DIA = 86_400_000;

/** "2026-10-20" (ou Date) → data limite da etapa, meia-noite local. */
export function prazoDaEtapa(
  dataDoEvento: string | Date | null | undefined,
  etapa: EtapaComPrazo,
  dias: DiasDosPrazos = DIAS_PADRAO,
): Date | null {
  if (!dataDoEvento) return null;
  let base: Date;
  if (dataDoEvento instanceof Date) {
    base = new Date(dataDoEvento.getFullYear(), dataDoEvento.getMonth(), dataDoEvento.getDate());
  } else {
    const iso = String(dataDoEvento).slice(0, 10);
    base = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  }
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() - dias[etapa]);
  return base;
}

export type SituacaoDoPrazo = "cumprido" | "atrasado" | "vence_logo" | "no_prazo" | "sem_data";

/**
 * - "cumprido": nada pendente nesta etapa;
 * - "atrasado": o prazo passou e ainda há pendência;
 * - "vence_logo": vence em até DIAS_DE_ALERTA dias (inclui hoje) com pendência;
 * - "no_prazo": pendência com folga.
 */
export function situacaoDoPrazo(prazo: Date | null, hoje: Date, pendentes: number): SituacaoDoPrazo {
  if (pendentes <= 0) return "cumprido";
  if (!prazo) return "sem_data";
  const dias = -(diasDeAtraso(prazo, hoje) ?? 0);
  if (dias < 0) return "atrasado";
  if (dias <= DIAS_DE_ALERTA) return "vence_logo";
  return "no_prazo";
}

/** Quantos dias de atraso (positivo) ou de folga (negativo). */
export function diasDeAtraso(prazo: Date | null, hoje: Date): number | null {
  if (!prazo) return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  return Math.round((h - prazo.getTime()) / MS_DIA);
}
