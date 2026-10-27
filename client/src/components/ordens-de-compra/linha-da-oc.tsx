/**
 * Uma prestação nas Ordens de compra (28/10). Uma LINHA de planilha no largo
 * (pessoa · valor aprovado · CNPJ emissor · OC · nota · pagamento · ação),
 * que vira cartão pela largura DA LISTA (container `oc-lista`, no index.css):
 * nenhum dado some entre os dois modos.
 *
 * A ação principal muda com o estado (Registrar OC → Enviar NF → Conferir →
 * Lançar no M4 → Marcar como pago); o resto mora no menu "…". A nota com
 * divergência (OC, valor ou CNPJ) ganha o filete vermelho e a frase do
 * servidor embaixo — é o destaque da conferência.
 */
import { memo } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowUpRight, BadgeCheck, CalendarClock, Clock3, ExternalLink, FileCheck2, FileText, FileUp, MessageSquareWarning, MoreHorizontal, Receipt, Undo2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SeloDaConferencia } from "./conferencia-da-nota";
import { CnpjEmissor, PilulaDoEstado } from "./pecas";
import { dataBr, ddmm, proximoPasso, reais, rotuloDaOrigem, temDivergencia } from "./oc-utils";
import type { LinhaDaOc as Linha } from "./tipos";

export interface AcoesDaLinhaDaOc {
  registrarOc: (l: Linha) => void;
  desfazerOc: (l: Linha) => void;
  enviarNota: (l: Linha) => void;
  marcarPago: (l: Linha) => void;
  desfazerPago: (l: Linha) => void;
  selecionar: (actualId: string, on: boolean) => void;
}

const BOTAO = "pas-alvo inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_DA_NOTA: Record<string, string> = {
  enviada: "enviada — aguardando o DP", devolvida: "devolvida ao colaborador", recusada: "recusada", aprovada: "aprovada", pendente: "pendente",
};

function linkDasNotas(l: Linha) {
  return `/invoices?event=${encodeURIComponent(l.eventId)}&tab=aprovacao&actual=${encodeURIComponent(l.actualId)}`;
}

