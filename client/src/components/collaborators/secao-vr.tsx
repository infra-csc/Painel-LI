/**
 * Ficha do colaborador · Benefício VR (28/10, pedido do DP).
 *
 * "Amarrar o benefício VR do cadastro na conta": o colaborador da CASA com
 * VR cadastrado paga no almoço de dia útil só o que falta para o valor da
 * regra (R$ 40 demais, R$ 44 gestão, R$ 35 ceno) — ex.: VR R$ 40,50 → R$ 0.
 * Sem VR, vale o valor fixo de sempre (R$ 5,00). Regra: shared/alimentacao.ts.
 * Edita quem edita o cadastro e o DP (PATCH /api/collaborators/:id/vr).
 * Só afeta o que for recalculado daqui pra frente.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine } from "lucide-react";
import type { Collaborator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/common/currency-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { formatarMoeda } from "@/lib/format";

export function SecaoVr({ c, podeEditar }: { c: Collaborator; podeEditar: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [vr, setVr] = useState<number | null>(c.vrDiarioCents ?? null);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(0);
  useEffect(() => { setVr(c.vrDiarioCents ?? null); setEditando(false); }, [c.id, c.vrDiarioCents]);

  const salvar = useMutation({
    mutationFn: async (vrDiarioCents: number | null) => {
      const res = await apiRequest("PATCH", `/api/collaborators/${c.id}/vr`, { vrDiarioCents });
      return res.json() as Promise<Collaborator>;
    },
    onSuccess: (atual) => {
      setVr(atual.vrDiarioCents ?? null);
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["/api/collaborators"] });
      toast({ variant: "success", title: atual.vrDiarioCents == null ? "VR retirado" : "VR salvo", description: "Vale para o que for recalculado no Planejado daqui pra frente." });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível salvar o VR", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  if (c.type !== "casa") return null;
  return (
    <section className="rounded-xl border border-border bg-card" data-testid="col-ficha-vr">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="text-xs font-semibold text-foreground">Benefício VR</h3>
        {podeEditar && !editando && (
          <button
            type="button"
            onClick={() => { setRascunho(vr ?? 0); setEditando(true); }}
            className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="col-ficha-vr-editar"
          >
            <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />{vr == null ? "Cadastrar" : "Alterar"}
          </button>
        )}
      </header>
      <div className="px-4 pb-3.5">
        {editando ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); salvar.mutate(rascunho); }}
          >
            <label htmlFor={`vr-${c.id}`} className="text-xs text-slate-600">VR por dia útil (R$)</label>
            <CurrencyInput id={`vr-${c.id}`} value={rascunho} onChange={setRascunho} className="h-9 w-28 text-right tabular-nums" aria-label="VR diário (R$)" />
            <div className="flex items-center gap-1.5 ml-auto">
              {vr != null && (
                <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" disabled={salvar.isPending} onClick={() => salvar.mutate(null)}>Tirar o VR</Button>
              )}
              <Button type="button" variant="outline" className="h-8 px-3 text-xs" disabled={salvar.isPending} onClick={() => setEditando(false)}>Cancelar</Button>
              <Button type="submit" className="h-8 px-3 text-xs gap-1" disabled={salvar.isPending} data-testid="col-ficha-vr-salvar">
                {salvar.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}Salvar
              </Button>
            </div>
          </form>
        ) : (
          <dl className="m-0">
            <dt className="text-2xs font-medium text-muted-foreground">VR diário</dt>
            <dd className="m-0 mt-0.5 text-sm tabular-nums text-foreground">{vr == null ? <span className="text-muted-foreground">Não cadastrado</span> : formatarMoeda(vr)}</dd>
          </dl>
        )}
        <p className="m-0 mt-2 text-2xs leading-4 text-muted-foreground">
          {vr == null
            ? "Sem VR, o almoço de dia útil em evento paga o valor fixo da regra (só a diferença do VR padrão)."
            : "O almoço de dia útil em evento paga só o que falta do VR para o valor da regra da função (R$ 40 demais · R$ 44 gestão · R$ 35 ceno)."}
        </p>
      </div>
    </section>
  );
}
