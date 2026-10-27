/**
 * Data de corte do legado dos honorários — Tabela de valores (26/10).
 *
 * Decisão do dono: eventos que TERMINAM antes desta data são legado (ficam
 * fora do fluxo novo; no Painel de honorários, só leitura com "Concluir em
 * lote"). Padrão: 01/11/2026. Só o administrador muda; o DP vê a data.
 * Salva na hora (GET/PUT /api/honorarios/data-de-corte) — não passa pela
 * barra de alterações da página, como as Empresas pagadoras.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";
import { CHAVE_DATA_DE_CORTE, useDataDeCorte } from "@/components/honorarios/use-honorarios";
import { DATA_DE_CORTE_PADRAO, dataDeCorteLegivel, dataDeCorteValida } from "@shared/legado-honorarios";
import { GrupoDeAjustes } from "./settings-fields";

export function DataDeCorteCard() {
  const { dataDeCorte, podeEditar, carregando } = useDataDeCorte();
  const [valor, setValor] = useState(dataDeCorte);
  useEffect(() => { setValor(dataDeCorte); }, [dataDeCorte]);
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async (data: string) => (await apiRequest("PUT", "/api/honorarios/data-de-corte", { dataDeCorte: data })).json(),
    onSuccess: (_r, data) => {
      qc.invalidateQueries({ queryKey: [CHAVE_DATA_DE_CORTE] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      toast({ variant: "success", title: "Data de corte salva", description: `Eventos que terminam antes de ${dataDeCorteLegivel(data)} são legado.` });
    },
    onError: (err) => toast({ variant: "destructive", title: "Não foi possível salvar a data de corte", description: apiErrorMessage(err, "Tente de novo.") }),
  });
  const mudou = valor !== dataDeCorte;
  const valida = dataDeCorteValida(valor);
  return (
    <GrupoDeAjustes
      id="cfg-data-de-corte"
      titulo="Data de corte do legado (honorários)"
      descricao="Eventos que terminam antes desta data ficam fora do fluxo novo dos honorários: no Painel de honorários aparecem no recorte Legado, só leitura; nas outras telas do grupo, só com o filtro “Mostrar eventos legados”. Salva na hora."
      data-testid="cfg-data-de-corte"
    >
      <div className="flex flex-wrap items-end gap-3 px-5 py-4 max-sm:px-4">
        <div className="min-w-0">
          <label htmlFor="data-de-corte" className="block text-xs font-medium text-slate-600">Legado: eventos que terminam antes de</label>
          <Input
            id="data-de-corte"
            type="date"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            disabled={!podeEditar || carregando || m.isPending}
            className="mt-1 h-9 w-[180px] tabular-nums"
            data-testid="data-de-corte-campo"
          />
        </div>
        {podeEditar ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-lg"
              disabled={!mudou || !valida || m.isPending}
              onClick={() => m.mutate(valor)}
              data-testid="data-de-corte-salvar"
            >
              {m.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Salvando…</> : "Salvar data"}
            </Button>
            {mudou && (
              <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setValor(dataDeCorte)} disabled={m.isPending}>
                Desfazer
              </Button>
            )}
          </div>
        ) : (
          <p className="m-0 inline-flex items-center gap-1.5 h-9 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />Só o administrador muda a data de corte.
          </p>
        )}
        <p className="m-0 basis-full flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
          Decisão de 26/10/2026: {dataDeCorteLegivel(DATA_DE_CORTE_PADRAO)}. Mudar a data não apaga nem conclui nada — só muda o que conta como legado.
        </p>
      </div>
    </GrupoDeAjustes>
  );
}
