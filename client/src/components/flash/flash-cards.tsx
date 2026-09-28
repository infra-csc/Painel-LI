// Extraído de flash-account.tsx em 25/09 (modularização): peças da coluna
// esquerda e do topo — card de resumo, painel "Admitidos sem crédito inicial",
// lista de contas por colaborador e o diálogo de exclusão de lançamento.
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, ChevronDown, Search, Sparkles, UserPlus, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingState } from "@/components/common/loading-state";
import { QueryError, type QueriesState } from "@/components/common/query-state";
import { toTitleCase } from "@/lib/format";
import { TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, fmtDate, formatCurrency, type Collaborator, type FlashMovement } from "./flash-types";
import type { DadosDoFlash } from "./use-flash-data";

export function SummaryCard({ label, value, icon: Icon, color, bg }: { label: string; value: string | number; icon: LucideIcon; color: string; bg: string }) {
  return (
    <div className="bg-card rounded-xl border border-border px-4 py-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <p className="text-base font-bold text-foreground font-mono truncate">{value}</p>
      </div>
    </div>
  );
}

export interface AdmittedWithoutCreditPanelProps {
  collaborators: Collaborator[];
  open: boolean;
  onToggle: () => void;
  onLancarCredito: (collabId: string) => void;
}

/** Admitidos sem crédito inicial — fecha o fluxo "crédito na admissão" */
export function AdmittedWithoutCreditPanel({ collaborators, open, onToggle, onLancarCredito }: AdmittedWithoutCreditPanelProps) {
  return (
    <div className="bg-card rounded-xl border border-warning/25 overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-warning-soft/40 transition-colors"
      >
        <div className="w-8 h-8 rounded-xl bg-warning-soft flex items-center justify-center shrink-0">
          <UserPlus className="w-4 h-4 text-warning" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-700">
            Admitidos sem crédito inicial
            <span className="ml-2 text-2xs font-bold px-1.5 py-0.5 rounded-full bg-warning-soft text-warning">
              {collaborators.length}
            </span>
          </p>
          <p className="text-2xs text-muted-foreground mt-0.5">
            Colaboradores ativos sem nenhum lançamento na conta Flash — lance o crédito inicial da admissão
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="max-h-[280px] overflow-y-auto divide-y divide-border border-t border-border">
          {collaborators.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <p className="flex-1 min-w-0 text-xs font-medium text-slate-600 truncate">{toTitleCase(c.fullName)}</p>
              <button
                onClick={() => onLancarCredito(c.id)}
                className="flex items-center gap-1.5 h-7 px-2.5 text-2xs font-semibold text-primary border border-primary/25 rounded-lg hover:bg-brand-soft transition-colors shrink-0"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" /> Lançar crédito
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface AccountsListProps {
  search: string;
  setSearch: (v: string) => void;
  estado: QueriesState;
  isLoading: boolean;
  accountRows: DadosDoFlash["accountRows"];
  movementsCount: number;
  selectedCollabId: string;
  onSelect: (id: string) => void;
}

/** Lista de contas (coluna esquerda). */
export function AccountsList({ search, setSearch, estado, isLoading, accountRows, movementsCount, selectedCollabId, onSelect }: AccountsListProps) {
  return (
    <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar colaborador…"
            className="pl-8 h-9 text-xs rounded-xl border-border"
          />
        </div>
      </div>
      <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
        {estado.isError ? (
          <QueryError error={estado.error} onRetry={estado.retry} className="m-3" />
        ) : isLoading ? (
          <LoadingState count={4} className="rounded-none border-0" label="Carregando contas…" />
        ) : accountRows.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Wallet className="w-8 h-8 text-slate-200 mx-auto mb-2" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              {movementsCount === 0
                ? "Nenhum lançamento ainda. Use \"Novo Lançamento\" para registrar o crédito inicial de um colaborador."
                : "Nenhum colaborador encontrado."}
            </p>
          </div>
        ) : accountRows.map(row => (
          <button
            key={row.collaboratorId}
            onClick={() => onSelect(row.collaboratorId)}
            aria-current={selectedCollabId === row.collaboratorId ? "true" : undefined}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
              selectedCollabId === row.collaboratorId ? "bg-brand-soft" : "hover:bg-surface-muted"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{toTitleCase(row.name)}</p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                Alim. <span className={`font-mono font-semibold ${row.food < TARGET_FOOD_CENTS ? "text-warning" : "text-success"}`}>{formatCurrency(row.food)}</span>
                <span className="mx-1.5 text-slate-200">·</span>
                Mob. <span className={`font-mono font-semibold ${row.mobility < TARGET_MOBILITY_CENTS ? "text-warning" : "text-primary"}`}>{formatCurrency(row.mobility)}</span>
              </p>
            </div>
            {row.belowTarget
              ? <AlertTriangle className="w-3.5 h-3.5 text-warning-strong shrink-0" aria-hidden="true" />
              : <CheckCircle2 className="w-3.5 h-3.5 text-success-strong shrink-0" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Confirmação de exclusão (padrão do app — sem window.confirm) */
export function DeleteMovementDialog({ movement, onClose, onConfirm }: { movement: FlashMovement | null; onClose: () => void; onConfirm: (id: string) => void }) {
  return (
    <AlertDialog open={!!movement} onOpenChange={open => { if (!open) onClose(); }}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
          <AlertDialogDescription>
            {movement && (
              <>
                {movement.type === "credito" ? "Crédito" : "Débito"} de {formatCurrency(movement.amountCents || 0)} em{" "}
                {movement.category === "alimentacao" ? "alimentação" : "mobilidade"} ({fmtDate(movement.movementDate)}).
                {" "}O saldo do colaborador será recalculado e a exclusão fica registrada na auditoria.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg bg-danger hover:bg-danger/90"
            onClick={() => { if (movement) onConfirm(movement.id); onClose(); }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
