// Extraído de rh-control.tsx em 25/09 (modularização); redesenho 08/10.
//
// Topo do Controle RH. Antes: quatro cartões de métrica com faixa colorida e
// número de 36px, uma legenda "as categorias se sobrepõem", e embaixo uma
// faixa laranja "N pendências aguardando ação do RH" com atalhos sublinhados,
// barra de progresso e o CTA "Ver pendências" — três blocos dizendo quase a
// mesma coisa (~330px antes do primeiro item).
//
// Agora é a MESMA anatomia do Planejado, do Realizado e do Comparativo:
//  - `ResumoDoRh` — o painel de resumo (pla-resumo): o progresso geral da
//    fila e o que o RH tem para fazer, por tipo (planejar, analisar, aprovar
//    NF, check-in). Cada número é também o atalho que recorta a lista
//    (eram os links da faixa laranja); reclicar desliga.
//  - `FilaDoRh` — a fila de trabalho comum (FilaDeTrabalho): os quatro
//    recortes de antes (Aguardando RH, colaborador, Nota fiscal, Concluídos),
//    que contam E filtram no servidor; reclicar desliga.
// Os números são os mesmos de antes, das mesmas fontes (contadores do servidor).
import type { LucideIcon } from "lucide-react";
import { CheckCircle, CircleDot, ClipboardList, Clock, FileText, Scale, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { PrestacaoStatus } from "./prestacao-types";
import type { InvoiceCounts } from "./use-rh-control-data";
import type { RhFiltros } from "./use-rh-filtros";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** As seis etapas do processo — a legenda que antes era o subtítulo colorido. */
const ETAPAS_DO_PROCESSO = ["Escalação", "Planejado", "Realizado", "Aprovação", "Nota fiscal", "Check-in"];

/** Leva a lista para a vista depois de recortar (só se ela estiver fora da tela). */
export function irParaLista() {
  setTimeout(() => {
    const el = document.getElementById("rh-listing");
    if (!el) return;
    const topo = el.getBoundingClientRect().top;
    if (topo >= 0 && topo < window.innerHeight * 0.6) return;
    const reduz = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "start" });
  }, 100);
}

