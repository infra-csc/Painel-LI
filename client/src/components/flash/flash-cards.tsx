// Extraído de flash-account.tsx em 25/09 (modularização); redesenho 08/10.
//
// Peças do topo e da coluna das contas da Conta corrente Flash:
//  - ResumoDoFlash: o painel de resumo (o mesmo desenho do Planejado/Realizado)
//    no lugar dos quatro cartões de KPI — contas, saldo de cada categoria com o
//    alvo por conta, "abaixo do alvo" (que recorta a lista) e a faixa de
//    cobertura do alvo;
//  - AdmittedWithoutCreditPanel: o aviso "admitidos sem crédito inicial" com a
//    lista que abre e o "Lançar crédito" de cada um;
//  - AccountsList: a lista de contas (busca, Todas/Abaixo/No alvo, saldo de
//    cada categoria com a barrinha do alvo);
//  - DeleteMovementDialog: a confirmação de exclusão com o lançamento por
//    extenso e o saldo antes → depois.
// Só apresentação: saldos, alvo e quem está abaixo vêm de `useFlashData`.
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, SearchX, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { avatarClasses, initials, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ROTULO_CATEGORIA, TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, fmtDate, formatCurrency, proporcaoDoAlvo,
  type Collaborator, type FlashMovement,
} from "./flash-types";
import type { DadosDoFlash } from "./use-flash-data";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Situação da conta em relação ao alvo — o recorte da lista. */
export type SituacaoDaConta = "todas" | "abaixo" | "no-alvo";

// ─── Barrinha do alvo ─────────────────────────────────────────────────────────

/** Barra fina do saldo sobre o alvo: cheia e verde no alvo; âmbar abaixo. */
export function MedidorDoAlvo({ saldo, alvo, className }: { saldo: number; alvo: number; className?: string }) {
  const abaixo = saldo < alvo;
  return (
    <span aria-hidden="true" className={cn("fla-medidor block h-[3px] rounded-full bg-border overflow-hidden", className)}>
      <span
        className={cn("fla-medidor-cheio block h-full rounded-full", abaixo ? "bg-warning-strong" : "bg-success-strong")}
        style={{ width: `${Math.round(proporcaoDoAlvo(saldo, alvo) * 100)}%` }}
      />
    </span>
  );
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

export interface ResumoDoFlashProps {
  totals: DadosDoFlash["totals"];
  /** Recorte "abaixo do alvo" ligado na lista. */
  abaixoAtivo: boolean;
  onVerAbaixo: () => void;
}

/**
 * O painel do topo, lido como o cabeçalho de um extrato: quantas contas, o
 * saldo somado de cada categoria (com o alvo por conta ao lado) e quantas
 * precisam de recarga; embaixo, a cobertura do alvo numa faixa fina.
 */
export function ResumoDoFlash({ totals, abaixoAtivo, onVerAbaixo }: ResumoDoFlashProps) {
  const noAlvo = totals.accounts - totals.below;
  const pct = totals.accounts > 0 ? Math.round((noAlvo / totals.accounts) * 100) : 0;
  return (
    <section aria-label="Resumo da conta corrente Flash" className="fla-resumo rounded-xl border border-border bg-card overflow-hidden" data-testid="flash-resumo">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        <div className="fla-metrica min-w-0 px-4 pt-3.5 pb-3" title="Colaboradores com pelo menos um lançamento na conta Flash">
          <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Users className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />Contas ativas
          </p>
          <p className="m-0 mt-1 text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums text-foreground" data-testid="flash-contas">{totals.accounts}</p>
          <p className="m-0 text-2xs sm:text-xs text-muted-foreground truncate">com lançamento no Flash</p>
        </div>
        <div className="fla-metrica min-w-0 px-4 pt-3.5 pb-3" title="Soma do saldo de alimentação de todas as contas">
          <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span className="fla-ponto bg-success-strong" aria-hidden="true" />Saldo alimentação
          </p>
          <p className="m-0 mt-1 text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums text-foreground truncate" data-testid="flash-saldo-alimentacao">{formatCurrency(totals.food)}</p>
          <p className="m-0 text-2xs sm:text-xs text-muted-foreground truncate">alvo {formatCurrency(TARGET_FOOD_CENTS)} por conta</p>
        </div>
        <div className="fla-metrica min-w-0 px-4 pt-3.5 pb-3" title="Soma do saldo de mobilidade de todas as contas">
          <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span className="fla-ponto bg-primary" aria-hidden="true" />Saldo mobilidade
          </p>
          <p className="m-0 mt-1 text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums text-foreground truncate" data-testid="flash-saldo-mobilidade">{formatCurrency(totals.mobility)}</p>
          <p className="m-0 text-2xs sm:text-xs text-muted-foreground truncate">alvo {formatCurrency(TARGET_MOBILITY_CENTS)} por conta</p>
        </div>
        {/* "Abaixo do alvo" conta E recorta a lista (reclicar desliga), como a fila das irmãs. */}
        <button
          type="button"
          onClick={onVerAbaixo}
          aria-pressed={abaixoAtivo}
          disabled={totals.below === 0 && !abaixoAtivo}
          title={totals.below > 0 ? "Mostrar só as contas abaixo do alvo" : "Nenhuma conta abaixo do alvo"}
          className={cn(
            "fla-metrica group relative min-w-0 px-4 pt-3.5 pb-3 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
            abaixoAtivo ? "bg-brand-soft" : "enabled:hover:bg-surface-muted",
          )}
          data-testid="flash-abaixo-do-alvo"
        >
          <span aria-hidden="true" className={cn("absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", abaixoAtivo ? "scale-x-100" : "scale-x-0")} />
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0", totals.below > 0 ? "text-warning-strong" : "text-muted-foreground")} aria-hidden="true" />
            <span className={abaixoAtivo ? "text-primary" : undefined}>Abaixo do alvo</span>
          </span>
          <span className={cn("block mt-1 text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums", totals.below > 0 ? "text-warning" : "text-muted-foreground")}>{totals.below}</span>
          <span className="block text-2xs sm:text-xs text-muted-foreground truncate">
            {totals.below > 0 ? (abaixoAtivo ? "só elas na lista" : "precisam de recarga") : "todas as contas no alvo"}
          </span>
        </button>
      </div>
      {totals.accounts > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 border-t border-border bg-surface-muted/60">
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Contas no alvo</span>
          <span
            role="progressbar"
            aria-label="Contas com os dois saldos no alvo"
            aria-valuemin={0}
            aria-valuemax={totals.accounts}
            aria-valuenow={noAlvo}
            className="relative w-28 sm:w-40 h-1.5 rounded-full bg-border overflow-hidden shrink-0 max-sm:flex-1"
          >
            <span className="fla-progresso absolute inset-y-0 left-0 rounded-full bg-success-strong" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
            {noAlvo === totals.accounts ? "todas no alvo" : `${noAlvo} de ${totals.accounts}`}
          </span>
          <span className="max-md:hidden ml-auto text-xs text-muted-foreground">
            No alvo = alimentação ≥ {formatCurrency(TARGET_FOOD_CENTS)} e mobilidade ≥ {formatCurrency(TARGET_MOBILITY_CENTS)}
          </span>
        </div>
      )}
    </section>
  );
}

