/**
 * Linha de uma prestação no Comparativo — 25/09 (modularização); redesenho 08/10.
 *
 * Antes: um cartão por pessoa com avatar colorido, o fundo inteiro tingido
 * pela decisão do RH (verde, âmbar, vermelho), uma "fita" de três caixas
 * Plan./Real./Dif. que mudava de lugar conforme havia ou não o lápis — os
 * números não ficavam um embaixo do outro — e, aberto, três blocos com
 * cabeçalho colorido e um rodapé de três caixas.
 *
 * Agora o Comparativo é lido como uma TABELA (é o que ele é): cada prestação
 * é uma linha com colaborador, situação, Planejado, Realizado e Diferença em
 * colunas fixas, alinhadas com o cabeçalho grudado; a decisão do RH vira o
 * selo da coluna Situação e um filete à esquerda. Aberta, a linha mostra o
 * extrato com os valores de cada parcela NAS MESMAS colunas, as anotações
 * (justificativa, comentários e ajustes do RH, planejamento alterado), as
 * observações e o histórico. Na largura útil estreita, a linha vira cartão.
 *
 * Tudo que estava aqui continua: seleção (pendentes, RH), dividida, reenviado,
 * não participou (com motivo), observações (selo e trecho), planejamento
 * alterado, comentário do RH no item, sem justificativa, função · tipo ·
 * período, nomes da divisão, editar realizado (RH), detalhamento por
 * colaborador com "ver detalhes", justificativa, comentário geral, observação
 * do ajuste, chat e histórico. Memoizado (item de lista).
 */
