/**
 * Aba "Fila de trabalho" da Escalação (25/09 — extraída de pages/scaling.tsx):
 * os blocos da fila, a faixa de recarga, os estados vazios, a tabela e a barra
 * de confirmação em lote.
 */
import { FilterX, History, Users } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import ScalingTable, { type ScalingTableProps } from "../scaling-table";
import ScalingWorkQueue from "../scaling-work-queue";
import BulkConfirmBar from "../bulk-confirm-bar";
import type { QueueKey } from "../scaling-queue";
import { AcaoDoEstado, EstadoVazio } from "./estados-da-pagina";

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
  /**
   * Evento passado escolhido no filtro com o recorte "Futuros" ainda ligado
   * (28/09). A lista fica vazia e o Exportar diz "nada para exportar" — o dono
   * viu isso e pediu que a tela explique onde clicar, sem mudar a lógica.
   */
  eventoPassadoOculto?: { nome: string; vagas: number; onMostrar: () => void } | null;
}

export function ScalingQueue({ contagens, total, fila, onFila, mostrarGestor, mostrarTrocas, isFetching, semVagas, visibleRows, nomesDosFiltrosAtivos, onLimparFiltros, tableProps, selectedInclusions, setSelectedIds, eventoPassadoOculto }: ScalingQueueProps) {
  const { getEventName, getFunctionName, getCollaboratorName } = tableProps;
  return (
    <>
      <ScalingWorkQueue contagens={contagens} total={total} ativa={fila} onEscolher={onFila} mostrarGestor={mostrarGestor} mostrarTrocas={mostrarTrocas} />

      {/* Recarga (07/10): uma barra fina colada no topo da lista, em vez de
          uma faixa que empurrava a tabela 30px a cada filtro. Ela não
          substitui os filtros: o toggle que disparou a busca continua
          clicável para poder ser desfeito. */}
      <div className="relative -my-2 h-0">
        {isFetching && (
          <p role="status" className="absolute inset-x-3 top-0.5 h-0.5 overflow-hidden rounded-full bg-brand-soft" data-testid="aviso-recarregando">
            <span className="esc-progresso block h-full w-2/5 rounded-full bg-primary" aria-hidden="true" />
            <span className="sr-only">Atualizando a lista…</span>
          </p>
        )}
      </div>

      {semVagas ? (
        <EstadoVazio
          icone={<Users className="w-5 h-5" aria-hidden="true" />}
          titulo="Nenhuma vaga para escalar"
          texto="As vagas chegam da Inclusão de Equipe quando as funções do evento abrem. Assim que uma for criada, ela aparece aqui."
        />
      ) : visibleRows.length === 0 && eventoPassadoOculto ? (
        <EstadoVazio
          icone={<History className="w-5 h-5" aria-hidden="true" />}
          titulo="Este evento já aconteceu"
          texto={`O recorte "Futuros" (o padrão) esconde as vagas de eventos passados. Para ver e exportar ${eventoPassadoOculto.vagas === 1 ? "a vaga" : `as ${eventoPassadoOculto.vagas} vagas`} de ${eventoPassadoOculto.nome}, mude o recorte para "Todos" ou "Realizados" — ali em cima, ao lado de "Futuros".`}
          acao={
            <AcaoDoEstado onClick={eventoPassadoOculto.onMostrar} testId="button-mostrar-evento-passado">
              Mostrar {eventoPassadoOculto.vagas === 1 ? "a vaga" : `as ${eventoPassadoOculto.vagas} vagas`}
            </AcaoDoEstado>
          }
        />
      ) : visibleRows.length === 0 ? (
        <EstadoVazio
          icone={<FilterX className="w-5 h-5" aria-hidden="true" />}
          titulo="Nenhuma escalação nesse recorte"
          texto={`Filtrando por ${nomesDosFiltrosAtivos || "este recorte"} não sobra nenhuma linha.`}
          acao={
            <AcaoDoEstado onClick={onLimparFiltros} testId="button-limpar-filtros" principal={false}>
              <FilterX className="h-4 w-4" aria-hidden="true" />Limpar filtros
            </AcaoDoEstado>
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
