// Extraído de system-settings.tsx em 25/09 (modularização): rodapé informativo
// da tela Valores padrão — aviso de permissão, "Salvo em" e a ação secundária
// "Atualizar Planejado" (o salvamento em si acontece na barra flutuante).
import { Lock, RefreshCw } from "lucide-react";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { formatDateTime } from "./settings-utils";
import type { LastSavedInfo } from "./use-settings-history";

export interface SettingsFooterProps {
  lastSaved: LastSavedInfo | null;
  isApplyingPending: boolean;
  onApplyToPending: () => void;
}

export function SettingsFooter({ lastSaved, isApplyingPending, onApplyToPending }: SettingsFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span>Administradores e Financeiro/RH podem alterar estes valores</span>
      </div>
      <div className="flex items-center gap-3">
        {lastSaved && (
          <span className="hidden text-xs text-muted-foreground sm:block">
            Salvo em {formatDateTime(lastSaved.timestamp)} · <span className="font-medium">{lastSaved.user}</span>
          </span>
        )}
        {/* Ação secundária: reaplica os valores JÁ SALVOS ao Planejado pendente
            (ao salvar pela barra flutuante isso já acontece automaticamente) */}
        <MotivoDesabilitado motivo="Aplica os valores padrão já salvos a todos os orçamentos planejados ainda não enviados. Ao salvar alterações, isso já é feito automaticamente." desabilitado={isApplyingPending}>
          <button
          type="button"
          onClick={onApplyToPending}
          disabled={isApplyingPending}

          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-card px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary-hover disabled:cursor-not-allowed disabled:text-muted-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isApplyingPending ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isApplyingPending ? 'Aplicando…' : 'Atualizar Planejado'}
        </button>
        </MotivoDesabilitado>
      </div>
    </div>
  );
}
