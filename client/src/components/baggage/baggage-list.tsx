/**
 * A lista de solicitações.
 *
 * A faixa colorida de 96px com o LOC em mono e a companhia é a identidade desta
 * tela: ela diz a CIA de relance, antes de qualquer leitura. Foi mantida
 * inteira. O que mudou é o corpo, que ganhou hierarquia — nome e CPF em cima,
 * ações à direita, os seis campos rotulados embaixo e o evento como contexto na
 * base — e o rodapé, que diz o que está na tela e por qual campo está ordenado.
 */
import { Luggage, Pencil, RotateCw, Trash2, X } from "lucide-react";
import {
  CIA_STYLE, ciaGroup, fmtDate, formatCpf, formatCurrency, getCpf,
  type BaggageRequestItem, type CollaboratorItem,
} from "./baggage-core";
import { NOME_DA_ORDEM, type Ordem, type ResumoDoRecorte } from "./baggage-logic";

const ROTULO = "text-[10px] font-bold text-[#64748B] uppercase tracking-[0.1em]";

export default function BaggageList({
  linhas, collabById, getCollabName, getEventName, carregando, erro, onRecarregar,
  temFiltroAtivo, totalSemFiltro, onLimparFiltros, onEditar, onExcluir, podeEditar, resumo, ordem,
}: {
  linhas: BaggageRequestItem[];
  collabById: Map<string, CollaboratorItem>;
  getCollabName: (id: string) => string;
  getEventName: (id: string) => string;
  carregando: boolean;
  erro: boolean;
  onRecarregar: () => void;
  temFiltroAtivo: boolean;
  /** Quantas solicitações existem ao todo — separa "nada registrado" de "nada encontrado". */
  totalSemFiltro: number;
  onLimparFiltros: () => void;
  onEditar: (r: BaggageRequestItem) => void;
  onExcluir: (r: BaggageRequestItem) => void;
  podeEditar: boolean;
  resumo: ResumoDoRecorte;
  ordem: Ordem;
}) {
  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <div className="p-4 space-y-3">
        {carregando ? (
          <div className="space-y-3" aria-hidden="true">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : erro ? (
          <div className="text-center py-10" role="alert">
            <p className="text-[13px] text-[#64748B] mb-3">Não foi possível carregar as solicitações.</p>
            <button
              type="button"
              onClick={onRecarregar}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-primary border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
              data-testid="button-retry-baggage"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" /> Tentar de novo
            </button>
          </div>
        ) : linhas.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-xl border border-dashed border-border" data-testid="lista-vazia">
            <Luggage className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" aria-hidden="true" />
            <p className="text-[13px] text-[#64748B]">
              {totalSemFiltro === 0
                ? "Nenhuma solicitação registrada ainda. Use “Nova solicitação” para registrar a primeira."
                : "Nenhuma solicitação encontrada com os filtros atuais."}
            </p>
            {totalSemFiltro > 0 && temFiltroAtivo && (
              <button
                type="button"
                onClick={onLimparFiltros}
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-primary border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                data-testid="button-clear-filters-empty"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" /> Limpar filtros
              </button>
            )}
          </div>
        ) : linhas.map(r => {
          const style = CIA_STYLE[ciaGroup(r.cia)];
          const c = collabById.get(r.collaboratorId);
          const cpf = c ? getCpf(c) : "";
          const nome = getCollabName(r.collaboratorId);
          const evento = getEventName(r.eventId);

          return (
            <div
              key={r.id}
              className="flex rounded-xl border border-border overflow-hidden hover:border-blue-200 transition-colors"
              data-testid={`baggage-row-${r.loc}`}
            >
              {/* Cartão de embarque: a companhia lida antes da leitura. */}
              <div className={`${style.stub} w-24 shrink-0 flex flex-col items-center justify-center gap-0.5 px-2 py-3 text-white`}>
                <p className="font-mono font-bold text-sm tracking-wider break-all text-center">{r.loc}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-90">{r.cia}</p>
              </div>

              <div className="flex-1 min-w-0 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 truncate" title={nome}>
                    {nome}
                    {cpf && <span className="ml-2 font-mono font-normal text-[11px] text-[#64748B]">{formatCpf(cpf)}</span>}
                  </p>
                  {podeEditar && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Editar solicitação"
                        aria-label={`Editar solicitação LOC ${r.loc}`}
                        onClick={() => onEditar(r)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:text-primary hover:bg-blue-50 transition-colors"
                        data-testid={`button-edit-${r.loc}`}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="Excluir solicitação"
                        aria-label={`Excluir solicitação LOC ${r.loc}`}
                        onClick={() => onExcluir(r)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:text-[#B91C1C] hover:bg-red-50 transition-colors"
                        data-testid={`button-delete-${r.loc}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-1.5 mt-2 text-[11px]">
                  <div><p className={ROTULO}>OS</p><p className="text-slate-700 font-medium truncate" title={r.os}>{r.os}</p></div>
                  <div><p className={ROTULO}>Qtd.</p><p className="text-slate-700 font-medium font-mono">{r.quantity}</p></div>
                  <div><p className={ROTULO}>Valor</p><p className="text-slate-800 font-mono font-semibold">{formatCurrency(r.valueCents || 0)}</p></div>
                  <div><p className={ROTULO}>Solicitação</p><p className="text-slate-700 font-medium font-mono">{fmtDate(r.requestDate)}</p></div>
                  <div><p className={ROTULO}>Embarque</p><p className="text-slate-700 font-medium font-mono">{fmtDate(r.boardingDate)}</p></div>
                  <div><p className={ROTULO}>Agência</p><p className="text-slate-700 font-medium truncate" title={r.agency}>{r.agency}</p></div>
                </div>

                <p className="text-[11px] text-[#64748B] mt-1.5 truncate" title={r.notes ? `${evento} — ${r.notes}` : evento}>
                  {evento}
                  {r.notes && <span className="text-[#94A3B8]"> — {r.notes}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {!carregando && !erro && linhas.length > 0 && (
        <div className="h-10 px-4 bg-[#F8FAFC] border-t border-border flex items-center gap-4 flex-wrap">
          <p className="text-[12px] text-[#64748B] tabular-nums" data-testid="rodape-lista">
            Mostrando {linhas.length} de {resumo.records === linhas.length ? linhas.length : resumo.records}{" "}
            {linhas.length === 1 ? "solicitação" : "solicitações"} · ordenado por {NOME_DA_ORDEM[ordem.campo]}
          </p>
          <p className="ml-auto text-[12px] text-[#64748B] font-mono" aria-live="polite">
            {resumo.bags} {resumo.bags === 1 ? "bagagem" : "bagagens"} · {formatCurrency(resumo.cents)}
          </p>
        </div>
      )}
    </div>
  );
}