export const LinhaDaOc = memo(function LinhaDaOc({ l, selecionada, destacada, acoes }: {
  l: Linha;
  selecionada: boolean;
  destacada?: boolean;
  acoes: AcoesDaLinhaDaOc;
}) {
  const nome = l.colaborador ? toTitleCase(l.colaborador.nome) : "Sem colaborador";
  const divergente = temDivergencia(l);
  const naoEmite = !l.emiteNf;
  const podeEnviarNota = !!l.oc && (l.estado === "com_oc" || l.estado === "nf_devolvida");
  const valorDiferente = !!l.oc && l.oc.valor != null && l.oc.valor !== l.valorAprovado;

  // A ação principal: o próximo passo que é do DP (ou que o DP pode adiantar).
  let principal: React.ReactNode = null;
  if (l.acoes.registrarOc) {
    principal = (
      <button type="button" onClick={() => acoes.registrarOc(l)} className={cn(BOTAO, "border-primary/35 bg-card text-primary hover:bg-brand-soft")} data-testid={`oc-registrar-${l.actualId}`}>
        <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />Registrar OC
      </button>
    );
  } else if (l.acoes.marcarPago) {
    principal = (
      <button type="button" onClick={() => acoes.marcarPago(l)} className={cn(BOTAO, "border-success/40 bg-card text-success hover:bg-success-soft")} data-testid={`oc-pagar-${l.actualId}`}>
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Marcar pago
      </button>
    );
  } else if (podeEnviarNota) {
    principal = (
      <button type="button" onClick={() => acoes.enviarNota(l)} className={cn(BOTAO, "border-border bg-card text-slate-700 hover:bg-surface-muted")} title="Quando o colaborador não consegue pelo app" data-testid={`oc-enviar-nota-${l.actualId}`}>
        <FileUp className="h-3.5 w-3.5" aria-hidden="true" />{l.estado === "nf_devolvida" ? "Reenviar NF" : "Enviar NF"}
      </button>
    );
  } else if (l.estado === "nf_enviada" || l.estado === "nf_aprovada") {
    principal = (
      <Link href={linkDasNotas(l)} className={cn(BOTAO, "border-border bg-card text-slate-700 hover:bg-surface-muted")} data-testid={`oc-ir-notas-${l.actualId}`}>
        {l.estado === "nf_enviada" ? "Conferir a NF" : "Lançar no M4"}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    );
  }

  const temMenu = l.acoes.desfazerOc || l.acoes.desfazerPago || !!l.nota;

  return (
    <div
      role="listitem"
      className={cn("oc-linha", divergente && "oc-linha-divergente", selecionada && "oc-linha-selecionada", destacada && "pla-destaque", naoEmite && "oc-linha-isenta")}
      data-actual-id={l.actualId}
      data-estado={l.estado}
      data-testid={`oc-linha-${l.actualId}`}
    >
      {/* Seleção (só o que dá para marcar como pago) */}
      <div className="oc-cel oc-c-sel">
        {l.acoes.marcarPago && (
          <Checkbox checked={selecionada} onCheckedChange={(v) => acoes.selecionar(l.actualId, !!v)} aria-label={`Selecionar ${nome} para marcar como pago`} data-testid={`oc-selecionar-${l.actualId}`} />
        )}
      </div>

      {/* Pessoa */}
      <div className="oc-cel oc-c-pessoa min-w-0">
        <p className="m-0 text-sm font-semibold leading-5 text-foreground break-words">{nome}</p>
        <p className="m-0 text-xs leading-5 text-muted-foreground">
          {l.funcao.nome ?? "Sem função"}
          {l.funcao.centroDeCusto && <> · CC {l.funcao.centroDeCusto}</>}
          {l.colaborador?.numero ? <span className="tabular-nums"> · nº {l.colaborador.numero}</span> : null}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><PilulaDoEstado linha={l} /></span></TooltipTrigger>
            <TooltipContent side="top" className="max-w-[300px] text-xs leading-relaxed">{proximoPasso(l)}</TooltipContent>
          </Tooltip>
          {l.estado === "nf_recusada" && <span className="text-2xs text-danger">decisão definitiva</span>}
        </div>
      </div>

      {/* Valor aprovado */}
      <div className="oc-cel oc-c-valor" data-rotulo="Aprovado">
        <span className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">{reais(l.valorAprovado)}</span>
      </div>

      {/* CNPJ emissor + selo de contrato */}
      <div className="oc-cel oc-c-cnpj min-w-0" data-rotulo="CNPJ emissor">
        {naoEmite ? <span className="text-xs text-muted-foreground">não emite NF</span> : <CnpjEmissor cnpj={l.cnpjEmissor} />}
      </div>

      {/* OC */}
      <div className="oc-cel oc-c-oc min-w-0" data-rotulo="OC">
        {l.oc ? (
          <div className="min-w-0">
            <p className="m-0 font-mono text-xs font-semibold text-slate-800 break-all" data-testid={`oc-numero-${l.actualId}`}>{l.oc.numero}</p>
            <p className="m-0 text-2xs leading-4 text-muted-foreground tabular-nums">
              <span className={cn(valorDiferente && "font-semibold text-warning")} title={valorDiferente ? `Diferente do aprovado (${reais(l.valorAprovado)})` : undefined}>{l.oc.valor != null ? reais(l.oc.valor) : "—"}</span>
              {l.oc.data && <> · {ddmm(l.oc.data)}</>}
              {l.oc.origem && <> · {rotuloDaOrigem(l.oc.origem)}</>}
            </p>
            {l.oc.justificativa && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="mt-0.5 inline-flex h-5 items-center gap-1 rounded-md border border-warning/30 bg-warning-soft px-1.5 text-2xs font-medium text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <MessageSquareWarning className="h-3 w-3" aria-hidden="true" />Com justificativa
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px] text-xs leading-relaxed">Sem contrato ativo — registrada com justificativa: “{l.oc.justificativa}”</TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : naoEmite ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className={cn("text-xs", l.acoes.exigeJustificativa ? "text-warning" : "text-muted-foreground")}>
            {l.acoes.exigeJustificativa ? "vai precisar de justificativa" : "sem OC"}
          </span>
        )}
      </div>

      {/* Nota + conferência */}
      <div className="oc-cel oc-c-nota min-w-0" data-rotulo="Nota fiscal">
        {l.nota ? (
          <div className="min-w-0 space-y-1">
            <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5">
              <span className="font-medium text-foreground tabular-nums">{l.nota.numero ? `NF ${l.nota.numero}` : "NF"}</span>
              {l.nota.valor != null && <span className={cn("tabular-nums", l.conferencia?.valor.confere === false ? "font-semibold text-danger" : "text-slate-600")}>{reais(l.nota.valor)}</span>}
              <SeloDaConferencia conferencia={l.conferencia} testid={`oc-conferencia-${l.actualId}`} />
            </p>
            <p className="m-0 text-2xs leading-4 text-muted-foreground">
              {STATUS_DA_NOTA[l.nota.status] ?? l.nota.status}{l.nota.enviadaEm ? ` · ${ddmm(l.nota.enviadaEm.slice(0, 10))}` : ""}
            </p>
            {divergente && l.conferencia && (
              <p className="m-0 flex gap-1 text-2xs leading-4 font-medium text-danger" data-testid={`oc-divergencia-${l.actualId}`}>
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" /><span className="min-w-0">{l.conferencia.divergencias[0]}{l.conferencia.divergencias.length > 1 ? ` (+${l.conferencia.divergencias.length - 1})` : ""}</span>
              </p>
            )}
            {l.nota.status === "devolvida" && l.nota.comentarioDoDp && (
              <p className="m-0 line-clamp-2 text-2xs leading-4 text-warning" title={l.nota.comentarioDoDp}>“{l.nota.comentarioDoDp}”</p>
            )}
          </div>
        ) : l.oc ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" aria-hidden="true" />aguardando a nota</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Programado / pago */}
      <div className="oc-cel oc-c-pag min-w-0" data-rotulo="Pagamento">
        {l.pagamento ? (
          <div className="min-w-0">
            <p className="m-0 inline-flex items-center gap-1 text-xs font-semibold text-success" data-testid={`oc-pago-${l.actualId}`}>
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Pago em {ddmm(l.pagamento.pagoEm)}
            </p>
            {l.pagamento.observacao && <p className="m-0 truncate text-2xs text-muted-foreground" title={l.pagamento.observacao}>{l.pagamento.observacao}</p>}
            {l.pagamento.comprovanteUrl && (
              <a href={l.pagamento.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline">
                <Receipt className="h-3 w-3" aria-hidden="true" />comprovante
              </a>
            )}
          </div>
        ) : l.programadoPara ? (
          <p className="m-0 inline-flex items-center gap-1 text-xs font-medium text-info" title={`Lançada no M4 com pagamento previsto para ${dataBr(l.programadoPara)}`}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Prog. {ddmm(l.programadoPara)}
          </p>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Ações */}
      <div className="oc-cel oc-c-acoes">
        {principal}
        {!temMenu && principal && <span className="oc-c-acoes-vazio" aria-hidden="true" />}
        {temMenu && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="pas-alvo inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Mais ações de ${nome}`} data-testid={`oc-menu-${l.actualId}`}>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[250px]">
              {l.nota?.arquivoUrl && (
                <DropdownMenuItem asChild>
                  <a href={l.nota.arquivoUrl} target="_blank" rel="noopener noreferrer"><FileText className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />Ver a nota fiscal</a>
                </DropdownMenuItem>
              )}
              {l.nota && (
                <DropdownMenuItem asChild>
                  <Link href={linkDasNotas(l)}><ExternalLink className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />Abrir em Notas fiscais</Link>
                </DropdownMenuItem>
              )}
              {(l.acoes.desfazerOc || l.acoes.desfazerPago) && <DropdownMenuSeparator />}
              {l.acoes.desfazerOc && (
                <DropdownMenuItem onSelect={() => acoes.desfazerOc(l)} className="text-danger focus:text-danger" data-testid={`oc-menu-desfazer-oc-${l.actualId}`}>
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />Desfazer a OC…
                </DropdownMenuItem>
              )}
              {l.acoes.desfazerPago && (
                <DropdownMenuItem onSelect={() => acoes.desfazerPago(l)} className="text-danger focus:text-danger" data-testid={`oc-menu-desfazer-pago-${l.actualId}`}>
                  <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />Desfazer o pago…
                </DropdownMenuItem>
              )}
              {l.oc && !l.acoes.desfazerOc && !l.pagamento && (
                <p className="m-0 px-2 py-1.5 text-2xs leading-4 text-muted-foreground">A OC não pode mais ser desfeita: já existe nota fiscal.</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
});

/** Cabeçalho da lista (as mesmas colunas de `.oc-linha`; some no modo cartão). */
export function CabecalhoDaLista({ todosSelecionados, algumSelecionavel, onSelecionarTodos }: {
  todosSelecionados: boolean | "indeterminate";
  algumSelecionavel: boolean;
  onSelecionarTodos: (on: boolean) => void;
}) {
  return (
    <div className={cn("oc-cabecalho", !algumSelecionavel && "oc-cabecalho-sem-selecao")} role="presentation">
      <div className="oc-cel oc-c-sel">
        {algumSelecionavel && (
          <Checkbox checked={todosSelecionados} onCheckedChange={(v) => onSelecionarTodos(!!v)} aria-label="Selecionar todos os programados à vista" data-testid="oc-selecionar-todos" />
        )}
      </div>
      <div className="oc-th oc-c-pessoa">Pessoa · situação</div>
      <div className="oc-th-cartao oc-c-pessoa">Selecionar os programados à vista</div>
      <div className="oc-th oc-c-valor text-right">Aprovado</div>
      <div className="oc-th oc-c-cnpj">CNPJ emissor</div>
      <div className="oc-th oc-c-oc">OC</div>
      <div className="oc-th oc-c-nota">Nota fiscal · conferência</div>
      <div className="oc-th oc-c-pag">Pagamento</div>
      <div className="oc-th oc-c-acoes" />
    </div>
  );
}
