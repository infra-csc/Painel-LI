/** Modal de sucesso após Salvar/Confirmar — AlertDialog do shadcn. */
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ScalingSuccessInfo {
  message: string;
  inclusionNumber: number | null;
  eventName: string;
  collaboratorName: string;
  functionName: string;
}

export default function ScalingSuccessDialog({ info, onClose }: { info: ScalingSuccessInfo | null; onClose: () => void }) {
  return (
    <AlertDialog open={!!info} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="max-w-[460px] rounded-[14px] p-0 gap-0 overflow-hidden" data-testid="dialog-scaling-success">
        <div className="flex flex-col items-center px-8 py-7">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "#DCFCE7" }}>
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <circle cx="18" cy="18" r="18" fill="#16A34A" fillOpacity="0.12"/>
              <path d="M10 18.5L15.5 24L26 13" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <AlertDialogHeader className="items-center text-center space-y-1 mb-3">
            <AlertDialogTitle className="text-lg font-bold text-slate-800">Sucesso</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500 text-center">{info?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          {info?.inclusionNumber != null && (
            <span className="mb-4 px-3 py-0.5 rounded-full text-sm font-bold" style={{ background: "#EEF2FF", color: "#4F46E5" }}>#{info.inclusionNumber}</span>
          )}
          <div className="w-full border-t border-slate-100 mb-4"/>
          <div className="w-full space-y-2 mb-5">
            {[["Evento", info?.eventName], ["Colaborador", info?.collaboratorName], ["Função", info?.functionName]].map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-400 font-medium shrink-0">{k}</span>
                <span className="text-slate-700 font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter className="w-full sm:justify-stretch">
            <AlertDialogAction
              onClick={onClose}
              className="w-full py-2.5 h-auto rounded-xl font-semibold text-white text-sm hover:opacity-90"
              style={{ background: "#2563EB" }}
              data-testid="button-success-ok"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
