/**
 * "Já atuei" — confirmação leve, num popover preso ao botão (07/10).
 *
 * Não é um diálogo de tela inteira: é uma marcação reversível só na conversa
 * (some da fila de Compras), então basta um clique a mais e um campo opcional
 * "o que foi feito", que vai para o histórico da vaga.
 *
 * 409 (outra pessoa marcou antes): a mensagem do servidor diz quem, o popover
 * fecha e a lista se refaz. Outros erros ficam DENTRO do popover, com o texto
 * digitado preservado, para tentar de novo.
 */
import { useId, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { isApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useResolverAviso, nomeProprio, type AvisoDeAlteracao } from "./use-avisos-de-alteracao";

const LIMITE = 500;

export function JaAtuei({ aviso, className }: {
  aviso: Pick<AvisoDeAlteracao, "id" | "inclusionNumber" | "collaboratorName" | "eventName">;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const resolver = useResolverAviso();
  const { toast } = useToast();
  const campoId = useId();
  const tituloId = useId();
  const vaga = [aviso.inclusionNumber ? `#${aviso.inclusionNumber}` : null, nomeProprio(aviso.collaboratorName), aviso.eventName].filter(Boolean).join(" · ");

  const confirmar = () => {
    setErro(null);
    resolver.mutate({ id: aviso.id, resolucao: texto }, {
      onSuccess: () => {
        setAberto(false);
        setTexto("");
        toast({ title: "Alteração marcada como resolvida", description: vaga });
      },
      onError: (e) => {
        if (isApiError(e) && e.status === 409) {
          setAberto(false);
          toast({ title: "Este aviso já foi resolvido", description: apiErrorMessage(e, "Outra pessoa marcou antes de você.") });
          return;
        }
        setErro(apiErrorMessage(e, "Não foi possível marcar agora. Tente de novo."));
      },
    });
  };

  return (
    <Popover open={aberto} onOpenChange={(o) => { if (!resolver.isPending) { setAberto(o); if (!o) setErro(null); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "pas-alvo inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-foreground",
            "transition-colors hover:border-success/40 hover:bg-success-soft hover:text-success",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-success/40 data-[state=open]:bg-success-soft data-[state=open]:text-success",
            className,
          )}
          data-testid={`aviso-ja-atuei-${aviso.id}`}
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          Já atuei
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} aria-labelledby={tituloId} className="w-[min(340px,calc(100vw-24px))] p-0 rounded-xl overflow-hidden">
        <div className="px-4 pt-3.5 pb-3">
          <p id={tituloId} className="m-0 text-sm font-semibold text-foreground">Marcar como resolvida?</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
            Sai da fila de todos de Compras e fica registrado no histórico da vaga{vaga ? <> <span className="text-foreground">{vaga}</span></> : null}.
          </p>
          <label htmlFor={campoId} className="block mt-3 mb-1 text-xs font-medium text-slate-700">
            O que foi feito <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id={campoId}
            value={texto}
            maxLength={LIMITE}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmar(); } }}
            rows={3}
            placeholder="Ex.: remarcado com a cia, nova LOC AX12B3"
            className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/12"
            data-testid={`aviso-resolucao-${aviso.id}`}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            {erro ? <p role="alert" className="m-0 text-2xs leading-snug text-danger">{erro}</p> : <span />}
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{texto.length}/{LIMITE}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border bg-surface-muted">
          <button
            type="button"
            onClick={() => setAberto(false)}
            disabled={resolver.isPending}
            className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={resolver.isPending}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            data-testid={`aviso-confirmar-${aviso.id}`}
          >
            {resolver.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Marcando…</>
              : <><Check className="w-3.5 h-3.5" aria-hidden="true" />Confirmar</>}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default JaAtuei;