// ─── Admitidos sem crédito inicial ────────────────────────────────────────────

export interface AdmittedWithoutCreditPanelProps {
  collaborators: Collaborator[];
  open: boolean;
  onToggle: () => void;
  onLancarCredito: (collabId: string) => void;
}

/** Admitidos sem crédito inicial — fecha o fluxo "crédito na admissão". */
export function AdmittedWithoutCreditPanel({ collaborators, open, onToggle, onLancarCredito }: AdmittedWithoutCreditPanelProps) {
  const n = collaborators.length;
  return (
    <section aria-label="Admitidos sem crédito inicial" className="pas-entra rounded-xl border border-warning/25 bg-warning-soft overflow-hidden" data-testid="flash-admitidos">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        <UserPlus className="w-4 h-4 mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
        <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-1.75rem)]">
          <p className="m-0 text-sm font-semibold text-warning">
            {n === 1 ? "1 colaborador ativo sem crédito inicial" : `${n} colaboradores ativos sem crédito inicial`}
          </p>
          <p className="m-0 mt-0.5 text-xs leading-5 text-warning">
            Nenhum lançamento na conta Flash ainda — lance o crédito da admissão ({formatCurrency(TARGET_FOOD_CENTS)} alimentação + {formatCurrency(TARGET_MOBILITY_CENTS)} mobilidade).
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="flash-admitidos-lista"
          className="pas-alvo shrink-0 max-sm:ml-7 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold text-warning border border-warning/30 bg-card/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="flash-admitidos-alternar"
        >
          {open ? "Ocultar lista" : "Ver lista"}
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul id="flash-admitidos-lista" className="fla-abre fla-admitidos m-0 p-0 list-none max-h-[264px] overflow-y-auto border-t border-warning/20 bg-card">
          {collaborators.map(c => {
            const [bg, fg] = avatarClasses(c.fullName);
            return (
              <li key={c.id} className="flex items-center gap-2.5 min-w-0 px-4 py-2">
                <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-2xs font-semibold", bg, fg)} aria-hidden="true">{initials(c.fullName)}</span>
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{toTitleCase(c.fullName)}</span>
                <button
                  type="button"
                  onClick={() => onLancarCredito(c.id)}
                  aria-label={`Lançar crédito inicial para ${toTitleCase(c.fullName)}`}
                  className="pas-alvo shrink-0 inline-flex items-center h-7 px-2.5 rounded-md text-xs font-semibold text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                >
                  Lançar crédito
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Lista de contas ──────────────────────────────────────────────────────────

export interface AccountsListProps {
  search: string;
  setSearch: (v: string) => void;
  movementsCount: number;
  selectedCollabId: string;
  onSelect: (id: string) => void;
  situacao: SituacaoDaConta;
  onSituacao: (s: SituacaoDaConta) => void;
  /** Quantas contas há em cada recorte (já com a busca aplicada). */
  contagem: Record<SituacaoDaConta, number>;
  /** Linhas do recorte atual (busca + situação). */
  linhas: DadosDoFlash["accountRows"];
  /** Todas as contas, sem recorte (o "de N" do contador). */
  totalDeContas: number;
  className?: string;
}

const SITUACOES: { id: SituacaoDaConta; rotulo: string; titulo?: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "abaixo", rotulo: "Abaixo", titulo: "Abaixo do alvo" },
  { id: "no-alvo", rotulo: "No alvo" },
];

/** Lista de contas (coluna esquerda). */
export function AccountsList({ search, setSearch, movementsCount, selectedCollabId, onSelect, situacao, onSituacao, contagem, linhas, totalDeContas, className }: AccountsListProps) {
  const semResultado = linhas.length === 0;
  return (
    <section aria-label="Contas por colaborador" className={cn("fla-contas flex flex-col rounded-xl border border-border bg-card overflow-hidden", className)} data-testid="flash-contas-lista">
      <div className="px-3 pt-3 pb-2.5 space-y-2.5 border-b border-border">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">Contas</h2>
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {linhas.length === totalDeContas ? plural(linhas.length, "conta", "contas") : `${linhas.length} de ${totalDeContas}`}
          </span>
        </div>
        <div className="sm:[&>div]:max-w-none">
          <BuscaDaLista valor={search} onChange={setSearch} placeholder="Buscar colaborador" rotulo="Buscar colaborador" testid="flash-busca" />
        </div>
        {/* Recorte pela situação do alvo: um controle segmentado com a contagem de cada lado. */}
        <div role="group" aria-label="Situação da conta" className="fla-segmentos grid grid-cols-3 p-0.5 rounded-lg bg-muted">
          {SITUACOES.map(s => {
            const on = situacao === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                title={s.titulo}
                aria-label={s.titulo ? `${s.titulo} (${contagem[s.id]})` : undefined}
                onClick={() => onSituacao(s.id)}
                className={cn(
                  "pas-alvo inline-flex items-center justify-center gap-1 min-w-0 h-7 px-1.5 rounded-md text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`flash-situacao-${s.id}`}
              >
                <span className="truncate">{s.rotulo}</span>
                <span className={cn("tabular-nums", on ? "text-muted-foreground" : "text-muted-foreground/80", s.id === "abaixo" && contagem.abaixo > 0 && "text-warning")}>{contagem[s.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {semResultado ? (
        <div className="pas-entra flex flex-col items-center text-center px-5 py-10" data-testid="flash-contas-sem-resultado">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground mb-2.5" aria-hidden="true">
            {movementsCount === 0 ? <Wallet className="w-4 h-4" /> : <SearchX className="w-4 h-4" />}
          </span>
          <p className="m-0 text-sm font-medium text-foreground">
            {search ? <>Nenhuma conta com “{search}”</> : situacao === "abaixo" ? "Nenhuma conta abaixo do alvo" : situacao === "no-alvo" ? "Nenhuma conta no alvo" : "Nenhuma conta aberta"}
          </p>
          <p className="m-0 mt-1 text-xs text-muted-foreground max-w-[260px]">
            {search || situacao !== "todas" ? "Confira a grafia ou tire o recorte para ver todas as contas." : "Use \"Novo lançamento\" para registrar o crédito inicial de um colaborador."}
          </p>
          {(search || situacao !== "todas") && (
            <button
              type="button"
              onClick={() => { setSearch(""); onSituacao("todas"); }}
              className="pas-alvo mt-3 inline-flex items-center h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="flash-limpar-filtros"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="fla-contas-rolagem m-0 p-0 list-none divide-y divide-border overflow-y-auto">
          {linhas.map(row => {
            const on = selectedCollabId === row.collaboratorId;
            const nome = toTitleCase(row.name);
            const [bg, fg] = avatarClasses(row.name);
            const foodAbaixo = row.food < TARGET_FOOD_CENTS;
            const mobAbaixo = row.mobility < TARGET_MOBILITY_CENTS;
            return (
              <li key={row.collaboratorId}>
                <button
                  type="button"
                  onClick={() => onSelect(row.collaboratorId)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "fla-conta relative w-full text-left flex items-start gap-3 pl-4 pr-3.5 py-3 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    on ? "fla-conta-sel bg-brand-soft" : "hover:bg-surface-muted",
                  )}
                  data-testid={`flash-conta-${row.collaboratorId}`}
                >
                  <span className={cn("inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-2xs font-semibold", bg, fg)} aria-hidden="true">{initials(row.name)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={cn("flex-1 min-w-0 text-sm font-medium truncate", on ? "text-primary" : "text-foreground")}>{nome}</span>
                      {row.belowTarget ? (
                        <span className="inline-flex items-center gap-1 shrink-0 h-5 px-1.5 rounded-md bg-warning-soft text-2xs font-semibold text-warning" title="Alimentação ou mobilidade abaixo do alvo">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />Abaixo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 shrink-0 text-2xs font-medium text-muted-foreground" title="Os dois saldos no alvo">
                          <CheckCircle2 className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" /><span className="max-[420px]:sr-only">No alvo</span>
                        </span>
                      )}
                    </span>
                    <span className="grid grid-cols-2 gap-x-4 mt-1.5">
                      <span className="min-w-0">
                        <span className="flex items-baseline justify-between gap-1.5 text-xs">
                          <span className="text-muted-foreground">Alim.</span>
                          <span className={cn("tabular-nums font-medium", foodAbaixo ? "text-warning" : "text-foreground")}>{formatCurrency(row.food)}</span>
                        </span>
                        <MedidorDoAlvo saldo={row.food} alvo={TARGET_FOOD_CENTS} className={cn("mt-1", !foodAbaixo && "invisible")} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-baseline justify-between gap-1.5 text-xs">
                          <span className="text-muted-foreground">Mob.</span>
                          <span className={cn("tabular-nums font-medium", mobAbaixo ? "text-warning" : "text-foreground")}>{formatCurrency(row.mobility)}</span>
                        </span>
                        <MedidorDoAlvo saldo={row.mobility} alvo={TARGET_MOBILITY_CENTS} className={cn("mt-1", !mobAbaixo && "invisible")} />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Exclusão ─────────────────────────────────────────────────────────────────

export interface DeleteMovementDialogProps {
  movement: FlashMovement | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  /** Saldo atual da categoria do lançamento (para mostrar o "depois"). */
  saldoAtual?: number;
  excluindo?: boolean;
}

/** Confirmação de exclusão (padrão do app — sem window.confirm). */
export function DeleteMovementDialog({ movement, onClose, onConfirm, saldoAtual, excluindo = false }: DeleteMovementDialogProps) {
  const credito = movement?.type === "credito";
  const valor = movement?.amountCents || 0;
  const categoria = movement ? (ROTULO_CATEGORIA[movement.category] ?? movement.category) : "";
  const depois = saldoAtual !== undefined ? saldoAtual - (credito ? valor : -valor) : undefined;
  return (
    <AlertDialog open={!!movement} onOpenChange={open => { if (!open && !excluindo) onClose(); }}>
      <AlertDialogContent className="rounded-xl max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
          <AlertDialogDescription>
            O saldo do colaborador será recalculado e a exclusão fica registrada na auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {movement && (
          <div className="rounded-lg border border-border bg-surface-muted/60 px-3.5 py-3" data-testid="flash-excluir-resumo">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-sm font-medium text-foreground truncate">
                  {movement.description || (credito ? "Crédito" : "Débito")}
                </p>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  {credito ? "Crédito" : "Débito"} · {categoria} · {fmtDate(movement.movementDate)}
                </p>
              </div>
              <p className={cn("m-0 shrink-0 text-sm font-semibold tabular-nums", credito ? "text-success" : "text-foreground")}>
                {credito ? "+" : "−"}{formatCurrency(valor)}
              </p>
            </div>
            {depois !== undefined && saldoAtual !== undefined && (
              <p className="m-0 mt-2.5 pt-2.5 border-t border-border text-xs text-muted-foreground tabular-nums">
                Saldo de {categoria.toLowerCase()}: {formatCurrency(saldoAtual)} <span aria-hidden="true">→</span><span className="sr-only">passa para</span>{" "}
                <span className={cn("font-semibold", depois < 0 ? "text-danger" : "text-foreground")}>{formatCurrency(depois)}</span>
              </p>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg" disabled={excluindo}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-lg gap-1.5 bg-danger hover:bg-danger/90"
            disabled={excluindo}
            // Fica aberto até o servidor responder: fechar antes escondia a falha.
            onClick={e => { e.preventDefault(); if (movement) onConfirm(movement.id); }}
            data-testid="flash-excluir-confirmar"
          >
            {excluindo
              ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            {excluindo ? "Excluindo…" : "Excluir lançamento"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
