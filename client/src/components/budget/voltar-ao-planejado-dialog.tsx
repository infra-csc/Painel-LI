/**
 * "Voltar ao Planejado" (28/10, pedido do DP — regra em shared/voltar-ao-planejado.ts).
 *
 * Usado no Realizado (rodapé do cartão) e na Conferência DP (ações da linha).
 * O DP/admin tira a prestação — e as divisões dela — do Realizado para
 * ajustar no Planejado: motivo obrigatório, o efeito por extenso (a linha
 * volta a pedir a pré-aprovação; o crédito do Flash de um comparativo
 * aprovado sai), e o porquê quando não dá (OC registrada / NF). O servidor
 * é a trava de verdade (POST /api/budget-actual/:id/voltar-ao-planejado).
 */
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";
import type { BudgetActual } from "@shared/schema";
import { MOTIVO_DO_VOLTAR_MAX, MOTIVO_DO_VOLTAR_MIN, podeVoltarAoPlanejado } from "@shared/voltar-ao-planejado";
import { formatCurrency } from "./types";

const MOLDURA = "max-w-[460px] w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] p-0 gap-0 rounded-xl overflow-hidden";
const VOLTAR = "inline-flex items-center justify-center h-9 px-4 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface RespostaDoVoltar {
  ok: boolean;
  plannedId: string | null;
  legado: boolean;
  divisoesRemovidas: number;
  comparativoAprovado: boolean;
  flash: { ok: boolean; removidos: number } | null;
}

export function VoltarAoPlanejadoDialog({ item, divisoes = [], nome, funcao, onClose, onFeito }: {
  item: BudgetActual | null;
  /** Divisões da prestação (voltam junto). */
  divisoes?: readonly BudgetActual[];
  nome: string;
  funcao: string;
  onClose: () => void;
  onFeito?: (r: RespostaDoVoltar) => void;
}) {
  const motivoId = useId();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const fechar = () => { setMotivo(""); setTentou(false); onClose(); };

  const mutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const res = await apiRequest("POST", `/api/budget-actual/${id}/voltar-ao-planejado`, { motivo });
      return res.json() as Promise<RespostaDoVoltar>;
    },
    onSuccess: (r) => {
      for (const k of ["/api/budget-actual", "/api/budget-planned", "/api/budget-comparison", "/api/flash-movements", CHAVE_CONTROLE_RH]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      toast({
        variant: "success",
        title: "Voltou ao Planejado",
        description: [
          r.legado ? "A linha está de novo no Planejado, pronta para ajustar e reenviar." : "A linha está de novo no Planejado e pede a pré-aprovação do DP.",
          r.divisoesRemovidas > 0 ? `${r.divisoesRemovidas} ${r.divisoesRemovidas === 1 ? "divisão saiu" : "divisões saíram"} junto.` : "",
          r.flash && r.flash.removidos > 0 ? `${r.flash.removidos} ${r.flash.removidos === 1 ? "crédito automático do Flash foi desfeito" : "créditos automáticos do Flash foram desfeitos"}.` : "",
        ].filter(Boolean).join(" "),
      });
      onFeito?.(r);
      fechar();
    },
    onError: (err: unknown) => toast({ title: "Não voltou ao Planejado", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const pode = item ? podeVoltarAoPlanejado(item, divisoes) : null;
  const limpo = motivo.trim();
  const motivoOk = limpo.length >= MOTIVO_DO_VOLTAR_MIN && limpo.length <= MOTIVO_DO_VOLTAR_MAX;
  const enviar = () => {
    setTentou(true);
    if (!item || !pode?.ok || !motivoOk || mutation.isPending) return;
    mutation.mutate({ id: item.id, motivo: limpo });
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !mutation.isPending) fechar(); }}>
      <DialogContent className={MOLDURA} data-testid="dialogo-voltar-ao-planejado">
        {!item && <DialogTitle className="sr-only">Voltar ao Planejado</DialogTitle>}
        {item && (
          <>
            <div className="flex items-start gap-3 px-5 pt-5 pb-1 pr-12">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warning-soft text-warning shrink-0" aria-hidden="true">
                <Undo2 className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0 pt-0.5">
                <DialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">Voltar ao Planejado?</DialogTitle>
                <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground truncate">{nome} · {funcao} · <span className="tabular-nums">{formatCurrency(item.totalValue)}</span></p>
              </div>
            </div>

            <div className="px-5 pt-3 pb-4 space-y-3.5">
              <DialogDescription asChild>
                <ul className="m-0 pl-4 list-disc space-y-1 text-sm leading-relaxed text-slate-600">
                  <li>A prestação sai do Realizado{divisoes.length > 0 ? ` com ${divisoes.length === 1 ? "a divisão" : `as ${divisoes.length} divisões`}` : ""} — o que estava preenchido fica no histórico (auditoria).</li>
                  <li>A linha volta ao Planejado e pede a pré-aprovação do DP de novo; depois é só reenviar.</li>
                  <li>Se o comparativo do evento estava aprovado, o crédito automático do Flash desta prestação é desfeito.</li>
                </ul>
              </DialogDescription>
              {pode && !pode.ok ? (
                <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs leading-5 text-danger" data-testid="voltar-bloqueado">{pode.motivo}</p>
              ) : (
                <div>
                  <label htmlFor={motivoId} className="block mb-1.5 text-xs font-medium text-slate-700">Motivo <span className="text-danger">*</span></label>
                  <Textarea
                    id={motivoId}
                    className="w-full rounded-lg text-sm resize-none border-border focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary placeholder:text-muted-foreground"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder='Ex.: "Empreita não tem mobilidade — recalcular no Planejado"'
                    rows={3}
                    maxLength={MOTIVO_DO_VOLTAR_MAX}
                    aria-invalid={tentou && !motivoOk ? true : undefined}
                    aria-describedby={tentou && !motivoOk ? `${motivoId}-erro` : undefined}
                    autoFocus
                    data-testid="voltar-motivo"
                  />
                  {tentou && !motivoOk && (
                    <p id={`${motivoId}-erro`} className="m-0 mt-1 text-xs font-medium text-danger">Escreva o motivo (pelo menos {MOTIVO_DO_VOLTAR_MIN} caracteres) — ele fica na auditoria.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-muted">
              <button type="button" className={VOLTAR} onClick={fechar} disabled={mutation.isPending}>Cancelar</button>
              {pode?.ok && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-white bg-warning-strong hover:bg-warning transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={enviar}
                  disabled={mutation.isPending}
                  data-testid="voltar-confirmar"
                >
                  {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Undo2 className="w-4 h-4" aria-hidden="true" />}
                  {mutation.isPending ? "Voltando…" : "Voltar ao Planejado"}
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default VoltarAoPlanejadoDialog;
