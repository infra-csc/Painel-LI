// Extraído de rh-control.tsx em 25/09 (modularização); redesenho 08/10.
//
// A linha da prestação na fila do Controle RH. Antes: avatar colorido, nome,
// badge, alerta de prazo e, à direita, uma fileira de chips e botões que
// mudava de lugar a cada status (e sumia quando o cartão abria).
//
// Agora é uma linha de TABELA, nas mesmas colunas para todo item — lê-se de
// relance: Colaborador (função · tipo) · Etapa · Prazo · Valor · Nota fiscal ·
// Próxima ação · abrir. A próxima ação é UMA só e fica sempre à vista:
// Planejar / Analisar (o que é do RH), Aprovar NF, Check-in — ou, quando a bola
// está com outra pessoa, com quem ela está. A aprovação de NF continua inline
// (sem data — a data de pagamento entra no Check-in Financeiro), agora num
// popover ancorado no botão em vez de empurrar a linha.
// Regras, chamadas e textos de toast: os mesmos de antes.
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AlertTriangle, ChevronDown, CircleDot, Loader2, RotateCcw } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { useToast } from "@/hooks/use-toast";
import { PopoverContent } from "@/components/ui/popover";
import type { NotaParaControle, PrestacaoItem } from "./prestacao-types";
import type { StatusConfigEntry } from "./status-config";
import { CHAVE_CONTROLE_RH, prazoDaLinha, type NavigationTarget } from "./prestacao-utils";

export type ToastFn = ReturnType<typeof useToast>["toast"];

const dataCurta = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

/** Selo da etapa: para os aprovados, a etapa É a da nota fiscal / check-in. */
export function seloDaEtapa(item: PrestacaoItem, config: StatusConfigEntry, nfStatus: string, hasCheckin: boolean, itemEmitsNf: boolean): { texto: string; cls: string } {
  if (item.status !== "aprovada_faturamento") return { texto: config.shortLabel, cls: config.badgeCls };
  if (nfStatus === "aprovada" && hasCheckin) return { texto: "Concluído", cls: "bg-success-soft text-success border-success/25" };
  if (nfStatus === "aprovada") return { texto: "Ag. Check-in", cls: "bg-brand-soft text-primary border-primary/25" };
  if (nfStatus === "enviada") return { texto: "NF em análise", cls: "bg-brand-soft text-primary border-primary/25" };
  if (nfStatus === "devolvida") return { texto: "NF devolvida", cls: "bg-warning-soft text-warning border-warning/25" };
  if (nfStatus === "recusada") return { texto: "NF recusada", cls: "bg-danger-soft text-danger border-danger/25" };
  if (!itemEmitsNf) return { texto: "Não emite NF", cls: "bg-muted text-muted-foreground border-border" };
  return { texto: "Ag. nota fiscal", cls: "bg-warning-soft text-warning border-warning/25" };
}

