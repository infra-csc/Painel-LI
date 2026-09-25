/**
 * Edições da PLANILHA do Planejado como funções puras — 25/09 (modularização).
 *
 * Eram os updaters de `setBudgetOverrides` dentro de budget-planned.tsx
 * (`handleSheetEdit` e `restoreSheetField`). Puras (prev → next) para serem
 * testáveis sem React e reutilizadas pelos lotes.
 */
import { parseBrNumber } from "@/lib/utils";
import type { BudgetOverride, BudgetOverrides, CalculatedBudget, SheetField } from "./types";

type SlotAlimentacao = "almocoSemana" | "jantarSemana" | "almocoFds" | "jantarFds";

// Handler para edição inline na planilha — grava override ESPARSO: apenas os
// campos efetivamente editados entram; o resto continua recalculando (ex.:
// mobilidade/alimentação reagem à chegada da passagem).
export function aplicarEdicaoNaPlanilha(
  prev: BudgetOverrides,
  budget: CalculatedBudget,
  field: SheetField,
  rawValue: string,
): BudgetOverrides {
  const val = parseBrNumber(rawValue);
  const valCents = Math.round(val * 100);

  const dias = Math.max(1, budget.weekdays + budget.weekends);

  // NÃO limpar o override quando o valor digitado coincide com o padrão.
  //
  // Zerar é uma decisão legítima do usuário e precisa ser gravada como
  // override. Para voltar ao padrão já existem três caminhos explícitos: o
  // ↩ de cada célula, o "Restaurar" da linha e o "Restaurar Padrão em Todos".

  const existingOvr = prev[budget.inclusion.id];
  const updated: BudgetOverride = { ...(existingOvr || { inclusionId: budget.inclusion.id }) };
  if (field === "valorDia") {
    // Diária PLANA: um único valor, espelhado nos campos legados
    updated.valorDiaria = valCents; updated.valorDiariaUtil = valCents; updated.valorDiariaFds = valCents;
  }
  else if (field === "alimentacao") {
    // valCents é por dia → converter para total do período.
    // Distribui SOMENTE entre buckets com dias > 0 (bucket sem dia conta 0 —
    // mesmo zeroing efetivo do modal e do calculatedBudgets).
    const totalCents = valCents * dias;
    const slots: SlotAlimentacao[] = [];
    if (budget.weekdays > 0) slots.push("almocoSemana", "jantarSemana");
    if (budget.weekends > 0) slots.push("almocoFds", "jantarFds");
    // Buckets sem dias saem do override — o zeroing efetivo os mantém em 0
    if (budget.weekdays === 0) { delete updated.almocoSemana; delete updated.jantarSemana; }
    if (budget.weekends === 0) { delete updated.almocoFds; delete updated.jantarFds; }
    if (slots.length > 0) {
      const existingBySlot = {
        almocoSemana: budget.almocoSemana, jantarSemana: budget.jantarSemana,
        almocoFds: budget.almocoFds, jantarFds: budget.jantarFds,
      };
      const existingTotal = slots.reduce((s, k) => s + existingBySlot[k], 0);
      if (existingTotal === 0) {
        // Divide igualmente entre as refeições dos buckets com dias;
        // resto do arredondamento vai no último para a soma bater exata.
        const q = Math.round(totalCents / slots.length);
        slots.forEach(k => { updated[k] = q; });
        updated[slots[slots.length - 1]] = totalCents - q * (slots.length - 1);
      } else {
        // Proporcional ao existente; resto no último componente
        let acc = 0;
        slots.forEach((k, i) => {
          if (i < slots.length - 1) {
            const v = Math.round(existingBySlot[k] * totalCents / existingTotal);
            updated[k] = v;
            acc += v;
          }
        });
        updated[slots[slots.length - 1]] = totalCents - acc;
      }
    }
  } else if (field === "alimentacaoUtil") {
    // valCents é por dia útil → propaga sobre almocoSemana + jantarSemana
    const totalCents = valCents * Math.max(1, budget.weekdays);
    const existingWd = budget.almocoSemana + budget.jantarSemana;
    if (existingWd === 0) {
      updated.almocoSemana = Math.round(totalCents / 2);
      updated.jantarSemana = totalCents - Math.round(totalCents / 2);
    } else {
      const f = totalCents / existingWd;
      updated.almocoSemana = Math.round(budget.almocoSemana * f);
      updated.jantarSemana = totalCents - Math.round(budget.almocoSemana * f);
    }
  } else if (field === "alimentacaoFds") {
    // valCents é por dia de fim de semana → propaga sobre almocoFds + jantarFds
    const totalCents = valCents * Math.max(1, budget.weekends);
    const existingWe = budget.almocoFds + budget.jantarFds;
    if (existingWe === 0) {
      updated.almocoFds = Math.round(totalCents / 2);
      updated.jantarFds = totalCents - Math.round(totalCents / 2);
    } else {
      const f = totalCents / existingWe;
      updated.almocoFds = Math.round(budget.almocoFds * f);
      updated.jantarFds = totalCents - Math.round(budget.almocoFds * f);
    }
  } else if (field === "mobilidade") {
    // valCents é o total (Ida + Volta) — não multiplica por dias
    updated.mobilidade = valCents;
    updated.mobilidadeIda = Math.round(valCents / 2);
    updated.mobilidadeVolta = valCents - Math.round(valCents / 2);
  }
  // Sem nenhum campo além do inclusionId (ex.: lote de alimentação numa
  // linha sem dias), não grava override vazio — a linha não foi editada.
  const { inclusionId: _iid, ...camposEditados } = updated;
  if (Object.keys(camposEditados).length === 0) {
    const next = { ...prev };
    delete next[budget.inclusion.id];
    return next;
  }
  return { ...prev, [budget.inclusion.id]: updated };
}

// Restaurar padrão de um campo: REMOVE o campo do override — o cálculo reassume
export function restaurarCampoDaPlanilha(prev: BudgetOverrides, sid: string, field: SheetField): BudgetOverrides {
  const ovr = prev[sid];
  if (!ovr) return prev;
  const updated: BudgetOverride = { ...ovr };
  if (field === "valorDia") { delete updated.valorDiaria; delete updated.valorDiariaUtil; delete updated.valorDiariaFds; }
  else if (field === "alimentacao") { delete updated.almocoSemana; delete updated.jantarSemana; delete updated.almocoFds; delete updated.jantarFds; }
  else if (field === "alimentacaoUtil") { delete updated.almocoSemana; delete updated.jantarSemana; }
  else if (field === "alimentacaoFds") { delete updated.almocoFds; delete updated.jantarFds; }
  else if (field === "mobilidade") { delete updated.mobilidade; delete updated.mobilidadeIda; delete updated.mobilidadeVolta; }
  const hasAny = Object.keys(updated).some(k => k !== "inclusionId");
  const n = { ...prev };
  if (!hasAny) delete n[sid];
  else n[sid] = updated;
  return n;
}

/** Remove os overrides das vagas informadas (ex.: "Restaurar Padrão em Todos" no filtro atual). */
export function limparOverridesDe(prev: BudgetOverrides, ids: readonly string[]): BudgetOverrides {
  const updated = { ...prev };
  ids.forEach(id => { delete updated[id]; });
  return updated;
}
