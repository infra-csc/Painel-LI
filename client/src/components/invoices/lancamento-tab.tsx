// Extraído de invoices.tsx em 25/09 (modularização): aba "Lançamento" da tela
// de Notas Fiscais — lista os itens NF-elegíveis do Realizado com o envio da
// nota (ou a linha "Não emite NF"). Filtro de status vem da URL via página.
//
// 08/10 (redesenho): de uma pilha de cartões de 150px (três por tela) para
// uma lista em planilha — cabeçalho grudado, colunas alinhadas, OC e anexo nas
// próprias células, ~10 linhas por tela em 1366. Em ordem de nome (o banco
// devolvia em qualquer ordem e a linha "pulava" depois de cada envio); quem
// não emite NF vai para um grupo próprio no fim, em vez de abrir a lista.
// Busca por colaborador, função ou OC; rodapé com quantos e quanto somam.
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { FileClock, SearchX, ArrowRight, Info } from "lucide-react";
import type { BudgetActual, Event, Invoice } from "@shared/schema";
import { toTitleCase, formatarMoeda } from "@/lib/format";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { FilterPills } from "./filter-pills";
import { InvoiceCard } from "./invoice-card";
import { SemNfItem } from "./sem-nf-item";
import { getEffectiveStatus, getStatusCfg } from "./invoice-status";
import { paraBusca } from "./invoice-format";
import { EstadoDaLista, BOTAO_SAIDA } from "./estado-da-lista";
import type { AbaBaseProps } from "./types";

// ── Lançamento Tab ────────────────────────────────────────────────────────────
const LANC_FILTERS = [
  { id: "all",               label: "Todos" },
  { id: "pendente",          label: "Pendente",           dot: getStatusCfg("pendente").dot },
  { id: "enviada",           label: "Aguardando RH",      dot: getStatusCfg("enviada").dot },
  { id: "devolvida",         label: "Devolvida",          dot: getStatusCfg("devolvida").dot },
  { id: "recusada",          label: "NF recusada",        dot: getStatusCfg("recusada").dot },
  { id: "checkin-pendente",  label: "Aguard. check-in",   dot: getStatusCfg("checkin-pendente").dot },
  { id: "checkin-realizado", label: "Check-in realizado", dot: getStatusCfg("checkin-realizado").dot },
  { id: "sem-nf",            label: "Não emite NF",       dot: "bg-slate-300" },
];

/** Abaixo disto as sete colunas não cabem sem espremer — a linha vira cartão. */
const LARGURA_MINIMA_DA_PLANILHA = 1000;

export interface LancamentoTabProps extends AbaBaseProps {
  approvedActuals: BudgetActual[];
  emitsNfFor: (actual: BudgetActual) => boolean;
  getInvoice: (actualId: string) => Invoice | undefined;
  selectedEvent: Event | undefined;
}

/** Cabeçalho da planilha (as mesmas colunas de `.nf-grade`). */
function CabecalhoDaLista() {
  return (
    <div className="nf-cabecalho" aria-hidden="true">
      <div className="nf-grade">
        <div className="nf-th">Colaborador</div>
        <div className="nf-th text-right">Valor</div>
        <div className="nf-th">Situação</div>
        <div className="nf-th inline-flex items-center gap-1" title="OCs repetidas no evento devem usar o mesmo anexo.">
          Número OC <Info className="w-3 h-3 opacity-70" />
        </div>
        <div className="nf-th">Nota fiscal</div>
        <div className="nf-th" />
        <div className="nf-th" />
      </div>
    </div>
  );
}