function Atalho({ icone: Icone, rotulo, n, sub, ativo, onClick, dica, testid }: {
  icone: LucideIcon; rotulo: string; n: number; sub: string; ativo: boolean; onClick: () => void; dica: string; testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={ativo ? "Clique para tirar este recorte" : dica}
      className={cn(
        "pla-metrica crh-atalho group relative min-w-0 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        ativo ? "bg-brand-soft" : "hover:bg-surface-muted",
      )}
      data-testid={testid}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", ativo ? "scale-x-100" : "scale-x-0")} />
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Icone className={cn("w-3.5 h-3.5 shrink-0", n > 0 ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        <span className={cn("truncate", ativo && "text-primary")}>{rotulo}</span>
      </span>
      <span className={cn("block mt-1 text-base sm:text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums", n > 0 ? "text-foreground" : "text-muted-foreground")}>{n}</span>
      <span className="block text-2xs sm:text-xs text-muted-foreground truncate">{sub}</span>
    </button>
  );
}

export interface ResumoDoRhProps {
  /** `contadores.status` do servidor — sobre todas as linhas do recorte de evento. */
  statusCounts: Record<string, number>;
  invoiceCounts: InvoiceCounts;
  concludedCount: number;
  totalForProgress: number;
  progressPct: number;
  filtros: RhFiltros;
}

/** Painel de resumo: progresso geral e o trabalho do RH por tipo (cada número recorta a lista). */
export function ResumoDoRh({ statusCounts, invoiceCounts, concludedCount, totalForProgress, progressPct, filtros: f }: ResumoDoRhProps) {
  const rhPlan = statusCounts.planejamento_pendente || 0;
  const rhComp = statusCounts.prestacao_recebida || 0;
  const rhNf = invoiceCounts.enviada;
  const chk = invoiceCounts.checkinPending || 0;
  const recusada = statusCounts.recusada || 0;
  const completo = totalForProgress > 0 && concludedCount >= totalForProgress;

  // Os atalhos da antiga faixa "pendências do RH", agora com volta (reclicar tira o recorte).
  const porStatus = (s: PrestacaoStatus) => () => {
    if (f.filterStatus === s) { f.setFilterStatus("all"); return; }
    f.setFilterStatus(s); f.setFilterCheckinOnly(false); irParaLista();
  };
  const porNf = () => {
    if (f.filterInvoiceStatus === "enviada") { f.setFilterInvoiceStatus("all"); return; }
    f.setFilterInvoiceStatus("enviada"); f.setFilterStatus("all"); f.setFilterCheckinOnly(false); irParaLista();
  };
  const porCheckin = () => {
    if (f.filterCheckinOnly) { f.setFilterCheckinOnly(false); return; }
    f.setFilterCheckinOnly(true); f.setFilterStatus("all"); irParaLista();
  };

  return (
    <section aria-label="Resumo do Controle RH" className="pla-resumo pla-resumo-medido rounded-xl border border-border bg-card overflow-hidden" data-testid="rh-resumo">
      <div className="pla-resumo-grade">
        {/* O número da tela: quanto da fila já chegou ao fim. */}
        <div className="pla-resumo-total min-w-0 px-4 pt-3.5 pb-3">
          <p className="m-0 text-xs font-medium text-slate-600">Progresso geral</p>
          <p className="m-0 mt-0.5 flex items-baseline gap-2 tabular-nums">
            <span className="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-primary" data-testid="rh-progresso-concluidos">{concludedCount}</span>
            <span className="text-sm text-muted-foreground">de {plural(totalForProgress, "prestação", "prestações")}</span>
          </p>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span
              role="progressbar"
              aria-label="Prestações concluídas (nota aprovada e check-in feito)"
              aria-valuemin={0}
              aria-valuemax={totalForProgress}
              aria-valuenow={concludedCount}
              className="relative flex-1 max-w-[220px] h-1.5 rounded-full bg-border overflow-hidden"
            >
              <span className="pla-progresso absolute inset-y-0 left-0 rounded-full bg-success-strong" style={{ width: `${progressPct}%` }} />
            </span>
            <span className={cn("text-xs tabular-nums whitespace-nowrap", completo ? "text-success font-semibold" : "text-muted-foreground")}
              title="Concluída = nota fiscal aprovada e check-in financeiro feito. Fora da conta: recusadas, quem não participou, quem não emite NF e NF recusada.">
              {progressPct}% concluídas
            </span>
          </div>
        </div>
        <Atalho icone={ClipboardList} rotulo="Planejar" n={rhPlan} sub={rhPlan ? (rhPlan === 1 ? "planejamento pendente" : "planejamentos pendentes") : "nada a planejar"}
          ativo={f.filterStatus === "planejamento_pendente"} onClick={porStatus("planejamento_pendente")}
          dica="Escalação confirmada — o RH cria o planejamento de valores. Clique para ver só esses itens." testid="rh-atalho-planejar" />
        <Atalho icone={Scale} rotulo="Analisar" n={rhComp} sub={rhComp ? (rhComp === 1 ? "comparativo recebido" : "comparativos recebidos") : "nada a analisar"}
          ativo={f.filterStatus === "prestacao_recebida"} onClick={porStatus("prestacao_recebida")}
          dica="Realizado recebido — o RH analisa o comparativo. Clique para ver só esses itens." testid="rh-atalho-analisar" />
        <Atalho icone={FileText} rotulo="Aprovar NF" n={rhNf} sub={rhNf ? (rhNf === 1 ? "nota enviada" : "notas enviadas") : "nenhuma nota enviada"}
          ativo={f.filterInvoiceStatus === "enviada"} onClick={porNf}
          dica="Notas fiscais enviadas pelo colaborador, à espera da aprovação do RH. Clique para ver só essas." testid="rh-atalho-nf" />
        <Atalho icone={CircleDot} rotulo="Check-in" n={chk} sub={chk ? (chk === 1 ? "nota aprovada sem check-in" : "notas aprovadas sem check-in") : "nenhum pendente"}
          ativo={f.filterCheckinOnly} onClick={porCheckin}
          dica="Nota aprovada — falta o Check-in Financeiro (define a data de pagamento). Clique para ver só esses." testid="rh-atalho-checkin" />
      </div>

      {/* O processo, da escalação ao check-in (a legenda que era o subtítulo). */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-2.5 border-t border-border bg-surface-muted/60">
        <ol className="m-0 p-0 list-none max-sm:hidden flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0" aria-label="Etapas da prestação de contas">
          {ETAPAS_DO_PROCESSO.map((e, i) => (
            <li key={e} className="flex items-center gap-1.5 text-xs text-slate-600">
              {i > 0 && <span aria-hidden="true" className="text-muted-foreground">›</span>}
              {e}
            </li>
          ))}
        </ol>
        <p className="m-0 md:ml-auto text-xs text-muted-foreground">
          {recusada > 0 && <span className="text-danger">{plural(recusada, "recusada", "recusadas")} · </span>}
          Um item pode estar em mais de um número — as etapas se sobrepõem.
        </p>
      </div>
    </section>
  );
}

const CARD_FILTROS = ["rh_action", "col_action", "nf_andamento", "concluidos"] as const;
type CardFiltro = (typeof CARD_FILTROS)[number];

export interface FilaDoRhProps {
  statusCounts: Record<string, number>;
  invoiceCounts: InvoiceCounts;
  rhActionCount: number;
  concludedCount: number;
  totalForProgress: number;
  filtros: RhFiltros;
}

/** Os quatro recortes de antes (os "cards"): contam e filtram no servidor; reclicar desliga. */
export function FilaDoRh({ statusCounts, invoiceCounts, rhActionCount, concludedCount, totalForProgress, filtros }: FilaDoRhProps) {
  const { filterStatus, setFilterFunction, setFilterCollaborator, setFilterInvoiceStatus, setSearchTerm, setFilterCheckinOnly, setShowConcluded, setFilterStatus } = filtros;

  const rhPlan = statusCounts.planejamento_pendente || 0;
  const rhComp = statusCounts.prestacao_recebida || 0;
  const rhNf = invoiceCounts.enviada;
  const chk = invoiceCounts.checkinPending || 0; // NF aprovada, check-in do RH pendente
  // Itens únicos (rhActionCount) — as sublinhas se sobrepõem e somariam a mais
  const rhTotal = rhActionCount;

  const colReal = (statusCounts.aguardando_prestacao || 0) + (statusCounts.devolvida_para_ajuste || 0);
  const colNfDev = invoiceCounts.devolvida;
  // NF ainda não lançada pelo colaborador — "Aguardando lançamento" na tela de NFs
  const colNfPend = invoiceCounts.pending;
  const colTotal = colReal + colNfDev + colNfPend;

  // "Em andamento" = realizados na etapa de NF (o check-in fica em Aguardando RH)
  const nfAgNf = invoiceCounts.pending;
  const nfAnalise = invoiceCounts.enviada;
  const nfDevNf = invoiceCounts.devolvida;
  const emAndamento = nfAgNf + nfAnalise + nfDevNf;
  const recusada = statusCounts.recusada || 0;

  // O recorte troca a situação e limpa os filtros finos (como os cards de antes).
  // 08/10: o EVENTO fica — os números são do evento escolhido na barra; trocar
  // para "todos" ao clicar mostrava uma lista maior que o número do bloco.
  const escolher = (k: CardFiltro | null) => {
    setFilterFunction("all");
    setFilterCollaborator("all");
    setFilterInvoiceStatus("all");
    setSearchTerm("");
    setFilterCheckinOnly(false);
    setShowConcluded(false);
    setFilterStatus(k ?? "all");
    if (k) irParaLista();
  };

  const blocos: BlocoDaFilaDeTrabalho<CardFiltro>[] = [
    { key: "rh_action", rotulo: "Aguardando RH", n: rhTotal, sub: rhTotal ? "com o RH" : "nada com o RH", icone: ShieldAlert, cor: rhTotal ? "text-danger" : "text-muted-foreground",
      titulo: `Planejamento ${rhPlan} · Comparativo ${rhComp} · Nota fiscal ${rhNf}${chk ? ` · Check-in ${chk}` : ""} — itens únicos (as etapas se sobrepõem)` },
    { key: "col_action", rotulo: "Aguardando colaborador", n: colTotal, sub: colTotal ? `${colReal} realizado${colReal === 1 ? "" : "s"} · ${colNfDev + colNfPend} nota${colNfDev + colNfPend === 1 ? "" : "s"}` : "ninguém pendente", icone: Users, cor: "text-primary",
      titulo: `Realizado ${colReal} · NF devolvida ${colNfDev} · Aguardando lançamento ${colNfPend}` },
    { key: "nf_andamento", rotulo: "Nota fiscal", n: emAndamento, sub: emAndamento ? `${nfAnalise} em análise` : "nenhuma em andamento", icone: Clock, cor: "text-warning",
      titulo: `Ag. envio ${nfAgNf} · Em análise ${nfAnalise} · NF devolvida ${nfDevNf}` },
    { key: "concluidos", rotulo: "Concluídos", n: concludedCount, sub: `de ${totalForProgress}${recusada ? ` · ${plural(recusada, "recusado", "recusados")}` : ""}`, icone: CheckCircle, cor: "text-success",
      titulo: `${concludedCount} de ${totalForProgress} concluídos (NF aprovada e check-in feito)${recusada ? ` · ${plural(recusada, "recusado", "recusados")}` : ""}` },
  ];

  const ativa = (CARD_FILTROS as readonly string[]).includes(filterStatus) ? (filterStatus as CardFiltro) : null;
  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={ativa}
      onEscolher={escolher}
      rotulo="Fila do Controle RH"
      testid={(k) => `rh-fila-${k}`}
    />
  );
}
