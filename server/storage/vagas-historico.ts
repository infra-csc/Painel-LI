/**
 * Registros de team_inclusion_logs gerados por uma alteração de vaga
 * (`updateTeamInclusion`): compara a vaga antes × patch e descreve cada
 * mudança em texto. Função PURA — o storage só lê os nomes (usuário e
 * colaboradores) e grava o que sai daqui na mesma transação do UPDATE.
 *
 * Apresentação dentro da camada de dados (anotado em 24/09, mantido): os
 * textos "R$ …", "dd/mm/aaaa" e "N/A" ficam PERSISTIDOS em `details`,
 * `previousValue` e `newValue` — não são rótulos de UI calculados na hora,
 * são o histórico como foi escrito. shared/log-auditoria.ts tem um `reais()`
 * idêntico, mas privado; quando for exportado, `fmtCents` daqui pode sumir.
 * Rótulos de status já vêm de `rotuloDoStatus` (shared/vaga-status).
 */
import type { TeamInclusion, InsertTeamInclusion, InsertTeamInclusionLog } from "@shared/schema";
import { rotuloDoStatus } from "@shared/vaga-status";
import { normalizarDataIso } from "./_comum";

export interface EntradaDoHistoricoDaVaga {
  /** Id da vaga (teamInclusionId de cada registro). */
  id: string;
  /** Linha como estava ANTES do UPDATE. */
  antes: TeamInclusion;
  /** Campos enviados no UPDATE. */
  patch: Partial<InsertTeamInclusion>;
  userId: string;
  userName: string;
  /** Nome do colaborador por id ("Nenhum" para vazio, "Desconhecido" se não achar). */
  nomeDoColaborador: (cid: string | null | undefined) => string;
}

/** O patch troca o colaborador da vaga? */
export function colaboradorMudou(antes: TeamInclusion, patch: Partial<InsertTeamInclusion>): boolean {
  return patch.collaboratorId !== undefined && patch.collaboratorId !== antes.collaboratorId;
}

/**
 * "YYYY-MM-DD" ou, quando o valor não é uma data legível, o texto original
 * (aparado) — o histórico mostra o que foi enviado, não descarta. Vazio → "".
 * É a diferença desta versão para `normalizarDataIso` (que devolve undefined).
 */
const toIsoDate = (d: unknown): string => normalizarDataIso(d) ?? (d ? String(d).trim() : "");

const fmtDate = (d: unknown): string => {
  const iso = toIsoDate(d);
  if (!iso) return "N/A";
  const parts = iso.split("-");
  return parts.length >= 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
};

