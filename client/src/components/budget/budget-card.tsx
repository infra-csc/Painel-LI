/**
 * CARD de colaborador da Visão Geral do Planejado — 25/09 (modularização).
 *
 * Extraído de budget-planned.tsx. Memoizado (é item de lista virtualizada):
 * o cabeçalho (ativo × "não participou") e o corpo (3 blocos) ficam em
 * componentes próprios para nenhum passar de 300 linhas.
 */
import { memo } from "react";
import { Calendar, Car, CheckCheck, ChevronDown, ChevronUp, Edit, Eye, Lock, Send, Undo2, UserX, Utensils } from "lucide-react";
import { cn, formatDiasUteis, formatFds } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { isAtendimentoFunction } from "@shared/atendimento";
import { FUNCAO_LOCAL_RAZAO, PERCURSEIRO_TIPOS } from "@shared/calculation-rules";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import type { BudgetActual, BudgetNote, BudgetPlanned as BudgetPlannedRow } from "@shared/schema";
import {
  avatarColor, ddmmLocal, formatCurrency, formatSegmentsMemo, isCasaType,
  type CalculatedBudget, type NotAttendedModalState, type RestoreModalState,
} from "./types";

export interface BudgetCardProps {
  budget: CalculatedBudget;
  name: string;
  functionName: string;
  isSent: boolean;
  isSelected: boolean;
  isCollapsed: boolean;
  isHighlighted: boolean;
  planRecord: BudgetPlannedRow | undefined;
  cardActual: BudgetActual | undefined;
  eventNotes: BudgetNote[];
  canEdit: boolean;
  canMarkNotAttended: boolean;
  restorePending: boolean;
  onToggleSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (budget: CalculatedBudget, viewMode?: boolean) => void;
  onSend: (id: string) => void;
  onNotAttended: (s: NotAttendedModalState) => void;
  onRestore: (s: RestoreModalState) => void;
}

type HeaderProps = BudgetCardProps & { isNotAttended: boolean; initials: string; isCasa: boolean };

