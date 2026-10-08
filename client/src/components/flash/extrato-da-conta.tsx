// Redesenho 08/10 — o painel do extrato de uma conta (coluna da direita).
//
// Cabeçalho com a pessoa e as ações (CSV, fechar; no celular/tablet, "Contas"
// para voltar), os dois saldos como num extrato bancário (o valor grande, a
// barrinha do alvo e quanto falta), o recorte por origem com a contagem de
// cada lado e a tabela. Só apresentação: os números vêm de `useFlashData`.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, FileX2, Lock, Plus, X } from "lucide-react";
import { isAutomaticFlashMovement } from "@shared/flash-rules";
import { Button } from "@/components/ui/button";
import { avatarClasses, initials, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MedidorDoAlvo } from "./flash-cards";
import { MovementsTable } from "./movements-table";
import {
  TARGET_FOOD_CENTS, TARGET_MOBILITY_CENTS, faltaParaOAlvo, fmtDate, formatCurrency,
  type Balance, type ExtratoLinha, type SourceFilter,
} from "./flash-types";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Um saldo do extrato: o valor, a barrinha do alvo e o que falta. Acende quando muda. */
function SaldoDaCategoria({ rotulo, saldo, alvo, ponto, testid }: { rotulo: string; saldo: number; alvo: number; ponto: string; testid: string }) {
  const anterior = useRef(saldo);
  const [acendeu, setAcendeu] = useState(0);
  useEffect(() => {
    if (anterior.current !== saldo) { anterior.current = saldo; setAcendeu(n => n + 1); }
  }, [saldo]);
  const falta = faltaParaOAlvo(saldo, alvo);
  return (
    <div className="fla-saldo min-w-0 px-4 sm:px-5 py-3.5">
      <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <span className={cn("fla-ponto", ponto)} aria-hidden="true" />Saldo {rotulo}
      </p>
      <p
        key={acendeu}
        className={cn("m-0 mt-1 text-[1.375rem] leading-7 font-semibold tracking-[-0.02em] tabular-nums", saldo < 0 ? "text-danger" : "text-foreground", acendeu > 0 && "fla-valor-mudou")}
        data-testid={testid}
      >
        {formatCurrency(saldo)}
      </p>
      <MedidorDoAlvo saldo={saldo} alvo={alvo} className="mt-2 max-w-[220px]" />
      <p className="m-0 mt-1.5 text-xs text-muted-foreground tabular-nums">
        {falta > 0
          ? <><span className="font-medium text-warning">faltam {formatCurrency(falta)}</span> para o alvo de {formatCurrency(alvo)}</>
          : <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-success-strong" aria-hidden="true" />no alvo de {formatCurrency(alvo)}</span>}
      </p>
    </div>
  );
}

export interface ExtratoDaContaProps {
  nome: string;
  saldo: Balance | undefined;
  extrato: ExtratoLinha[];
  extratoVisible: ExtratoLinha[];
  sourceFilter: SourceFilter;
  setSourceFilter: (f: SourceFilter) => void;
  hasAutomatic: boolean;
  canManage: boolean;
  getEventName: (id?: string | null) => string;
  onEdit: (m: ExtratoLinha) => void;
  onDelete: (m: ExtratoLinha) => void;
  onExportCsv: () => void;
  onClose: () => void;
  /** Abre "Novo lançamento" já com esta pessoa (vazio do extrato). */
  onNovo: () => void;
  destaques?: ReadonlySet<string>;
  className?: string;
}

const ORIGENS: { id: SourceFilter; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "manual", rotulo: "Manuais" },
  { id: "automatico", rotulo: "Automáticos" },
];

