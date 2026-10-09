// Extraído de rh-control.tsx em 25/09 (modularização); redesenho 08/10.
//
// Corpo da prestação aberta. Antes: quatro caixas empilhadas com sombra (o
// stepper num cartão, uma faixa cinza Planejado → Realizado, o detalhamento
// em duas colunas, a faixa verde do check-in com emoji, o comentário) e um
// rodapé de botões coloridos que repetiam a ação da linha.
//
// Agora é um extrato que continua a linha: o trilho das seis etapas (com as
// datas), e embaixo duas colunas — à esquerda Planejado × Realizado (a
// diferença com sinal e %, e "Ver detalhes" abre diárias, alimentação e
// mobilidade lado a lado, com a justificativa do responsável); à direita a
// nota fiscal/pagamento e o comentário do RH. No rodapé, os atalhos para as
// telas onde se age — discretos: a ação forte já está na linha.
// Nada saiu: os mesmos textos, os mesmos destinos e as mesmas condições.
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowRight, Ban, Check, CheckCircle, ChevronDown, CircleDot, FileCheck, FileText, MessageSquare } from "lucide-react";
import type { NotaParaControle, PrestacaoItem } from "./prestacao-types";
import { formatDateTime, type NavigationTarget } from "./prestacao-utils";
import { TimelinePrestacao } from "./timeline-prestacao";

const fmt = formatarMoeda;
const dataLonga = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export interface CartaoPrestacaoCorpoProps {
  item: PrestacaoItem;
  /** Nota fiscal do `item.actual`, se houver. */
  invoice: NotaParaControle | undefined;
  itemEmitsNf: boolean;
  navTarget: NavigationTarget | null;
  hasCheckin: boolean;
  canRh: boolean;
  showDetails: boolean;
  toggleDetails: (id: string) => void;
  navigate: (path: string) => void;
}

/** Botão do rodapé: discreto (a ação forte mora na linha), no tom do destino. */
function Atalho({ onClick, tom = "neutro", icone: Icone, children }: { onClick: () => void; tom?: "neutro" | "marca" | "atencao" | "sucesso"; icone?: typeof FileText; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pas-alvo inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border bg-card text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tom === "marca" ? "border-primary/40 text-primary hover:bg-brand-soft"
        : tom === "atencao" ? "border-warning/40 text-warning hover:bg-warning-soft"
        : tom === "sucesso" ? "border-success/40 text-success hover:bg-success-soft"
        : "border-border text-slate-700 hover:bg-muted",
      )}
    >
      {Icone && <Icone className="w-3.5 h-3.5" aria-hidden="true" />}
      {children}
      <ArrowRight className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
    </button>
  );
}

