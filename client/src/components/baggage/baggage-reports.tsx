/**
 * Os dois relatórios: por colaborador e por evento.
 *
 * Eram tabelas com `overflow-x`. No estreito isso é pior do que parece: rolar
 * para o lado esconde justamente a ÚLTIMA coluna, que é o valor — o número que
 * a pessoa veio ver. Abaixo do limiar cada linha vira cartão, com o rótulo de
 * cada faixa vindo do próprio `<th>`.
 *
 * Os `+`/`−` do ajuste de histórico foram de 16px para 24px: alvo de 16 pixels
 * ao lado de outro alvo de 16 pixels erra o alvo.
 */
import { CalendarDays, Download, Plus, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { fixEncoding } from "@/lib/utils";
import {
  CIA_ORDEM, CIA_STYLE, formatCpf, formatCurrency, getCpf, toTitleCase,
  type CiaGroup, type CollaboratorItem,
} from "./baggage-core";
import type { AgregadoDoColaborador } from "./baggage-logic";

/** Abaixo disto as colunas não cabem e cada linha vira cartão. */
const LARGURA_MINIMA = 900;

const TH = "text-[10px] uppercase tracking-[0.1em] font-bold text-[#64748B] px-4 py-2.5";

/**
 * Vira as linhas em cartões abaixo do limiar, sobre a MESMA árvore de células.
 * Nada é re-renderizado de outro jeito, então nenhum dado se perde entre os
 * dois modos.
 */
function EstiloCartao({ classe }: { classe: string }) {
  return (
    <style>{`
      .${classe} thead { display: none; }
      .${classe} table, .${classe} tbody, .${classe} tfoot, .${classe} tr, .${classe} td { display: block; width: 100%; }
      .${classe} table { min-width: 0 !important; }
      .${classe} tr { padding: 8px 0; border-bottom: 1px solid var(--border); }
      .${classe} td { padding: 3px 16px; text-align: left !important; }
      .${classe} td[data-rotulo]::before {
        content: attr(data-rotulo);
        display: block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .1em;
        color: #64748B;
        margin-bottom: 2px;
      }
    `}</style>
  );
}

function Busca({ value, onChange, placeholder, label, testid }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string; testid: string;
}) {
  return (
    <div className="p-3 border-b border-border">
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="pl-8 h-9 text-xs rounded-xl border-gray-200"
          data-testid={testid}
        />
      </div>
    </div>
  );
}

function BotaoCsv({ onClick, title, disabled }: { onClick: () => void; title: string; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 border border-border rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download className="w-3.5 h-3.5" aria-hidden="true" /> CSV
    </button>
  );
}

// ── Por colaborador ──────────────────────────────────────────────────────────

export interface LinhaDeColaborador extends AgregadoDoColaborador {
  collaboratorId: string;
  name: string;
  cpf: string;
}

