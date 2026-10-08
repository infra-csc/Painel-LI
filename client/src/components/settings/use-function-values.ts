// Extraído de system-settings.tsx em 25/09 (modularização): estado e regras
// das "Diárias por Função (legado)" — os 4 mapas de valores (casa/freela ×
// útil/fds), o predicado de sujeira, a edição inline célula a célula, o lote
// do salvamento e as entradas de histórico. A busca e o estado de edição ficam
// AQUI (e não na tabela) porque a tabela vive dentro de um Collapsible que
// desmonta ao fechar — se o estado fosse dela, fechar a zona legada zeraria a
// busca e a edição em andamento.
//
// 08/10 (correção de defeitos): o salvamento deixou de ser N PATCH/POST em
// paralelo — este hook só MONTA o lote (só as células alteradas) e quem grava
// é o PUT em lote de useSettingsForm. As regras puras moram em
// settings-salvamento.ts; a recarga depois de salvar preserva o que foi
// editado durante o envio.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { User, Function as FunctionType, FunctionValue } from "@shared/schema";
import type { HistoryEntry } from "./settings-utils";
import {
  funcaoAlterada, historicoDasFuncoes, loteDasFuncoes, mapasSalvos, mapasVazios, mesclarRecarga,
  type Carimbo, type FuncaoNoLote, type MapaDaFuncao, type MapasDasFuncoes,
} from "./settings-salvamento";

export type SettingsTab = 'casa' | 'freela';
export type EditingField = 'wd' | 'we';

/** O que a tabela/linha precisa para editar uma célula inline. */
export interface FunctionValuesEditor {
  editingFunctionId: string | null;
  editingField: EditingField;
  editingFunctionValue: string;
  setEditingFunctionValue: (v: string) => void;
  editInputRef: RefObject<HTMLInputElement>;
  getCurrentValue: (fnId: string, field: EditingField) => string;
  startEditFunction: (fn: FunctionType, field?: EditingField) => void;
  confirmEditFunction: (fnId: string) => void;
  cancelEditFunction: () => void;
}

export interface UseFunctionValuesParams {
  allFunctions: FunctionType[];
  allFunctionValues: FunctionValue[];
  activeTab: SettingsTab;
  user: User | null;
}

const mapaDaCelula = (tab: SettingsTab, field: EditingField): MapaDaFuncao =>
  tab === 'casa' ? (field === 'wd' ? 'casaWd' : 'casaWe') : (field === 'wd' ? 'freelaWd' : 'freelaWe');

export function useFunctionValues({ allFunctions, allFunctionValues, activeTab, user }: UseFunctionValuesParams) {
  const [mapas, setMapas] = useState<MapasDasFuncoes>(mapasVazios);
  const [functionSearch, setFunctionSearch] = useState("");
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditingField>('wd');
  const [editingFunctionValue, setEditingFunctionValue] = useState<string>("");
  const editInputRef = useRef<HTMLInputElement>(null);
  // Contra o que a edição da pessoa é medida na próxima recarga: o que está
  // salvo, ou — durante um salvamento — o que foi enviado.
  const salvosRef = useRef<MapasDasFuncoes>(mapasVazios());
  const baseRef = useRef<MapasDasFuncoes>(mapasVazios());

  // Reconstrói os 4 mapas a partir do que está salvo (o "Descartar").
  const resetFunctionValueStates = useCallback(() => {
    if (allFunctions.length === 0) return;
    const frescos = mapasSalvos(allFunctions, allFunctionValues);
    salvosRef.current = frescos;
    baseRef.current = frescos;
    setMapas(frescos);
  }, [allFunctions, allFunctionValues]);

  // Carga e recargas: o que chegou do servidor, sem apagar célula editada
  // (inclusive a editada enquanto o salvamento corria).
  useEffect(() => {
    if (allFunctions.length === 0) return;
    const frescos = mapasSalvos(allFunctions, allFunctionValues);
    const base = baseRef.current;
    setMapas(atuais => mesclarRecarga(frescos, atuais, base));
    salvosRef.current = frescos;
    baseRef.current = frescos;
  }, [allFunctions, allFunctionValues]);

  useEffect(() => {
    if (editingFunctionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFunctionId]);

  const dirtyFunctionCount = allFunctions.filter(fn => funcaoAlterada(fn, allFunctionValues, mapas)).length;

  /** Lote do salvamento — só as células alteradas — e marca o envio. */
  const prepararEnvio = (): FuncaoNoLote[] => {
    baseRef.current = mapas;
    return loteDasFuncoes(allFunctions, allFunctionValues, mapas);
  };
  /** Salvamento falhou: as edições voltam a ser medidas contra o salvo. */
  const envioFalhou = () => {
    baseRef.current = salvosRef.current;
  };

  // Entradas de histórico (e a lista "antes → depois" da barra). Precisa rodar
  // ANTES de gravar, enquanto allFunctionValues ainda tem os valores antigos.
  // O carimbo vem de quem salva — um só para tarifas e funções.
  const buildFunctionHistoryEntries = (carimbo?: Carimbo): HistoryEntry[] =>
    historicoDasFuncoes(allFunctions, allFunctionValues, mapas,
      carimbo ?? { timestamp: new Date().toISOString(), user: user?.name || "Admin" });

  function getCurrentValue(fnId: string, field: EditingField): string {
    return mapas[mapaDaCelula(activeTab, field)][fnId] ?? "0.00";
  }
  function startEditFunction(fn: FunctionType, field: EditingField = 'wd') {
    setEditingFunctionId(fn.id);
    setEditingField(field);
    setEditingFunctionValue(getCurrentValue(fn.id, field));
  }
  function confirmEditFunction(fnId: string) {
    const val = editingFunctionValue;
    const mapa = mapaDaCelula(activeTab, editingField);
    setMapas(prev => ({ ...prev, [mapa]: { ...prev[mapa], [fnId]: val } }));
    setEditingFunctionId(null);
  }
  function cancelEditFunction() {
    setEditingFunctionId(null);
  }

  const editor: FunctionValuesEditor = {
    editingFunctionId,
    editingField,
    editingFunctionValue,
    setEditingFunctionValue,
    editInputRef,
    getCurrentValue,
    startEditFunction,
    confirmEditFunction,
    cancelEditFunction,
  };

  return {
    functionSearch,
    setFunctionSearch,
    resetFunctionValueStates,
    dirtyFunctionCount,
    prepararEnvio,
    envioFalhou,
    buildFunctionHistoryEntries,
    editor,
  };
}

export type FunctionValuesState = ReturnType<typeof useFunctionValues>;
