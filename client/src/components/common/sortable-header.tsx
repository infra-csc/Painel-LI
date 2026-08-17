import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/** Campos ordenáveis compartilhados entre as tabelas do sistema. */
export type SortField = 'id' | 'event' | 'function' | 'collaborator' | 'date' | 'status' | 'destination' | 'period' | 'diarias';
export type SortDirection = 'asc' | 'desc';

/**
 * Genérico em `F` para que cada tela possa estender os campos ordenáveis
 * (ex.: 'hotelName' em Hospedagens) sem alterar o enum compartilhado.
 * Sem parâmetro, continua igual ao antigo `SortConfig` (campo = SortField).
 */
export interface SortConfig<F extends string = SortField> {
  field: F;
  direction: SortDirection;
}

interface SortableHeaderProps<F extends string> {
  field: F;
  children: React.ReactNode;
  className?: string;
  sortConfig: SortConfig<F> | null;
  onSort: (field: F) => void;
}

const ARIA_SORT: Record<SortDirection, 'ascending' | 'descending'> = { asc: 'ascending', desc: 'descending' };

/**
 * Cabeçalho de coluna ordenável acessível: o `<th>` carrega `aria-sort` e o
 * controle real é um `<button>` interno (foco/Enter/Espaço funcionam sem JS extra).
 */
export default function SortableHeader<F extends string = SortField>({
  field,
  children,
  className = "",
  sortConfig,
  onSort,
}: SortableHeaderProps<F>) {
  const active = sortConfig?.field === field;
  const direction = active ? sortConfig!.direction : null;
  return (
    <th
      scope="col"
      aria-sort={direction ? ARIA_SORT[direction] : 'none'}
      className={`group px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] hover:bg-slate-100 transition-colors ${className}`}
      data-testid={`header-${field}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1 w-full text-left uppercase tracking-[inherit] cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label={typeof children === 'string' ? `Ordenar por ${children}` : undefined}
      >
        <span>{children}</span>
        {direction === 'asc' && <ChevronUp className="w-3 h-3" aria-hidden="true" />}
        {direction === 'desc' && <ChevronDown className="w-3 h-3" aria-hidden="true" />}
        {!direction && <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40" aria-hidden="true" />}
      </button>
    </th>
  );
}
