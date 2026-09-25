// Extraído de flash-account.tsx em 25/09 (modularização): consultas, saldos
// por colaborador, extrato com saldo acumulado, filtro por origem, admitidos
// sem crédito inicial, exclusão e exportação CSV. Só dados — nenhum JSX.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { useToast } from "@/hooks/use-toast";
import { useQueriesState } from "@/components/common/query-state";
import { flashSourceLabel, isAutomaticFlashMovement } from "@shared/flash-rules";
import {
  TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, fmtDate,
  type Balance, type Collaborator, type EventItem, type ExtratoLinha, type FlashMovement, type SourceFilter,
} from "./flash-types";

export function useFlashData(args: { search: string; selectedCollabId: string; sourceFilter: SourceFilter }) {
  const { search, selectedCollabId, sourceFilter } = args;
  const { toast } = useToast();
  const qc = useQueryClient();

  const qCollaborators = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const qEvents = useQuery<EventItem[]>({ queryKey: ["/api/events"] });
  const qMovements = useQuery<FlashMovement[]>({ queryKey: ["/api/flash-movements"] });
  // `?? []` criaria um array novo a cada render e invalidaria os memos abaixo.
  const collaborators = useMemo(() => qCollaborators.data ?? [], [qCollaborators.data]);
  const events = useMemo(() => qEvents.data ?? [], [qEvents.data]);
  const movements = useMemo(() => qMovements.data ?? [], [qMovements.data]);
  // Erro/carregando das três consultas (23/09): antes uma falha virava
  // "Nenhum lançamento ainda" — sem aviso e sem botão para tentar de novo.
  const estado = useQueriesState([qCollaborators, qEvents, qMovements]);
  const isLoading = estado.isLoading;

  const getCollabName = useCallback((id: string) => collaborators.find(c => c.id === id)?.fullName || "—", [collaborators]);
  const getEventName = useCallback((id?: string | null) => events.find(e => e.id === id)?.name || "", [events]);

  // Saldo por colaborador: créditos somam, débitos subtraem
  const balances = useMemo(() => {
    const map = new Map<string, Balance>();
    for (const m of movements) {
      // Categoria desconhecida (dado legado/manual) não pode corromper o saldo
      if (m.category !== "alimentacao" && m.category !== "mobilidade") continue;
      const b = map.get(m.collaboratorId) || { food: 0, mobility: 0, count: 0 };
      const signed = (m.type === "credito" ? 1 : -1) * (m.amountCents || 0);
      if (m.category === "alimentacao") b.food += signed; else b.mobility += signed;
      b.count += 1;
      map.set(m.collaboratorId, b);
    }
    return map;
  }, [movements]);

  const accountRows = useMemo(() => {
    const rows = Array.from(balances.entries()).map(([collaboratorId, b]) => ({
      collaboratorId,
      name: getCollabName(collaboratorId),
      ...b,
      belowTarget: b.food < TARGET_FOOD_CENTS || b.mobility < TARGET_MOBILITY_CENTS,
    }));
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [balances, getCollabName, search]);

  const totals = useMemo(() => {
    let food = 0, mobility = 0, below = 0;
    for (const r of Array.from(balances.values())) {
      food += r.food; mobility += r.mobility;
      if (r.food < TARGET_FOOD_CENTS || r.mobility < TARGET_MOBILITY_CENTS) below++;
    }
    return { food, mobility, below, accounts: balances.size };
  }, [balances]);

  const selectedMovements = useMemo(
    () => movements.filter(m => m.collaboratorId === selectedCollabId),
    [movements, selectedCollabId],
  );

  // Extrato com saldo acumulado (por categoria e geral).
  // Ordena localmente por data do movimento (createdAt desempata) antes de
  // acumular — o saldo por linha não pode depender da ordem que a API devolve.
  const extrato = useMemo((): ExtratoLinha[] => {
    const sorted = [...selectedMovements].sort((a, b) => {
      const byDate = String(a.movementDate || "").localeCompare(String(b.movementDate || ""));
      if (byDate !== 0) return byDate;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    let food = 0, mobility = 0;
    return sorted.map(m => {
      const signed = (m.type === "credito" ? 1 : -1) * (m.amountCents || 0);
      if (m.category === "alimentacao") food += signed; else mobility += signed;
      return { ...m, signed, runningFood: food, runningMobility: mobility };
    });
  }, [selectedMovements]);

  // Filtro por origem é só de exibição — o saldo acumulado por linha continua
  // calculado sobre TODOS os lançamentos (senão o "Saldo" da linha mentiria).
  const extratoVisible = useMemo(() => {
    if (sourceFilter === "todos") return extrato;
    return extrato.filter(m => isAutomaticFlashMovement(m) === (sourceFilter === "automatico"));
  }, [extrato, sourceFilter]);
  const hasAutomatic = useMemo(() => extrato.some(m => isAutomaticFlashMovement(m)), [extrato]);

  // Critério único de "tem conta": QUALQUER movimento registrado (mesmo o que o
  // servidor usa para rejeitar o crédito inicial). `balances` não serve — ele
  // ignora categorias desconhecidas e mentiria para dados legados/manuais.
  const collabsWithMovements = useMemo(
    () => new Set(movements.map(m => m.collaboratorId)),
    [movements],
  );

  // Admitidos sem crédito inicial: colaboradores ativos sem NENHUM lançamento
  // (o crédito inicial só vale para conta nova — o servidor rejeita se já houver
  // movimentos). Fecha o fluxo "crédito na admissão".
  const admittedWithoutInitialCredit = useMemo(() => {
    return collaborators
      .filter(c => c.active !== false && !collabsWithMovements.has(c.id))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"));
  }, [collaborators, collabsWithMovements]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/flash-movements/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/flash-movements"] });
      toast({ title: "Lançamento excluído" });
    },
    onError: (e: unknown) => toast({ title: "Não foi possível excluir o lançamento", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" }),
  });

  // Campo CSV seguro: aspas duplas quando houver ; aspas ou quebra de linha
  const csvField = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

  const exportCsv = () => {
    const name = getCollabName(selectedCollabId);
    const header = "Data;Categoria;Tipo;Origem;Evento;Descrição;Valor (R$);Saldo Alimentação (R$);Saldo Mobilidade (R$)";
    const lines = extrato.map(m => [
      fmtDate(m.movementDate),
      m.category === "alimentacao" ? "Alimentação" : "Mobilidade",
      m.type === "credito" ? "Crédito" : "Débito",
      isAutomaticFlashMovement(m) ? `Automático (${flashSourceLabel(m.sourceType)})` : "Manual",
      csvField(getEventName(m.eventId)),
      csvField(m.description || ""),
      (m.signed / 100).toFixed(2).replace(".", ","),
      (m.runningFood / 100).toFixed(2).replace(".", ","),
      (m.runningMobility / 100).toFixed(2).replace(".", ","),
    ].join(";"));
    const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conta-corrente-flash-${name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const selectedBalance = balances.get(selectedCollabId);

  return {
    estado, isLoading, collaborators, events, movements,
    getCollabName, getEventName,
    accountRows, totals, extrato, extratoVisible, hasAutomatic,
    collabsWithMovements, admittedWithoutInitialCredit, selectedBalance,
    deleteMutation, exportCsv,
    invalidateMovements: () => qc.invalidateQueries({ queryKey: ["/api/flash-movements"] }),
  };
}

export type DadosDoFlash = ReturnType<typeof useFlashData>;