/** Aprovar NF com confirmação num popover ancorado no botão (mesma chamada de antes). */
function AprovarNf({ nf, colName, valor, forte, approvingInvoiceId, nfApproving, setApprovingInvoiceId, setNfApproving, toast }: {
  nf: NotaParaControle | undefined;
  colName: string;
  valor: number | null;
  /** Ação forte da linha (botão cheio) ou atalho discreto na coluna da nota. */
  forte: boolean;
  approvingInvoiceId: string | null;
  nfApproving: boolean;
  setApprovingInvoiceId: (id: string | null) => void;
  setNfApproving: (v: boolean) => void;
  toast: ToastFn;
}) {
  const aberto = !!nf?.id && approvingInvoiceId === nf.id;
  const aprovar = async () => {
    if (!nf?.id) return;
    setNfApproving(true);
    try {
      await apiRequest("POST", `/api/invoices/${nf.id}/approve`, {});
      // A fila vem do endpoint agregado; a chave global de notas continua para a tela de Notas Fiscais.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] }),
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }),
      ]);
      setApprovingInvoiceId(null);
      toast({ title: "Nota aprovada!", description: "Faça o Check-in Financeiro para definir a data de pagamento." });
    } catch (err) {
      toast({ title: "Erro ao aprovar nota", description: apiErrorMessage(err, "Tente novamente"), variant: "destructive" });
    } finally {
      setNfApproving(false);
    }
  };
  return (
    <PopoverPrimitive.Root open={aberto} onOpenChange={(o) => { if (!o && !nfApproving) setApprovingInvoiceId(null); }}>
      {/* Âncora, e não Trigger: o gatilho do Radix poria aria-expanded no botão,
          e o único "expandir" da linha é o chevron. */}
      <PopoverPrimitive.Anchor asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setApprovingInvoiceId(aberto ? null : nf?.id || null); }}
          className={cn(
            "pas-alvo crh-acao inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            forte ? "crh-acao-forte px-3" : "px-2.5 border border-primary/30 bg-card text-primary hover:bg-brand-soft",
            aberto && "ring-2 ring-primary/30",
          )}
        >
          Aprovar NF
        </button>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        align="end"
        side="bottom"
        collisionPadding={12}
        className="w-[300px] p-0 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onEscapeKeyDown={(e) => { if (nfApproving) e.preventDefault(); }}
      >
        <div className="px-4 pt-3.5 pb-3">
          <p className="m-0 text-sm font-semibold text-foreground">Aprovar esta nota?</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
            Nota de <span className="font-medium text-foreground">{colName}</span>
            {valor !== null && <> · <span className="tabular-nums">{formatarMoeda(valor)}</span></>}
            {nf?.oc && <> · {/^oc/i.test(nf.oc) ? nf.oc : `OC ${nf.oc}`}</>}. A data de pagamento entra depois, no Check-in Financeiro.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border bg-surface-muted/60">
          <button
            type="button"
            aria-label="Cancelar aprovação"
            disabled={nfApproving}
            onClick={() => setApprovingInvoiceId(null)}
            className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-slate-700 hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={nfApproving}
            onClick={aprovar}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {nfApproving && <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {nfApproving ? "Aprovando…" : "Confirmar"}
          </button>
        </div>
      </PopoverContent>
    </PopoverPrimitive.Root>
  );
}

export interface CartaoPrestacaoLinhaProps {
  item: PrestacaoItem;
  config: StatusConfigEntry;
  isExpanded: boolean;
  isResubmitted: boolean | null | undefined;
  navTarget: NavigationTarget | null;
  needsRhAction: boolean;
  colName: string;
  nfEligible: boolean;
  nfInvCard: NotaParaControle | undefined;
  nfStatus: string;
  hasCheckin: boolean;
  itemEmitsNf: boolean;
  canRh: boolean;
  approvingInvoiceId: string | null;
  nfApproving: boolean;
  setApprovingInvoiceId: (id: string | null) => void;
  setNfApproving: (v: boolean) => void;
  toast: ToastFn;
  navigate: (path: string) => void;
  toggleExpand: (id: string) => void;
}

