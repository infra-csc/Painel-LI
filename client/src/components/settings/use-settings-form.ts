// Extraído de system-settings.tsx em 25/09 (modularização): orquestrador de
// dados da tela Valores padrão — as 5 consultas, o react-hook-form, o
// salvamento único (tarifas + diárias por função + aplicar ao Planejado),
// o histórico local e a ação "Atualizar Planejado". A página só compõe o
// que este hook devolve; nenhum cartão fala com a API diretamente.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Function as FunctionType, FunctionValue, PaymentCompany } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { parseBrNumber } from "@/lib/utils";
import { isRhOrAdmin } from "@/lib/role-utils";
import { useQueriesState } from "@/components/common/query-state";
import {
  FIELD_LABELS, FORM_DEFAULT_VALUES, LEGACY_ZONE_FIELDS, PERCENT_KEYS,
  formSchema, settingsToFormValues, type FormValues,
} from "./settings-schema";
import { HISTORY_KEY, LAST_SAVED_KEY, centavosToReais, formatCurrency, type HistoryEntry } from "./settings-utils";
import { useSettingsHistory } from "./use-settings-history";
import { useFunctionValues, type SettingsTab } from "./use-function-values";

export function useSettingsForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Zona legada controlada: aberta programaticamente quando um erro de
  // validação está num campo escondido dentro dela (ver handleSaveAll).
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('casa');
  const { history, setHistory, lastSaved, setLastSaved } = useSettingsHistory();

  // Sem permissão, nada é baixado — o gate de render sozinho ainda deixava
  // as 5 queries rodarem e entregarem os dados ao navegador
  const allowed = isRhOrAdmin(user);

  // Sem `queryFn` caseiro (23/09): o padrão do queryClient checa `res.ok`,
  // trata 401 e HTML de servidor desatualizado — os de antes gravavam o corpo
  // do erro no cache e o formulário aparecia preenchido com lixo.
  const qSettings = useQuery<Record<string, number>>({ queryKey: ["/api/system-settings"], enabled: allowed });
  const qFunctions = useQuery<FunctionType[]>({ queryKey: ["/api/functions"], enabled: allowed });
  const qFnCollaboratorTypes = useQuery<Record<string, string[]>>({ queryKey: ["/api/function-collaborator-types"], staleTime: 0, enabled: allowed });
  const qFunctionValues = useQuery<FunctionValue[]>({ queryKey: ["/api/function-values"], enabled: allowed });
  const qPaymentCompanies = useQuery<PaymentCompany[]>({ queryKey: ["/api/payment-companies"], enabled: allowed });
  const settings = qSettings.data;
  const allFunctions = useMemo(() => qFunctions.data ?? [], [qFunctions.data]);
  const fnCollaboratorTypes = qFnCollaboratorTypes.data ?? {};
  const allFunctionValues = useMemo(() => qFunctionValues.data ?? [], [qFunctionValues.data]);
  const paymentCompanies = qPaymentCompanies.data ?? [];
  // Erro/carregando das 5 consultas (23/09): o formulário só aparece com os
  // dados na mão — antes nascia vazio e era preenchido depois.
  const estado = useQueriesState([qSettings, qFunctions, qFnCollaboratorTypes, qFunctionValues, qPaymentCompanies]);

  const fnValues = useFunctionValues({ allFunctions, allFunctionValues, activeTab, user });
  const { dirtyFunctionCount, saveFunctionValuesMutation, buildFunctionHistoryEntries } = fnValues;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: FORM_DEFAULT_VALUES,
  });

  useEffect(() => {
    if (settings) {
      form.reset(settingsToFormValues(settings));
    }
  }, [settings, form]);

  const dirtyFormFields = Object.keys(form.formState.dirtyFields).length;
  const totalUnsaved = dirtyFormFields + dirtyFunctionCount;
  const hasAnyChanges = totalUnsaved > 0;
  const isSavingAny = saveFunctionValuesMutation.isPending;

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body: Record<string, number> = {};
      for (const [key, val] of Object.entries(values)) {
        body[key] = parseBrNumber(val);
      }
      body["default_mobility"] = (parseBrNumber(values.default_mobility_ida) || 0) + (parseBrNumber(values.default_mobility_volta) || 0);
      return apiRequest("PUT", "/api/system-settings", body);
    },
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      const now = new Date().toISOString();
      const userName = user?.name || "Admin";
      const newEntries: HistoryEntry[] = [];
      if (settings) {
        for (const key of Object.keys(values) as (keyof FormValues)[]) {
          const newVal = values[key];
          if (PERCENT_KEYS.has(key)) {
            // Percentuais inteiros — o valor salvo já é inteiro cru (sem ×100)
            const oldRaw = String(settings[key] ?? "");
            if (parseBrNumber(oldRaw || "NaN") !== parseBrNumber(newVal)) {
              newEntries.push({ timestamp: now, user: userName, field: FIELD_LABELS[key] ?? key, oldValue: `${oldRaw || "—"}%`, newValue: `${newVal}%` });
            }
            continue;
          }
          const oldVal = centavosToReais(settings[key] ?? settings["default_daily_value"] ?? 0);
          if (parseBrNumber(oldVal) !== parseBrNumber(newVal)) {
            newEntries.push({ timestamp: now, user: userName, field: FIELD_LABELS[key] ?? key, oldValue: formatCurrency(oldVal), newValue: formatCurrency(newVal) });
          }
        }
      }
      const updatedHistory = [...newEntries, ...history].slice(0, 40);
      setHistory(updatedHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
      const savedInfo = { timestamp: now, user: userName };
      setLastSaved(savedInfo);
      localStorage.setItem(LAST_SAVED_KEY, JSON.stringify(savedInfo));
    },
    // Sem onError aqui: o único toast de falha do fluxo é o do catch de
    // handleSaveAll (que exibe a mensagem do servidor) — antes eram dois.
  });

  // ÚNICO fluxo de salvamento da página (barra flutuante): valida, salva as
  // tarifas + valores por função e aplica os padrões aos planejamentos
  // pendentes, com um único toast ao final.
  const handleSaveAll = form.handleSubmit(
    async (values) => {
      try {
        await saveMutation.mutateAsync(values);
        if (dirtyFunctionCount > 0) {
          // Histórico local também cobre as Diárias por Função salvas neste fluxo
          const fnEntries = buildFunctionHistoryEntries();
          await saveFunctionValuesMutation.mutateAsync();
          queryClient.invalidateQueries({ queryKey: ["/api/function-values"] });
          if (fnEntries.length > 0) {
            setHistory(prev => {
              const updated = [...fnEntries, ...prev].slice(0, 40);
              localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
              return updated;
            });
          }
        }
        // Apply new defaults to all pending (not-yet-sent) budget_planned records
        let updatedCount = 0;
        let applyFailed = false;
        try {
          const applyRes = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
          const applyData = await applyRes.json();
          updatedCount = applyData.updated ?? 0;
          if (updatedCount > 0) {
            queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
          }
        } catch {
          // Falha não pode ser engolida: os valores foram salvos, mas o
          // Planejado pendente ficou desatualizado — avisar com o caminho manual.
          applyFailed = true;
        }
        if (applyFailed) {
          toast({
            title: "Valores salvos, mas não foi possível atualizar os planejamentos pendentes",
            description: "Use o botão \"Atualizar Planejado\" para aplicá-los aos orçamentos pendentes.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Valores padrão salvos",
            description: updatedCount > 0
              ? `${updatedCount} planejamento${updatedCount > 1 ? 's' : ''} pendente${updatedCount > 1 ? 's' : ''} atualizado${updatedCount > 1 ? 's' : ''} com os novos valores.`
              : "Os novos valores serão aplicados em orçamentos de novos eventos.",
          });
        }
      } catch (e) {
        toast({
          title: "Erro ao salvar",
          description: apiErrorMessage(e, "Não foi possível salvar as alterações. Tente novamente."),
          variant: "destructive",
        });
      }
    },
    (errors) => {
      toast({ title: "Corrija os valores destacados antes de salvar", variant: "destructive" });
      // Se o primeiro campo inválido estiver na zona legada (colapsada), abre a
      // seção e leva o foco até ele — senão o erro fica invisível.
      const firstErrorField = Object.keys(errors)[0];
      if (firstErrorField && LEGACY_ZONE_FIELDS.has(firstErrorField)) {
        setLegacyOpen(true);
        // Os campos legados só montam na aba correspondente (Casa/Freela)
        setActiveTab(firstErrorField.endsWith("_freela") ? "freela" : "casa");
        // Espera o CollapsibleContent montar antes de rolar/focar
        setTimeout(() => {
          const el = document.getElementById(firstErrorField);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            (el as HTMLElement).focus({ preventScroll: true });
          }
        }, 150);
      }
    },
  );

  // Ação secundária (não salva nada): reaplica os valores padrão JÁ SALVOS a
  // todos os orçamentos planejados ainda não enviados.
  const [isApplyingPending, setIsApplyingPending] = useState(false);
  const handleApplyToPending = async () => {
    setIsApplyingPending(true);
    try {
      const res = await apiRequest("POST", "/api/budget-planned/apply-defaults", {});
      const data = await res.json();
      const count = data.updated ?? 0;
      if (count > 0) queryClient.invalidateQueries({ queryKey: ["/api/budget-planned"] });
      toast({
        title: count > 0
          ? `${count} planejamento${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}`
          : "Nenhum orçamento pendente encontrado",
        description: count > 0 ? "Valores padrão aplicados aos orçamentos pendentes." : undefined,
      });
    } catch (err) {
      toast({ title: "Não foi possível atualizar o Planejado", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setIsApplyingPending(false);
    }
  };

  return {
    user,
    estado,
    form,
    // Dados das consultas
    allFunctions,
    fnCollaboratorTypes,
    allFunctionValues,
    paymentCompanies,
    // Zona legada
    legacyOpen, setLegacyOpen,
    activeTab, setActiveTab,
    fnValues,
    // Salvamento
    totalUnsaved,
    hasAnyChanges,
    // Mesmo predicado de antes: mutation das diárias por função OU das tarifas
    isSaving: isSavingAny || saveMutation.isPending,
    handleSaveAll,
    // Histórico local
    history,
    lastSaved,
    // Atualizar Planejado
    isApplyingPending,
    handleApplyToPending,
  };
}

export type SettingsFormState = ReturnType<typeof useSettingsForm>;
