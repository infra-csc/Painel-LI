/**
 * Alterações já resolvidas — as mais recentes que alguém de Compras marcou
 * "Já atuei" (o servidor devolve as 100 últimas). Serve para conferir o que
 * um colega fez antes de mexer de novo na mesma passagem.
 */
import { CheckCheck, CloudOff, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemDoAviso } from "./item-do-aviso";
import { dataDaProva, useAvisosResolvidos, type TipoDeAviso } from "./use-avisos-de-alteracao";

export function AvisosResolvidosDialog({ tipo, aberto, onAbertoChange }: {
  tipo: TipoDeAviso;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  const { avisos, carregando, erro, tentarDeNovo } = useAvisosResolvidos(tipo, aberto);
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-[680px] p-0 gap-0 flex flex-col max-h-[min(86dvh,760px)] overflow-hidden" data-testid="avisos-resolvidos">
        <DialogHeader className="px-5 pt-5 pb-3.5 pr-12 border-b border-border text-left">
          <DialogTitle className="text-base font-semibold text-foreground">Alterações resolvidas</DialogTitle>
          <DialogDescription className="text-xs">
            As mais recentes que alguém da equipe marcou como “Já atuei” — com o que foi feito.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {carregando ? (
            <div role="status" aria-live="polite" className="divide-y divide-border">
              <span className="sr-only">Carregando alterações resolvidas…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-5 py-4 space-y-2" aria-hidden="true">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : erro ? (
            <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
              <CloudOff className="w-6 h-6 text-danger mb-2" aria-hidden="true" />
              <p className="m-0 text-sm font-semibold text-foreground">Não foi possível carregar as resolvidas.</p>
              <button type="button" onClick={tentarDeNovo} className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted">
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />Tentar de novo
              </button>
            </div>
          ) : avisos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <CheckCheck className="w-6 h-6 text-muted-foreground mb-2" aria-hidden="true" />
              <p className="m-0 text-sm font-semibold text-foreground">Nenhuma alteração resolvida ainda</p>
              <p className="m-0 mt-1 text-xs text-muted-foreground">Quando alguém marcar “Já atuei”, ela aparece aqui.</p>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-border">
              {avisos.map((a) => (
                <li key={a.id}>
                  <p className="m-0 px-4 pt-3 -mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {a.eventName ?? "Evento"}{a.eventStartDate ? ` · ${dataDaProva(a.eventStartDate)}` : ""}
                  </p>
                  <ItemDoAviso aviso={a} resolvido />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AvisosResolvidosDialog;
