// Extraído de system-settings.tsx em 25/09 (modularização): tabela "Diária por
// Função (legado)" — cabeçalho com contador de alteradas, busca, estados vazios
// e a lista de linhas (FunctionValueRow). A filtragem por aba (casa/freela) e
// por busca era uma IIFE dentro do JSX da página; virou o corpo deste componente.
import { Link } from "wouter";
import type { Function as FunctionType, FunctionValue } from "@shared/schema";
import { BadgeCheck, ExternalLink, Search } from "lucide-react";
import { FunctionValueRow } from "./function-value-row";
import type { FunctionValuesEditor, SettingsTab } from "./use-function-values";

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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft">
            <BadgeCheck className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">Diária por Função (legado)</p>
            <p className="text-2xs font-light text-muted-foreground">
              Onde ainda vale: só para funções fora das regras acima — para o time casa/freela coberto pelas regras, estes valores deixaram de ser usados no cálculo.
            </p>
          </div>
          {dirtyFunctionCount > 0 && (
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-semibold text-warning">
              {dirtyFunctionCount} alterada{dirtyFunctionCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {allFunctions.length > 0 && (
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              aria-label="Buscar função"
              placeholder="Buscar função…"
              value={functionSearch}
              onChange={e => setFunctionSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
              className="w-full rounded-full border-none bg-muted py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>
      )}

      {allFunctions.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <BadgeCheck className="mx-auto mb-3 h-8 w-8 text-slate-200" aria-hidden="true" />
          <p className="mb-1 text-sm font-medium text-muted-foreground">Nenhuma função cadastrada.</p>
          <p className="mb-4 text-xs text-muted-foreground">Acesse a página de Funções para adicionar.</p>
          <Link href="/functions" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            Ir para Funções <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      ) : visibleFns.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-muted-foreground">
          Nenhuma função encontrada para "<span className="font-medium">{functionSearch}</span>".
        </div>
      ) : (
        <div className="overflow-x-auto"><div className="min-w-[420px]">
          <div className="grid grid-cols-3 border-b border-border bg-surface-muted px-5 py-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">Função</span>
            <span className="text-right text-2xs font-bold uppercase tracking-wider text-primary">Dia Útil</span>
            <span className="text-right text-2xs font-bold uppercase tracking-wider text-warning-strong">Fim de Semana</span>
          </div>
          <div className="divide-y divide-border">
            {visibleFns.map((fn) => (
              <FunctionValueRow
                key={fn.id}
                fn={fn}
                fv={allFunctionValues.find(v => v.functionId === fn.id)}
                activeTab={activeTab}
                editor={editor}
              />
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-2xs text-muted-foreground">{allFunctions.length} {allFunctions.length === 1 ? 'função' : 'funções'} cadastradas</span>
            <Link href="/functions" className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:text-primary-hover hover:underline">
              Gerenciar funções <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
        </div></div>
      )}
    </div>
  );
}
