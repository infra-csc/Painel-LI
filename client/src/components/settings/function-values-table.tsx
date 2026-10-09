// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// Tabela "Diária por função (legado)" — cabeçalho com contador de alteradas,
// busca, estados vazios e a lista de linhas (FunctionValueRow). A filtragem
// por aba (casa/freela) e por busca é a mesma de antes.
//
// 08/10 — dentro da zona legada, sem cartão próprio (era cartão dentro de
// cartão): título, busca com contagem, "Limpar busca" no sem resultado e a
// tabela que vira cartão na largura estreita.
import { Link } from "wouter";
import type { Function as FunctionType, FunctionValue } from "@shared/schema";
import { ExternalLink, Search, X } from "lucide-react";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { SeloAlteradas } from "./settings-fields";
import { toTitleCase } from "@/lib/format";
import { FunctionValueRow } from "./function-value-row";
import type { FunctionValuesEditor, SettingsTab } from "./use-function-values";

/**
 * Cabeçalho da tabela. As células de verdade vêm da linha (`rowRender`); estes
 * `cell` só existem para o contrato do DataTable.
 */
const COLUNAS_DE_VALORES: ColunaDaTabela<FunctionType>[] = [
  { key: "funcao", header: "Função", papel: "principal", cell: fn => toTitleCase(fn.name) },
  { key: "wd", header: "Dia útil", align: "right", width: 200, cell: () => null },
  { key: "we", header: "Fim de semana", align: "right", width: 200, cell: () => null },
];

export interface FunctionValuesTableProps {
  allFunctions: FunctionType[];
  fnCollaboratorTypes: Record<string, string[]>;
  allFunctionValues: FunctionValue[];
  activeTab: SettingsTab;
  functionSearch: string;
  setFunctionSearch: (v: string) => void;
  dirtyFunctionCount: number;
  editor: FunctionValuesEditor;
}

export function FunctionValuesTable({
  allFunctions, fnCollaboratorTypes, allFunctionValues, activeTab,
  functionSearch, setFunctionSearch, dirtyFunctionCount, editor,
}: FunctionValuesTableProps) {
  const isCasaType = (types: string[]) => types.some(t => t === 'casa' || t === 'local');
  const isFreelaType = (types: string[]) => types.some(t => t === 'freela');

  const coordinator = allFunctions.find(fn => fn.responsibleArea === '__system__');
  const regularFns = allFunctions
    .filter(fn => fn.responsibleArea !== '__system__')
    .filter(fn => {
      const types = fnCollaboratorTypes[fn.id] ?? [];
      if (types.length === 0) return true; // sem dados ainda → mostrar em ambas as abas
      return activeTab === 'casa' ? isCasaType(types) : isFreelaType(types);
    })
    .filter(fn => fn.name.toLowerCase().includes(functionSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const visibleFns = coordinator && !functionSearch
    ? [coordinator, ...regularFns]
    : coordinator && coordinator.name.toLowerCase().includes(functionSearch.toLowerCase())
    ? [coordinator, ...regularFns]
    : regularFns;

  return (
    <div className="pt-4" data-testid="cfg-funcoes">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-3">
        <div className="min-w-0 max-w-[620px]">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="m-0 text-sm font-semibold text-foreground">Diária por função</h3>
            <SeloAlteradas n={dirtyFunctionCount} />
          </div>
          <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
            Só para funções fora das regras de cima — para o time casa/freela coberto pelas regras estes valores não entram no cálculo. Clique no valor para editar.
          </p>
        </div>
        {allFunctions.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              aria-label="Buscar função"
              placeholder="Buscar função"
              value={functionSearch}
              onChange={e => setFunctionSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); if (e.key === 'Escape' && functionSearch) { e.preventDefault(); setFunctionSearch(""); } }}
              className="cfg-busca h-9 w-full rounded-lg border border-border bg-card pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {functionSearch && (
              <button type="button" onClick={() => setFunctionSearch("")} aria-label="Limpar busca" className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {allFunctions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center" data-testid="cfg-funcoes-vazio">
          <p className="m-0 text-sm font-medium text-foreground">Nenhuma função cadastrada</p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">As funções são cadastradas na tela Funções.</p>
          <Link href="/functions" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            Ir para Funções <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      ) : visibleFns.length === 0 ? (
        <div className="pas-entra rounded-lg border border-dashed border-border px-6 py-8 text-center" data-testid="cfg-funcoes-sem-resultado">
          <p className="m-0 text-sm text-foreground">Nenhuma função com “<span className="font-medium">{functionSearch}</span>”{activeTab === 'freela' ? ' no freela' : ' na casa'}.</p>
          <button type="button" onClick={() => setFunctionSearch("")} className="mt-2 text-xs font-semibold text-primary hover:underline">Limpar busca</button>
        </div>
      ) : (
        <div className="cfg-funcoes-caixa rounded-lg border border-border overflow-hidden">
          <DataTable
            columns={COLUNAS_DE_VALORES}
            rows={visibleFns}
            getRowId={fn => fn.id}
            caption="Diária por função: valor de dia útil e de fim de semana"
            cardMode="never"
            tableClassName="cfg-funcoes-tabela"
            rowRender={fn => (
              <FunctionValueRow
                key={fn.id}
                fn={fn}
                fv={allFunctionValues.find(v => v.functionId === fn.id)}
                activeTab={activeTab}
                editor={editor}
              />
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-muted/50 px-4 py-2.5">
            <span className="text-2xs text-muted-foreground tabular-nums">
              {functionSearch ? `${visibleFns.length} de ` : ""}{allFunctions.length} {allFunctions.length === 1 ? 'função cadastrada' : 'funções cadastradas'}
            </span>
            <Link href="/functions" className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:text-primary-hover hover:underline">
              Gerenciar funções <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