import { memo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ClipboardList, GitFork, MessageSquare, PencilLine, TriangleAlert, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { BudgetChat, BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { ActivityTimeline, PlannedEditedBadge, type ActivityLog } from "@/components/activity-timeline";
import type { BudgetActual, BudgetNote, BudgetPlanned, TeamInclusion } from "@shared/schema";
import { Chip } from "./budget-card";
import { BlocoDoExtrato, CabecalhoDoExtrato, Diferenca, LinhaDoExtrato } from "./comparison-blocks";
import { ratearPlanejadoPorDias } from "./actual-utils";
import { isCasaType } from "./types";
import { dailySubtotalOf, fmt, getWorkedDayCount, lerAdjustedFields, type ComparisonRow, type SplitDetailState } from "./comparison-utils";

export interface ComparisonCardProps {
  row: ComparisonRow;
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  cardTi: TeamInclusion | undefined;
  eventNotes: BudgetNote[];
  plannedLogs: ActivityLog[];
  rhComment: string | null | undefined;
  isRhOrAdmin: boolean;
  getCollaboratorName: (id?: string | null) => string;
  getFunctionName: (id?: string | null) => string;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (a: BudgetActual) => void;
  onSplitDetail: (s: SplitDetailState) => void;
}

/** Motivo de quem não participou: o do Planejado, senão o do Realizado. */
const motivoDaAusencia = (row: ComparisonRow) => row.planned?.didNotAttendReason || row.actual.didNotAttendReason || null;

const fmtPeriodDate = (d: string) => {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/** Selo da coluna Situação — o mesmo vocabulário da fila. */
function SeloDaLinha({ status }: { status: string }) {
  if (status === "aprovado") return <Chip tom="ok">Aprovada</Chip>;
  if (status === "devolvido") return <Chip tom="alerta" title="Devolvida para correção — está com o responsável">Devolvida</Chip>;
  if (status === "rejeitado") return <Chip tom="perigo" title="Recusada pelo RH — o responsável pode corrigir e reenviar">Recusada</Chip>;
  return <Chip tom="info" title="Enviada pelo responsável — aguardando a decisão do RH">Para análise</Chip>;
}

/** Botão discreto da linha, sempre visível, com texto (o mesmo dos cards do Planejado). */
const ACAO = "pas-alvo inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Anotação do corpo aberto: ícone · título · texto, no tom de quem escreveu. */
function Nota({ icone: Icone, titulo, tom = "neutro", children }: { icone: LucideIcon; titulo: string; tom?: "neutro" | "alerta" | "ok" | "perigo"; children: ReactNode }) {
  const cores = {
    neutro: "border-border bg-card text-slate-600 [&_.cmp-nota-icone]:text-muted-foreground [&_.cmp-nota-titulo]:text-slate-700",
    alerta: "border-warning/25 bg-warning-soft/60 text-warning [&_.cmp-nota-icone]:text-warning-strong",
    ok: "border-success/25 bg-success-soft/60 text-success [&_.cmp-nota-icone]:text-success-strong",
    perigo: "border-danger/25 bg-danger-soft/60 text-danger [&_.cmp-nota-icone]:text-danger-strong",
  }[tom];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5", cores)}>
      <Icone className="cmp-nota-icone w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-xs leading-relaxed">
        <p className="cmp-nota-titulo m-0 font-semibold">{titulo}</p>
        <div className="m-0">{children}</div>
      </div>
    </div>
  );
}

/** Detalhamento por colaborador de uma escalação dividida. */
function SplitRows({ row, p: pl, plannedTotal, actualTotal, getCollaboratorName, getFunctionName, onSplitDetail }: {
  row: ComparisonRow; p: BudgetPlanned | null; plannedTotal: number; actualTotal: number;
  getCollaboratorName: (id?: string | null) => string; getFunctionName: (id?: string | null) => string; onSplitDetail: (s: SplitDetailState) => void;
}) {
  const a = row.actual;
  const allGroupDays = [...((a.workedDays as string[] | null) || []), ...row.splitChildren.flatMap(c => ((c.workedDays as string[] | null) || []))].sort();
  return (
    <div role="group" aria-label="Detalhamento por colaborador" className="cmp-bloco">
      <LinhaDoExtrato
        nivel="grupo"
        cor="bg-primary"
        rotulo={<>Por colaborador<span className="cmp-chip-texto font-normal text-muted-foreground"> · planejado proporcional aos dias</span></>}
        planned={plannedTotal}
        actual={actualTotal}
      />
      {[a, ...row.splitChildren].map((colItem, ci) => {
        const isParent = ci === 0;
        const nome = getCollaboratorName(colItem.collaboratorId);
        const colProp = pl ? ratearPlanejadoPorDias(pl, colItem, allGroupDays, getFunctionName) : null;
        const dias = getWorkedDayCount(colItem);
        return (
          <LinhaDoExtrato
            key={colItem.id}
            rotulo={
              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                <span className="truncate text-foreground font-medium">{nome}</span>
                <Chip tom="marca" className="shrink-0">{isParent ? "Titular" : <><GitFork className="w-3 h-3" aria-hidden="true" />Divisão</>}</Chip>
                {dias > 0 && <span className="shrink-0 tabular-nums text-muted-foreground">{dias} {dias === 1 ? "dia" : "dias"}</span>}
              </span>
            }
            planned={colProp?.totalValue || 0}
            actual={colItem.totalValue}
            longo
            acao={
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSplitDetail({ actual: colItem, planned: pl, propPlanned: colProp, isParent, allGroupDays }); }}
                className={cn(ACAO, "h-7 text-muted-foreground hover:bg-muted hover:text-foreground")}
                title="Ver detalhes completos"
                aria-label={`Ver detalhes completos de ${nome}`}
              >
                <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Detalhes</span>
              </button>
            }
          />
        );
      })}
    </div>
  );
}