export function CartaoPrestacaoCorpo({
  item, invoice, itemEmitsNf, navTarget, hasCheckin, canRh, showDetails, toggleDetails, navigate,
}: CartaoPrestacaoCorpoProps) {
  const planned = item.planned;
  const actual = item.actual;
  const nfInvFin = actual ? invoice : null;
  const aprovadaComRealizado = item.status === "aprovada_faturamento" && !!actual;
  const nfStatusRodape = invoice?.status || "pendente";

  // ── Planejado × Realizado ──
  let extrato: React.ReactNode = null;
  if (planned && actual) {
    const diff = actual.totalValue - planned.totalValue;
    const isNegative = diff < 0;
    const isZero = diff === 0;
    const pct = planned.totalValue > 0 ? Math.abs(diff / planned.totalValue * 100).toFixed(1) : "0";
    const alimP = planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner;
    const alimR = (actual.weekdayLunch ?? 0) + (actual.weekdayDinner ?? 0) + (actual.weekendLunch ?? 0) + (actual.weekendDinner ?? 0);
    const mobP = planned.mobility + planned.transport;
    const mobR = (actual.mobility ?? 0) + (actual.transport ?? 0);
    extrato = (
      <section className="crh-bloco" aria-label="Planejado × Realizado">
        <div className="flex items-center gap-2">
          <h5 className="crh-bloco-titulo">Planejado × Realizado</h5>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 h-7 px-2 -mr-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => toggleDetails(item.id)}
          >
            {showDetails ? "Ocultar" : "Ver detalhes"}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150 motion-reduce:transition-none", showDetails && "rotate-180")} aria-hidden="true" />
          </button>
        </div>
        <div className="crh-totais">
          <div>
            <span className="crh-rotulo">Planejado</span>
            <span className="text-sm font-medium tabular-nums text-slate-600">{fmt(planned.totalValue)}</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground self-end mb-1" aria-hidden="true" />
          <div>
            <span className="crh-rotulo">Realizado</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(actual.totalValue)}</span>
          </div>
          <div className="ml-auto self-end">
            {isZero ? (
              <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-2xs font-medium bg-success-soft text-success">
                <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" /> Idênticos · {fmt(planned.totalValue)}
              </span>
            ) : (
              <span className={cn("text-xs font-semibold tabular-nums", isNegative ? "text-success" : "text-danger")}>
                {isNegative ? "−" : "+"}{fmt(Math.abs(diff))} <span className="font-medium">({isNegative ? "−" : "+"}{pct}%)</span>
              </span>
            )}
          </div>
        </div>
        {showDetails && (
          <div className="crh-detalhe pas-entra">
            <div className="crh-detalhe-linha crh-detalhe-cab" aria-hidden="true">
              <span />
              <span>Planejado</span>
              <span>Realizado</span>
            </div>
            <div className="crh-detalhe-linha">
              <span>Diárias</span>
              <span>{planned.dailyQuantity}× {fmt(planned.dailyValue)}</span>
              <span>{actual.dailyQuantity}× {fmt(actual.dailyValue)}</span>
            </div>
            <div className="crh-detalhe-linha">
              <span>Alimentação</span>
              <span>{fmt(alimP)}</span>
              <span>{fmt(alimR)}</span>
            </div>
            <div className="crh-detalhe-linha">
              <span>Mobilidade</span>
              <span>{fmt(mobP)}</span>
              <span>{fmt(mobR)}</span>
            </div>
            {actual.changeReason && (
              <p className="m-0 mt-2 pt-2 border-t border-border text-xs text-slate-600">
                <span className="text-muted-foreground">Justificativa do responsável: </span>
                <span className="italic">{actual.changeReason}</span>
              </p>
            )}
          </div>
        )}
      </section>
    );
  } else if (planned) {
    extrato = (
      <section className="crh-bloco" aria-label="Planejado">
        <h5 className="crh-bloco-titulo">Planejado</h5>
        <p className="m-0 mt-1.5 text-sm font-medium tabular-nums text-slate-600">{fmt(planned.totalValue)}</p>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">O realizado ainda não foi enviado pelo responsável.</p>
      </section>
    );
  } else {
    extrato = (
      <section className="crh-bloco" aria-label="Planejado">
        <h5 className="crh-bloco-titulo">Planejado</h5>
        <p className="m-0 mt-1.5 text-xs text-muted-foreground">Ainda sem valores — o planejamento é a próxima etapa.</p>
      </section>
    );
  }

  // ── Nota fiscal (texto do rodapé de antes, mesmas condições) ──
  let nfInfo: React.ReactNode = null;
  if (aprovadaComRealizado) {
    if (nfStatusRodape === "pendente" && !itemEmitsNf) {
      nfInfo = <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="w-3.5 h-3.5" aria-hidden="true" />Não emite NF — definido na escalação</span>;
    } else if (nfStatusRodape === "pendente") {
      nfInfo = <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="w-3.5 h-3.5" aria-hidden="true" />Aguardando envio da nota fiscal</span>;
    } else if (nfStatusRodape === "recusada") {
      nfInfo = <span className="flex items-center gap-1.5 text-xs text-danger font-medium"><Ban className="w-3.5 h-3.5" aria-hidden="true" />NF recusada — decisão definitiva, sem reenvio</span>;
    } else if (nfStatusRodape === "devolvida") {
      nfInfo = <span className="flex items-center gap-1.5 text-xs text-warning font-medium"><FileText className="w-3.5 h-3.5" aria-hidden="true" />Nota devolvida</span>;
    }
  }

  const checkinPayStr = nfInvFin?.checkinAt && nfInvFin?.paymentDate ? dataLonga(nfInvFin.paymentDate) : null;
  const temLado = !!(planned && nfInvFin?.checkinAt) || !!actual?.rhComment || !!nfInfo;

  // ── Atalhos do rodapé ──
  let atalhoNf: React.ReactNode = null;
  if (aprovadaComRealizado) {
    if (nfStatusRodape === "enviada" && canRh) {
      atalhoNf = <Atalho tom="marca" icone={FileText} onClick={() => navigate(`/invoices?event=${item.event.id}&tab=aprovacao`)}>Aprovar nota fiscal</Atalho>;
    } else if (nfStatusRodape === "devolvida") {
      atalhoNf = <Atalho tom="atencao" onClick={() => navigate(`/invoices?event=${item.event.id}`)}>Ver notas fiscais</Atalho>;
    } else if (nfStatusRodape === "aprovada" && !hasCheckin && canRh) {
      // nfStatus "aprovada" + sem check-in → tela de check-in (card específico)
      atalhoNf = <Atalho tom="marca" icone={CircleDot} onClick={() => navigate(`/invoices?event=${item.event.id}&tab=aprovacao&filter=checkin-pendente&actual=${item.actual?.id || ""}`)}>Ir para Check-in</Atalho>;
    } else if (nfStatusRodape === "aprovada" && hasCheckin) {
      atalhoNf = <Atalho tom="sucesso" icone={FileCheck} onClick={() => navigate(`/invoices?event=${item.event.id}`)}>Ver nota fiscal</Atalho>;
    }
  }

  return (
    <div className="crh-corpo pas-entra" onClick={(e) => e.stopPropagation()}>
      {/* Trilho — rola de lado em telas estreitas */}
      <div className="crh-trilho pas-rolagem-x">
        <TimelinePrestacao item={item} invoice={invoice} itemEmitsNf={itemEmitsNf} />
      </div>

      <div className={cn("crh-corpo-grade", !temLado && "crh-corpo-grade-um")}>
        {extrato}

        {temLado && (
          <div className="flex flex-col gap-3 min-w-0">
            {(nfInfo || (planned && nfInvFin?.checkinAt)) && (
              <section className="crh-bloco" aria-label="Nota fiscal">
                <h5 className="crh-bloco-titulo">Nota fiscal</h5>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {nfInfo}
                  {planned && nfInvFin?.checkinAt && (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-success"><CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />Check-in Financeiro Realizado</span>
                      {checkinPayStr && <span className="text-slate-600 tabular-nums">Pagamento: {checkinPayStr}</span>}
                    </span>
                  )}
                </div>
              </section>
            )}

            {actual?.rhComment && (
              <section className="crh-bloco crh-bloco-comentario" aria-label="Comentário do RH">
                <h5 className="crh-bloco-titulo flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />Comentário do RH</h5>
                <p className="m-0 mt-1.5 text-sm leading-relaxed text-foreground">{actual.rhComment}</p>
                {actual.rhActionAt && (
                  <p className="m-0 mt-1 text-2xs text-muted-foreground tabular-nums">
                    {formatDateTime(actual.rhActionAt)} — {item.rhActionByName ?? "-"}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {(navTarget || atalhoNf) && (
        <div className="crh-rodape">
          {navTarget && (
            <Atalho onClick={() => navigate(navTarget.path)}>
              {item.status === "prestacao_recebida" ? "Analisar comparativo" : navTarget.label}
            </Atalho>
          )}
          {atalhoNf}
        </div>
      )}
    </div>
  );
}
