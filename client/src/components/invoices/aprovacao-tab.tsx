// Extraído de invoices.tsx em 25/09 (modularização): aba "Aprovação RH" da
// tela de Notas Fiscais — tabela das notas enviadas com ações do RH. Estado
// da ação aberta/motivo/data fica aqui; mutations em `useAprovacaoMutations`;
// linha, painel inline e rodapé são componentes próprios.
//
// 08/10 (redesenho): a tabela da família de Passagens/Bagagem — cabeçalho
// grudado abaixo da barra, larguras-guia, valores alinhados, cartão abaixo de
// 960px úteis. Em ordem de nome (o banco devolvia em qualquer ordem), busca
// por colaborador, função ou OC, e o pé com quantas estão na tela e quanto
// ELAS somam (que antes se sobrepunham dentro de uma célula e, até 08/10,
// somavam o evento inteiro mesmo com filtro).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FileText, SearchX, ArrowRight } from "lucide-react";
import type { Invoice } from "@shared/schema";
import { toTitleCase } from "@/lib/format";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { FilterPills } from "./filter-pills";
import { getEffectiveStatus, getStatusCfg } from "./invoice-status";
import { buildHistory, daysSince, HistoryPanel } from "./invoice-history";
import { formatCurrency, paraBusca } from "./invoice-format";
import { AprovacaoRow } from "./aprovacao-row";
import { AprovacaoActionPanel } from "./aprovacao-action-panel";
import { AprovacaoTotalsFooter, somarNotas } from "./aprovacao-totals-footer";
import { EstadoDaLista, BOTAO_SAIDA } from "./estado-da-lista";
import { useAprovacaoMutations } from "./use-invoice-actions";
import type { AbaBaseProps, ActiveAprovAction, AprovAction } from "./types";
import type { BudgetActual } from "@shared/schema";

// ── Aprovação Tab ─────────────────────────────────────────────────────────────
const APROV_FILTERS = [
  { id: "all",               label: "Todos" },
  { id: "enviada",           label: "Aguardando",         dot: getStatusCfg("enviada").dot },
  { id: "checkin-pendente",  label: "Aguard. check-in",   dot: getStatusCfg("checkin-pendente").dot },
  { id: "checkin-realizado", label: "Check-in realizado", dot: getStatusCfg("checkin-realizado").dot },
  { id: "devolvida",         label: "Devolvida",          dot: getStatusCfg("devolvida").dot },
  { id: "recusada",          label: "NF recusada",        dot: getStatusCfg("recusada").dot },
];

/** Abaixo disto a tabela não cabe sem espremer coluna e vira cartão — o mesmo limiar das irmãs. */
const LARGURA_MINIMA_DA_TABELA = 960;
const COLUNAS = 6;

// 11px/600 com tracking curto — o mesmo cabeçalho de Passagens.
const TH = "px-3 py-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground text-left";

export interface AprovacaoTabProps extends AbaBaseProps {
  invoices: Invoice[];
  budgetActuals: BudgetActual[];
  /** Saída do vazio: ir para a aba Lançamento. */
  onIrParaLancamento?: () => void;
}