/** Corpo aberto: extrato comparativo, anotações, observações e histórico. */
function ComparisonCardBody(props: ComparisonCardProps & { plannedTotal: number; actualTotal: number; itemRhStatus: string; isNotAttended: boolean }) {
  const { row, plannedLogs, rhComment, getCollaboratorName, getFunctionName, onSplitDetail, plannedTotal, actualTotal, itemRhStatus, isNotAttended } = props;
  const p = row.planned;
  const a = row.actual;
  // Subtotal de diárias derivado do total gravado (total − alimentação −
  // mobilidade − translado, como no Realizado): qty × média arredondada
  // não reproduz o subtotal dia a dia e deixava o card sem fechar
  const dailyPlanned = p ? dailySubtotalOf(p) : 0;
  const dailyActual = dailySubtotalOf(a);
  const planId = row.planned?.id;
  const plannedEdits = planId ? plannedLogs.filter(l => l.entity_id === planId && l.action === "update") : [];
  const lastEdit = plannedEdits.length > 0
    ? [...plannedEdits].sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime())[0]
    : null;
  // Ajustes do RH campo a campo (de → para) — jsonb pode chegar como string ou objeto.
  const ajustes = Object.values(lerAdjustedFields(a.rhAdjustedFields) as Record<string, { from: number; to: number; label: string }>);
  const diff = actualTotal - plannedTotal;
  const tomDoItem = itemRhStatus === "aprovado" ? "ok" : itemRhStatus === "rejeitado" ? "perigo" : "alerta";

  return (
    <div className="cmp-corpo" onClick={(e) => e.stopPropagation()}>
      {isNotAttended && (
        <div className="mb-2">
          <Nota icone={UserX} titulo="Colaborador não participou do evento">
            <p className="m-0">Planejado, Realizado e Diferença ficam fora dos totais. Os valores abaixo são só referência.</p>
            {motivoDaAusencia(row) && <p className="m-0 mt-0.5 italic">Motivo: {motivoDaAusencia(row)}</p>}
          </Nota>
        </div>
      )}

      {/* ── Extrato: os valores de cada parcela nas colunas da linha ── */}
      <div className={cn("cmp-extrato", isNotAttended && "opacity-60")}>
        <div className="cmp-so-cartao"><CabecalhoDoExtrato /></div>
        {row.isSplit ? (
          <SplitRows row={row} p={p} plannedTotal={plannedTotal} actualTotal={actualTotal} getCollaboratorName={getCollaboratorName} getFunctionName={getFunctionName} onSplitDetail={onSplitDetail} />
        ) : (
          <>
            <BlocoDoExtrato
              titulo="Diárias"
              cor="bg-primary"
              // O subtotal de diárias é o do cabeçalho da categoria.
              subtotal={{ planned: dailyPlanned, actual: dailyActual }}
              linhas={[
                { rotulo: "Quantidade de diárias", planned: p?.dailyQuantity || 0, actual: a.dailyQuantity, quantidade: true },
                // Preço, não parcela: fica fora do subtotal.
                { rotulo: "Valor unitário (média)", planned: p?.dailyValue || 0, actual: a.dailyValue, soma: false },
              ]}
            />
            <BlocoDoExtrato
              titulo="Alimentação"
              cor="bg-warning-strong"
              linhas={[
                { rotulo: "Almoço (dias úteis)", planned: p?.weekdayLunch || 0, actual: a.weekdayLunch },
                { rotulo: "Jantar (dias úteis)", planned: p?.weekdayDinner || 0, actual: a.weekdayDinner },
                { rotulo: "Almoço (fim de semana)", planned: p?.weekendLunch || 0, actual: a.weekendLunch },
                { rotulo: "Jantar (fim de semana)", planned: p?.weekendDinner || 0, actual: a.weekendDinner },
              ]}
            />
            <BlocoDoExtrato
              titulo="Mobilidade"
              cor="bg-slate-400"
              linhas={[
                { rotulo: "Mobilidade", planned: p?.mobility || 0, actual: a.mobility },
                // Translado precisa aparecer aqui: o total o inclui, e sem esta
                // linha os subtotais não fechavam com o total
                { rotulo: "Translado", planned: p?.transport || 0, actual: a.transport },
              ]}
            />
          </>
        )}
        <LinhaDoExtrato
          nivel="total"
          rotulo={<>{row.isSplit ? "Total do grupo" : "Total da prestação"}{plannedTotal > 0 && diff !== 0 && (
            <span className={cn("cmp-total-pct ml-1.5 font-medium tabular-nums", diff > 0 ? "text-danger" : "text-success")}>
              {diff > 0 ? "+" : "−"}{Math.abs(diff / plannedTotal * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          )}</>}
          planned={plannedTotal}
          actual={actualTotal}
        />
      </div>

      {/* ── Anotações ── */}
      {(a.changeReason || a.rhComment || (rhComment && !a.rhComment) || a.rhAdjustNote || ajustes.length > 0 || plannedEdits.length > 0) && (
        <div className="cmp-notas">
          {a.changeReason && (
            <Nota icone={MessageSquare} titulo="Justificativa do responsável"><p className="m-0">{a.changeReason}</p></Nota>
          )}
          {a.rhComment && (
            <Nota icone={MessageSquare} titulo="Comentário do RH" tom={tomDoItem}><p className="m-0">{a.rhComment}</p></Nota>
          )}
          {rhComment && !a.rhComment && (
            <Nota icone={MessageSquare} titulo="Comentário do RH (geral)" tom="alerta"><p className="m-0">{rhComment}</p></Nota>
          )}
          {(a.rhAdjustNote || ajustes.length > 0) && (
            <Nota icone={PencilLine} titulo={a.rhAdjustNote ? "Observação do ajuste (RH)" : "Ajustes do RH"} tom="alerta">
              {a.rhAdjustNote && <p className="m-0">{a.rhAdjustNote}</p>}
              {ajustes.length > 0 && (
                <ul className="m-0 mt-0.5 p-0 list-none">
                  {ajustes.map((f, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-slate-600">
                      <span>{f.label}:</span>
                      <span className="tabular-nums line-through text-muted-foreground">{fmt(f.from)}</span>
                      <span aria-hidden="true">→</span>
                      <span className="sr-only">para</span>
                      <span className="tabular-nums font-semibold text-warning">{fmt(f.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Nota>
          )}
          {planId && plannedEdits.length > 0 && (
            <Nota icone={TriangleAlert} titulo="O orçamento planejado foi alterado pelo RH" tom="alerta">
              {lastEdit && <p className="m-0">Última edição por {lastEdit.user_name || "?"} — os valores de referência podem ter mudado após o envio.</p>}
            </Nota>
          )}
        </div>
      )}

      {/* ── Observações (chat de auditoria) e histórico ── */}
      <div className="cmp-conversa">
        <BudgetChat
          entityType="actual"
          entityId={a.id}
          eventId={a.eventId}
          linkedEntityType={a.plannedId ? "planned" : undefined}
          linkedEntityId={a.plannedId || undefined}
        />
        <ActivityTimeline entityType="budget_actual" entityId={a.id} />
      </div>
    </div>
  );
}

export const ComparisonCard = memo(function ComparisonCard(props: ComparisonCardProps) {
  const { row, isExpanded, isSelected, isHighlighted, cardTi, eventNotes, plannedLogs, isRhOrAdmin, getCollaboratorName, getFunctionName, onToggleExpand, onToggleSelect, onEdit } = props;
  const p = row.planned;
  const a = row.actual;
  const plannedTotal = p?.totalValue || 0;
  const actualTotal = row.groupActualTotal;
  const diff = actualTotal - plannedTotal;
  const hasJustification = !!a.changeReason;
  const hasDiff = diff !== 0;

  const itemRhStatus = a.rhStatus || "pendente";
  const isDecided = itemRhStatus === "aprovado" || itemRhStatus === "rejeitado" || itemRhStatus === "devolvido";
  const isResubmitted = a.resubmitted;
  const colName = getCollaboratorName(row.collaboratorId);
  const cardKey = `${row.collaboratorId}-${row.functionId}`;
  // Planejado OU Realizado marcado (o critério do Realizado — @shared/comparativo).
  const isNotAttended = row.naoParticipou;
  const motivoAusencia = motivoDaAusencia(row);
  const temNotas = eventNotes.length > 0 && eventNotes.some(n => n.entityId === a.id);
  // Item devolvido está com o responsável — o RH não edita até o reenvio
  const podeEditar = isRhOrAdmin && !["aprovado", "rejeitado", "devolvido"].includes(a.rhStatus || "");
  const podeSelecionar = isRhOrAdmin && !isDecided;

  // Period from team inclusion
  const tiStart = cardTi?.actualStartDate || cardTi?.scheduleStartDate;
  const tiEnd   = cardTi?.actualEndDate   || cardTi?.scheduleEndDate;
  const periodLabel = tiStart && tiEnd ? `${fmtPeriodDate(tiStart)} – ${fmtPeriodDate(tiEnd)}` : null;
  const pct = plannedTotal > 0 && hasDiff ? Math.abs(diff / plannedTotal * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : null;

  return (
    <article
      data-card-id={cardKey}
      aria-label={colName}
      className={cn(
        "cmp-linha",
        isNotAttended && "cmp-linha-ausente",
        !isNotAttended && isDecided && `cmp-linha-${itemRhStatus}`,
        isSelected && "cmp-linha-sel",
        isExpanded && "cmp-linha-aberta",
        isHighlighted && "pla-destaque",
      )}
    >
      {/* Linha: o clique em qualquer lugar abre/fecha; o botão acessível é o chevron
          (controles interativos não podem viver dentro de um role="button"). */}
      <div className="cmp-topo" onClick={() => onToggleExpand(a.id)}>
        <div className="cmp-c-sel" onClick={(e) => e.stopPropagation()}>
          {podeSelecionar ? (
            <Checkbox
              checked={isSelected}
              aria-label={`Selecionar ${colName}`}
              onCheckedChange={(checked) => onToggleSelect(a.id, !!checked)}
              className="pas-alvo"
            />
          ) : isNotAttended ? (
            <UserX className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          ) : null}
        </div>

        <div className="cmp-c-colab min-w-0">
          <h3 className={cn("m-0 text-sm font-semibold leading-5 truncate", isNotAttended ? "text-slate-600" : "text-foreground")}>{colName}</h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground truncate">
            {getFunctionName(row.functionId)}
            <span aria-hidden="true"> · </span>
            {/* "local" é da casa (isCasaType) — antes aparecia como Freela. */}
            <span className={isCasaType(row.collaboratorType) ? "text-primary" : undefined}>{isCasaType(row.collaboratorType) ? "Casa" : "Freela"}</span>
            {periodLabel && <span className="tabular-nums"><span aria-hidden="true"> · </span>{periodLabel}</span>}
          </p>
          {(row.isSplit || isResubmitted || isNotAttended || temNotas || (hasDiff && !hasJustification && !row.isSplit && !isNotAttended) || !!row.planned) && (
            <div className="cmp-selos flex flex-wrap items-center gap-1 mt-1.5 empty:hidden">
              {row.isSplit && (
                <Chip tom="marca" title={[a, ...row.splitChildren].map(c => getCollaboratorName(c.collaboratorId)).join(" + ")}>
                  <GitFork className="w-3 h-3" aria-hidden="true" />Dividida · {row.splitChildren.length + 1}
                </Chip>
              )}
              {isResubmitted && <Chip tom="marca" title="O responsável corrigiu e reenviou depois de uma devolução">Reenviada</Chip>}
              {isNotAttended && <Chip tom="alerta"><UserX className="w-3 h-3" aria-hidden="true" />Não participou</Chip>}
              {hasDiff && !hasJustification && !row.isSplit && !isNotAttended && (
                <Chip tom="alerta" title="O realizado difere do planejado e o responsável não escreveu justificativa">
                  <TriangleAlert className="w-3 h-3" aria-hidden="true" />Sem justificativa
                </Chip>
              )}
              {temNotas && <BudgetNotesBadge notes={eventNotes} entityId={a.id} />}
              {row.planned && <PlannedEditedBadge logs={plannedLogs} entityId={row.planned.id} />}
            </div>
          )}
          {row.isSplit && (
            <p className="m-0 mt-1 text-2xs text-primary truncate">
              <span className="sr-only">Divisão: </span>{[a, ...row.splitChildren].map(c => getCollaboratorName(c.collaboratorId)).join(" + ")}
            </p>
          )}
          {/* Trechos: motivo de quem não participou, comentário do RH na devolução/recusa, observações. */}
          {isNotAttended && motivoAusencia && (
            <p className="m-0 mt-1 text-2xs italic text-muted-foreground truncate">{motivoAusencia}</p>
          )}
          {isDecided && a.rhComment && (itemRhStatus === "rejeitado" || itemRhStatus === "devolvido") && (
            <p className={cn("m-0 mt-1 text-2xs italic truncate", itemRhStatus === "rejeitado" ? "text-danger" : "text-warning")}>
              <span className="not-italic font-medium">RH: </span>“{a.rhComment}”
            </p>
          )}
          {temNotas && <div className="min-w-0 [&>div]:mt-1"><BudgetNotesSnippet notes={eventNotes} entityId={a.id} /></div>}
        </div>

        <div className="cmp-c-sit"><SeloDaLinha status={itemRhStatus} /></div>

        <div className="cmp-c-plan cmp-num" data-rotulo="Planejado">
          <span className="sr-only">Planejado: </span>
          <span className={cn("text-sm tabular-nums text-muted-foreground", isNotAttended && "line-through")}>{p ? fmt(plannedTotal) : "—"}</span>
        </div>
        <div className="cmp-c-real cmp-num" data-rotulo="Realizado">
          <span className="sr-only">Realizado: </span>
          <span className={cn("text-[15px] leading-5 font-semibold tabular-nums", isNotAttended ? "text-muted-foreground" : "text-foreground")}>{fmt(actualTotal)}</span>
        </div>
        <div className="cmp-c-dif cmp-num" data-rotulo="Diferença">
          <span className="sr-only">Diferença: </span>
          {isNotAttended ? (
            <span className="text-xs text-muted-foreground" title="Quem não participou fica fora dos totais">fora dos totais</span>
          ) : (
            <span className="inline-flex flex-col items-end leading-tight">
              <Diferenca planned={plannedTotal} actual={actualTotal} forte className="text-sm" />
              {pct && <span className={cn("text-2xs tabular-nums", diff > 0 ? "text-danger/80" : "text-success/80")}>{diff > 0 ? "+" : "−"}{pct}%</span>}
            </span>
          )}
        </div>

        <div className="cmp-c-acoes" onClick={(e) => e.stopPropagation()}>
          {podeEditar && (
            <button
              type="button"
              aria-label={`Editar realizado de ${colName} (RH)`}
              title="Ajustar o realizado (fica registrado como ajuste do RH)"
              className={cn(ACAO, "text-muted-foreground hover:bg-warning-soft hover:text-warning")}
              onClick={() => onEdit(a)}
            >
              <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ajustar</span>
            </button>
          )}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Recolher" : "Expandir"} detalhes de ${colName}`}
            className={cn(ACAO, "text-muted-foreground hover:bg-muted hover:text-foreground")}
            onClick={() => onToggleExpand(a.id)}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200 motion-reduce:transition-none", isExpanded && "rotate-180")} aria-hidden="true" />
            <span className="cmp-acao-texto">{isExpanded ? "Recolher" : "Detalhar"}</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <ComparisonCardBody {...props} plannedTotal={plannedTotal} actualTotal={actualTotal} itemRhStatus={itemRhStatus} isNotAttended={isNotAttended} />
      )}
    </article>
  );
});

export default ComparisonCard;
