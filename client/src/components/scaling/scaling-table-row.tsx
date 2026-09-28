/**
 * Uma linha da tabela da Escalação (25/09 — extraída de scaling-table.tsx):
 * seleção, ID, função/evento, colaborador (ou "Escalar alguém"), período,
 * "Precisa de", situação e as ações da linha.
 */
import { rotuloEmpreita, vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { AlertTriangle, ArrowLeftRight, Check, MessageSquare, ChevronRight, Lock, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDiarias, formatDateRange } from "@/lib/utils";
import type { TeamInclusion } from "@shared/schema";
import { StatusBadge } from "@/components/common/status-badge";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { ScalingTableProps } from "./scaling-table";
import { detalheDaSituacao, getStatusBadge, needsDaLinha, shouldShowPendingSwapBadge } from "./scaling-table-cells";

export const CHECKBOX_CLS = "border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary";

export function ScalingTableRow({ inclusion, p }: { inclusion: TeamInclusion; p: Omit<ScalingTableProps, "rows"> }) {
  const {
    onRowClick, onViewComments, onEscalar, getFunctionName, getEventName, getCollaboratorName, getCollaboratorCity, getTicket, getAccommodation,
    pendingSwapByInclusion, pendingChangeByInclusion, approvedSwapInclusionIds, seenSwapIds, currentUserId, isAdminOrPurchasing,
    canManageFunction, canApproveProduction, readOnly = false, commentCountByInclusion, getResponsavelDaFuncao, temPassagemComprada, isEventLocked,
    podeConfirmarRapido, onConfirmarRapido, confirmandoId, selectedIds, getSelectBlockReason, onToggleSelect,
  } = p;

  const ticket = getTicket(inclusion.id);
  const funcao = getFunctionName(inclusion.functionId);
  const swap = pendingSwapByInclusion.get(inclusion.id);
  const mostraSwap = shouldShowPendingSwapBadge(swap, inclusion, { currentUserId, isAdminOrPurchasing, seenSwapIds });
  const pedido = pendingChangeByInclusion?.get(inclusion.id);
  const city = inclusion.city || getCollaboratorCity(inclusion.collaboratorId);
  const selectBlock = getSelectBlockReason(inclusion);
  const isSelected = selectedIds.has(inclusion.id);
  const idLabel = `#${inclusion.inclusionNumber ?? ""}`;
  // Guardados porque agora aparecem duas vezes: no texto e no title.
  const nomeDoEvento = getEventName(inclusion.eventId);
  const nomeDoColaborador = getCollaboratorName(inclusion.collaboratorId);
  const cancelada = inclusion.status === "cancelado";
  const eventoTravado = isEventLocked?.(inclusion) ?? false;
  const podeGerir = canManageFunction(inclusion.functionId) && !readOnly && !eventoTravado;
  const empreita = vagaComEmpreita(inclusion);
  const vazia = !inclusion.collaboratorId && !empreita && !cancelada;
  const needs = needsDaLinha(inclusion, {
    ticket, funcao,
    passagemComprada: temPassagemComprada?.(inclusion) ?? !!ticket?.purchaseDate,
    hospedagem: getAccommodation(inclusion.id),
  });
  const detalhe = detalheDaSituacao(inclusion, { swap: mostraSwap ? swap : undefined, pedido });

  // O marcador de 3px responde a uma pergunta só: isto espera
  // alguém? Âmbar quando espera VOCÊ (vaga sua por preencher, ou
  // aprovação que é sua), roxo quando está com outra pessoa.
  const esperaVoce = (vazia && podeGerir) || (inclusion.status === "aguardando_producao" && canApproveProduction);
  // Só pinta de roxo o que a linha CONSEGUE explicar: a troca que
  // este usuário não deve ver não tem detalhe embaixo, e uma borda
  // colorida sem legenda é charada, não sinal.
  const emAnalise = (!!swap && mostraSwap) || !!pedido;
  // Tokens (23/09): espera você = warning-strong; em análise = info-strong.
  const marker = cancelada ? "border-l-transparent" : esperaVoce ? "border-l-warning-strong" : emAnalise ? "border-l-info-strong" : "border-l-transparent";
  const nComments = commentCountByInclusion?.get(inclusion.id) ?? 0;

  return (
    <tr
      className={`group/row h-[52px] border-b border-border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${isSelected ? "bg-brand-soft hover:bg-brand-soft" : "bg-card hover:bg-surface-muted"} ${cancelada ? "opacity-55" : ""}`}
      onClick={() => onRowClick(inclusion)}
      tabIndex={0}
      aria-label={`Abrir detalhes da escalação ${idLabel}`}
      aria-selected={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(inclusion); }
      }}
      data-testid={`row-inclusion-${inclusion.id}`}
    >
      <td
        className={`px-3 text-center border-l-[3px] ${marker}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* `title` nativo em vez do Tooltip do Radix: eram 150
            instâncias por página, cada uma com contexto e portal
            próprios, e a lista congelava perto de um segundo a cada
            reordenação. O motivo continua legível — no title e no
            aria-label — e o cabeçalho, que é UM, mantém o Tooltip. */}
        <span className="inline-flex" title={selectBlock ?? undefined}>
          <Checkbox
            checked={isSelected}
            disabled={!!selectBlock}
            onCheckedChange={() => onToggleSelect(inclusion.id)}
            aria-label={selectBlock ? `Não selecionável: ${selectBlock}` : `Selecionar escalação ${idLabel}`}
            data-testid={`checkbox-select-${inclusion.id}`}
            className={CHECKBOX_CLS}
          />
        </span>
      </td>

      <td className="pr-3.5 whitespace-nowrap">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{idLabel}</span>
      </td>

      <td className="px-3.5 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate" title={funcao}>{funcao}</div>
        <div className="text-xs text-muted-foreground truncate" title={nomeDoEvento}>{nomeDoEvento}</div>
      </td>

      <td className="px-3.5 min-w-0">
        {empreita ? (
          <>
            <div className="text-sm font-medium text-foreground break-words" title={rotuloEmpreita(inclusion)}>
              <StatusBadge tone="info" className="mr-1.5 uppercase tracking-wide">Empreita</StatusBadge>
              {inclusion.empreitaEmpresa}
            </div>
            <div className="text-xs text-muted-foreground">
              {inclusion.empreitaPessoas ?? 0} {Number(inclusion.empreitaPessoas) === 1 ? "pessoa" : "pessoas"}
              {inclusion.empreitaValor != null ? ` · ${(Number(inclusion.empreitaValor) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` : ""}
            </div>
          </>
        ) : inclusion.collaboratorId ? (
          <>
            <div className="text-sm font-medium text-foreground truncate" title={nomeDoColaborador}>{nomeDoColaborador}</div>
            {city && <div className="text-xs text-muted-foreground truncate" title={city}>{city}</div>}
          </>
        ) : vazia && podeGerir ? (
          <button
            type="button"
            onClick={(e) => onEscalar(e, inclusion)}
            className="inline-flex items-center gap-1.5 h-[30px] pl-2.5 pr-3 rounded-lg border border-dashed border-primary/40 bg-brand-soft text-sm font-semibold text-primary whitespace-nowrap hover:bg-brand-soft hover:border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            data-testid={`button-escalar-${inclusion.id}`}
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" /> Escalar alguém
          </button>
        ) : (
          <span
            title={(() => {
              if (eventoTravado) return "Evento encerrado — a partir do dia seguinte ao término, só o administrador altera.";
              if (readOnly) return "Esta lista está em modo consulta.";
              const quem = getResponsavelDaFuncao?.(inclusion.functionId);
              // Com o nome, a linha travada vira um encaminhamento:
              // a pessoa sabe a quem pedir em vez de só descobrir
              // que não pode.
              return quem
                ? `Quem escala esta vaga é ${quem}, responsável por ${funcao}. Você pode consultar.`
                : `Quem responde por ${funcao} escala esta vaga. Você pode consultar.`;
            })()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />Não escalado
          </span>
        )}
      </td>

      <td className="px-3.5 whitespace-nowrap">
        <div className="text-sm text-slate-700 tabular-nums">
          {formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate)}
        </div>
        <div className="text-xs text-muted-foreground">{formatDiarias(inclusion.dailyRates)}</div>
      </td>

      <td className="px-3.5">
        <div className="flex items-center gap-1.5 flex-wrap" aria-label="Do que esta escalação precisa">
          {needs.map((n) => (
            <span
              key={n.key}
              title={n.title}
              className={`inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap ${n.cls}`}
            >
              {n.icon}{n.label}
            </span>
          ))}
          {needs.length === 0 && <span className="text-xs text-muted-foreground">Sem logística</span>}
        </div>
      </td>

      <td className="px-3.5">
        <div className="flex flex-col gap-[3px] min-w-0">
          {/* Troca pendente manda na pílula (dono, 15/09: "esse aprovado
              não faz sentido nenhum"): o status guardado da vaga
              ("Aprovado") só volta a valer depois da decisão. */}
          {/* Tom `info` (23/09), não `warning`: a troca está com OUTRA
              pessoa decidindo; o marcador de 3px é quem diz se
              espera você. Mesma cor do marcador "troca em análise". */}
          {detalhe?.tom === "troca" ? (
            <StatusBadge tone="info" dot data-testid="scaling-status-troca-em-analise">
              Troca em análise
            </StatusBadge>
          ) : getStatusBadge(inclusion, "sm")}
          {/* Pedido de ajuste/exclusão em aberto TRAVA a vaga (regra do
              dono, 26/08): não dá para escalar, comprar nem confirmar até o
              aprovador decidir. Um texto de 11px cortado em "Pedido de
              ajuste com o …" não avisava isso a ninguém — virou chip
              âmbar, com ícone, que quebra linha em vez de cortar. */}
          {detalhe && detalhe.tom === "pedido" ? (
            <span
              className="inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0 rounded-md border border-warning/30 bg-warning-soft px-[7px] py-[2px] text-2xs font-semibold leading-tight text-warning"
              title={detalhe.titulo}
              data-testid={`detalhe-situacao-${inclusion.id}`}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{detalhe.texto}</span>
              {detalhe.sufixo && <span className="whitespace-nowrap font-normal opacity-80">{detalhe.sufixo}</span>}
            </span>
          ) : detalhe && (
            <span
              className={`text-2xs truncate ${detalhe.tom === "troca" ? "text-info" : "text-muted-foreground"}`}
              title={detalhe.titulo}
              data-testid={`detalhe-situacao-${inclusion.id}`}
            >
              {detalhe.texto}
            </span>
          )}
          {/* Etiqueta para Compras (dono, 15/09): a vaga teve troca de
              colaborador aprovada. Antes era um texto pequeno que sumia
              sempre que a linha tinha outro detalhe ("Falta confirmar"…). */}
          {approvedSwapInclusionIds.has(inclusion.id) && detalhe?.tom !== "troca" && (
            <StatusBadge
              tone="success"
              icon={ArrowLeftRight}
              title="Esta vaga teve uma troca de colaborador aprovada — confira passagem e hospedagem"
              data-testid={`tag-troca-aprovada-${inclusion.id}`}
            >
              Troca aprovada
            </StatusBadge>
          )}
        </div>
      </td>

      <td className="px-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          {onConfirmarRapido && podeGerir && podeConfirmarRapido?.(inclusion) && (
            <MotivoDesabilitado motivo={`Confirmar a escalação de ${nomeDoColaborador} — o servidor decide o status (cenotécnica vai ao gestor)`} desabilitado={confirmandoId === inclusion.id}>
              <button
              type="button"
              onClick={(e) => onConfirmarRapido(e, inclusion)}
              disabled={confirmandoId === inclusion.id}
              className="inline-flex h-[30px] items-center gap-1 rounded-lg bg-success px-2.5 text-xs font-semibold text-white hover:bg-success/90 transition-colors disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
              aria-label={`Confirmar escalação ${idLabel}`}
              data-testid={`button-confirmar-rapido-${inclusion.id}`}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {confirmandoId === inclusion.id ? "Confirmando…" : "Confirmar"}
            </button>
            </MotivoDesabilitado>
          )}
          <button
            type="button"
            className="relative inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg text-muted-foreground hover:bg-brand-soft hover:text-primary transition-colors"
            onClick={(e) => onViewComments(e, inclusion)}
            title={nComments === 0
              ? "Comentários e histórico"
              : `${nComments} ${nComments === 1 ? "comentário" : "comentários"} · abrir histórico`}
            aria-label={`Abrir comentários e histórico da escalação ${idLabel}${nComments ? ` (${nComments})` : ""}`}
            data-testid={`button-comments-${inclusion.id}`}
          >
            <MessageSquare className="w-[17px] h-[17px]" aria-hidden="true" />
            {nComments > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground text-2xs font-bold leading-none tabular-nums"
                data-testid={`badge-comments-${inclusion.id}`}
              >
                {nComments > 9 ? "9+" : nComments}
              </span>
            )}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg text-muted-foreground hover:bg-brand-soft hover:text-primary transition-colors"
            onClick={() => onRowClick(inclusion)}
            title="Abrir detalhes"
            aria-label={`Abrir detalhes de ${idLabel}`}
            data-testid={`button-open-${inclusion.id}`}
          >
            <ChevronRight className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}
