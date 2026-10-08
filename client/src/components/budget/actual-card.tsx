/**
 * CARD de prestação do Orçamento Realizado — 25/09 (modularização);
 * redesenho 08/10.
 *
 * Antes: avatar colorido, faixa de 3px no topo, três caixas coloridas
 * (azul, âmbar, azul) com "plan:" miúdo, o total lá embaixo e as ações como
 * ícones sem texto — ~300px por pessoa, numa coluna só.
 *
 * Agora é o MESMO extrato do card do Planejado (a etapa anterior do fluxo):
 * quem é (nome, função · período, selos) e o total realizado no alto à
 * direita, com a diferença para o planejado logo abaixo; as linhas de
 * lançamento (Diárias, Alimentação, Mobilidade e, quando houver, Translado)
 * com a conta miúda no meio — e o planejado da linha quando ela diverge —, a
 * linha de referência "Planejado" no fim; as ações num rodapé sempre à vista,
 * com texto. Tudo que estava aqui continua: selos de situação (aprovado,
 * devolvido, recusado, em revisão, duplicado, salvo em, não preenchido),
 * não participou, ajuste do RH (aviso e campo a campo), divergência,
 * titular/divisão com os dias trabalhados, planejamento alterado,
 * observações e o bloqueio de quem já foi enviado.
 *
 * Os derivados (planejado de referência, dias, divergência) chegam prontos
 * da lista. Memoizado (item de lista).
 */
import { memo } from "react";
import { Calendar, ChevronDown, ChevronUp, Eye, GitFork, Lock, MessageSquare, PencilLine, Trash2, TriangleAlert, UserX } from "lucide-react";
import { cn, formatDiasUteis, formatFds } from "@/lib/utils";
import { lerAdjustedFields } from "./comparison-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import type { ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote, BudgetPlanned } from "@shared/schema";
import { Chip, Conta, Lancamento } from "./budget-card";
import { formatCurrency, ddmm } from "./types";
import { formatWorkedDays, isUnfilledItem, reconstructDailyValues, subtotalDiariasDe, type DayCounts, type ModalActualTab } from "./actual-utils";

export interface ActualCardProps {
  cardItem: BudgetActual;
  isGParent?: boolean;
  isGChild?: boolean;
  collabName: string;
  functionName: string;
  cardDays: DayCounts;
  cardPlanned: BudgetPlanned | undefined;
  diverges: boolean;
  notAttended: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  isRhOrAdmin: boolean;
  splitPending: boolean;
  onToggleSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (item: BudgetActual, tab?: ModalActualTab) => void;
  onSplit: (item: BudgetActual) => void;
  onDelete: (id: string) => void;
}

