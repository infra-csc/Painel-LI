// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// Antes: rodapé com o aviso de permissão, o "Salvo em" e o botão "Atualizar
// Planejado" — três coisas sem relação no fim de uma página longa.
// 08/10: o "Atualizar Planejado" sobe para a barra de contexto (ação
// secundária da tela, com o efeito explicado e o aviso quando há alteração
// não salva), o "salvo em" vai para o painel de resumo e aqui fica só a nota
// de quem pode alterar.
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface AtualizarPlanejadoProps {
  isApplyingPending: boolean;
  onApplyToPending: () => void;
  /** Há alteração não salva: o botão avisa que ela NÃO entra. */
  temAlteracao?: boolean;
  disabled?: boolean;
}

/** Ação secundária (não salva nada): reaplica os valores JÁ SALVOS ao Planejado pendente. */
export function AtualizarPlanejado({ isApplyingPending, onApplyToPending, temAlteracao = false, disabled = false }: AtualizarPlanejadoProps) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          onClick={onApplyToPending}
          disabled={isApplyingPending || disabled}
          className="pas-alvo shrink-0 h-[34px] rounded-lg px-3 text-sm font-medium gap-1.5 max-sm:w-full"
          data-testid="cfg-atualizar-planejado"
        >
          <RefreshCw className={`h-4 w-4 ${isApplyingPending ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          {isApplyingPending ? 'Aplicando…' : 'Atualizar Planejado'}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-[320px] text-xs font-normal leading-relaxed">
        Reaplica os valores padrão JÁ SALVOS a todos os planejamentos ainda não enviados ao Realizado. Ao salvar alterações isso já é feito automaticamente.
        {temAlteracao && <span className="block mt-1.5 font-semibold">As alterações não salvas desta tela não entram.</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Nota de permissão no pé da página. */
export function SettingsFooter() {
  return (
    <p className="m-0 flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Administradores e Financeiro/RH podem alterar estes valores. Cada salvamento fica registrado na auditoria do sistema.
    </p>
  );
}
