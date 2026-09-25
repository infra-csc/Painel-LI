/**
 * Barra fixa e confirmação de "Enviar para revisão" do Realizado — 25/09
 * (modularização). Extraídas de budget-actual.tsx. Aviso e envio cobrem o
 * MESMO conjunto: pendentes visíveis no filtro atual ('all') ou a interseção
 * da seleção com esses pendentes ('selected').
 */
import { CheckCircle2, Send } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BudgetActual } from "@shared/schema";
import { isUnfilledItem } from "./actual-utils";

const formatCurrency = formatarMoeda;

export interface SendForReviewBarProps {
  sidebarWidth: number;
  totalRealizado: number;
  prestacaoCount: number;
  pendingCount: number;
  selectedCount: number;
  allSentForReview: boolean;
  isPending: boolean;
  onClearSelection: () => void;
  onSendSelected: () => void;
  onSendAll: () => void;
}

export function SendForReviewBar(p: SendForReviewBarProps) {
  const { sidebarWidth, totalRealizado, prestacaoCount, pendingCount, selectedCount, allSentForReview, isPending, onClearSelection, onSendSelected, onSendAll } = p;
  return (
    <div className="fixed bottom-0 right-0 z-40 px-6 py-3 bg-card/95 backdrop-blur-md border-t border-border transition-all duration-300 shadow-2" style={{ left: sidebarWidth }}>
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-2xs uppercase tracking-widest font-semibold text-primary/70">Total Realizado</div>
            <div className="text-lg font-semibold tabular-nums leading-tight text-primary">{formatCurrency(totalRealizado)}</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-2xs text-muted-foreground">
            {prestacaoCount} {prestacaoCount === 1 ? "prestação" : "prestações"}
            {pendingCount < prestacaoCount && pendingCount > 0 && (
              <span className="ml-1 text-warning font-medium">· {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}</span>
            )}
            {pendingCount === 0 && prestacaoCount > 0 && (
              <span className="ml-1 text-success font-medium">· todas enviadas</span>
            )}
            {selectedCount > 0 && (
              <span className="ml-2 font-semibold text-primary">· {selectedCount} selecionada{selectedCount > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {allSentForReview ? (
            <div className="flex items-center gap-2 bg-success-soft border border-success/25 rounded-xl px-3 py-1.5 text-xs text-success font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Enviado para revisão
            </div>
          ) : selectedCount > 0 ? (
            <>
              <button onClick={onClearSelection} className="text-xs text-muted-foreground hover:text-slate-600">Limpar</button>
              <Button
                size="sm"
                className="h-9 px-5 text-xs font-semibold rounded-xl text-white gap-1.5 bg-success shadow-2"
                disabled={isPending}
                onClick={onSendSelected}
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                Enviar selecionadas
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground hidden sm:block">Selecione ou envie todas</span>
              <Button
                size="sm"
                className="h-9 px-5 text-xs font-semibold rounded-xl text-white gap-1.5 bg-success shadow-2"
                disabled={isPending}
                onClick={onSendAll}
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                Enviar todas
              </Button>
            </>
          )}
        </div>
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
  return (
    <AlertDialog open={confirmSend !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="max-w-md rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmSend === "selected"
              ? "Enviar prestações selecionadas para revisão?"
              : "Enviar prestações para revisão?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                {confirmSend === "selected"
                  ? <>Serão enviadas as <strong>{targets.length} {targets.length === 1 ? "prestação selecionada" : "prestações selecionadas"}</strong>.</>
                  : <>Serão enviadas as <strong>{targets.length} {targets.length === 1 ? "prestação visível" : "prestações visíveis"} no filtro atual</strong>.</>}
              </p>
              {targetUnfilled > 0 && (
                <p>
                  <strong className="text-warning">
                    {targetUnfilled} {targetUnfilled === 1 ? 'item está como "Não preenchido"' : 'itens estão como "Não preenchido"'}
                  </strong>{" "}
                  e {targetUnfilled === 1 ? "será enviado" : "serão enviados"} com os valores atuais.
                </p>
              )}
              <p>
                Após o envio, os itens ficam <strong>bloqueados para edição</strong> e a{" "}
                <strong>emissão de NF é liberada</strong> para os colaboradores enviados.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl text-white bg-success"
            onClick={() => onConfirm(targets)}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            {confirmSend === "selected" ? "Enviar selecionadas" : "Enviar prestações"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
