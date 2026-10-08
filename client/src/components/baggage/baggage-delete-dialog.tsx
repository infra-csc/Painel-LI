/**
 * Confirmação de exclusão de uma solicitação (soft delete no servidor).
 *
 * 08/10 (redesenho): era um parágrafo corrido — "LOC X (Azul) — Nome, R$ 93,50,
 * embarque em 03/11/2026. A exclusão fica…" — que obrigava a ler a frase para
 * saber QUAL bilhete ia sair. Agora o bilhete aparece como na lista (LOC,
 * companhia, valor, de quem e para qual evento), a consequência fica numa
 * frase curta e o botão diz o que faz ("Excluir solicitação"), em vermelho.
 * Mesma ação e mesmo `data-testid` de antes.
 */
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { CIA_STYLE, ciaGroup, fmtDate, formatCurrency, type BaggageRequestItem } from "./baggage-core";

export default function BaggageDeleteDialog({ alvo, onFechar, onConfirmar, getCollabName, getEventName }: {
  alvo: BaggageRequestItem | null;
  onFechar: () => void;
  onConfirmar: (r: BaggageRequestItem) => void;
  getCollabName: (id: string) => string;
  getEventName: (id: string) => string;
}) {
  return (
    <AlertDialog open={!!alvo} onOpenChange={open => { if (!open) onFechar(); }}>
      <AlertDialogContent className="rounded-xl sm:max-w-[460px]">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-danger-soft text-danger shrink-0" aria-hidden="true">
              <Trash2 className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0 text-left">
              <AlertDialogTitle className="text-base font-semibold">Excluir esta solicitação de bagagem?</AlertDialogTitle>
              <AlertDialogDescription className="mt-1 text-sm leading-relaxed">
                Ela sai da lista e dos totais por companhia, colaborador e evento. A exclusão fica registrada na auditoria.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {alvo && (
          <div className="rounded-lg border border-border bg-surface-muted px-3.5 py-3" data-testid="excluir-bilhete">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-sm font-semibold tracking-wide text-foreground">{alvo.loc}</span>
              <span className={`inline-flex items-center h-[22px] px-[7px] rounded-md text-2xs font-semibold ${CIA_STYLE[ciaGroup(alvo.cia)].badge}`}>{alvo.cia}</span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">{formatCurrency(alvo.valueCents || 0)}</span>
            </div>
            <p className="m-0 mt-1.5 text-xs text-slate-600">
              <span className="font-medium text-foreground">{getCollabName(alvo.collaboratorId)}</span>
              <span className="mx-1.5 text-muted-foreground" aria-hidden="true">·</span>
              {getEventName(alvo.eventId)}
            </p>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground tabular-nums">
              Embarque em {fmtDate(alvo.boardingDate)} · {alvo.quantity} {alvo.quantity === 1 ? "bagagem" : "bagagens"}
            </p>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="h-9 rounded-lg mt-0">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="h-9 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { if (alvo) onConfirmar(alvo); onFechar(); }}
            data-testid="button-confirm-delete"
          >
            Excluir solicitação
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