export function CartaoPrestacaoLinha({
  item, config, isExpanded, isResubmitted, navTarget, needsRhAction, colName,
  nfEligible, nfInvCard, nfStatus, hasCheckin, itemEmitsNf, canRh,
  approvingInvoiceId, nfApproving, setApprovingInvoiceId, setNfApproving, toast,
  navigate, toggleExpand,
}: CartaoPrestacaoLinhaProps) {
  const selo = seloDaEtapa(item, config, nfStatus, hasCheckin, itemEmitsNf);
  const prazo = prazoDaLinha(item);

  // Valor: o realizado quando existe; senão o planejado (é o que a prestação vale hoje).
  const valor = item.actual?.totalValue ?? item.planned?.totalValue ?? null;
  const dif = item.actual && item.planned ? item.actual.totalValue - item.planned.totalValue : 0;
  const naoParticipou = !!(item.planned?.didNotAttend || item.actual?.didNotAttend);

  // A NF desta linha (a mesma elegibilidade de antes: só com o Realizado enviado).
  const comNota = nfEligible && !!item.actual;
  const nfEnviadaRh = comNota && nfStatus === "enviada" && canRh;
  const checkinPendente = item.status === "aprovada_faturamento" && !!item.actual && nfStatus === "aprovada" && !hasCheckin && canRh;
  // UMA ação forte por linha, na ordem do trabalho do RH.
  const acao: "planejar" | "analisar" | "aprovar_nf" | "checkin" | null =
    needsRhAction && navTarget ? (item.status === "prestacao_recebida" ? "analisar" : "planejar")
    : nfEnviadaRh ? "aprovar_nf"
    : checkinPendente ? "checkin"
    : null;

  // Com quem está a bola quando não é com o RH (o que antes era o rótulo "Ag. colaborador"/"Devolvida").
  const responsavel = item.responsavelAtual && !["RH", "Concluído"].includes(item.responsavelAtual) ? toTitleCase(item.responsavelAtual) : null;
  const comQuem: { texto: string; sub?: string; tom: string } | null =
    acao ? null
    : item.status === "aguardando_prestacao" ? { texto: "Com o responsável", sub: responsavel ?? "preencher o realizado", tom: "text-slate-600" }
    : item.status === "devolvida_para_ajuste" ? { texto: "Devolvida ao responsável", sub: responsavel ?? "corrigir e reenviar", tom: "text-warning" }
    : comNota && nfStatus === "pendente" && itemEmitsNf ? { texto: "Com o colaborador", sub: "enviar a nota fiscal", tom: "text-slate-600" }
    : comNota && nfStatus === "devolvida" ? { texto: "Com o colaborador", sub: "corrigir a nota", tom: "text-warning" }
    : comNota && nfStatus === "enviada" ? { texto: "Com o RH", sub: "nota em análise", tom: "text-slate-600" }
    : null;

  const nfAprovadaEm = nfInvCard?.paymentDate ? dataCurta(nfInvCard.paymentDate) : nfInvCard?.approvedAt ? dataCurta(nfInvCard.approvedAt) : "";

  return (
    // 28/09: a linha NÃO é role="button" (havia botões reais dentro). O
    // expandir de teclado é o chevron; o clique na área livre abre com o mouse.
    <div className="crh-topo" onClick={() => toggleExpand(item.id)}>
      {/* Colaborador · função · tipo */}
      <div className="crh-c-colab min-w-0">
        <h4 className="m-0 flex items-center gap-1.5 min-w-0 text-sm font-semibold leading-5 text-foreground">
          <span className="truncate">{colName}</span>
          {isResubmitted && (
            <span className="inline-flex items-center gap-0.5 shrink-0 h-[18px] px-1.5 rounded text-2xs font-medium bg-brand-soft text-primary" title="O responsável corrigiu e reenviou o realizado">
              <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />Reenviado
            </span>
          )}
        </h4>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground truncate">
          {item.functionName ?? "-"}
          {item.planned?.collaboratorType && (
            <span className="ml-1">· {item.planned.collaboratorType === "casa" ? "Casa" : "Freela"}</span>
          )}
        </p>
      </div>

      {/* Etapa */}
      <div className="crh-c-etapa min-w-0">
        <span className={cn("inline-flex items-center h-[22px] px-2 rounded-md border text-2xs font-semibold whitespace-nowrap", selo.cls)}>{selo.texto}</span>
      </div>

      {/* Prazo */}
      <div className="crh-c-prazo min-w-0" data-rotulo="Prazo">
        {prazo ? (
          <span className={cn("inline-flex items-start gap-1 text-xs leading-4", prazo.tom === "perigo" ? "text-danger font-medium" : prazo.tom === "atencao" ? "text-warning font-medium" : "text-muted-foreground")}>
            {prazo.alerta && <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span>{prazo.texto}</span>
          </span>
        ) : <span className="text-xs text-muted-foreground" aria-label="Sem prazo">—</span>}
      </div>

      {/* Valor */}
      <div className="crh-c-valor crh-num min-w-0" data-rotulo="Valor">
        {valor !== null ? (
          <span className="flex flex-col items-end leading-tight">
            <span className={cn("text-sm font-semibold tabular-nums", naoParticipou ? "text-muted-foreground line-through decoration-1" : "text-foreground")}>{formatarMoeda(valor)}</span>
            <span className="text-2xs text-muted-foreground tabular-nums whitespace-nowrap">
              {naoParticipou ? "não participou"
                : item.actual ? (dif !== 0 ? <span className={dif > 0 ? "text-danger" : "text-success"}>{dif > 0 ? "+" : "−"}{formatarMoeda(Math.abs(dif))} do planejado</span> : "realizado")
                : "planejado"}
            </span>
          </span>
        ) : <span className="text-xs text-muted-foreground">sem planejado</span>}
      </div>

      {/* Nota fiscal */}
      <div className="crh-c-nf min-w-0" data-rotulo="Nota fiscal">
        {!comNota ? (
          !itemEmitsNf ? <span className="text-xs text-muted-foreground" title="Definido na escalação">Não emite</span>
          : item.status === "devolvida_para_ajuste" ? <span className="text-xs text-muted-foreground" title="NF pausada — Realizado devolvido para ajuste">Pausada</span>
          : item.status === "recusada" ? <span className="text-xs text-muted-foreground">—</span>
          : <span className="text-xs text-muted-foreground" title="A nota é liberada com o envio do realizado">Após o realizado</span>
        ) : nfStatus === "enviada" && canRh && acao !== "aprovar_nf" ? (
          <span onClick={(e) => e.stopPropagation()}>
            <AprovarNf nf={nfInvCard} colName={colName} valor={valor} forte={false} approvingInvoiceId={approvingInvoiceId} nfApproving={nfApproving} setApprovingInvoiceId={setApprovingInvoiceId} setNfApproving={setNfApproving} toast={toast} />
          </span>
        ) : (
          <span className="flex flex-col leading-tight min-w-0">
            <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium",
              nfStatus === "aprovada" ? "text-success"
              : nfStatus === "enviada" ? "text-primary"
              : nfStatus === "devolvida" ? "text-warning"
              : nfStatus === "recusada" ? "text-danger"
              : !itemEmitsNf ? "text-muted-foreground"
              : "text-warning")}>
              <span aria-hidden="true" className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                nfStatus === "aprovada" ? "bg-success-strong"
                : nfStatus === "enviada" ? "bg-primary"
                : nfStatus === "devolvida" ? "bg-warning-strong"
                : nfStatus === "recusada" ? "bg-danger-strong"
                : !itemEmitsNf ? "bg-border"
                : "bg-warning-strong")} />
              {nfStatus === "aprovada" ? "Aprovada"
                : nfStatus === "enviada" ? "Em análise"
                : nfStatus === "devolvida" ? "Devolvida"
                : nfStatus === "recusada" ? "Recusada"
                : !itemEmitsNf ? "Não emite"
                : "Aguardando envio"}
            </span>
            {nfStatus === "aprovada" && nfAprovadaEm && (
              <span className="mt-0.5 pl-3 text-2xs text-muted-foreground tabular-nums">{nfInvCard?.paymentDate ? "pag." : "em"} {nfAprovadaEm}</span>
            )}
          </span>
        )}
      </div>

      {/* Próxima ação */}
      <div className="crh-c-acao min-w-0">
        {(acao === "planejar" || acao === "analisar") && navTarget && (
          <button
            type="button"
            className="pas-alvo crh-acao crh-acao-forte inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            onClick={(e) => { e.stopPropagation(); navigate(navTarget.path); }}
            title={navTarget.label}
          >
            {acao === "analisar" ? "Analisar" : "Planejar"}
          </button>
        )}
        {acao === "aprovar_nf" && (
          <span onClick={(e) => e.stopPropagation()}>
            <AprovarNf nf={nfInvCard} colName={colName} valor={valor} forte approvingInvoiceId={approvingInvoiceId} nfApproving={nfApproving} setApprovingInvoiceId={setApprovingInvoiceId} setNfApproving={setNfApproving} toast={toast} />
          </span>
        )}
        {acao === "checkin" && (
          <button
            type="button"
            className="pas-alvo crh-acao crh-acao-forte inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            onClick={(e) => { e.stopPropagation(); navigate(`/invoices?event=${item.event.id}&tab=aprovacao&filter=checkin-pendente&actual=${item.actual?.id || ""}`); }}
            title="Fazer o Check-in Financeiro na tela de Notas fiscais"
          >
            <CircleDot className="w-3.5 h-3.5" aria-hidden="true" />Check-in
          </button>
        )}
        {comQuem && (
          <span className="flex flex-col leading-tight min-w-0">
            <span className={cn("text-xs font-medium truncate", comQuem.tom)}>{comQuem.texto}</span>
            {comQuem.sub && <span className="text-2xs text-muted-foreground truncate">{comQuem.sub}</span>}
          </span>
        )}
      </div>

      {/* Abrir */}
      <div className="crh-c-abrir">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Recolher" : "Expandir"} prestação de ${colName}`}
          onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
          className="pas-alvo inline-flex w-8 h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform duration-200 motion-reduce:transition-none", isExpanded && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
