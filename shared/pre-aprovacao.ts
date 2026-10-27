/**
 * Pré-aprovação do DP no Planejado — Módulo de Honorários, Fase 0 (26/10).
 *
 * Ata de 22/10: "Nenhum registro é liberado para a Produção sem a
 * pré-aprovação do DP". No app, "liberar para a Produção" é o "Enviar ao
 * Realizado" do Planejado (é ele que cria a prestação que o responsável da
 * função preenche). Daqui em diante o envio só passa com a linha
 * pré-aprovada — e com os MESMOS valores que o DP pré-aprovou.
 *
 * Onde mora: a coluna `budget_planned.status`, que existia desde agosto
 * ("pendente, aprovado_rh, rejeitado_rh") e nunca foi usada — nenhuma rota a
 * gravava (POST/PATCH descartam o campo). Valor novo `pre_aprovado`; o
 * antigo `aprovado_rh` (só o seed da demonstração o usava) vale como
 * pré-aprovado, para não quebrar nada que já esteja gravado assim. Quem e
 * quando: `approved_by` / `approved_at`, que também já existiam.
 *
 * Funções puras — usadas pelo servidor (rotas) e pela tela (estado da linha).
 */

/** Valor gravado em `budget_planned.status` quando o DP pré-aprova a linha. */
export const STATUS_PRE_APROVADO = "pre_aprovado";
/** Valor padrão da coluna: linha calculada, ainda sem a pré-aprovação. */
export const STATUS_PENDENTE = "pendente";

/** A linha está pré-aprovada? (`aprovado_rh` é o nome antigo do mesmo estado.) */
export function estaPreAprovado(status: string | null | undefined): boolean {
  return status === STATUS_PRE_APROVADO || status === "aprovado_rh";
}

/**
 * Campos que formam o VALOR da linha. Mudou qualquer um depois da
 * pré-aprovação (recalcular, ajuste manual, honorário aprovado), a linha
 * volta a pendente — o DP pré-aprovou outro número.
 */
export const CAMPOS_DE_VALOR_DO_PLANEJADO = [
  "dailyQuantity", "dailyValue", "costAssistance",
  "weekdayLunch", "weekdayDinner", "weekendLunch", "weekendDinner",
  "mobility", "mobilityIda", "mobilityVolta", "transport", "totalValue",
] as const;
export type CampoDeValorDoPlanejado = (typeof CAMPOS_DE_VALOR_DO_PLANEJADO)[number];

export type ValoresDoPlanejado = Partial<Record<CampoDeValorDoPlanejado, number | null | undefined>>;

/** Nome legível de cada campo de valor (aviso e auditoria). */
export const ROTULO_DO_CAMPO_DE_VALOR: Record<CampoDeValorDoPlanejado, string> = {
  dailyQuantity: "dias", dailyValue: "diária", costAssistance: "ajuda de custo",
  weekdayLunch: "almoço (semana)", weekdayDinner: "jantar (semana)",
  weekendLunch: "almoço (fim de semana)", weekendDinner: "jantar (fim de semana)",
  mobility: "mobilidade", mobilityIda: "mobilidade (ida)", mobilityVolta: "mobilidade (volta)",
  transport: "translado", totalValue: "total",
};

/**
 * Campos de valor que mudaram entre o gravado (`antes`) e o novo (`depois`).
 * Só compara o que veio em `depois` (um PATCH parcial não "zera" o resto);
 * nulo e ausente valem 0 (mobilidade de ida/volta é nula em linha antiga).
 */
export function camposDeValorQueMudaram(antes: ValoresDoPlanejado, depois: ValoresDoPlanejado): CampoDeValorDoPlanejado[] {
  const mudaram: CampoDeValorDoPlanejado[] = [];
  for (const campo of CAMPOS_DE_VALOR_DO_PLANEJADO) {
    if (!(campo in depois) || depois[campo] === undefined) continue;
    if ((antes[campo] ?? 0) !== (depois[campo] ?? 0)) mudaram.push(campo);
  }
  return mudaram;
}

/**
 * Estado da pré-aprovação de UMA vaga no Planejado.
 *  - `enviado`: já está no Realizado (liberado à Produção) — fora da decisão;
 *  - `nao_participou`: marcado como não participou — zera, não se pré-aprova;
 *  - `pre_aprovado`: pré-aprovado e o valor de agora é o pré-aprovado;
 *  - `desatualizado`: estava pré-aprovado, mas o valor mudou — volta a pendente;
 *  - `pendente`: falta a pré-aprovação do DP;
 *  - `legado` (27/10): evento legado (termina antes da data de corte,
 *    shared/legado-honorarios.ts) — fluxo antigo: vai ao Realizado SEM a
 *    pré-aprovação (decisão do dono: só o fluxo novo a exige). Pré-aprovar
 *    continua possível; pré-aprovada com o valor de agora fica `pre_aprovado`.
 */
export type SituacaoDaPreAprovacao = "enviado" | "nao_participou" | "pre_aprovado" | "desatualizado" | "pendente" | "legado";

export function situacaoDaPreAprovacao(e: {
  enviado: boolean;
  naoParticipou: boolean;
  /** Linha gravada do Planejado (pode não existir: a vaga só é gravada ao pré-aprovar, marcar ausência ou enviar). */
  planejado: (ValoresDoPlanejado & { status?: string | null }) | null | undefined;
  /** Os valores que a tela calcula agora para a vaga (mesmo formato do que é gravado). */
  valoresDeAgora: ValoresDoPlanejado;
  /** O evento é legado (27/10)? Então a vaga não pede a pré-aprovação. */
  eventoLegado?: boolean;
}): SituacaoDaPreAprovacao {
  if (e.enviado) return "enviado";
  if (e.naoParticipou) return "nao_participou";
  const preAprovada = !!e.planejado && estaPreAprovado(e.planejado.status);
  if (preAprovada && e.planejado && camposDeValorQueMudaram(e.planejado, e.valoresDeAgora).length === 0) return "pre_aprovado";
  // Legado (27/10): sem pré-aprovação válida, segue o fluxo antigo (o servidor também não exige).
  if (e.eventoLegado) return "legado";
  return preAprovada ? "desatualizado" : "pendente";
}

/** A linha pode ir ao Realizado? Pré-aprovada com o valor pré-aprovado — ou de evento legado (27/10). */
export function podeLiberarParaProducao(s: SituacaoDaPreAprovacao): boolean {
  return s === "pre_aprovado" || s === "legado";
}

/** A linha ainda pede a pré-aprovação do DP? (`desatualizado` também pede.) */
export function pedePreAprovacao(s: SituacaoDaPreAprovacao): boolean {
  return s === "pendente" || s === "desatualizado";
}
