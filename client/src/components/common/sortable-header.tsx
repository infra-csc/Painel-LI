import { ChevronUp, ChevronDown } from "lucide-react";

export type SortField = 'id' | 'event' | 'function' | 'collaborator' | 'date' | 'status' | 'destination' | 'period' | 'diarias';

export interface SortConfig {
  field: SortField;
  direction: 'asc' | 'desc';
}

interface SortableHeaderProps {
  field: SortField;
  children: React.ReactNode;
  className?: string;
  sortConfig: SortConfig | null;
  onSort: (field: SortField) => void;
}

export default function SortableHeader({ 
  field, 
  children, 
  className = "", 
  sortConfig, 
  onSort 
}: SortableHeaderProps) {
  return (
    <th 
      className={`px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/50 transition-colors ${className}`}
      onClick={() => onSort(field)}
      data-testid={`header-${field}`}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        {sortConfig?.field === field && (
          sortConfig.direction === 'asc' 
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );
}