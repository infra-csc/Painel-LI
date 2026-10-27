/**
 * Resumo · "1,5 diária" da vaga (28/10, pedido do DP — shared/meia-diaria.ts).
 *
 * Quem escala marca os dias de carga/descarga ("1,5 diária" = a diária do dia
 * + ½), junto dos dias de trabalho da vaga. Discreto: sem dia marcado e sem
 * permissão, a linha nem aparece; com permissão e nada marcado, um link abre a
 * fileira de dias. Grava na hora (rota dedicada), como o tipo de freela.
 */
import { useState } from "react";
import type { TeamInclusion } from "@shared/schema";
import { diasDeTrabalhoDaVaga, normalizarDiasMeiaExtra, resumoDasMeiasDiarias } from "@shared/meia-diaria";
import { FileiraDeMeiaDiaria } from "@/components/common/meia-diaria";
import type { ScalingMutations } from "../use-scaling-mutations";
import { Propriedade } from "./details-shared";

export function MeiaDiariaDaVaga({ inclusion, podeMarcar, mutation }: {
  inclusion: TeamInclusion;
  podeMarcar: boolean;
  mutation: ScalingMutations["setDiasMeiaExtra"];
}) {
  const [aberto, setAberto] = useState(false);
  const dias = diasDeTrabalhoDaVaga(inclusion);
  const marcados = normalizarDiasMeiaExtra(inclusion.diasMeiaExtra, dias);
  if (dias.length === 0 || (marcados.length === 0 && !podeMarcar)) return null;
  const set = new Set(marcados);
  const alternar = (dia: string) => {
    const proximo = new Set(set);
    if (proximo.has(dia)) proximo.delete(dia); else proximo.add(dia);
    mutation.mutate({ id: inclusion.id, diasMeiaExtra: Array.from(proximo).sort() });
  };
  const mostrarFileira = podeMarcar && (aberto || marcados.length > 0);
  return (
    <Propriedade rotulo="1,5 diária" testId="vaga-meia-diaria">
      {marcados.length > 0 && (
        <p className="m-0 text-xs font-medium text-info">{resumoDasMeiasDiarias(marcados)} <span className="font-normal text-muted-foreground">· carga/descarga</span></p>
      )}
      {mostrarFileira ? (
        <div className={marcados.length > 0 ? "mt-1.5" : ""}>
          <span id={`vaga-meia-${inclusion.id}`} className="sr-only">Dias com 1,5 diária</span>
          <FileiraDeMeiaDiaria
            dias={dias.map((dia) => ({ dia }))}
            marcados={set}
            onAlternar={alternar}
            desabilitado={mutation.isPending}
            rotuloId={`vaga-meia-${inclusion.id}`}
          />
          <p className="m-0 mt-1 text-2xs text-muted-foreground">O dia marcado paga a diária + ½ (carga ou descarga). O Planejado já calcula; casa (CLT) só recebe no fim de semana.</p>
        </div>
      ) : podeMarcar ? (
        <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-info hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded" data-testid="vaga-abrir-meia-diaria">
          + Marcar dia com 1,5 diária
        </button>
      ) : null}
    </Propriedade>
  );
}
