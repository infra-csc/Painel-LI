/**
 * Filtro de PERÍODO da barra dos Honorários (23/10) — fica ao lado do seletor
 * de evento. Atalhos (Este mês · Mês passado · Últimos 3 meses · Este ano ·
 * Tudo), "de/até" livre e, na aba Liberados, a base: data da liberação
 * (padrão) ou data do evento. As regras moram em shared/honorarios-periodo.ts;
 * aqui só a apresentação. O estado é da página (URL).
 */
import { useState } from "react";
import { CalendarRange, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ATALHOS_DO_PERIODO, BASE_DO_PERIODO_LABEL, descricaoDoIntervalo, intervaloDoPeriodo, rotuloDoPeriodo, semLimite,
  type BaseDoPeriodo, type EscolhaDoPeriodo,
} from "@shared/honorarios-periodo";

const BOTAO_DE_OPCAO = "val-alvo inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LIGADO = "bg-card font-semibold text-primary shadow-1 ring-1 ring-border";
const DESLIGADO = "text-muted-foreground hover:text-foreground";

export function FiltroDePeriodo({ escolha, onEscolha, hoje, base, onBase, onLimpar, podeLimpar, className }: {
  escolha: EscolhaDoPeriodo;
  onEscolha: (e: EscolhaDoPeriodo) => void;
  hoje: string;
  /** A base em vigor. `onBase` presente = a pessoa pode trocar (aba Liberados). */
  base: BaseDoPeriodo;
  onBase?: (b: BaseDoPeriodo) => void;
  onLimpar: () => void;
  /** Há algo a limpar (período ou base fora do padrão). */
  podeLimpar: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const intervalo = intervaloDoPeriodo(escolha, hoje);
  const ativo = !semLimite(intervalo);
  const rotulo = rotuloDoPeriodo(escolha, hoje);
  // Curto (cabe no botão de 300px): "01/10/2026 a 31/10/2026 · pela liberação".
  const pela = base === "liberacao" ? "pela liberação" : "pelo evento";
  const detalhe = ativo ? `${escolha.atalho === "personalizado" ? "" : `${descricaoDoIntervalo(intervalo)} · `}${pela}` : "sem recorte de datas";
  const de = intervalo.de ?? "";
  const ate = intervalo.ate ?? "";

  return (
    <div className={cn("relative flex min-w-0 max-w-full items-center gap-0.5", className)}>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="hon-periodo"
            aria-label={`Período: ${rotulo}${ativo ? ` (${descricaoDoIntervalo(intervalo)}, ${BASE_DO_PERIODO_LABEL[base]})` : ""}. Trocar período`}
            className={cn(
              "group flex h-[42px] min-w-0 max-w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[300px]",
              aberto && "bg-muted",
            )}
          >
            <CalendarRange className={cn("h-4 w-4 shrink-0", ativo ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-5 text-foreground">{rotulo}</span>
              <span className="block truncate text-2xs leading-4 tabular-nums text-muted-foreground">{detalhe}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", aberto && "rotate-180")} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[min(340px,calc(100vw-32px))] space-y-4 rounded-xl p-4" data-testid="hon-periodo-painel">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Período</p>
            <div role="radiogroup" aria-label="Atalhos de período" className="grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-background p-[3px]">
              {ATALHOS_DO_PERIODO.map((a) => {
                const on = escolha.atalho === a.id;
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => onEscolha({ atalho: a.id })}
                    className={cn(BOTAO_DE_OPCAO, on ? LIGADO : DESLIGADO, a.id === "tudo" && "col-span-2")}>
                    {a.rotulo}
                  </button>
                );
              })}
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-foreground">De / até</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-2xs text-muted-foreground">De</span>
                <Input type="date" value={de} max={ate || undefined} aria-label="Data inicial do período" data-testid="hon-periodo-de" className="h-9 rounded-lg bg-card px-2 text-sm"
                  onChange={(e) => onEscolha({ atalho: "personalizado", de: e.target.value || null, ate: ate || null })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs text-muted-foreground">Até</span>
                <Input type="date" value={ate} min={de || undefined} aria-label="Data final do período" data-testid="hon-periodo-ate" className="h-9 rounded-lg bg-card px-2 text-sm"
                  onChange={(e) => onEscolha({ atalho: "personalizado", de: de || null, ate: e.target.value || null })} />
              </label>
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Aplicar à</p>
            {onBase ? (
              <>
                <div role="radiogroup" aria-label="Data a que o período se aplica" className="grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-background p-[3px]">
                  {(["liberacao", "evento"] as const).map((b) => (
                    <button key={b} type="button" role="radio" aria-checked={base === b} onClick={() => onBase(b)} className={cn(BOTAO_DE_OPCAO, base === b ? LIGADO : DESLIGADO)}>
                      {b === "liberacao" ? "Data da liberação" : "Data do evento"}
                    </button>
                  ))}
                </div>
                <p className="text-2xs leading-4 text-muted-foreground">
                  {base === "liberacao"
                    ? "O que foi pago no período, pela data da OC/DP — como o Financeiro fecha o mês."
                    : "Os eventos que começam no período, com tudo o que já foi liberado deles."}
                </p>
              </>
            ) : (
              <p className="text-2xs leading-4 text-muted-foreground">Data de início do evento. Em Liberados dá para usar a data da liberação.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" size="sm" className="val-alvo -ml-2 text-muted-foreground" onClick={() => { onLimpar(); setAberto(false); }} disabled={!podeLimpar} data-testid="hon-periodo-limpar">
              Limpar
            </Button>
            <Button type="button" size="sm" className="val-alvo" onClick={() => setAberto(false)}>Pronto</Button>
          </div>
        </PopoverContent>
      </Popover>
      {ativo && (
        <button type="button" onClick={onLimpar} aria-label="Limpar período" title="Limpar período" data-testid="hon-periodo-x"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
