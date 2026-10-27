/**
 * CARD de colaborador da Visão Geral do Planejado — 25/09 (modularização);
 * redesenho 08/10.
 *
 * Antes: avatar colorido, faixa de 3px no topo, três blocos com fundo
 * (azul, âmbar, azul) e as ações a 60% de opacidade até o mouse chegar —
 * ~360px por pessoa, com o total lá embaixo.
 *
 * Agora o card é um EXTRATO: quem é (nome, função, período, chips) e o total
 * no alto, à direita, onde o olho procura; três linhas de lançamento
 * (Diárias, Alimentação, Mobilidade) com a conta miúda no meio e o valor
 * alinhado à direita; as ações num rodapé sempre visível. Tudo que estava
 * aqui continua: tipos de atendimento/percurseiro/empreita, "só diária",
 * CLT, deflação por período, estimado, "incluída no pacote", função local,
 * ajuste do RH, observações e o estado "Não participou" com motivo.
 *
 * Memoizado (é item de lista virtualizada).
 */
import { memo } from "react";
import { BadgeCheck, ChevronDown, ChevronUp, Eye, Lock, PencilLine, Send, Undo2, UserX } from "lucide-react";
import { cn, formatDiasUteis, formatFds } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetNotesBadge, BudgetNotesSnippet } from "@/components/budget-chat";
import { isAtendimentoFunction } from "@shared/atendimento";
import { FUNCAO_LOCAL_RAZAO, PERCURSEIRO_TIPOS } from "@shared/calculation-rules";
import { CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import { AvisosDoHonorario, SeloDoHonorario, fonteDoHonorario } from "./honorario-no-planejado";
import { SeloDaPreAprovacao, quandoLegivel, type PlanejadoDaTela } from "./pre-aprovacao";
import { pedePreAprovacao, podeLiberarParaProducao, type SituacaoDaPreAprovacao } from "@shared/pre-aprovacao";
import { SeloContratoAtivo } from "@/components/contratos/pecas";
import type { SituacaoDoColaboradorApi } from "@/components/contratos/api";
import type { BudgetActual, BudgetNote, BudgetPlanned as BudgetPlannedRow } from "@shared/schema";
import {
  ddmmLocal, formatCurrency, formatSegmentsMemo, isCasaType,
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
  /** "Usar o honorário aprovado" (21/10): limpa o ajuste manual da mão de obra. */
  onUsarHonorario?: (id: string) => void;
  /** Pré-aprovação do DP (26/10): pendente, pré-aprovada, valor mudou, enviada, ausente. */
  situacao: SituacaoDaPreAprovacao;
  onPreAprovar: (b: CalculatedBudget) => void;
  onDesfazerPreAprovacao: (b: CalculatedBudget) => void;
  /** Contrato ativo do CNPJ da pessoa (Fase 0, 27/10) — só o DP recebe; selo só quando falta. */
  contrato?: SituacaoDoColaboradorApi;
}

// `info` e `perigo` (08/10) são do Realizado (em revisão, recusado), que reaproveita o Chip.
export type Tom = "neutro" | "marca" | "alerta" | "ok" | "info" | "perigo";
const TOM: Record<Tom, string> = {
  neutro: "bg-muted text-slate-600 border-transparent",
  marca: "bg-brand-soft text-primary border-transparent",
  alerta: "bg-warning-soft text-warning border-warning/25",
  ok: "bg-success-soft text-success border-transparent",
  info: "bg-info-soft text-info border-transparent",
  perigo: "bg-danger-soft text-danger border-danger/25",
};

/** Etiqueta curta do card (tipo, modalidade, situação). */
export function Chip({ tom = "neutro", title, children, className }: { tom?: Tom; title?: string; children: React.ReactNode; className?: string }) {
  return (
    <span title={title} className={cn("pla-chip inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-2xs font-medium whitespace-nowrap", TOM[tom], className)}>
      {children}
    </span>
  );
}

/** Linha de lançamento do extrato: rótulo · conta miúda · valor. */
export function Lancamento({ rotulo, cor, valor, riscado, children }: {
  rotulo: string; cor: string; valor: number; riscado: boolean; children: React.ReactNode;
}) {
  return (
    <div className="pla-lancamento">
      <dt className="pla-lancamento-rotulo flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <span aria-hidden="true" className={cn("w-1.5 h-1.5 rounded-full shrink-0", cor)} />
        {rotulo}
      </dt>
      <dd className="pla-lancamento-conta m-0 min-w-0 flex flex-col gap-0.5 text-2xs leading-4 text-muted-foreground">{children}</dd>
      <dd className={cn("pla-lancamento-valor m-0 text-sm font-medium tabular-nums text-right text-foreground", riscado && "line-through text-muted-foreground")}>
        {formatCurrency(valor)}
      </dd>
    </div>
  );
}

/** "1 dia útil · R$ 465,00" — a conta de uma faixa, na mesma linha (só o valor do lançamento fica na coluna da direita). */
export function Conta({ rotulo, valor, title }: { rotulo: React.ReactNode; valor?: React.ReactNode; title?: string }) {
  return (
    <span className="min-w-0" title={title}>
      {rotulo}
      {valor != null && <> · <span className="tabular-nums text-slate-600">{valor}</span></>}
    </span>
  );
}

/** Corpo colapsável: Diárias, Alimentação e Mobilidade. */
function BudgetCardBody({ budget, isNotAttended }: { budget: CalculatedBudget; isNotAttended: boolean }) {
  const alimTotal = budget.almocoSemana + budget.jantarSemana + budget.almocoFds + budget.jantarFds;
  // Honorário APROVADO (21/10): a mão de obra é o aprovado — a conta diz de onde veio.
  const hon = budget.honorarioAprovado ? budget.honorario : null;
  const dias = budget.deflationSegments[0]?.days ?? budget.diasComDiaria;
  // Diária por dia (útil/fds) só quando não há valor fechado (percurso, tabela ou honorário).
  const porDiaria = !budget.isPercurso && !budget.cenoEmpreita && !hon;
  const origemDaRegra = budget.inclusion.empreitaEmpresa ? "empreita da escala" : budget.cenoFreelaTipo ? "tabela" : "diárias";
  return (
    <dl className={cn("pla-extrato m-0 px-4 py-1", isNotAttended && "opacity-50 grayscale select-none")}>
      <Lancamento rotulo="Diárias" cor="bg-primary" valor={budget.subtotalDiarias} riscado={isNotAttended}>
        {hon && (
          budget.honorarioDifere ? (
            <Conta rotulo={`Ajuste manual · ${dias} ${dias === 1 ? "dia" : "dias"}`} valor={formatCurrency(budget.valorDiaria)} title={fonteDoHonorario(hon)} />
          ) : (
            <>
              <span className="text-success font-medium" data-testid="planejado-fonte-honorario">{fonteDoHonorario(hon)}</span>
              {budget.maoDeObraPelaRegra != null && budget.maoDeObraPelaRegra !== budget.subtotalDiarias && (
                <span className="tabular-nums" title="O honorário aprovado substitui a mão de obra da regra de hoje; alimentação e mobilidade seguem as regras normais.">
                  no lugar de {formatCurrency(budget.maoDeObraPelaRegra)} ({origemDaRegra})
                </span>
              )}
            </>
          )
        )}
        {/* Percurso: pacote fechado × dias trabalhados (regra 15/10) */}
        {budget.isPercurso && (
          <>
            <Conta
              rotulo={`${budget.diasComDiaria} ${budget.diasComDiaria === 1 ? "diária" : "diárias"} · pacote por dia trabalhado`}
              valor={formatCurrency(budget.valorDiaria)}
            />
            {budget.percurseiro && (
              <span className="tabular-nums" title="Composição do pacote por diária: motoqueiro + fee Ivan + alimentação (3 refeições) + ajuda transporte + NF">
                {formatCurrency(budget.percurseiro.motoqueiro)} + fee {formatCurrency(budget.percurseiro.fee)} + alim. {formatCurrency(budget.percurseiro.alimentacao)} + transp. {formatCurrency(budget.percurseiro.transporte)} + NF {formatCurrency(budget.percurseiro.nf)}
              </span>
            )}
          </>
        )}
        {/* Empreita cenotécnica: valor FECHADO por nº de dias (tipo definido na Escalação) */}
        {!budget.isPercurso && budget.cenoEmpreita && (
          <>
            <Conta
              title="Empreita: valor fechado da tabela pelo nº de dias — não é diária × dias, e não sofre deflação por período. A modalidade é definida na tela de Escalação."
              rotulo={`Empreita — ${CENO_FREELA_TIPO_LABELS[budget.cenoEmpreita.tipo]} · ${budget.cenoEmpreita.dias} ${budget.cenoEmpreita.dias === 1 ? "dia" : "dias"} · valor fechado`}
            />
            {budget.cenoEmpreita.extrapolado && (
              <span className="font-medium text-warning" title="Fora da faixa da tabela: o valor foi extrapolado pelo incremento constante da modalidade">
                valor extrapolado (tabela cobre 2 a 6 dias)
              </span>
            )}
          </>
        )}
        {porDiaria && budget.regraDiaria === "nenhuma" && (budget.weekdays > 0 || budget.weekends > 0) && (
          <Conta title="Cenotécnica da casa (CLT): não recebe diária (nem em fim de semana)" rotulo="sem diária (cenotécnica CLT)" />
        )}
        {porDiaria && budget.regraDiaria !== "nenhuma" && budget.weekdays > 0 && (
          budget.regraDiaria === "fds"
            ? <Conta rotulo={formatDiasUteis(budget.weekdays)} valor="sem diária (CLT)" title="Colaborador da casa (CLT): em dia útil já é assalariado — diária só nos fins de semana" />
            : <Conta rotulo={formatDiasUteis(budget.weekdays)} valor={formatCurrency(budget.valorDiariaUtil)} />
        )}
        {porDiaria && budget.regraDiaria !== "nenhuma" && budget.weekends > 0 && (
          <Conta rotulo={formatFds(budget.weekends)} valor={formatCurrency(budget.valorDiariaFds)} />
        )}
        {porDiaria && budget.weekdays === 0 && budget.weekends === 0 && <span>—</span>}
        {/* Memória da deflação por período (>4 dias) */}
        {budget.deflationSegments.length > 1 && (
          <span className="tabular-nums text-primary" title="Deflação por período: 100% até o 4º dia; fatores reduzidos nas faixas seguintes">
            {formatSegmentsMemo(budget.deflationSegments)}
          </span>
        )}
      </Lancamento>

      <Lancamento rotulo="Alimentação" cor="bg-warning-strong" valor={alimTotal} riscado={isNotAttended}>
        {budget.alimEstimada && (
          <span title="Sem horários da passagem registrada — refeições estimadas até a compra">
            <Chip tom="alerta">estimado</Chip>
          </span>
        )}
        {(budget.almocoSemana > 0 || budget.jantarSemana > 0) && (
          <Conta rotulo="Semana" valor={formatCurrency(budget.almocoSemana + budget.jantarSemana)} />
        )}
        {(budget.almocoFds > 0 || budget.jantarFds > 0) && (
          <Conta rotulo="Fim de semana" valor={formatCurrency(budget.almocoFds + budget.jantarFds)} />
        )}
        {alimTotal === 0 && (
          budget.isPercurso
            ? <span title="Alimentação (3 refeições) já está dentro do pacote do percurseiro">incluída no pacote</span>
            : budget.funcaoLocal
              ? <span title={FUNCAO_LOCAL_RAZAO}>sem alimentação (função local)</span>
              : <span>—</span>
        )}
      </Lancamento>

      <Lancamento rotulo="Mobilidade" cor="bg-slate-400" valor={budget.mobilidade} riscado={isNotAttended}>
        {budget.mobilidadeIda > 0 && <Conta rotulo="Ida" valor={formatCurrency(budget.mobilidadeIda)} />}
        {budget.mobilidadeVolta > 0 && <Conta rotulo="Volta" valor={formatCurrency(budget.mobilidadeVolta)} />}
        {budget.mobilidadeIda === 0 && budget.mobilidadeVolta === 0 && (
          budget.isPercurso
            ? <span title="Ajuda de custo transporte já está dentro do pacote do percurseiro">incluída no pacote</span>
            : budget.funcaoLocal
              ? <span title={FUNCAO_LOCAL_RAZAO}>sem mobilidade (função local)</span>
              : <span>—</span>
        )}
      </Lancamento>
    </dl>
  );
}

/** Botão do rodapé do card: discreto, sempre visível, com texto. */
const ACAO = "pas-alvo inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";

export const BudgetCard = memo(function BudgetCard(p: BudgetCardProps) {
  const {
    budget, name, functionName, isSent, isSelected, isCollapsed, isHighlighted, planRecord, cardActual, eventNotes,
    canEdit, canMarkNotAttended, restorePending, situacao,
  } = p;
  const preAprovado = situacao === "pre_aprovado";
  const pedePre = pedePreAprovacao(situacao);
  // 27/10: evento legado vai ao Realizado sem a pré-aprovação (fluxo antigo).
  const podeEnviar = podeLiberarParaProducao(situacao);
  const plano = planRecord as PlanejadoDaTela | undefined;
  const isCasa = isCasaType(budget.collaborator?.type);
  const isNotAttended = !!planRecord?.didNotAttend;
  const id = budget.inclusion.id;
  const inicio = budget.inclusion.scheduleStartDate;
  const fim = budget.inclusion.scheduleEndDate;
  const temNotas = !!planRecord && eventNotes.some(n => n.entityId === planRecord.id);

  return (
    <article
      data-card-id={id}
      aria-label={name}
      className={cn(
        "pla-card group flex flex-col h-full rounded-xl border bg-card",
        isNotAttended ? "pla-card-ausente bg-surface-muted border-border"
          : isSelected ? "pla-card-sel border-primary"
          : budget.hasOverride && !isSent ? "border-warning/25"
          : "border-border",
        isHighlighted && "pla-destaque",
      )}
    >
      {/* ── Quem é · total ── */}
      <header className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
        <div className="pt-0.5 shrink-0 w-4 flex justify-center">
          {isNotAttended ? (
            <UserX className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          ) : !isSent && canEdit ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => p.onToggleSelect(id)}
              aria-label={`Selecionar ${name}`}
              className="pas-alvo"
            />
          ) : (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Enviado — aguardando prestação de contas">
                    <Lock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">Aguardando prestação de contas</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className={cn("m-0 text-sm font-semibold leading-5 truncate", isNotAttended ? "text-slate-600" : "text-foreground")}>{name}</h3>
            {cardActual?.rhAdjusted && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-label="DP ajustou o realizado" className="inline-flex shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <PencilLine className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">DP ajustou o realizado deste colaborador</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground truncate">
            {functionName}
            {inicio && fim && <span className="tabular-nums"> · {ddmmLocal(inicio)}–{ddmmLocal(fim)}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {/* Tipo não é alerta: Freela em neutro, o âmbar fica para o que pede atenção. */}
            <Chip tom={isCasa ? "marca" : "neutro"}>{isCasa ? "Casa" : "Freela"}</Chip>
            {isNotAttended ? (
              <>
                <Chip tom="alerta"><UserX className="w-3 h-3" aria-hidden="true" />Não participou</Chip>
                {planRecord?.didNotAttendReason && (
                  <Chip tom="neutro" className="max-w-full whitespace-normal h-auto py-px">"{planRecord.didNotAttendReason}"</Chip>
                )}
              </>
            ) : (
              <>
                {isAtendimentoFunction(functionName) && (
                  budget.inclusion.atendimentoTipo
                    ? <Chip tom="marca" title="Tipo de atendimento — troque no modal de edição">{budget.inclusion.atendimentoTipo === "key_account" ? "Key Account" : "Exec. Contas"}</Chip>
                    : <Chip tom="alerta" title="Defina Key Account ou Executivo de Contas no modal de edição">definir tipo</Chip>
                )}
                {budget.isPercurso && (
                  budget.percurseiroTipo
                    ? <Chip tom="marca" title="Tipo do percurseiro (pacote fechado) — troque no modal de edição">{PERCURSEIRO_TIPOS.find(t => t.value === budget.percurseiroTipo)?.label}</Chip>
                    : <Chip tom="alerta" title="Defina Tipo 1 ou Tipo 2 no modal de edição — Tipo 1 usado provisoriamente">definir tipo</Chip>
                )}
                {budget.cenoEmpreitaVaga && (budget.cenoFreelaTipo || !budget.honorarioAprovado) && (
                  budget.cenoFreelaTipo
                    ? <Chip tom="alerta" title="Modalidade da empreita cenotécnica — definida na tela de Escalação (somente leitura aqui)">{CENO_FREELA_TIPO_LABELS[budget.cenoFreelaTipo]}</Chip>
                    : <Chip tom="alerta" title="Sem modalidade de empreita: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação (somente leitura aqui)">definir tipo na Escalação</Chip>
                )}
                {budget.funcaoLocal && !budget.isPercurso && <Chip title={FUNCAO_LOCAL_RAZAO}>só diária</Chip>}
                <SeloDoHonorario budget={budget} />
                {budget.hasOverride && !isSent && (
                  <Chip tom="alerta" title="Valores personalizados"><PencilLine className="w-3 h-3" aria-hidden="true" />Ajuste manual</Chip>
                )}
                <SeloDaPreAprovacao situacao={situacao} planejado={plano} />
                <SeloContratoAtivo situacao={p.contrato?.situacao} contratos={p.contrato?.contratos} />
                {isSent && <Chip tom="info" title="Liberado para a Produção: a prestação está no Realizado"><Send className="w-3 h-3" aria-hidden="true" />No Realizado</Chip>}
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right pl-1">
          <p className="m-0 text-2xs text-muted-foreground whitespace-nowrap">{isNotAttended ? "Não contabilizado" : "Total planejado"}</p>
          <p className={cn("m-0 text-lg leading-6 font-semibold tracking-[-0.01em] tabular-nums whitespace-nowrap", isNotAttended ? "text-muted-foreground line-through" : "text-foreground")}>
            {formatCurrency(budget.totalFinal)}
          </p>
        </div>
      </header>

      {!isNotAttended && (
        <AvisosDoHonorario
          budget={budget}
          actual={cardActual}
          isSent={isSent}
          podeEditar={canEdit}
          onUsarHonorario={p.onUsarHonorario}
          className="flex flex-col gap-1.5 px-4 pb-2"
        />
      )}

      {!isCollapsed && <BudgetCardBody budget={budget} isNotAttended={isNotAttended} />}

      {temNotas && planRecord && (
        <div className="flex items-center gap-2 px-4 pb-2 min-w-0">
          <div className="min-w-0 flex-1 [&>div]:mt-0"><BudgetNotesSnippet notes={eventNotes} entityId={planRecord.id} /></div>
          <BudgetNotesBadge notes={eventNotes} entityId={planRecord.id} />
        </div>
      )}

      {/* Quem pré-aprovou e quando (26/10) — a assinatura do DP, à vista. */}
      {preAprovado && plano?.approvedAt && (
        <p className="m-0 px-4 pb-2 text-2xs leading-4 text-success" data-testid="planejado-quem-pre-aprovou">
          <BadgeCheck className="inline w-3 h-3 -mt-px mr-1" aria-hidden="true" />
          Pré-aprovado por {plano.approvedByName || "DP"} · {quandoLegivel(plano.approvedAt)}
        </p>
      )}
      {situacao === "desatualizado" && (
        <p role="note" className="m-0 mx-4 mb-2 rounded-md border border-warning/25 bg-warning-soft px-2.5 py-1.5 text-2xs leading-4 text-warning" data-testid="planejado-valor-mudou">
          O valor mudou depois da pré-aprovação ({formatCurrency(plano?.totalValue ?? 0)} → {formatCurrency(budget.totalFinal)}). Pré-aprove de novo para liberar.
        </p>
      )}

      {/* ── Ações: sempre à vista, discretas; a forte é a da barra de seleção ── */}
      <footer className="mt-auto flex items-center gap-1 px-2.5 py-1.5 border-t border-border">
        <button
          type="button"
          className={cn(ACAO, "text-muted-foreground hover:bg-muted hover:text-foreground")}
          aria-label={isCollapsed ? `Expandir card de ${name}` : `Recolher card de ${name}`}
          aria-expanded={!isCollapsed}
          onClick={() => p.onToggleCollapse(id)}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
          <span className="max-[380px]:hidden">{isCollapsed ? "Detalhar" : "Recolher"}</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {isNotAttended ? (
            canMarkNotAttended && planRecord && (
              <button
                type="button"
                className={cn(ACAO, "text-primary hover:bg-brand-soft")}
                onClick={() => p.onRestore({
                  id: planRecord.id, name, functionName,
                  startDate: inicio ?? undefined,
                  endDate: fim ?? undefined,
                })}
                disabled={restorePending}
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                Restaurar
              </button>
            )
          ) : (
            <>
              {canMarkNotAttended && !isSent && (
                <button
                  type="button"
                  className={cn(ACAO, "text-muted-foreground hover:bg-danger-soft hover:text-danger")}
                  aria-label={`Marcar ${name} como não participou`}
                  title="Marcar como não participou"
                  onClick={() => p.onNotAttended({
                    id: planRecord?.id,
                    budget: planRecord ? undefined : budget,
                    name,
                    functionName,
                  })}
                >
                  <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="max-[480px]:hidden">Não participou</span>
                </button>
              )}
              {isSent && (
                <button
                  type="button"
                  className={cn(ACAO, "text-slate-700 hover:bg-muted")}
                  aria-label={`Visualizar detalhes de ${name}`}
                  title="Visualizar detalhes e observações"
                  onClick={() => p.onEdit(budget, true)}
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  Ver detalhes
                </button>
              )}
              {canEdit && !isSent && (
                <button
                  type="button"
                  className={cn(ACAO, "text-slate-700 hover:bg-muted")}
                  aria-label={`Editar valores de ${name}`}
                  title="Editar valores"
                  onClick={() => p.onEdit(budget)}
                >
                  <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
                  Editar
                </button>
              )}
              {/* 26/10: primeiro o DP pré-aprova; só então a vaga vai ao Realizado. */}
              {canEdit && !isSent && preAprovado && (
                <button
                  type="button"
                  className={cn(ACAO, "text-muted-foreground hover:bg-warning-soft hover:text-warning")}
                  aria-label={`Desfazer a pré-aprovação de ${name}`}
                  title="Desfazer a pré-aprovação"
                  onClick={() => p.onDesfazerPreAprovacao(budget)}
                >
                  <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="max-[480px]:hidden">Desfazer</span>
                </button>
              )}
              {canEdit && !isSent && pedePre && (
                <button
                  type="button"
                  className={cn(ACAO, "text-success bg-success-soft hover:bg-success-strong hover:text-white")}
                  aria-label={`Pré-aprovar o valor de ${name}`}
                  title="Pré-aprovar o valor (DP)"
                  onClick={() => p.onPreAprovar(budget)}
                  data-testid="planejado-pre-aprovar-linha"
                >
                  <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Pré-aprovar
                </button>
              )}
              {canEdit && !isSent && podeEnviar && (
                <button
                  type="button"
                  className={cn(ACAO, "text-primary bg-brand-soft hover:bg-primary hover:text-primary-foreground")}
                  aria-label={`Enviar ${name} para o Realizado`}
                  title="Enviar ao Realizado (liberar para a Produção)"
                  onClick={() => p.onSend(id)}
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Enviar
                </button>
              )}
            </>
          )}
        </div>
      </footer>
    </article>
  );
});

export default BudgetCard;