const fmtDT = (d: string | Date) => {
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

/** Selo da situação — baseado direto em rhStatus: o rh-action zera sentForReview
 *  ao devolver/recusar, então condicionar Devolvido/Recusado a sentForReview
 *  tornava esses ramos inalcançáveis. */
function SeloDaSituacao({ cardItem }: { cardItem: BudgetActual }) {
  const isDuplicated = cardItem.observations?.includes("Duplicado no Realizado");
  if (cardItem.rhStatus === "aprovado") return <Chip tom="ok">Aprovado</Chip>;
  if (cardItem.rhStatus === "devolvido") return <Chip tom="alerta">Devolvido</Chip>;
  if (cardItem.rhStatus === "rejeitado") return <Chip tom="perigo">Recusado</Chip>;
  if (cardItem.sentForReview) return <Chip tom="info" title="Enviada — aguardando a análise do RH">Em revisão</Chip>;
  if (isDuplicated) return <Chip tom="marca">Duplicado</Chip>;
  if (!isUnfilledItem(cardItem) && cardItem.updatedAt) return <Chip tom="neutro" title="Última gravação desta prestação">Salvo {fmtDT(cardItem.updatedAt)}</Chip>;
  return <Chip tom="neutro" className="border-dashed border-border bg-card" title="Ainda não foi salva — vale o planejado como ponto de partida">Não preenchido</Chip>;
}

/** "Planejamento alterado": a mesma regra do selo do Comparativo, no tom do card. */
function SeloPlanejadoAlterado({ logs, entityId }: { logs: ActivityLog[]; entityId: string }) {
  const edicoes = logs.filter(l => l.entity_id === entityId && l.action === "update");
  if (edicoes.length === 0) return null;
  const ultima = [...edicoes].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
  const quando = ultima?.created_at ? new Date(ultima.created_at).toLocaleDateString("pt-BR") : "";
  return (
    <Chip tom="alerta" title={ultima ? `Alterado por ${ultima.user_name || "?"}${quando ? ` em ${quando}` : ""}` : "Planejamento alterado pelo RH"}>
      <TriangleAlert className="w-3 h-3" aria-hidden="true" />Planejamento alterado
    </Chip>
  );
}

/** "+R$ 230,00" (acima, vermelho) / "−R$ 80,00" (abaixo, verde) — ou nada. */
function DiferencaDaLinha({ real, plano }: { real: number; plano: number }) {
  const d = real - plano;
  if (Math.abs(d) <= 1) return null;
  return (
    <span className="tabular-nums">
      planejado {formatCurrency(plano)} ·{" "}
      <span className={cn("font-semibold", d > 0 ? "text-danger" : "text-success")}>{d > 0 ? "+" : "−"}{formatCurrency(Math.abs(d))}</span>
    </span>
  );
}

function ActualCardBody({ cardItem, cardDays, cardPlanned: planned, notAttended }: Pick<ActualCardProps, "cardItem" | "cardDays" | "cardPlanned" | "notAttended">) {
  const totalAlimentacao = cardItem.weekdayLunch + cardItem.weekdayDinner + cardItem.weekendLunch + cardItem.weekendDinner;
  // Translado (transport) não é diária — subtraído para o subtotal do card não misturar as verbas
  const cardSubtotalDiarias = subtotalDiariasDe(cardItem);
  const { valorUtil: cardValorUtil, valorFds: cardValorFds } = reconstructDailyValues(cardSubtotalDiarias, cardDays.weekdays, cardDays.weekends);
  const plannedAlim = planned ? (planned.weekdayLunch + planned.weekdayDinner + planned.weekendLunch + planned.weekendDinner) : 0;
  const plannedDiarias = planned ? (planned.totalValue - plannedAlim - planned.mobility - planned.transport) : 0;
  const semana = cardItem.weekdayLunch + cardItem.weekdayDinner;
  const fds = cardItem.weekendLunch + cardItem.weekendDinner;
  const wkd = cardDays.weekdays;
  const wke = cardDays.weekends;
  const perWkd = wkd > 0 && semana > 0 ? Math.round(semana / wkd) : 0;
  const perWke = wke > 0 && fds > 0 ? Math.round(fds / wke) : 0;
  const ida = cardItem.mobilityIda;
  const volta = cardItem.mobilityVolta;
  return (
    <dl className={cn("pla-extrato m-0 px-4 py-1", notAttended && "opacity-50 grayscale select-none")}>
      <Lancamento rotulo="Diárias" cor="bg-primary" valor={cardSubtotalDiarias} riscado={notAttended}>
        {cardDays.weekdays > 0 && <Conta rotulo={formatDiasUteis(cardDays.weekdays)} valor={formatCurrency(cardValorUtil)} />}
        {cardDays.weekends > 0 && <Conta rotulo={formatFds(cardDays.weekends)} valor={formatCurrency(cardValorFds)} />}
        {cardDays.weekdays === 0 && cardDays.weekends === 0 && <span>—</span>}
        {planned && <DiferencaDaLinha real={cardSubtotalDiarias} plano={plannedDiarias} />}
      </Lancamento>
      <Lancamento rotulo="Alimentação" cor="bg-warning-strong" valor={totalAlimentacao} riscado={notAttended}>
        {wkd > 0 && semana > 0 && <Conta rotulo={formatDiasUteis(wkd)} valor={formatCurrency(perWkd)} />}
        {wke > 0 && fds > 0 && <Conta rotulo={formatFds(wke)} valor={formatCurrency(perWke)} />}
        {semana === 0 && fds === 0 && <span>—</span>}
        {planned && <DiferencaDaLinha real={totalAlimentacao} plano={plannedAlim} />}
      </Lancamento>
      <Lancamento rotulo="Mobilidade" cor="bg-slate-400" valor={cardItem.mobility} riscado={notAttended}>
        {typeof ida === "number" && (ida > 0 || (volta ?? 0) > 0)
          ? <Conta rotulo={<>Ida <span className="tabular-nums text-slate-600">{formatCurrency(ida)}</span> · Volta</>} valor={formatCurrency(volta ?? 0)} />
          : cardItem.mobility === 0 ? <span>—</span> : null}
        {planned && <DiferencaDaLinha real={cardItem.mobility} plano={planned.mobility} />}
      </Lancamento>
      {/* Translado entra no total gravado: sem a linha, as parcelas não fechavam com o total. */}
      {cardItem.transport > 0 && (
        <Lancamento rotulo="Translado" cor="bg-slate-300" valor={cardItem.transport} riscado={notAttended}>
          <span>definido pelo RH</span>
        </Lancamento>
      )}
    </dl>
  );
}

/** Botão do rodapé do card: discreto, sempre visível, com texto (o mesmo do Planejado). */
const ACAO = "pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";

export const ActualCard = memo(function ActualCard(p: ActualCardProps) {
  const {
    cardItem, isGParent = false, isGChild = false, collabName, functionName, cardDays, diverges, notAttended,
    isCollapsed, isSelected, isHighlighted, cardPlanned: planned, eventNotes, plannedLogs, isRhOrAdmin, splitPending,
  } = p;
  const isItemLocked = !!cardItem.sentForReview;
  const isItemEditable = !cardItem.sentForReview;
  const isCasa = cardItem.collaboratorType === "casa";
  const workedDaysStr = formatWorkedDays(cardItem.workedDays || []);
  const isInGroup = isGParent || isGChild;
  const diff = planned ? cardItem.totalValue - planned.totalValue : 0;
  const temNotas = eventNotes.some(n => n.entityId === cardItem.id);
  const naoPreenchido = isUnfilledItem(cardItem);
  // jsonb pode chegar como string (API de hoje) ou objeto — ver lib/json-seguro.
  const rhFields: Record<string, { from: number; to: number; label: string }> = lerAdjustedFields(cardItem.rhAdjustedFields);
  const temAjustesRh = Object.keys(rhFields).length > 0;

  return (
    <article
      data-card-id={cardItem.id}
      aria-label={collabName}
      className={cn(
        "pla-card group flex flex-col h-full rounded-xl border bg-card",
        notAttended ? "pla-card-ausente bg-surface-muted border-border"
          : isSelected ? "pla-card-sel border-primary"
          : cardItem.rhStatus === "devolvido" || cardItem.rhStatus === "rejeitado" ? "border-warning/40"
          : "border-border",
        isHighlighted && "pla-destaque",
      )}
    >
      {/* ── Quem é · total ── */}
      <header className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
        <div className="pt-0.5 shrink-0 w-4 flex justify-center">
          {notAttended && !isItemEditable ? (
            <UserX className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          ) : isItemLocked ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Prestação bloqueada para edição">
                    <Lock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Enviada para revisão — bloqueada para edição</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => p.onToggleSelect(cardItem.id)}
              aria-label={`Selecionar prestação de ${collabName}`}
              className="pas-alvo"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className={cn("m-0 text-sm font-semibold leading-5 truncate", notAttended ? "text-slate-600" : "text-foreground")}>{collabName}</h3>
            {cardItem.rhAdjusted && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-label="Realizado ajustado pelo RH" className="inline-flex shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <PencilLine className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">Realizado ajustado pelo RH</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground truncate">
            {functionName}
            {cardDays.startDate && cardDays.endDate && (
              <span className="tabular-nums"> · {cardDays.startDate === cardDays.endDate ? ddmm(cardDays.startDate) : `${ddmm(cardDays.startDate)}–${ddmm(cardDays.endDate)}`}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {/* Tipo não é alerta: Freela em neutro, o âmbar fica para o que pede atenção. */}
            <Chip tom={isCasa ? "marca" : "neutro"}>{isCasa ? "Casa" : "Freela"}</Chip>
            <SeloDaSituacao cardItem={cardItem} />
            {notAttended && <Chip tom="alerta"><UserX className="w-3 h-3" aria-hidden="true" />Não participou</Chip>}
            {/* No titular de uma divisão, `diverges` compara a fatia dele com o planejado
                da escalação inteira (sempre "diverge"): vale a régua do proporcional. */}
            {diverges && !notAttended && (!isInGroup || Math.abs(diff) > 1) && <Chip tom="alerta" title="O total realizado é diferente do planejado">Divergência</Chip>}
            {isGParent && <Chip tom="marca" title="Titular da escalação dividida">Titular</Chip>}
            {isGChild && <Chip tom="marca" title="Parte de uma escalação dividida"><GitFork className="w-3 h-3" aria-hidden="true" />Divisão</Chip>}
            {cardItem.plannedId && <SeloPlanejadoAlterado logs={plannedLogs} entityId={cardItem.plannedId} />}
          </div>
          {workedDaysStr && isInGroup && (
            <p className="m-0 mt-1.5 flex items-start gap-1 text-2xs leading-4 text-primary">
              <Calendar className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
              <span><span className="sr-only">Dias trabalhados: </span>{workedDaysStr}</span>
            </p>
          )}
        </div>

        <div className="shrink-0 text-right pl-1">
          <p className="m-0 text-2xs text-muted-foreground whitespace-nowrap">{notAttended ? "Não contabilizado" : "Total realizado"}</p>
          <p className={cn("m-0 text-lg leading-6 font-semibold tracking-[-0.01em] tabular-nums whitespace-nowrap", notAttended ? "text-muted-foreground line-through" : "text-foreground")}>
            {formatCurrency(cardItem.totalValue)}
          </p>
          {planned && !notAttended && (
            Math.abs(diff) <= 1 ? (
              <p className="m-0 mt-0.5 text-2xs text-muted-foreground whitespace-nowrap" title={`Planejado: ${formatCurrency(planned.totalValue)}`}>no previsto</p>
            ) : (
              <p
                className={cn("m-0 mt-0.5 text-2xs font-semibold tabular-nums whitespace-nowrap", diff > 0 ? "text-danger" : "text-success")}
                title={`Planejado: ${formatCurrency(planned.totalValue)}`}
              >
                {diff > 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))}
                <span className="font-normal text-muted-foreground"> vs plan.</span>
              </p>
            )
          )}
        </div>
      </header>

      {!isCollapsed && (
        <>
          {/* Aviso para quem não é do RH quando o RH mexeu nos valores */}
          {!isRhOrAdmin && cardItem.rhAdjusted && (
            <div className="mx-4 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg bg-warning-soft border border-warning/25">
              <p className="m-0 flex-1 min-w-0 text-xs text-warning">O RH ajustou alguns valores do seu realizado.</p>
              <button
                type="button"
                onClick={() => p.onEdit(cardItem, "historico")}
                className="pas-alvo shrink-0 h-7 px-2 rounded-md text-xs font-semibold text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver alterações
              </button>
            </div>
          )}
          <ActualCardBody cardItem={cardItem} cardDays={cardDays} cardPlanned={planned} notAttended={notAttended} />
          {/* Referência só quando difere: igual, o topo já diz "no previsto". */}
          {planned && Math.abs(diff) > 1 && (
            <div className="mx-4 flex items-baseline justify-between gap-3 pt-2 pb-2.5 border-t border-dashed border-border text-xs text-muted-foreground">
              <span>Planejado{isInGroup ? " (proporcional aos dias)" : ""}</span>
              <span className="tabular-nums">{formatCurrency(planned.totalValue)}</span>
            </div>
          )}
          {/* Campos ajustados pelo RH — de → para */}
          {temAjustesRh && (
            <div className="mx-4 mb-2.5 px-3 py-2 rounded-lg bg-warning-soft/60 border border-warning/20">
              <p className="m-0 text-2xs font-semibold text-warning">Ajustes do RH</p>
              <ul className="m-0 mt-0.5 p-0 list-none">
                {Object.values(rhFields).map((f, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-2xs leading-5 text-slate-600">
                    <span>{f.label}:</span>
                    <span className="tabular-nums line-through text-muted-foreground">{formatCurrency(f.from)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="tabular-nums font-semibold text-warning">{formatCurrency(f.to)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {temNotas && (
        <div className="flex items-center gap-2 px-4 pb-2 min-w-0">
          <div className="min-w-0 flex-1 [&>div]:mt-0"><BudgetNotesSnippet notes={eventNotes} entityId={cardItem.id} /></div>
        </div>
      )}

      {/* ── Ações: sempre à vista, discretas; a forte é a do topo/da seleção ── */}
      <footer className="mt-auto flex items-center gap-1 px-2.5 py-1.5 border-t border-border">
        <button
          type="button"
          className={cn(ACAO, "text-muted-foreground hover:bg-muted hover:text-foreground")}
          aria-label={isCollapsed ? `Expandir prestação de ${collabName}` : `Recolher prestação de ${collabName}`}
          aria-expanded={!isCollapsed}
          onClick={() => p.onToggleCollapse(cardItem.id)}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
          <span className="max-[380px]:hidden">{isCollapsed ? "Detalhar" : "Recolher"}</span>
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className={cn(ACAO, "text-muted-foreground hover:bg-muted hover:text-foreground")}
            aria-label={`Ver observações de ${collabName}`}
            title="Observações"
            onClick={() => p.onEdit(cardItem, "observacoes")}
          >
            {temNotas
              ? <span className="inline-flex items-center pr-1"><BudgetNotesBadge notes={eventNotes} entityId={cardItem.id} /></span>
              : <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="rea-acao-texto">Observações</span>
          </button>
          {isItemEditable ? (
            <>
              <button
                type="button"
                className={cn(ACAO, "text-muted-foreground hover:bg-muted hover:text-foreground")}
                aria-label={`Dividir prestação de ${collabName}`}
                title="Dividir a escalação com outro colaborador"
                onClick={() => p.onSplit(cardItem)}
                disabled={splitPending}
              >
                <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="rea-acao-texto">Dividir</span>
              </button>
              <button
                type="button"
                className={cn(ACAO, "text-muted-foreground hover:bg-danger-soft hover:text-danger")}
                aria-label={`Remover prestação de ${collabName}`}
                title="Remover prestação"
                onClick={() => p.onDelete(cardItem.id)}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="rea-acao-texto">Remover</span>
              </button>
              <button
                type="button"
                className={cn(ACAO, naoPreenchido ? "text-primary bg-brand-soft hover:bg-primary hover:text-primary-foreground" : "text-slate-700 hover:bg-muted")}
                aria-label={`${naoPreenchido ? "Preencher" : "Editar"} prestação de ${collabName}`}
                onClick={() => p.onEdit(cardItem)}
              >
                <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
                {naoPreenchido ? "Preencher" : "Editar"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={cn(ACAO, "text-slate-700 hover:bg-muted")}
              aria-label={`Ver prestação de ${collabName}`}
              onClick={() => p.onEdit(cardItem)}
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              Ver detalhes
            </button>
          )}
        </div>
      </footer>
    </article>
  );
});

export default ActualCard;
