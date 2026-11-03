/**
 * Resumo · dias da vaga que mexem na alimentação e na diária.
 *
 *  - Dia de carregamento (29/10, deck de Honorários): quem escala marca o dia;
 *    ele tem janta mesmo sem logística (shared/regras-de-29-10.ts).
 *  - 1,5 diária (28/10): o deck de 29/10 esconde a marcação ("dobrar diária", no
 *    Realizado, ocupa o lugar). Vaga que já tem dia marcado continua mostrando,
 *    para poder tirar — o valor gravado não muda sozinho.
 */
import { useState } from "react";
import type { TeamInclusion } from "@shared/schema";
import { diasDeTrabalhoDaVaga, normalizarDiasMeiaExtra, resumoDasMeiasDiarias } from "@shared/meia-diaria";
import { CARREGAMENTO_ROTULO, resumoDosDiasDeCarregamento } from "@shared/regras-de-29-10";
import { FileiraDeMeiaDiaria } from "@/components/common/meia-diaria";
import type { ScalingMutations } from "../use-scaling-mutations";
import { Propriedade } from "./details-shared";

export function MeiaDiariaDaVaga({ inclusion, podeMarcar, mutation }: {
  inclusion: TeamInclusion;
  podeMarcar: boolean;
  mutation: ScalingMutations["setDiasMeiaExtra"];
}) {
  const dias = diasDeTrabalhoDaVaga(inclusion);
  const marcados = normalizarDiasMeiaExtra(inclusion.diasMeiaExtra, dias);
  if (marcados.length === 0) return null;
  const set = new Set(marcados);
  const tirar = (dia: string) => {
    mutation.mutate({ id: inclusion.id, diasMeiaExtra: marcados.filter((d) => d !== dia) });
  };
  return (
    <Propriedade rotulo="1,5 diária" testId="vaga-meia-diaria">
      <p className="m-0 text-xs font-medium text-info">{resumoDasMeiasDiarias(marcados)}</p>
      {podeMarcar && (
        <div className="mt-1.5">
          <span id={`vaga-meia-${inclusion.id}`} className="sr-only">Dias com 1,5 diária</span>
          <FileiraDeMeiaDiaria
            dias={marcados.map((dia) => ({ dia }))}
            marcados={set}
            onAlternar={tirar}
            desabilitado={mutation.isPending}
            rotuloId={`vaga-meia-${inclusion.id}`}
          />
          <p className="m-0 mt-1 text-2xs text-muted-foreground">Marcado antes. Para pagar duas diárias no dia, use Dobrar no Realizado.</p>
        </div>
      )}
    </Propriedade>
  );
}

export function DiasDeCarregamentoDaVaga({ inclusion, podeMarcar, mutation }: {
  inclusion: TeamInclusion;
  podeMarcar: boolean;
  mutation: ScalingMutations["setDiasCarregamento"];
}) {
  const [aberto, setAberto] = useState(false);
  const dias = diasDeTrabalhoDaVaga(inclusion);
  const marcados = normalizarDiasMeiaExtra(inclusion.diasCarregamento, dias);
  if (dias.length === 0 || (marcados.length === 0 && !podeMarcar)) return null;
  const set = new Set(marcados);
  const alternar = (dia: string) => {
    const proximo = new Set(set);
    if (proximo.has(dia)) proximo.delete(dia); else proximo.add(dia);
    mutation.mutate({ id: inclusion.id, diasCarregamento: Array.from(proximo).sort() });
  };
  const mostrarFileira = podeMarcar && (aberto || marcados.length > 0);
  return (
    <Propriedade rotulo="Carregamento" testId="vaga-carregamento">
      {marcados.length > 0 && <p className="m-0 text-xs font-medium text-info">{resumoDosDiasDeCarregamento(marcados)}</p>}
      {mostrarFileira ? (
        <div className={marcados.length > 0 ? "mt-1.5" : ""}>
          <span id={`vaga-carregamento-${inclusion.id}`} className="sr-only">Dias de carregamento</span>
          <FileiraDeMeiaDiaria
            dias={dias.map((dia) => ({ dia }))}
            marcados={set}
            onAlternar={alternar}
            desabilitado={mutation.isPending}
            rotuloId={`vaga-carregamento-${inclusion.id}`}
            rotulo={CARREGAMENTO_ROTULO}
            selo="janta"
          />
          <p className="m-0 mt-1 text-2xs text-muted-foreground">O dia marcado tem janta mesmo sem logística (carregamento ou descarregamento noturno). O Planejado já calcula.</p>
        </div>
      ) : podeMarcar ? (
        <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-info hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded" data-testid="vaga-abrir-carregamento">
          + Marcar dia de carregamento
        </button>
      ) : null}
    </Propriedade>
  );
}