export function BaggageByCollaborator({
  linhas, busca, onBusca, candidatos, onAdicionarAoHistorico, onAjustarHistorico, ajustando,
  carregando, erroDeHistorico, onRecarregarHistorico, temHistorico, semRegistros, onVerSolicitacoes, onCsv,
}: {
  linhas: LinhaDeColaborador[];
  busca: string;
  onBusca: (v: string) => void;
  /** Colaboradores ativos que batem com a busca mas ainda não têm bagagem. */
  candidatos: CollaboratorItem[];
  onAdicionarAoHistorico: (collaboratorId: string) => void;
  onAjustarHistorico: (collaboratorId: string, cia: CiaGroup, atual: number, delta: number) => void;
  ajustando: boolean;
  carregando: boolean;
  erroDeHistorico: boolean;
  onRecarregarHistorico: () => void;
  temHistorico: boolean;
  semRegistros: boolean;
  onVerSolicitacoes: (collaboratorId: string) => void;
  onCsv: () => void;
}) {
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA;

  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <EstiloCartao classe="bagagem-colab-cartao" />
      <div className="flex items-center gap-2 pr-3 border-b border-border">
        <div className="flex-1 min-w-0">
          <Busca
            value={busca} onChange={onBusca}
            placeholder="Buscar por nome ou CPF..."
            label="Buscar colaborador por nome ou CPF"
            testid="input-search-collab-tab"
          />
        </div>
        <BotaoCsv onClick={onCsv} title="Exportar os totais por colaborador em CSV" disabled={linhas.length === 0} />
      </div>

      {erroDeHistorico && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-[11px] text-[#92400E]" role="alert">
          <span>
            Não foi possível carregar o histórico de bagagens — o servidor pode estar rodando uma versão antiga.
            Reinicie o workflow no Replit e tente de novo.
          </span>
          <button
            type="button"
            onClick={onRecarregarHistorico}
            className="shrink-0 text-[11px] font-bold text-[#92400E] underline underline-offset-2 hover:text-[#78350F]"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Quem bate com a busca mas ainda não tem bagagem: dá para incluir daqui. */}
      {busca.trim().length >= 3 && candidatos.length > 0 && (
        <div className="px-4 py-2.5 border-b border-border bg-slate-50/60">
          <p className="text-[10px] uppercase tracking-wider font-bold text-[#64748B] mb-1.5">
            Sem bagagem registrada — adicionar ao histórico
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidatos.map(c => (
              <button
                key={c.id}
                type="button"
                disabled={ajustando}
                onClick={() => onAdicionarAoHistorico(c.id)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-border bg-card hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                title="Adiciona 1 bagagem em Outros — depois ajuste por CIA com os botões + / −"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                {toTitleCase(fixEncoding(c.fullName))}
                {getCpf(c) && <span className="font-mono text-[#64748B] ml-1">{formatCpf(getCpf(c))}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <div className="p-4 space-y-2" aria-hidden="true">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      ) : linhas.length === 0 ? (
        <div className="text-center py-10 px-4">
          <Users className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" aria-hidden="true" />
          <p className="text-[13px] text-[#64748B]">
            {erroDeHistorico
              ? "O histórico não pôde ser carregado (veja o aviso acima) e ainda não há solicitações registradas."
              : semRegistros
                ? "Nenhuma solicitação registrada ainda — os totais por colaborador (incluindo o histórico importado) aparecem aqui."
                : "Nenhum colaborador encontrado."}
          </p>
        </div>
      ) : (
        <div ref={ref} className={modoCartao ? "bagagem-colab-cartao" : "overflow-x-auto"}>
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr>
                <th className={`${TH} text-left`}>Colaborador</th>
                <th className={`${TH} text-left`}>CPF</th>
                <th className={`${TH} text-left`}>Por CIA</th>
                <th className={`${TH} text-right`}>Bagagens</th>
                <th className={`${TH} text-right`}>Valor total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map(row => (
                <tr
                  key={row.collaboratorId}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver solicitações de ${row.name}`}
                  onClick={() => onVerSolicitacoes(row.collaboratorId)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVerSolicitacoes(row.collaboratorId); }
                  }}
                  className="hover:bg-blue-50/40 cursor-pointer focus:outline-none focus:bg-blue-50/60"
                  data-testid={`collab-row-${row.collaboratorId}`}
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{row.name}</td>
                  <td className="px-2 py-2.5 font-mono text-[#475569] whitespace-nowrap" data-rotulo="CPF">
                    {row.cpf ? formatCpf(row.cpf) : "—"}
                  </td>
                  <td
                    className="px-2 py-2.5"
                    data-rotulo="Por CIA"
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                  >
                    {/*
                      A contagem soma registros do sistema e histórico. Os botões
                      ajustam SÓ a parte histórica — registro do sistema tem
                      evento e valor, e se edita na aba Solicitações.
                    */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {CIA_ORDEM.map(g => {
                        const total = row.byCia[g];
                        const hist = row.histByCia[g];
                        return (
                          <span
                            key={g}
                            className={`inline-flex items-center gap-0.5 text-[11px] font-bold rounded-full whitespace-nowrap ${total > 0 ? CIA_STYLE[g].badge : "bg-slate-50 text-[#94A3B8]"} px-0.5`}
                          >
                            <button
                              type="button"
                              disabled={ajustando || hist <= 0}
                              onClick={() => onAjustarHistorico(row.collaboratorId, g, hist, -1)}
                              aria-label={`Remover 1 bagagem ${g} do histórico de ${row.name}`}
                              title={hist <= 0 ? "Sem histórico nesta CIA para remover (registros do sistema se editam na aba Solicitações)" : "Remover 1 do histórico"}
                              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/70 disabled:opacity-30 disabled:cursor-not-allowed"
                            >−</button>
                            <span className="px-0.5">{g}: {total}</span>
                            <button
                              type="button"
                              disabled={ajustando}
                              onClick={() => onAjustarHistorico(row.collaboratorId, g, hist, +1)}
                              aria-label={`Adicionar 1 bagagem ${g} ao histórico de ${row.name}`}
                              title="Adicionar 1 ao histórico"
                              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/70 disabled:opacity-30"
                            >+</button>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap" data-rotulo="Bagagens">
                    {row.totalBags}
                    {row.historyBags > 0 && (
                      <span
                        className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-[#475569] align-middle"
                        title={`${row.historyBags} bagagem(ns) do histórico importado da planilha antiga (sem evento/valor)`}
                      >
                        {row.historyBags} hist.
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800 whitespace-nowrap" data-rotulo="Valor total">
                    {formatCurrency(row.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {temHistorico && (
            <p className="px-4 py-2 text-[11px] text-[#64748B] border-t border-slate-100">
              As contagens somam os registros do sistema com o histórico importado da planilha antiga (selo "hist.").
              Os botões + / − ajustam só a parte histórica (sem evento nem valor — por isso não entra no Valor total);
              registros do sistema se editam na aba Solicitações.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Por evento ───────────────────────────────────────────────────────────────

export interface LinhaDeEvento {
  eventId: string;
  name: string;
  bags: number;
  cents: number;
  records: number;
}

export function BaggageByEvent({
  linhas, busca, onBusca, totais, carregando, semRegistros, onVerSolicitacoes, onCsv,
}: {
  linhas: LinhaDeEvento[];
  busca: string;
  onBusca: (v: string) => void;
  totais: { bags: number; cents: number };
  carregando: boolean;
  semRegistros: boolean;
  onVerSolicitacoes: (eventId: string) => void;
  onCsv: () => void;
}) {
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA;

  return (
    <div className="bg-card rounded-[14px] border border-border overflow-hidden">
      <EstiloCartao classe="bagagem-evento-cartao" />
      <div className="flex items-center gap-2 pr-3 border-b border-border">
        <div className="flex-1 min-w-0">
          <Busca
            value={busca} onChange={onBusca}
            placeholder="Buscar evento..." label="Buscar evento"
            testid="input-search-event-tab"
          />
        </div>
        <BotaoCsv onClick={onCsv} title="Exportar os totais por evento em CSV" disabled={linhas.length === 0} />
      </div>

      {carregando ? (
        <div className="p-4 space-y-2" aria-hidden="true">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      ) : linhas.length === 0 ? (
        <div className="text-center py-10 px-4">
          <CalendarDays className="w-8 h-8 text-[#CBD5E1] mx-auto mb-2" aria-hidden="true" />
          <p className="text-[13px] text-[#64748B]">
            {semRegistros
              ? "Nenhuma solicitação registrada ainda — os totais por evento aparecem aqui."
              : "Nenhum evento encontrado."}
          </p>
        </div>
      ) : (
        <div ref={ref} className={modoCartao ? "bagagem-evento-cartao" : "overflow-x-auto"}>
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr>
                <th className={`${TH} text-left`}>Evento</th>
                <th className={`${TH} text-right`}>Bagagens</th>
                <th className={`${TH} text-right`}>Valor total</th>
                <th className={`${TH} text-right`}>Valor médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map(row => (
                <tr
                  key={row.eventId}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver solicitações do evento ${row.name}`}
                  onClick={() => onVerSolicitacoes(row.eventId)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVerSolicitacoes(row.eventId); }
                  }}
                  className="hover:bg-blue-50/40 cursor-pointer focus:outline-none focus:bg-blue-50/60"
                  data-testid={`event-row-${row.eventId}`}
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{row.name}</td>
                  <td className="px-2 py-2.5 text-right font-semibold text-slate-800" data-rotulo="Bagagens">{row.bags}</td>
                  <td className="px-2 py-2.5 text-right font-mono font-semibold text-slate-800 whitespace-nowrap" data-rotulo="Valor total">
                    {formatCurrency(row.cents)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#475569] whitespace-nowrap" data-rotulo="Valor médio">
                    {row.bags > 0 ? formatCurrency(Math.round(row.cents / row.bags)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F8FAFC] border-t border-border">
                <td className="px-4 py-2.5 text-[11px] font-bold text-[#475569] uppercase tracking-wide">Total geral</td>
                <td className="px-2 py-2.5 text-right font-bold text-slate-900" data-rotulo="Bagagens">{totais.bags}</td>
                <td className="px-2 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap" data-rotulo="Valor total">
                  {formatCurrency(totais.cents)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[#475569] whitespace-nowrap" data-rotulo="Valor médio">
                  {totais.bags > 0 ? formatCurrency(Math.round(totais.cents / totais.bags)) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
