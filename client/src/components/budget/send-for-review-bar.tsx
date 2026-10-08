/**
 * Barra de seleção e confirmação de "Enviar para revisão" do Realizado —
 * 25/09 (modularização); redesenho 08/10.
 *
 * Antes era um rodapé fixo SEMPRE presente (total, contagem, "Selecione ou
 * envie todas" e um botão verde) que cobria o fim da lista e exigia 9rem de
 * folga embaixo da página. O total e as contagens foram para o painel de
 * resumo e a fila; o "Enviar para revisão" de tudo que está visível mora na
 * barra de contexto, como a ação forte do Planejado.
 *
 * Agora é a barra de seleção da família (a mesma do Planejado): só aparece
 * com algo marcado, sobe do rodapé, diz quantas e quanto somam, e carrega
 * "Enviar para revisão (N)" e "Limpar seleção".
 *
 * Aviso e envio da confirmação cobrem o MESMO conjunto: pendentes visíveis no
 * filtro atual ('all') ou a interseção da seleção com esses pendentes
 * ('selected'), com os filhos de divisão acompanhando o pai.
 */
import { Loader2, Lock, ReceiptText, Send, TriangleAlert, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BudgetActual } from "@shared/schema";
import { isUnfilledItem } from "./actual-utils";
import { formatCurrency } from "./types";

export interface SendForReviewBarProps {
  selectedCount: number;
  /** Soma do total realizado das prestações marcadas (centavos). */
  totalSelecionado: number;
  isPending: boolean;
  onClearSelection: () => void;
  onSendSelected: () => void;
}

export function SendForReviewBar({ selectedCount: n, totalSelecionado, isPending, onClearSelection, onSendSelected }: SendForReviewBarProps) {
  if (n === 0) return null;
  return (
    <div className="sticky bottom-3 z-20 pas-sobe" role="region" aria-label="Ações da seleção" data-testid="barra-selecao-realizado">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="m-0 text-sm font-semibold tabular-nums" aria-live="polite">
              {n} <span className="max-sm:hidden">{n === 1 ? "prestação selecionada" : "prestações selecionadas"}</span><span className="sm:hidden">{n === 1 ? "selecionada" : "selecionadas"}</span>
              <span className="font-normal text-background/70"> · {formatCurrency(totalSelecionado)}</span>
            </p>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
              data-testid="realizado-limpar-selecao"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar seleção
            </button>
          </div>
          <p className="m-0 hidden lg:block text-2xs leading-4 text-background/65 truncate">
            Vão para a análise do RH com os valores de agora — e ficam travadas para edição.
          </p>
        </div>
        <button
          type="button"
          onClick={onSendSelected}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60 shrink-0"
          data-testid="realizado-enviar-selecionadas"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
          <span>{isPending ? "Enviando…" : <>Enviar<span className="max-[420px]:hidden"> para revisão</span> ({n})</>}</span>
        </button>
      </div>
    </div>
  );
}

export interface SendForReviewDialogProps {
  confirmSend: null | "all" | "selected";
  onClose: () => void;
  pendingFiltered: BudgetActual[];
  selectedCards: Set<string>;
  onConfirm: (targets: BudgetActual[]) => void;
}

/** Confirmação: enviar para revisão (todas visíveis ou selecionadas). */
export function SendForReviewDialog({ confirmSend, onClose, pendingFiltered, selectedCards, onConfirm }: SendForReviewDialogProps) {
  // Filhos de divisão acompanham o pai selecionado — sem isso o pai ia
  // sozinho e os filhos ficavam pendentes/destravados para sempre (o
  // servidor pula itens não enviados na decisão do RH).
  const targets = confirmSend === "selected"
    ? pendingFiltered.filter(i =>
        selectedCards.has(i.id) || (i.splitParentId && selectedCards.has(i.splitParentId)))
    : pendingFiltered;
  const targetUnfilled = targets.filter(isUnfilledItem).length;
  const soma = targets.reduce((s, i) => s + i.totalValue, 0);
  const n = targets.length;
  // Filhos de divisão que entram junto sem estarem marcados (o número da barra é só o dos marcados).
  const acompanham = confirmSend === "selected" ? targets.filter(i => !selectedCards.has(i.id)).length : 0;
  return (
    <AlertDialog open={confirmSend !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="max-w-[460px] rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmSend === "selected"
              ? `Enviar ${n === 1 ? "a prestação selecionada" : `as ${n} prestações selecionadas`} para revisão?`
              : `Enviar ${n === 1 ? "a prestação visível" : `as ${n} prestações visíveis`} para revisão?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-slate-600">
              <p className="m-0">
                {confirmSend === "selected"
                  ? <>Vão para a análise do RH <strong className="text-foreground">{n} {n === 1 ? "prestação" : "prestações"}</strong>, somando <strong className="text-foreground tabular-nums">{formatCurrency(soma)}</strong>.
                      {acompanham > 0 && <> {acompanham === 1 ? "Inclui 1 divisão que acompanha o titular marcado." : `Inclui ${acompanham} divisões que acompanham os titulares marcados.`}</>}</>
                  : <>Vão para a análise do RH as <strong className="text-foreground">{n} {n === 1 ? "prestação pendente visível" : "prestações pendentes visíveis"} no filtro atual</strong>, somando <strong className="text-foreground tabular-nums">{formatCurrency(soma)}</strong>.</>}
              </p>
              {targetUnfilled > 0 && (
                <p className="m-0 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-5 text-warning">
                  <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{targetUnfilled} {targetUnfilled === 1 ? 'item está como "Não preenchido"' : 'itens estão como "Não preenchido"'}</strong>{" "}
                    e {targetUnfilled === 1 ? "será enviado" : "serão enviados"} com os valores atuais.
                  </span>
                </p>
              )}
              <ul className="m-0 p-0 list-none space-y-1.5 text-xs leading-5">
                <li className="flex items-start gap-2"><Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span>Após o envio, os itens ficam <strong className="text-foreground">bloqueados para edição</strong>.</span></li>
                <li className="flex items-start gap-2"><ReceiptText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span>A <strong className="text-foreground">emissão de NF é liberada</strong> para os colaboradores enviados.</span></li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground"
            onClick={() => onConfirm(targets)}
            disabled={n === 0}
            data-testid="realizado-confirmar-envio"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            {confirmSend === "selected" ? "Enviar selecionadas" : "Enviar prestações"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
