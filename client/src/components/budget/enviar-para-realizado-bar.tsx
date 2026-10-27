/**
 * Barra de seleção do Planejado — 25/09 (modularização); redesenho 08/10.
 *
 * Antes era um rodapé translúcido SEMPRE presente (total do evento, barra de
 * progresso e um botão cinza "Selecione colaboradores") que, grudado no fim
 * da janela, cobria a última linha da planilha. O total e o progresso foram
 * para o painel de resumo, onde moram os números do evento.
 *
 * Agora é a barra de seleção da família (a mesma de Hospedagem): só aparece
 * com algo marcado, sobe do rodapé, diz quantos e quanto somam, e carrega a
 * ação forte da tela — "Enviar ao Realizado (N)" — mais o "Limpar seleção".
 * A confirmação continua a mesma (ConfirmSendDialog).
 */
import { BadgeCheck, Loader2, Send, X } from "lucide-react";
import { formatCurrency } from "./types";

export interface EnviarParaRealizadoBarProps {
  selectedIds: Set<string>;
  /** Soma do total planejado das vagas marcadas (centavos). */
  totalSelecionado: number;
  onSend: (ids: string[]) => void;
  onLimpar: () => void;
  isSending?: boolean;
  /**
   * 26/10 (Honorários, Fase 0): dos selecionados, quantos já têm a
   * pré-aprovação do DP (vão ao Realizado) e quantos ainda pedem — a barra
   * oferece os dois passos, cada um com a sua contagem.
   */
  nPreAprovados?: number;
  nAPreAprovar?: number;
  onPreAprovar?: () => void;
}

export function EnviarParaRealizadoBar({ selectedIds, totalSelecionado, onSend, onLimpar, isSending, nPreAprovados, nAPreAprovar = 0, onPreAprovar }: EnviarParaRealizadoBarProps) {
  const n = selectedIds.size;
  if (n === 0) return null;
  const nEnviar = nPreAprovados ?? n;
  return (
    <div className="sticky bottom-3 z-20 pas-sobe" role="region" aria-label="Ações da seleção" data-testid="barra-selecao-planejado">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
              {n} <span className="max-sm:hidden">{n === 1 ? "colaborador selecionado" : "colaboradores selecionados"}</span><span className="sm:hidden">{n === 1 ? "selecionado" : "selecionados"}</span>
              <span className="font-normal text-background/70"> · {formatCurrency(totalSelecionado)}</span>
            </p>
            <button
              type="button"
              onClick={onLimpar}
              className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
              data-testid="planejado-limpar-selecao"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
            </button>
          </div>
          <p className="m-0 hidden lg:block text-2xs leading-4 text-background/65 truncate">
            {nAPreAprovar > 0
              ? `${nAPreAprovar} ${nAPreAprovar === 1 ? "pede" : "pedem"} a pré-aprovação do DP antes de ir ao Realizado.`
              : "Vai para o Realizado (liberado para a Produção) com o valor pré-aprovado."}
          </p>
        </div>
        {onPreAprovar && nAPreAprovar > 0 && (
          <button
            type="button"
            onClick={onPreAprovar}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-success-strong text-xs font-semibold text-white hover:bg-success-strong/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 shrink-0"
            data-testid="planejado-pre-aprovar-selecionados"
          >
            <BadgeCheck className="w-4 h-4" aria-hidden="true" />
            Pré-aprovar<span className="max-[420px]:hidden"> ({nAPreAprovar})</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onSend(Array.from(selectedIds))}
          disabled={isSending || nEnviar === 0}
          title={nEnviar === 0 ? "Nenhum selecionado tem a pré-aprovação do DP ainda" : undefined}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 shrink-0"
          data-testid="planejado-enviar-selecionados"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
          {isSending ? "Enviando…" : <>Enviar<span className="max-[420px]:hidden"> ao Realizado</span> ({nEnviar})</>}
        </button>
      </div>
    </div>
  );
}

export default EnviarParaRealizadoBar;