export function ExtratoDaConta(p: ExtratoDaContaProps) {
  const { nome, saldo, extrato, extratoVisible, sourceFilter, setSourceFilter, hasAutomatic, canManage } = p;
  const [bg, fg] = avatarClasses(nome);
  const contagem = useMemo(() => {
    const auto = extrato.filter(m => isAutomaticFlashMovement(m)).length;
    return { todos: extrato.length, manual: extrato.length - auto, automatico: auto } satisfies Record<SourceFilter, number>;
  }, [extrato]);
  const desde = extrato[0]?.movementDate;

  return (
    <section aria-label={`Extrato de ${toTitleCase(nome)}`} className={cn("fla-extrato rounded-xl border border-border bg-card", p.className)} data-testid="flash-extrato">
      {/* Cabeçalho: quem é e as ações do extrato. */}
      {/* Celular/tablet: a lista some enquanto o extrato está aberto — "Contas" volta. */}
      <div className="lg:hidden flex items-center px-2.5 sm:px-3.5 py-1.5 border-b border-border bg-surface-muted/50">
        <button
          type="button"
          onClick={p.onClose}
          className="pas-alvo inline-flex items-center gap-1 h-8 pl-1.5 pr-2.5 rounded-lg text-sm font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="flash-extrato-voltar"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />Contas
        </button>
      </div>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-border">
        <span className={cn("max-sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-xs font-semibold", bg, fg)} aria-hidden="true">{initials(nome)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-base font-semibold leading-6 text-foreground truncate" data-testid="flash-extrato-nome">{toTitleCase(nome)}</h2>
          <p className="m-0 text-xs text-muted-foreground truncate">
            {extrato.length > 0
              ? <>{plural(extrato.length, "lançamento", "lançamentos")}{desde && <> · desde {fmtDate(desde)}</>}</>
              : "Sem lançamentos"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={p.onExportCsv}
          disabled={extrato.length === 0}
          title="Exportar o extrato completo em CSV"
          className="pas-alvo shrink-0 h-8 px-2.5 rounded-lg text-xs font-medium gap-1.5"
          data-testid="flash-exportar-csv"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" /><span>CSV</span>
        </Button>
        <button
          type="button"
          onClick={p.onClose}
          aria-label="Fechar extrato"
          title="Fechar extrato"
          className="max-lg:hidden w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Os dois saldos, como num extrato bancário. */}
      <div className="fla-saldos grid grid-cols-2 border-b border-border">
        <SaldoDaCategoria rotulo="alimentação" saldo={saldo?.food || 0} alvo={TARGET_FOOD_CENTS} ponto="bg-success-strong" testid="flash-extrato-saldo-alimentacao" />
        <SaldoDaCategoria rotulo="mobilidade" saldo={saldo?.mobility || 0} alvo={TARGET_MOBILITY_CENTS} ponto="bg-primary" testid="flash-extrato-saldo-mobilidade" />
      </div>

      {extrato.length === 0 ? (
        <div className="pas-entra flex flex-col items-center text-center px-6 py-12" data-testid="flash-extrato-vazio">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
            <FileX2 className="w-5 h-5" />
          </span>
          <p className="m-0 text-sm font-semibold text-foreground">Nenhum lançamento para este colaborador</p>
          <p className="m-0 mt-1 max-w-[340px] text-xs leading-5 text-muted-foreground">
            A conta abre com o crédito inicial da admissão; depois, cada evento aprovado repõe o que foi gasto.
          </p>
          {canManage && (
            <Button type="button" variant="outline" onClick={p.onNovo} className="mt-4 h-8 px-3 rounded-lg text-xs font-medium gap-1.5">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />Novo lançamento
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Recorte por origem: manual × automático (crédito da aprovação do comparativo). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-2.5 border-b border-border">
            <div role="group" aria-label="Origem do lançamento" className="inline-flex p-0.5 rounded-lg bg-muted max-sm:w-full">
              {ORIGENS.map(o => {
                const on = sourceFilter === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSourceFilter(o.id)}
                    disabled={contagem[o.id] === 0 && !on}
                    className={cn(
                      "pas-alvo inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors max-sm:flex-1",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                      on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground enabled:hover:text-foreground",
                    )}
                    data-testid={`flash-origem-${o.id}`}
                  >
                    {o.rotulo}<span className="tabular-nums text-muted-foreground">{contagem[o.id]}</span>
                  </button>
                );
              })}
            </div>
            {hasAutomatic && (
              <p
                className="m-0 sm:ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                title="Gerado na aprovação do comparativo do evento — acompanha o Realizado; estorno em Comparativo → Fechamento do comparativo → Reabrir comparativo"
              >
                <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                Automático = crédito do comparativo (somente leitura)
              </p>
            )}
          </div>

          {extratoVisible.length === 0 ? (
            <div className="pas-entra flex flex-col items-center text-center px-6 py-10" data-testid="flash-extrato-sem-resultado">
              <p className="m-0 text-sm font-medium text-foreground">
                Nenhum lançamento {sourceFilter === "automatico" ? "automático" : "manual"} para este colaborador
              </p>
              <button
                type="button"
                onClick={() => setSourceFilter("todos")}
                className="pas-alvo mt-3 inline-flex items-center h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver todos os lançamentos
              </button>
            </div>
          ) : (
            <MovementsTable
              extratoVisible={extratoVisible}
              canManage={canManage}
              getEventName={p.getEventName}
              onEdit={p.onEdit}
              onDelete={p.onDelete}
              destaques={p.destaques}
              filtrado={sourceFilter !== "todos"}
            />
          )}
        </>
      )}
    </section>
  );
}

export default ExtratoDaConta;