// Filtro de status controlado pela página (vive na URL desde 23/09).
export function AprovacaoTab({ invoices, getName, getFuncName, budgetActuals, selectedEventId, qc, toast, filterStatus, onFilterStatus, highlightActualId, busca = "", onBusca, onIrParaLancamento }: AprovacaoTabProps) {
  const [active, setActive]             = useState<ActiveAprovAction>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [comment, setComment]           = useState("");
  const [tocouMotivo, setTocouMotivo]   = useState(false);
  const [checkinDate, setCheckinDate]   = useState("");
  const setFilterStatus = onFilterStatus;
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_TABELA;
  const largo = largura !== null && largura >= 1400;

  // Param `actual` → destaca a linha e limpa após a animação (padrão da LancamentoTab)
  useEffect(() => {
    if (highlightActualId) {
      setHighlightedId(highlightActualId);
      const timer = setTimeout(() => setHighlightedId(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightActualId]);

  // Scroll até a linha destacada — tenta de novo até o elemento aparecer no DOM
  useEffect(() => {
    if (!highlightedId) return;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.querySelector(`[data-actual-id="${highlightedId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 200);
      }
    };
    const t = setTimeout(tryScroll, 150);
    return () => clearTimeout(t);
  }, [highlightedId, filterStatus, invoices?.length]);

  // `useCallback` (25/09) só para o `React.memo` da linha valer — a lógica é a mesma.
  const openAction = useCallback((invId: string, type: AprovAction) => {
    setHistoryOpenId(null);
    if (active?.invId === invId && active.type === type) {
      setActive(null);
    } else {
      setActive({ invId, type });
      setComment("");
      setCheckinDate("");
    }
  }, [active]);
  const closeAction = useCallback(() => { setActive(null); }, []);
  const toggleHistory = useCallback((invId: string) => {
    setActive(null);
    setHistoryOpenId(prev => prev === invId ? null : invId);
  }, []);

  const { approveMutation, returnMutation, rejectMutation, checkinMutation } =
    useAprovacaoMutations({ selectedEventId, qc, toast, comment, checkinDate, closeAction });

  // Ordem de nome (pt-BR): estável — decidir uma nota não embaralha a tabela.
  const ordenadas = useMemo(() => [...invoices].sort((a, b) =>
    toTitleCase(getName(a.collaboratorId)).localeCompare(toTitleCase(getName(b.collaboratorId)), "pt-BR")),
  [invoices, getName]);

  // Um invólucro só, montado sempre: a medida da largura nasce com a aba.
  return <div ref={ref}>{conteudo()}</div>;

  function conteudo() {
    if (invoices.length === 0) {
      return (
        <EstadoDaLista
          icone={FileText}
          titulo="Nenhuma nota enviada ainda"
          texto="As notas lançadas para este evento aparecem aqui para a análise do RH: aprovar, devolver para ajuste ou recusar, e depois o check-in financeiro."
          acao={onIrParaLancamento && (
            <button type="button" onClick={onIrParaLancamento} className={BOTAO_SAIDA}>
              Ir para Lançamento <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          testid="nf-aprovacao-vazio"
        />
      );
    }

    const getActual = (id: string | null) => budgetActuals.find(a => a.id === id);

    // Busca (nome, função, OC) — as contagens das pílulas contam sobre ela.
    const q = paraBusca(busca);
    const buscadas = q
      ? ordenadas.filter(i =>
          paraBusca(getName(i.collaboratorId)).includes(q)
          || paraBusca(getFuncName(i.functionId)).includes(q)
          || paraBusca(i.oc).includes(q))
      : ordenadas;

    const aprovCountFor = (id: string) => {
      if (id === "all") return buscadas.length;
      return buscadas.filter(i => getEffectiveStatus(i) === id).length;
    };
    const alertFor = (id: string): number => {
      if (id !== "enviada") return 0;
      return buscadas.filter(i => i.status === "enviada" && daysSince(i) > 3).length;
    };

    const filteredInvoices = filterStatus === "all"
      ? buscadas
      : buscadas.filter(i => getEffectiveStatus(i) === filterStatus);

    // Totais do pé: o MESMO conjunto da lista na tela (antes somavam o evento
    // inteiro ao lado de "Mostrando N de M" e os números não batiam).
    const temRecorte = filterStatus !== "all" || !!q;
    const totais = somarNotas(filteredInvoices, id => getActual(id)?.totalValue || 0);
    const resumo = `${temRecorte ? `Mostrando ${filteredInvoices.length} de ${invoices.length}` : invoices.length} ${invoices.length === 1 ? "nota" : "notas"}`;

    return (
      <div className="flex flex-col gap-3">
        <FilterPills filters={APROV_FILTERS} active={filterStatus} countFor={aprovCountFor} onChange={setFilterStatus} alertFor={alertFor} />

        {/* `overflow-clip` (e não `hidden`): `hidden` prendia o cabeçalho grudado. */}
        <div className="bg-card rounded-xl border border-border overflow-clip">
          {filteredInvoices.length === 0 ? (
            <EstadoDaLista
              moldura={false}
              icone={SearchX}
              titulo="Nenhuma nota neste recorte"
              texto={q ? <>Nada bate com “{busca.trim()}”{filterStatus !== "all" ? " nesta situação" : ""}. Ajuste a busca ou limpe os filtros.</> : "Nenhuma nota está nesta situação agora."}
              acao={
                <button type="button" onClick={() => { setFilterStatus("all"); onBusca?.(""); }} className={BOTAO_SAIDA} data-testid="nf-limpar-filtros">
                  Limpar filtros
                </button>
              }
              testid="nf-sem-resultado"
            />
          ) : (
            <div className={modoCartao ? "nf-tab-cartao" : "pas-tabela"}>
              <table className={`w-full text-left border-collapse ${modoCartao ? "" : "table-fixed"}`}>
                <caption className="sr-only">Notas fiscais: colaborador, evento, valor, competência e situação da nota</caption>
                {!modoCartao && (
                  <colgroup>
                    <col />
                    <col style={{ width: largo ? 160 : 120 }} />
                    <col style={{ width: largo ? 220 : 148 }} />
                    <col style={{ width: largo ? 160 : 104 }} />
                    <col style={{ width: largo ? 80 : 60 }} />
                    <col style={{ width: largo ? 340 : 316 }} />
                  </colgroup>
                )}
                <thead className="pas-cabecalho">
                  <tr>
                    <th scope="col" className={`${TH} pl-[19px]`}>Colaborador</th>
                    <th scope="col" className={`${TH} !text-right`}>Valor</th>
                    <th scope="col" className={TH}>OC</th>
                    <th scope="col" className={TH}>Nota</th>
                    <th scope="col" className={`${TH} px-1 text-center`}><span className="sr-only">Histórico</span></th>
                    <th scope="col" className={`${TH} pr-4 !text-right`}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => {
                    const actual   = getActual(inv.budgetActualId);
                    const name     = getName(inv.collaboratorId);
                    const effSt        = getEffectiveStatus(inv);
                    const cfg          = getStatusCfg(effSt);
                    const isActive     = active?.invId === inv.id;
                    const isHistOpen   = historyOpenId === inv.id;
                    const history      = buildHistory(inv, name);
                    // Realizado devolvido/rejeitado pausa a aprovação da NF até o reenvio
                    const actualBlocked = !!actual && (actual.rhStatus === "devolvido" || actual.rhStatus === "rejeitado");
                    const isTarget = !!highlightedId && inv.budgetActualId === highlightedId;

                    return (
                      <Fragment key={inv.id}>
                        <AprovacaoRow
                          inv={inv}
                          actual={actual}
                          name={name}
                          funcName={getFuncName(inv.functionId)}
                          effSt={effSt}
                          cfg={cfg}
                          activeType={isActive && active ? active.type : null}
                          isHistOpen={isHistOpen}
                          historyCount={history.length}
                          isTarget={isTarget}
                          actualBlocked={actualBlocked}
                          onOpenAction={openAction}
                          onToggleHistory={toggleHistory}
                        />

                        {/* Inline action panel */}
                        {isActive && active && (
                          <AprovacaoActionPanel
                            key={`${inv.id}-panel`}
                            inv={inv}
                            cfg={cfg}
                            type={active.type}
                            comment={comment}
                            setComment={setComment}
                            tocouMotivo={tocouMotivo}
                            setTocouMotivo={setTocouMotivo}
                            checkinDate={checkinDate}
                            setCheckinDate={setCheckinDate}
                            closeAction={closeAction}
                            approveMutation={approveMutation}
                            returnMutation={returnMutation}
                            rejectMutation={rejectMutation}
                            checkinMutation={checkinMutation}
                            nome={toTitleCase(name)}
                            valor={actual ? formatCurrency(actual.totalValue) : undefined}
                            colunas={COLUNAS}
                          />
                        )}

                        {/* History panel */}
                        {isHistOpen && (
                          <tr key={`${inv.id}-history`} className={`nf-painel-linha border-l-[3px] border-l-primary border-b border-border`}>
                            <td colSpan={COLUNAS} className="p-0">
                              <div className="nf-faixa nf-abre bg-surface-muted border-t border-border">
                                <HistoryPanel events={history} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <AprovacaoTotalsFooter
            approvedTotal={totais.aprovadas.valor}
            waitingTotal={totais.aguardando.valor}
            grandTotal={totais.total}
            nAprovadas={totais.aprovadas.n}
            nAguardando={totais.aguardando.n}
            doRecorte={temRecorte}
            resumo={filteredInvoices.length > 0 ? resumo : undefined}
          />
        </div>
      </div>
    );
  }
}