// Filtro de status controlado pela página (vive na URL desde 23/09).
export function LancamentoTab({ approvedActuals, emitsNfFor, getInvoice, getName, getFuncName, selectedEvent, selectedEventId, qc, toast, filterStatus, onFilterStatus, highlightActualId, busca = "", onBusca }: LancamentoTabProps) {
  const setFilterStatus = onFilterStatus;
  const [highlightedId, setHighlightedId] = useState<string>(highlightActualId || "");
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  const modoCartao = largura !== null && largura < LARGURA_MINIMA_DA_PLANILHA;

  // When highlightActualId arrives, update and clear after animation
  useEffect(() => {
    if (highlightActualId) {
      setHighlightedId(highlightActualId);
      const timer = setTimeout(() => setHighlightedId(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightActualId]);

  // Scroll to the highlighted card — retries until element appears in DOM (data may load async)
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
  }, [highlightedId, filterStatus, approvedActuals?.length]);

  function getEffStatus(actual: BudgetActual) {
    if (!emitsNfFor(actual)) return "sem-nf"; // definido na escalação
    return getEffectiveStatus(getInvoice(actual.id));
  }

  // Ordem de nome (pt-BR): estável — enviar uma nota não move a linha.
  const ordenados = useMemo(() => [...approvedActuals].sort((a, b) =>
    toTitleCase(getName(a.collaboratorId)).localeCompare(toTitleCase(getName(b.collaboratorId)), "pt-BR")),
  [approvedActuals, getName]);

  // Busca (nome, função, OC) — as contagens das pílulas contam sobre ela.
  const q = paraBusca(busca);
  const buscados = q
    ? ordenados.filter(a =>
        paraBusca(getName(a.collaboratorId)).includes(q)
        || paraBusca(getFuncName(a.functionId)).includes(q)
        || paraBusca(getInvoice(a.id)?.oc).includes(q))
    : ordenados;

  const countFor = (id: string) =>
    id === "all"
      ? buscados.length
      : buscados.filter(a => getEffStatus(a) === id).length;

  const filtered = filterStatus === "all"
    ? buscados
    : buscados.filter(a => getEffStatus(a) === filterStatus);

  // Um invólucro só, montado sempre: a medida da largura nasce com a aba e
  // continua valendo quando a lista troca de vazia para cheia.
  return <div ref={ref}>{conteudo()}</div>;

  function conteudo() {
  if (approvedActuals.length === 0) {
    return (
      <EstadoDaLista
        icone={FileClock}
        titulo="Nada para lançar neste evento ainda"
        texto="O lançamento de notas é liberado assim que o Realizado do colaborador é enviado. Itens devolvidos ou rejeitados ficam pausados até a regularização."
        acao={
          <Link href="/budget-actual" className={BOTAO_SAIDA}>
            Abrir o Realizado <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        }
        testid="nf-lancamento-vazio"
      />
    );
  }

  const emitem = filtered.filter(a => emitsNfFor(a));
  const naoEmitem = filtered.filter(a => !emitsNfFor(a));
  const soma = filtered.reduce((s, a) => s + (a.totalValue || 0), 0);
  const temRecorte = filterStatus !== "all" || !!q;

  return (
    <div className="flex flex-col gap-3">
      <FilterPills filters={LANC_FILTERS} active={filterStatus} countFor={countFor} onChange={setFilterStatus} />

      <div className="rounded-xl border border-border bg-card overflow-clip">
        {filtered.length === 0 ? (
          <EstadoDaLista
            moldura={false}
            icone={SearchX}
            titulo="Nenhum item neste recorte"
            texto={q ? <>Nada bate com “{busca.trim()}”{filterStatus !== "all" ? " nesta situação" : ""}. Ajuste a busca ou limpe os filtros.</> : "Nenhum item está nesta situação agora."}
            acao={
              <button
                type="button"
                onClick={() => { setFilterStatus("all"); onBusca?.(""); }}
                className={BOTAO_SAIDA}
                data-testid="nf-limpar-filtros"
              >
                Limpar filtros
              </button>
            }
            testid="nf-sem-resultado"
          />
        ) : (
          <div className={modoCartao ? "nf-cartoes" : "nf-planilha"}>
            {!modoCartao && <CabecalhoDaLista />}
            <div role="list" aria-label="Notas fiscais por colaborador">
              {emitem.map(actual => (
                <InvoiceCard
                  key={actual.id}
                  actual={actual}
                  invoice={getInvoice(actual.id)}
                  getName={getName}
                  getFuncName={getFuncName}
                  selectedEvent={selectedEvent}
                  selectedEventId={selectedEventId}
                  qc={qc}
                  toast={toast}
                  destacado={actual.id === highlightedId}
                />
              ))}
            </div>
            {naoEmitem.length > 0 && (
              <>
                {/* Quem não emite NF (definido na escalação): um grupo próprio, no fim. */}
                {emitem.length > 0 && (
                  <div className="nf-grupo" id="nf-grupo-sem-nf">
                    Não emitem nota fiscal
                    <span className="font-normal normal-case tracking-normal text-muted-foreground"> · {naoEmitem.length} · definido na escalação</span>
                  </div>
                )}
                <div role="list" aria-label="Itens que não emitem nota fiscal">
                  {naoEmitem.map(actual => (
                    <SemNfItem key={actual.id} actual={actual} getName={getName} getFuncName={getFuncName} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Rodapé: o que está na tela e quanto soma. */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-h-10 px-4 py-2 bg-surface-muted border-t border-border">
            <p className="m-0 text-xs text-slate-600 tabular-nums" data-testid="nf-rodape-lancamento" aria-live="polite">
              {temRecorte ? `Mostrando ${filtered.length} de ${approvedActuals.length}` : `${approvedActuals.length}`}{" "}
              {approvedActuals.length === 1 ? "item" : "itens"} do Realizado
              {naoEmitem.length > 0 && emitem.length > 0 ? ` · ${naoEmitem.length} sem nota` : ""}
            </p>
            <p className="m-0 sm:ml-auto text-xs text-slate-600 tabular-nums">
              {temRecorte ? "Soma do recorte" : "Soma"}: <span className="font-semibold text-foreground">{formatarMoeda(soma)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
  }
}