/** Header do card — estado INATIVO (Não Participou) ou ATIVO. */
function BudgetCardHeader(p: HeaderProps) {
  const { budget, name, functionName, isSent, isSelected, isCollapsed, planRecord, cardActual, canEdit, canMarkNotAttended, restorePending, isNotAttended, initials, isCasa } = p;
  if (isNotAttended) {
    return (
      <div className="px-4 py-3 bg-card">
        {/* Linha superior: avatar + nome + botão restaurar */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground text-xs font-bold shrink-0 bg-border">
            {initials || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-slate-600 text-sm truncate block">{name}</span>
            <span className="text-2xs text-muted-foreground">{functionName}</span>
          </div>
          {canMarkNotAttended && planRecord && (
            <button
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary-hover active:scale-95 transition-all shrink-0 disabled:opacity-60 shadow-1"
              onClick={() => p.onRestore({
                id: planRecord.id, name,
                functionName,
                startDate: budget.inclusion.scheduleStartDate ?? undefined,
                endDate: budget.inclusion.scheduleEndDate ?? undefined,
              })}
              disabled={restorePending}
            >
              <Undo2 style={{ width: 14, height: 14 }} aria-hidden="true" />
              Restaurar
            </button>
          )}
        </div>

        {/* Linha inferior: data + badge motivo */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {/* Data do período */}
          {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-2xs font-normal text-muted-foreground">
              <Calendar className="text-muted-foreground shrink-0" style={{ width: 10, height: 10 }} aria-hidden="true" />
              {ddmmLocal(budget.inclusion.scheduleStartDate)}
              <span className="text-muted-foreground">–</span>
              {ddmmLocal(budget.inclusion.scheduleEndDate)}
            </span>
          )}
          {/* Badge ausência */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-medium bg-warning-soft text-warning border border-warning/25">
            <UserX style={{ width: 10, height: 10 }} aria-hidden="true" />
            Não participou
          </span>
          {/* Motivo */}
          {planRecord?.didNotAttendReason && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium bg-warning-soft text-warning border border-warning/25">
              "{planRecord.didNotAttendReason}"
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    /* ── Header do card — estado ATIVO ── */
    <div className={`flex items-center justify-between px-4 py-3 ${
      isSent ? "bg-brand-soft/40" : "bg-surface-muted/60"
    }`}>
      <div className="flex items-center gap-3">
        {/* Checkbox / lock */}
        {!isSent ? (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => p.onToggleSelect(budget.inclusion.id)}
            aria-label={`Selecionar ${name}`}
          />
        ) : (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="w-4 h-4 text-primary/70 shrink-0 cursor-default" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Aguardando prestação de contas
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Avatar */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(name)}`}>
          {initials || "?"}
        </div>

        <div className="min-w-0 flex-1 flex flex-col gap-y-1">
          {/* Linha 1: nome + dot */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground text-sm truncate">{name}</span>
            {budget.hasOverride && (
              <span className="w-2 h-2 rounded-full bg-warning-strong shrink-0" title="Valores personalizados" />
            )}
            {cardActual?.rhAdjusted && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs shrink-0 cursor-default text-warning">✏</span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">RH ajustou o realizado deste colaborador</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Linha 2: badge de data */}
          {budget.inclusion.scheduleStartDate && budget.inclusion.scheduleEndDate && (
            <span className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded-md bg-muted text-2xs font-normal text-muted-foreground tracking-[0.01em]">
              <Calendar className="text-muted-foreground shrink-0" style={{ width: 10, height: 10 }} aria-hidden="true" />
              {ddmmLocal(budget.inclusion.scheduleStartDate)}
              <span className="text-muted-foreground">–</span>
              {ddmmLocal(budget.inclusion.scheduleEndDate)}
            </span>
          )}
          {/* Linha 3: badges de função/tipo */}
          <div className="flex items-center gap-1 overflow-hidden flex-wrap">
            <span className="text-2xs font-semibold text-slate-600 bg-border px-2 py-0.5 rounded-full truncate shrink min-w-0">{functionName}</span>
            {isAtendimentoFunction(functionName) && (
              budget.inclusion.atendimentoTipo ? (
                <span className="text-2xs font-semibold text-primary bg-brand-soft px-2 py-0.5 rounded-full shrink-0" title="Tipo de atendimento — troque no modal de edição">
                  {budget.inclusion.atendimentoTipo === "key_account" ? "Key Account" : "Exec. Contas"}
                </span>
              ) : (
                <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Defina Key Account ou Executivo de Contas no modal de edição">
                  definir tipo
                </span>
              )
            )}
            {budget.isPercurso && (
              budget.percurseiroTipo ? (
                <span className="text-2xs font-semibold text-primary bg-brand-soft px-2 py-0.5 rounded-full shrink-0" title="Tipo do percurseiro (pacote fechado) — troque no modal de edição">
                  {PERCURSEIRO_TIPOS.find(t => t.value === budget.percurseiroTipo)?.label}
                </span>
              ) : (
                <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Defina Tipo 1 ou Tipo 2 no modal de edição — Tipo 1 usado provisoriamente">
                  definir tipo
                </span>
              )
            )}
            {budget.cenoEmpreitaVaga && (
              budget.cenoFreelaTipo ? (
                <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Modalidade da empreita cenotécnica — definida na tela de Escalação (somente leitura aqui)">
                  {CENO_FREELA_TIPO_LABELS[budget.cenoFreelaTipo]}
                </span>
              ) : (
                <span className="text-2xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full shrink-0" title="Sem modalidade de empreita: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação (somente leitura aqui)">
                  definir tipo na Escalação
                </span>
              )
            )}
            {budget.funcaoLocal && !budget.isPercurso && (
              <span className="text-2xs font-semibold text-slate-600 bg-muted border border-border px-2 py-0.5 rounded-full shrink-0" title={FUNCAO_LOCAL_RAZAO}>
                só diária
              </span>
            )}
            <span className={`text-2xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isCasa ? "bg-brand-soft text-primary" : "bg-warning-soft text-warning"}`}>{isCasa ? "Casa" : "Freela"}</span>
            {isSent && (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap bg-brand-soft text-primary border border-primary/25">
                <CheckCheck style={{ width: 10, height: 10 }} aria-hidden="true" />
                Salvo
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-0.5">
        {canMarkNotAttended && !isSent && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger-strong hover:bg-danger-soft rounded-lg"
                  aria-label={`Marcar ${name} como não participou`}
                  onClick={() => p.onNotAttended({
                    id: planRecord?.id,
                    budget: planRecord ? undefined : budget,
                    name,
                    functionName,
                  })}>
                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Marcar como não participou</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
        {canEdit && !isSent && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary-hover hover:bg-brand-soft rounded-lg" title="Editar valores" aria-label={`Editar valores de ${name}`} onClick={() => p.onEdit(budget)}>
            <Edit className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        )}
        {isSent && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary/70 hover:text-primary-hover hover:bg-brand-soft rounded-lg" onClick={() => p.onEdit(budget, true)} aria-label={`Visualizar detalhes de ${name}`}>
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Visualizar detalhes e observações</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {!isSent && (
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 rounded-lg text-success hover:text-success hover:bg-success-soft"
            title="Enviar para o Realizado"
            aria-label={`Enviar ${name} para o Realizado`}
            onClick={() => p.onSend(budget.inclusion.id)}
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        )}
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-slate-600 rounded-lg"
          title={isCollapsed ? "Expandir" : "Recolher"}
          aria-label={isCollapsed ? `Expandir card de ${name}` : `Recolher card de ${name}`}
          onClick={() => p.onToggleCollapse(budget.inclusion.id)}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
        </Button>
        </div>
      </div>
    </div>
  );
}

/** Corpo colapsável: 3 blocos (Diárias, Alimentação, Mobilidade). */
function BudgetCardBody({ budget, isNotAttended }: { budget: CalculatedBudget; isNotAttended: boolean }) {
  return (
    <div className={`px-4 pt-3 pb-3 flex-1 flex flex-col gap-3 transition-all duration-500${isNotAttended ? " opacity-25 grayscale pointer-events-none select-none" : ""}`}>
      {/* 3 blocos — hierarquia tipográfica + altura mínima consistente */}
      <div className="flex flex-col gap-2">
        {/* ── Diárias ── */}
        <div className="rounded-xl flex items-stretch bg-brand-soft" style={{ minHeight: 50 }}>
          {/* Esquerda: ícone + label + total */}
          <div className="flex items-center px-3 py-2.5 shrink-0" style={{ minWidth: 112 }}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-primary">Diárias</span>
              </div>
              <span className={cn("tabular-nums font-medium text-sm leading-none text-foreground tracking-[-0.01em]", (isNotAttended ? "line-through" : "no-underline"))}>{formatCurrency(budget.subtotalDiarias)}</span>
            </div>
          </div>
          {/* Separador */}
          <div className="bg-primary/7" style={{ width: 1, margin: "9px 0" }} />
          {/* Direita: detalhes */}
          <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
            {/* Percurso: pacote fechado × diárias fixas (viagem 2 / local 1) */}
            {budget.isPercurso && (
              <>
                <div className="flex items-center justify-between gap-x-2">
                  <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground">
                    {budget.diasComDiaria} {budget.diasComDiaria === 1 ? "diária" : "diárias"} ({budget.inclusion.needsTicket ? "percurso em viagem — regra fixa" : "percurso local — regra fixa"})
                  </span>
                  <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiaria)}</span>
                </div>
                {budget.percurseiro && (
                  <span className="text-2xs leading-tight text-muted-foreground tabular-nums"
                    title="Composição do pacote por diária: motoqueiro + fee Ivan + alimentação (3 refeições) + ajuda transporte + NF">
                    {formatCurrency(budget.percurseiro.motoqueiro)} + fee {formatCurrency(budget.percurseiro.fee)} + alim. {formatCurrency(budget.percurseiro.alimentacao)} + transp. {formatCurrency(budget.percurseiro.transporte)} + NF {formatCurrency(budget.percurseiro.nf)}
                  </span>
                )}
              </>
            )}
            {/* Empreita cenotécnica: valor FECHADO por nº de dias (tipo definido na Escalação) */}
            {!budget.isPercurso && budget.cenoEmpreita && (
              <>
                <div className="flex items-center justify-between gap-x-2">
                  <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground"
                    title="Empreita: valor fechado da tabela pelo nº de dias — não é diária × dias, e não sofre deflação por período. A modalidade é definida na tela de Escalação.">
                    Empreita — {CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} · {budget.cenoEmpreita.dias} {budget.cenoEmpreita.dias === 1 ? "dia" : "dias"} · valor fechado
                  </span>
                  <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.subtotalDiarias)}</span>
                </div>
                {budget.cenoEmpreita.extrapolado && (
                  <span className="text-2xs leading-tight font-semibold text-warning"
                    title="Fora da faixa da tabela: o valor foi extrapolado pelo incremento constante da modalidade">
                    valor extrapolado (tabela cobre 2 a 6 dias)
                  </span>
                )}
              </>
            )}
            {!budget.isPercurso && !budget.cenoEmpreita && budget.regraDiaria === "nenhuma" && (budget.weekdays > 0 || budget.weekends > 0) && (
              <span className="font-normal text-2xs leading-tight text-muted-foreground"
                title="Cenotécnica da casa (CLT): não recebe diária (nem em fim de semana)">
                sem diária (cenotécnica CLT)
              </span>
            )}
            {!budget.isPercurso && !budget.cenoEmpreita && budget.regraDiaria !== "nenhuma" && budget.weekdays > 0 && (
              <div className="flex items-center justify-between gap-x-2">
                <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth: "fit-content" }}>{formatDiasUteis(budget.weekdays)}</span>
                {budget.regraDiaria === "fds" ? (
                  <span className="font-normal text-2xs leading-tight shrink-0 text-muted-foreground"
                    title="Colaborador da casa (CLT): em dia útil já é assalariado — diária só nos fins de semana">
                    sem diária (CLT)
                  </span>
                ) : (
                  <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiariaUtil)}</span>
                )}
              </div>
            )}
            {!budget.isPercurso && !budget.cenoEmpreita && budget.regraDiaria !== "nenhuma" && budget.weekends > 0 && (
              <div className="flex items-center justify-between gap-x-2">
                <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth: "fit-content" }}>{formatFds(budget.weekends)}</span>
                <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.valorDiariaFds)}</span>
              </div>
            )}
            {!budget.isPercurso && !budget.cenoEmpreita && budget.weekdays === 0 && budget.weekends === 0 && (
              <span className="text-2xs font-normal text-muted-foreground">—</span>
            )}
            {/* Memória da deflação por período (>4 dias) */}
            {budget.deflationSegments.length > 1 && (
              <span className="text-2xs leading-tight font-normal tabular-nums text-primary"
                title="Deflação por período: 100% até o 4º dia; fatores reduzidos nas faixas seguintes">
                {formatSegmentsMemo(budget.deflationSegments)}
              </span>
            )}
          </div>
        </div>

        {/* ── Alimentação ── */}
        <div className="rounded-xl flex items-stretch bg-warning-soft" style={{ minHeight: 50 }}>
          <div className="flex items-center px-3 py-2.5 shrink-0" style={{ minWidth: 112 }}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <Utensils className="w-2.5 h-2.5 shrink-0 text-warning" aria-hidden="true" />
                <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-warning">Alimentação</span>
                {budget.alimEstimada && (
                  <span className="inline-flex items-center px-1 py-px rounded-full text-2xs font-semibold shrink-0 bg-warning-soft text-warning"
                    title="Sem horários da passagem registrada — refeições estimadas até a compra">
                    estimado
                  </span>
                )}
              </div>
              <span className={cn("tabular-nums font-medium text-sm leading-none text-foreground tracking-[-0.01em]", (isNotAttended ? "line-through" : "no-underline"))}>{formatCurrency(budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds)}</span>
            </div>
          </div>
          <div className="bg-warning/8" style={{ width: 1, margin: "9px 0" }} />
          <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
            {(budget.almocoSemana > 0 || budget.jantarSemana > 0) && (
              <div className="flex items-center justify-between gap-x-2">
                <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth: "fit-content" }}>Semana</span>
                <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-warning">{formatCurrency(budget.almocoSemana + budget.jantarSemana)}</span>
              </div>
            )}
            {(budget.almocoFds > 0 || budget.jantarFds > 0) && (
              <div className="flex items-center justify-between gap-x-2">
                <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth: "fit-content" }}>Fim de semana</span>
                <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-warning">{formatCurrency(budget.almocoFds + budget.jantarFds)}</span>
              </div>
            )}
            {budget.almocoSemana === 0 && budget.jantarSemana === 0 && budget.almocoFds === 0 && budget.jantarFds === 0 && (
              budget.isPercurso
                ? <span className="text-2xs font-normal text-muted-foreground" title="Alimentação (3 refeições) já está dentro do pacote do percurseiro">incluída no pacote</span>
                : budget.funcaoLocal
                  ? <span className="text-2xs font-normal text-muted-foreground" title={FUNCAO_LOCAL_RAZAO}>sem alimentação (função local)</span>
                  : <span className="text-2xs font-normal text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* ── Mobilidade ── */}
        <div className="rounded-xl flex items-stretch bg-brand-soft" style={{ minHeight: 50 }}>
          <div className="flex items-center px-3 py-2.5 shrink-0" style={{ minWidth: 112 }}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <Car className="w-2.5 h-2.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-primary">Mobilidade</span>
              </div>
              <span className={cn("tabular-nums font-medium text-sm leading-none text-foreground tracking-[-0.01em]", (isNotAttended ? "line-through" : "no-underline"))}>{formatCurrency(budget.mobilidade)}</span>
            </div>
          </div>
          <div className="bg-primary-hover/8" style={{ width: 1, margin: "9px 0" }} />
          <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-2.5">
            {budget.mobilidadeIda > 0 && (
              <div className="flex items-center justify-between gap-x-2">
                <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth: "fit-content" }}>Ida</span>
                <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.mobilidadeIda)}</span>
              </div>
            )}
            {budget.mobilidadeVolta > 0 && (
              <div className="flex items-center justify-between gap-x-2">
                <span className="text-2xs leading-tight font-normal flex-1 text-muted-foreground" style={{ minWidth: "fit-content" }}>Volta</span>
                <span className="font-normal tabular-nums text-2xs leading-tight shrink-0 tracking-wide text-primary">{formatCurrency(budget.mobilidadeVolta)}</span>
              </div>
            )}
            {budget.mobilidadeIda === 0 && budget.mobilidadeVolta === 0 && (
              budget.isPercurso
                ? <span className="text-2xs font-normal text-muted-foreground" title="Ajuda de custo transporte já está dentro do pacote do percurseiro">incluída no pacote</span>
                : budget.funcaoLocal
                  ? <span className="text-2xs font-normal text-muted-foreground" title={FUNCAO_LOCAL_RAZAO}>sem mobilidade (função local)</span>
                  : <span className="text-2xs font-normal text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const BudgetCard = memo(function BudgetCard(p: BudgetCardProps) {
  const { budget, name, isSent, isSelected, isCollapsed, isHighlighted, planRecord, eventNotes } = p;
  const isCasa = isCasaType(budget.collaborator?.type);
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const isNotAttended = !!planRecord?.didNotAttend;

  return (
    <div
      data-card-id={budget.inclusion.id}
      className={`rounded-xl border transition-all duration-500 ease-in-out overflow-hidden flex flex-col group h-full ${
        isNotAttended ? "bg-surface-muted border-border shadow-1" :
        isHighlighted ? "bg-card ring-2 ring-primary shadow-3" :
        isSelected ? "bg-card ring-2 ring-success-strong border-success/25 shadow-2" :
        isSent ? "bg-card border-primary/25 opacity-85 shadow-1" :
        budget.hasOverride ? "bg-card border-warning/25 shadow-1" : "bg-card border-border shadow-1"
      } ${!isNotAttended && !isSelected ? "hover:-translate-y-1 hover:shadow-3  hover:border-primary/25" : ""}`}
    >
      {/* stripe top */}
      <div className={`h-[3px] ${isSelected ? "bg-success-strong" : isSent ? "bg-primary/40" : isNotAttended ? "bg-slate-300" : "bg-primary"}`} />
      <BudgetCardHeader {...p} isNotAttended={isNotAttended} initials={initials} isCasa={isCasa} />

      {/* ── Corpo colapsável ── */}
      {!isCollapsed && <BudgetCardBody budget={budget} isNotAttended={isNotAttended} />}

      {/* ── Rodapé Total ── */}
      <div
        className={cn(`transition-all duration-500${isNotAttended ? " opacity-30 grayscale" : ""}`, "flex justify-between items-center py-2.5 px-4", (isNotAttended ? "bg-surface-muted" : "bg-brand-soft"))}
        style={{
          borderTop: isNotAttended ? "1px solid var(--border)" : "1px solid var(--brand-soft)",
          marginTop: "auto",
        }}>
        <span className={cn("text-2xs font-semibold uppercase tracking-widest", (isNotAttended ? "text-muted-foreground" : "text-primary"))}>
          {isNotAttended ? "Não contabilizado" : "Total Planejado"}
        </span>
        <span className={cn("text-base font-medium tracking-[-0.02em] tabular-nums", (isNotAttended ? "text-muted-foreground" : "text-primary"), (isNotAttended ? "line-through" : "no-underline"))}>
          {formatCurrency(budget.totalFinal)}
        </span>
      </div>
      {planRecord && eventNotes.length > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-1">
          <BudgetNotesBadge notes={eventNotes} entityId={planRecord.id} />
          <BudgetNotesSnippet notes={eventNotes} entityId={planRecord.id} />
        </div>
      )}
    </div>
  );
});

export default BudgetCard;