const fmtCents = (v: number) => `R$ ${(v / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDay = (d: string) => { const parts = toIsoDate(d).split("-"); return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : d; };

export function montarLogsDeAlteracaoDaVaga(e: EntradaDoHistoricoDaVaga): InsertTeamInclusionLog[] {
  const { id, antes: oldInclusion, patch: inclusionData, userId, userName, nomeDoColaborador } = e;
  const logsToCreate: InsertTeamInclusionLog[] = [];
  const push = (action: string, details: string, previousValue: string | null, newValue: string | null) =>
    logsToCreate.push({ teamInclusionId: id, action, details, previousValue, newValue, userId, userName });

  // Status — rótulo único de shared/vaga-status (o mapa local foi apagado)
  if (inclusionData.status && inclusionData.status !== oldInclusion.status) {
    push("status_changed",
      `Status alterado de "${rotuloDoStatus(oldInclusion.status)}" para "${rotuloDoStatus(inclusionData.status)}"`,
      oldInclusion.status, inclusionData.status);
  }

  if (colaboradorMudou(oldInclusion, inclusionData)) {
    const oldCollabName = nomeDoColaborador(oldInclusion.collaboratorId);
    const newCollabName = nomeDoColaborador(inclusionData.collaboratorId);
    push("collaborator_changed", `Colaborador alterado de "${oldCollabName}" para "${newCollabName}"`, oldCollabName, newCollabName);
  }

  const oldDaysArr = (oldInclusion.workDays || []).map(toIsoDate).filter(Boolean).sort();
  const newDaysArr = Array.isArray(inclusionData.workDays) ? inclusionData.workDays.map(toIsoDate).filter(Boolean).sort() : null;
  const workDaysAlsoChanging = !!newDaysArr && oldDaysArr.join(",") !== newDaysArr.join(",");

  // Período — só quando os dias NÃO mudam junto (o registro consolidado abaixo já traz o período)
  if (!workDaysAlsoChanging &&
      ((inclusionData.scheduleStartDate && inclusionData.scheduleStartDate !== oldInclusion.scheduleStartDate) ||
       (inclusionData.scheduleEndDate && inclusionData.scheduleEndDate !== oldInclusion.scheduleEndDate))) {
    const prevPeriod = `${fmtDate(oldInclusion.scheduleStartDate)} a ${fmtDate(oldInclusion.scheduleEndDate)}`;
    const newPeriod = `${fmtDate(inclusionData.scheduleStartDate || oldInclusion.scheduleStartDate)} a ${fmtDate(inclusionData.scheduleEndDate || oldInclusion.scheduleEndDate)}`;
    push("dates_changed", `Período: ${prevPeriod} → ${newPeriod}`, prevPeriod, newPeriod);
  }

  if ((inclusionData.flightDepartureDate && inclusionData.flightDepartureDate !== oldInclusion.flightDepartureDate) ||
      (inclusionData.flightReturnDate && inclusionData.flightReturnDate !== oldInclusion.flightReturnDate)) {
    push("travel_dates_changed", "Datas de viagem alteradas",
      `${oldInclusion.flightDepartureDate || "N/A"} a ${oldInclusion.flightReturnDate || "N/A"}`,
      `${inclusionData.flightDepartureDate || oldInclusion.flightDepartureDate || "N/A"} a ${inclusionData.flightReturnDate || oldInclusion.flightReturnDate || "N/A"}`);
  }

  if (inclusionData.observations !== undefined && inclusionData.observations !== oldInclusion.observations) {
    push("observations_changed", "Observações atualizadas", oldInclusion.observations || "", inclusionData.observations || "");
  }

  if (!workDaysAlsoChanging && inclusionData.dailyRates !== undefined && inclusionData.dailyRates !== oldInclusion.dailyRates) {
    push("daily_rates_changed",
      `Quantidade de diárias alterada de ${oldInclusion.dailyRates ?? 0} para ${inclusionData.dailyRates}`,
      String(oldInclusion.dailyRates ?? 0), String(inclusionData.dailyRates));
  }

  if (inclusionData.dailyValue !== undefined && inclusionData.dailyValue !== oldInclusion.dailyValue) {
    push("daily_value_changed",
      `Valor da diária alterado de ${fmtCents(oldInclusion.dailyValue ?? 0)} para ${fmtCents(inclusionData.dailyValue)}`,
      String(oldInclusion.dailyValue ?? 0), String(inclusionData.dailyValue));
  }

  if (newDaysArr && workDaysAlsoChanging) {
    const oldPeriodStart = oldDaysArr[0] || toIsoDate(oldInclusion.scheduleStartDate);
    const oldPeriodEnd = oldDaysArr[oldDaysArr.length - 1] || toIsoDate(oldInclusion.scheduleEndDate);
    const newPeriodStart = newDaysArr[0] || toIsoDate(inclusionData.scheduleStartDate) || toIsoDate(oldInclusion.scheduleStartDate);
    const newPeriodEnd = newDaysArr[newDaysArr.length - 1] || toIsoDate(inclusionData.scheduleEndDate) || toIsoDate(oldInclusion.scheduleEndDate);
    const details = [
      `${oldDaysArr.length} dia(s) → ${newDaysArr.length} dia(s)`,
      `Período: ${fmtDate(oldPeriodStart)} a ${fmtDate(oldPeriodEnd)} → ${fmtDate(newPeriodStart)} a ${fmtDate(newPeriodEnd)}`,
      `Dias: ${oldDaysArr.length > 0 ? oldDaysArr.map(fmtDay).join(", ") : "nenhum"} → ${newDaysArr.length > 0 ? newDaysArr.map(fmtDay).join(", ") : "nenhum"}`,
    ].join(" | ");
    push("work_days_changed", details, oldDaysArr.join(", ") || "nenhum", newDaysArr.join(", ") || "nenhum");
  }

  if (inclusionData.city !== undefined && inclusionData.city !== oldInclusion.city) {
    push("city_changed",
      `Cidade alterada de "${oldInclusion.city || "Não informada"}" para "${inclusionData.city || "Não informada"}"`,
      oldInclusion.city || "", inclusionData.city || "");
  }

  return logsToCreate;
}
