/**
 * Uma vaga da lista da Escalação (25/09 — extraída de scaling-table.tsx):
 * seleção, ID, função/evento, colaborador (ou "Escalar alguém"), período,
 * "Precisa de", situação e as ações da linha.
 *
 * Redesenho 07/10: a MESMA vaga tem duas formas — a linha da tabela (notebook
 * e monitor) e o cartão (tablet e celular, onde a grade de 1.300px rolava de
 * lado e escondia a situação e as ações). As regras moram UMA vez em
 * `modeloDaLinha` e nas peças abaixo; as duas formas só arrumam as peças.
 * Os `data-testid` são os mesmos nas duas — só uma delas existe por vez.
 */
import { rotuloEmpreita, vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { AlertTriangle, ArrowLeftRight, Check, MessageSquare, ChevronRight, Lock, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDiarias, formatDateRange } from "@/lib/utils";
import type { TeamInclusion } from "@shared/schema";
import { StatusBadge } from "@/components/common/status-badge";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import type { ScalingTableProps } from "./scaling-table";
import { detalheDaSituacao, getStatusBadge, needsDaLinha, shouldShowPendingSwapBadge, type Need } from "./scaling-table-cells";

export const CHECKBOX_CLS = "border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary";

type P = Omit<ScalingTableProps, "rows">;

/** Tudo o que a linha decide, calculado uma vez — a tabela e o cartão leem daqui. */
function modeloDaLinha(inclusion: TeamInclusion, p: P) {
  const {
    getFunctionName, getEventName, getCollaboratorName, getCollaboratorCity, getTicket, getAccommodation,
    pendingSwapByInclusion, pendingChangeByInclusion, seenSwapIds, currentUserId, isAdminOrPurchasing,
    canManageFunction, canApproveProduction, readOnly = false, commentCountByInclusion, getResponsavelDaFuncao,
    temPassagemComprada, isEventLocked, getSelectBlockReason, selectedIds,
  } = p;
  const ticket = getTicket(inclusion.id);
  const funcao = getFunctionName(inclusion.functionId);
  const swap = pendingSwapByInclusion.get(inclusion.id);
  const mostraSwap = shouldShowPendingSwapBadge(swap, inclusion, { currentUserId, isAdminOrPurchasing, seenSwapIds });
  const pedido = pendingChangeByInclusion?.get(inclusion.id);
  const cancelada = inclusion.status === "cancelado";
  const eventoTravado = isEventLocked?.(inclusion) ?? false;
  const podeGerir = canManageFunction(inclusion.functionId) && !readOnly && !eventoTravado;
  const empreita = vagaComEmpreita(inclusion);
  const vazia = !inclusion.collaboratorId && !empreita && !cancelada;
  const detalhe = detalheDaSituacao(inclusion, { swap: mostraSwap ? swap : undefined, pedido });
  // O marcador de 3px responde a uma pergunta só: isto espera
  // alguém? Âmbar quando espera VOCÊ (vaga sua por preencher, ou
  // aprovação que é sua), roxo quando está com outra pessoa.
  const esperaVoce = (vazia && podeGerir) || (inclusion.status === "aguardando_producao" && canApproveProduction);
  // Só pinta de roxo o que a linha CONSEGUE explicar: a troca que
  // este usuário não deve ver não tem detalhe embaixo, e uma borda
  // colorida sem legenda é charada, não sinal.
  const emAnalise = (!!swap && mostraSwap) || !!pedido;
  return {
    funcao,
    nomeDoEvento: getEventName(inclusion.eventId),
    nomeDoColaborador: getCollaboratorName(inclusion.collaboratorId),
    city: inclusion.city || getCollaboratorCity(inclusion.collaboratorId),
    selectBlock: getSelectBlockReason(inclusion),
    isSelected: selectedIds.has(inclusion.id),
    idLabel: `#${inclusion.inclusionNumber ?? ""}`,
    cancelada, eventoTravado, podeGerir, empreita, vazia, detalhe,
    needs: needsDaLinha(inclusion, {
      ticket, funcao,
      passagemComprada: temPassagemComprada?.(inclusion) ?? !!ticket?.purchaseDate,
      hospedagem: getAccommodation(inclusion.id),
    }),
    // Tokens (23/09): espera você = warning-strong; em análise = info-strong.
    marker: cancelada ? "border-l-transparent" : esperaVoce ? "border-l-warning-strong" : emAnalise ? "border-l-info-strong" : "border-l-transparent",
    nComments: commentCountByInclusion?.get(inclusion.id) ?? 0,
    /** Por que esta pessoa não escala aqui — com o nome, vira encaminhamento. */
    tituloTravada: (() => {
      if (eventoTravado) return "Evento encerrado — a partir do dia seguinte ao término, só o administrador altera.";
      if (readOnly) return "Esta lista está em modo consulta.";
      const quem = getResponsavelDaFuncao?.(inclusion.functionId);
      return quem
        ? `Quem escala esta vaga é ${quem}, responsável por ${funcao}. Você pode consultar.`
        : `Quem responde por ${funcao} escala esta vaga. Você pode consultar.`;
    })(),
  };
}
type Modelo = ReturnType<typeof modeloDaLinha>;

// ── Peças ────────────────────────────────────────────────────────────────

function Selecao({ inclusion, m, p }: { inclusion: TeamInclusion; m: Modelo; p: P }) {
  // `title` nativo em vez do Tooltip do Radix: eram 150 instâncias por
  // página, cada uma com contexto e portal próprios, e a lista congelava
  // perto de um segundo a cada reordenação. O motivo continua legível — no
  // title e no aria-label — e o cabeçalho, que é UM, mantém o Tooltip.
  return (
    <span className="esc-alvo inline-flex items-center justify-center" title={m.selectBlock ?? undefined}>
      <Checkbox
        checked={m.isSelected}
        disabled={!!m.selectBlock}
        onCheckedChange={() => p.onToggleSelect(inclusion.id)}
        aria-label={m.selectBlock ? `Não selecionável: ${m.selectBlock}` : `Selecionar escalação ${m.idLabel}`}
        data-testid={`checkbox-select-${inclusion.id}`}
        className={CHECKBOX_CLS}
      />
    </span>
  );
}

function Colaborador({ inclusion, m, p, emLinha = false }: { inclusion: TeamInclusion; m: Modelo; p: P; emLinha?: boolean }) {
  if (m.empreita) {
    return (
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
    );
  }
  if (inclusion.collaboratorId) {
    return emLinha ? (
      <p className="min-w-0 truncate text-sm" title={[m.nomeDoColaborador, m.city].filter(Boolean).join(" · ")}>
        <span className="font-medium text-foreground">{m.nomeDoColaborador}</span>
        {m.city && <span className="text-muted-foreground"> · {m.city}</span>}
      </p>
    ) : (
      <>
        <div className="text-sm font-medium text-foreground truncate" title={m.nomeDoColaborador}>{m.nomeDoColaborador}</div>
        {m.city && <div className="text-xs text-muted-foreground truncate" title={m.city}>{m.city}</div>}
      </>
    );
  }
  if (m.vazia && m.podeGerir) {
    return (
      <button
        type="button"
        onClick={(e) => p.onEscalar(e, inclusion)}
        className="esc-escalar inline-flex items-center gap-1.5 h-[30px] pl-2.5 pr-3 rounded-lg border border-dashed border-primary/40 bg-brand-soft text-sm font-semibold text-primary whitespace-nowrap hover:border-solid hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        data-testid={`button-escalar-${inclusion.id}`}
      >
        <UserPlus className="w-4 h-4" aria-hidden="true" /> Escalar alguém
      </button>
    );
  }
  return (
    <span title={m.tituloTravada} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Lock className="w-3.5 h-3.5" aria-hidden="true" />Não escalado
    </span>
  );
}

function Periodo({ inclusion, emLinha = false }: { inclusion: TeamInclusion; emLinha?: boolean }) {
  const datas = formatDateRange(inclusion.scheduleStartDate, inclusion.scheduleEndDate);
  return emLinha ? (
    <p className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
      {datas} <span className="text-muted-foreground">· {formatDiarias(inclusion.dailyRates)}</span>
    </p>
  ) : (
    <>
      <div className="text-sm text-slate-700 tabular-nums">{datas}</div>
      <div className="text-xs text-muted-foreground">{formatDiarias(inclusion.dailyRates)}</div>
    </>
  );
}

function PrecisaDe({ needs }: { needs: Need[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap" aria-label="Do que esta escalação precisa">
      {needs.map((n) => (
        <span
          key={n.key}
          title={n.title}
          className={`inline-flex items-center gap-1 h-[22px] px-1.5 rounded-md text-2xs font-medium whitespace-nowrap ${n.cls}`}
        >
          {n.icon}{n.label}
        </span>
      ))}
      {needs.length === 0 && <span className="text-xs text-muted-foreground">Sem logística</span>}
    </div>
  );
}

/**
 * Confirmar direto da lista (04/09). Na TABELA ele mora na Situação, no lugar
 * do "Falta confirmar a escalação" — o botão diz a mesma coisa e ainda faz;
 * no cartão fica com as outras ações. O texto que ele substitui vai no title.
 */
function ConfirmarRapido({ inclusion, m, p }: { inclusion: TeamInclusion; m: Modelo; p: P }) {
  const { onConfirmarRapido, confirmandoId } = p;
  if (!onConfirmarRapido) return null;
  const confirmando = confirmandoId === inclusion.id;
  const falta = m.detalhe?.tom === "neutro" ? `${m.detalhe.titulo}. ` : "";
  return (
    // O clique e o Enter param aqui: a linha em volta abriria o modal por cima.
    <span className="inline-flex" {...pararPropagacao}>
    <MotivoDesabilitado motivo={`${falta}Confirmar a escalação de ${m.nomeDoColaborador} — o servidor decide o status (cenotécnica vai ao gestor)`} desabilitado={confirmando}>
      <button
        type="button"
        onClick={(e) => onConfirmarRapido(e, inclusion)}
        disabled={confirmando}
        className="esc-alvo inline-flex h-[26px] items-center gap-1 rounded-md border border-success/30 bg-success-soft px-2 text-xs font-semibold text-success transition-colors hover:bg-success hover:text-white hover:border-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success-strong disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
        aria-label={`Confirmar escalação ${m.idLabel}`}
        data-testid={`button-confirmar-rapido-${inclusion.id}`}
      >
        {confirmando
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        {confirmando ? "Confirmando…" : "Confirmar"}
      </button>
    </MotivoDesabilitado>
    </span>
  );
}

/** A vaga pode ser confirmada direto da lista por esta pessoa. */
const temConfirmarRapido = (inclusion: TeamInclusion, m: Modelo, p: P) =>
  !!p.onConfirmarRapido && m.podeGerir && !!p.podeConfirmarRapido?.(inclusion);

function Situacao({ inclusion, m, p, comConfirmar = false }: { inclusion: TeamInclusion; m: Modelo; p: P; comConfirmar?: boolean }) {
  const { detalhe } = m;
  const confirmarAqui = comConfirmar && temConfirmarRapido(inclusion, m, p);
  return (
    <div className="flex flex-col items-start gap-[3px] min-w-0">
      {/* Troca pendente manda na pílula (dono, 15/09: "esse aprovado
          não faz sentido nenhum"): o status guardado da vaga
          ("Aprovado") só volta a valer depois da decisão. Tom `info`
          (23/09): a troca está com OUTRA pessoa decidindo. */}
      {detalhe?.tom === "troca" ? (
        <StatusBadge tone="info" dot data-testid="scaling-status-troca-em-analise">
          Troca em análise
        </StatusBadge>
      ) : getStatusBadge(inclusion, "sm")}
      {/* Pedido de ajuste/exclusão em aberto TRAVA a vaga (regra do
          dono, 26/08): chip âmbar, com ícone, que quebra linha em vez de cortar. */}
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
      ) : confirmarAqui && detalhe?.tom !== "troca" ? (
        <ConfirmarRapido inclusion={inclusion} m={m} p={p} />
      ) : detalhe && (
        <span
          className={`max-w-full text-2xs truncate ${detalhe.tom === "troca" ? "text-info" : "text-muted-foreground"}`}
          title={detalhe.titulo}
          data-testid={`detalhe-situacao-${inclusion.id}`}
        >
          {detalhe.texto}
        </span>
      )}
      {/* Etiqueta para Compras (dono, 15/09): a vaga teve troca de colaborador aprovada. */}
      {p.approvedSwapInclusionIds.has(inclusion.id) && detalhe?.tom !== "troca" && (
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
  );
}

function Acoes({ inclusion, m, p, comConfirmar = false }: { inclusion: TeamInclusion; m: Modelo; p: P; comConfirmar?: boolean }) {
  const { onViewComments, onRowClick } = p;
  const icone = "esc-alvo relative inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div className="flex items-center justify-end gap-0.5">
      {comConfirmar && temConfirmarRapido(inclusion, m, p) && <span className="mr-1"><ConfirmarRapido inclusion={inclusion} m={m} p={p} /></span>}
      <button
        type="button"
        className={icone}
        onClick={(e) => onViewComments(e, inclusion)}
        title={m.nComments === 0
          ? "Comentários e histórico"
          : `${m.nComments} ${m.nComments === 1 ? "comentário" : "comentários"} · abrir histórico`}
        aria-label={`Abrir comentários e histórico da escalação ${m.idLabel}${m.nComments ? ` (${m.nComments})` : ""}`}
        data-testid={`button-comments-${inclusion.id}`}
      >
        <MessageSquare className="w-[17px] h-[17px]" aria-hidden="true" />
        {m.nComments > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full bg-primary text-primary-foreground text-2xs font-bold leading-none tabular-nums ring-2 ring-card"
            data-testid={`badge-comments-${inclusion.id}`}
          >
            {m.nComments > 9 ? "9+" : m.nComments}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`${icone} esc-abrir`}
        onClick={() => onRowClick(inclusion)}
        title="Abrir detalhes"
        aria-label={`Abrir detalhes de ${m.idLabel}`}
        data-testid={`button-open-${inclusion.id}`}
      >
        <ChevronRight className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

const pararPropagacao = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };

function abrirPeloTeclado(e: React.KeyboardEvent, abrir: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
}

// ── Linha da tabela ─────────────────────────────────────────────────────

export function ScalingTableRow({ inclusion, p, compacta = false }: {
  inclusion: TeamInclusion;
  p: P;
  /** Tabela compacta (notebook): sem a coluna de ID — ele entra na célula da vaga. */
  compacta?: boolean;
}) {
  const m = modeloDaLinha(inclusion, p);
  return (
    <tr
      className={`esc-linha group/row h-[52px] border-b border-border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${m.isSelected ? "bg-brand-soft hover:bg-brand-soft" : "bg-card hover:bg-surface-muted"} ${m.cancelada ? "opacity-55" : ""}`}
      onClick={() => p.onRowClick(inclusion)}
      tabIndex={0}
      aria-label={`Abrir detalhes da escalação ${m.idLabel}`}
      aria-selected={m.isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onRowClick(inclusion); }
      }}
      data-testid={`row-inclusion-${inclusion.id}`}
    >
      <td className={`px-3 text-center border-l-[3px] ${m.marker}`} {...pararPropagacao}>
        <Selecao inclusion={inclusion} m={m} p={p} />
      </td>
      {!compacta && (
        <td className="pr-2 whitespace-nowrap">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{m.idLabel}</span>
        </td>
      )}
      <td className="px-3 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate" title={m.funcao}>{m.funcao}</div>
        <div className="text-xs text-muted-foreground truncate" title={m.nomeDoEvento}>
          {compacta && <span className="font-mono tabular-nums text-slate-500">{m.idLabel} · </span>}
          {m.nomeDoEvento}
        </div>
      </td>
      <td className="px-3 min-w-0">
        <Colaborador inclusion={inclusion} m={m} p={p} />
      </td>
      <td className="px-3 whitespace-nowrap">
        <Periodo inclusion={inclusion} />
      </td>
      <td className="px-3 py-1.5">
        <PrecisaDe needs={m.needs} />
      </td>
      <td className="px-3 py-1.5">
        <Situacao inclusion={inclusion} m={m} p={p} comConfirmar />
      </td>
      <td className="pl-1 pr-2.5" {...pararPropagacao}>
        <Acoes inclusion={inclusion} m={m} p={p} />
      </td>
    </tr>
  );
}

// ── Cartão (tablet e celular) ──────────────────────────────────────────

/**
 * A vaga como cartão: o que é (função · #ID · evento) e a situação na
 * primeira linha, quem vai e quando no meio, do que precisa e as ações
 * embaixo. Nada da linha da tabela fica de fora.
 */
export function ScalingCardRow({ inclusion, p }: { inclusion: TeamInclusion; p: P }) {
  const m = modeloDaLinha(inclusion, p);
  return (
    <li
      className={`esc-cartao relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 border-b border-border border-l-[3px] ${m.marker} pl-3 pr-3 py-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${m.isSelected ? "bg-brand-soft" : "bg-card hover:bg-surface-muted"} ${m.cancelada ? "opacity-60" : ""}`}
      onClick={() => p.onRowClick(inclusion)}
      tabIndex={0}
      aria-label={`Abrir detalhes da escalação ${m.idLabel}`}
      onKeyDown={(e) => abrirPeloTeclado(e, () => p.onRowClick(inclusion))}
      data-testid={`row-inclusion-${inclusion.id}`}
    >
      <div className="pt-0.5" {...pararPropagacao}>
        <Selecao inclusion={inclusion} m={m} p={p} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground" title={m.funcao}>
              {m.funcao} <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{m.idLabel}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground" title={m.nomeDoEvento}>{m.nomeDoEvento}</p>
          </div>
          <div className="shrink-0 max-w-[48%]"><Situacao inclusion={inclusion} m={m} p={p} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 max-w-full"><Colaborador inclusion={inclusion} m={m} p={p} emLinha /></div>
          <Periodo inclusion={inclusion} emLinha />
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><PrecisaDe needs={m.needs} /></div>
          <div className="-mr-1.5 shrink-0" {...pararPropagacao}><Acoes inclusion={inclusion} m={m} p={p} comConfirmar /></div>
        </div>
      </div>
    </li>
  );
}
