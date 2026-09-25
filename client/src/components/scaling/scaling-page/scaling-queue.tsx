/**
 * Aba "Fila de trabalho" da Escalação (25/09 — extraída de pages/scaling.tsx):
 * os blocos da fila, a faixa de recarga, os estados vazios, a tabela e a barra
 * de confirmação em lote.
 */
import { FilterX, Users } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import ScalingTable, { type ScalingTableProps } from "../scaling-table";
import ScalingWorkQueue from "../scaling-work-queue";
import BulkConfirmBar from "../bulk-confirm-bar";
import type { QueueKey } from "../scaling-queue";
import { EstadoVazio } from "./estados-da-pagina";

export interface ScalingQueueProps {
  contagens: Record<QueueKey, number>;
  total: number;
  fila: QueueKey | null;
  onFila: (fila: QueueKey | null) => void;
  mostrarGestor: boolean;
  mostrarTrocas: boolean;
  isFetching: boolean;
  /** Não há vaga nenhuma para escalar E nenhum filtro ligado. */
  semVagas: boolean;
  visibleRows: TeamInclusion[];
  nomesDosFiltrosAtivos: string;
  onLimparFiltros: () => void;
  tableProps: Omit<ScalingTableProps, "rows">;
  selectedInclusions: TeamInclusion[];
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function ScalingQueue({ contagens, total, fila, onFila, mostrarGestor, mostrarTrocas, isFetching, semVagas, visibleRows, nomesDosFiltrosAtivos, onLimparFiltros, tableProps, selectedInclusions, setSelectedIds }: ScalingQueueProps) {
  const { getEventName, getFunctionName, getCollaboratorName } = tableProps;
  return (
    <>
      <ScalingWorkQueue contagens={contagens} total={total} ativa={fila} onEscolher={onFila} mostrarGestor={mostrarGestor} mostrarTrocas={mostrarTrocas} />

      {/* A faixa de recarga fica ACIMA dos filtros e não os
          substitui: o toggle que disparou a busca precisa continuar
          clicável para poder ser desfeito. */}
      {isFetching && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-border bg-brand-soft px-3 py-1.5 text-xs text-primary"
          data-testid="aviso-recarregando"
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
          Atualizando a lista…
        </p>
      )}

      {semVagas ? (
        <EstadoVazio
          icone={<Users className="w-7 h-7" aria-hidden="true" />}
          titulo="Nenhuma vaga para escalar"
          texto="As vagas chegam da Inclusão de Equipe quando as funções do evento abrem. Assim que uma for criada, ela aparece aqui."
        />
      ) : visibleRows.length === 0 ? (
        <EstadoVazio
          icone={<FilterX className="w-7 h-7" aria-hidden="true" />}
          titulo="Nenhuma escalação nesse recorte"
          texto={`Filtrando por ${nomesDosFiltrosAtivos || "este recorte"} não sobra nenhuma linha.`}
          acao={
            <button
              type="button"
              onClick={onLimparFiltros}
              className="h-[34px] px-3.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              data-testid="button-limpar-filtros"
            >
              Limpar filtros
            </button>
          }
        />
      ) : (
        <ScalingTable rows={visibleRows} {...tableProps} />
      )}

      <BulkConfirmBar
        selected={selectedInclusions}
        onClear={() => setSelectedIds(new Set())}
        getEventName={getEventName}
        getFunctionName={getFunctionName}
        getCollaboratorName={getCollaboratorName}
        onDone={(results) => {
          const okIds = new Set(results.filter(r => r.ok).map(r => r.inclusion.id));
          setSelectedIds(prev => new Set(Array.from(prev).filter(id => !okIds.has(id))));
          queryClient.invalidateQueries({ queryKey: ["/api/team-inclusions"] });
        }}
      />
    </>
  );
}
