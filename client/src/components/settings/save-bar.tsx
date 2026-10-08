// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// Barra de alterações — o ÚNICO ponto que grava a tela Valores padrão. Recebe
// só contadores, a lista do que mudou e callbacks; quem decide o que salvar é
// useSettingsForm.
//
// 08/10 — a barra escura da família (Planejado, Realizado): sobe do rodapé
// quando há alteração, diz quantas e o EFEITO de salvar, abre a lista "antes →
// depois" (o que vai ser gravado), avisa campo com erro e leva até ele.
// "Descartar" é um botão com nome (era um × solto de 12px).
import { AlertCircle, ListChecks, Loader2, Save, Undo2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MudancaPendente {
  rotulo: string;
  antes: string;
  depois: string;
}

export interface SaveBarProps {
  totalUnsaved: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Lista "antes → depois" (montada só quando o popover abre). */
  mudancas?: () => MudancaPendente[];
  /** Campos com erro de validação depois de tentar salvar. */
  erros?: number;
  onIrParaErro?: () => void;
}

export function SaveBar({ totalUnsaved, saving, onSave, onDiscard, mudancas, erros = 0, onIrParaErro }: SaveBarProps) {
  const n = totalUnsaved;
  return (
    <div className="cfg-barra sticky bottom-3 z-20 pas-sobe" role="region" aria-label="Alterações não salvas" data-testid="cfg-barra-alteracoes">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-foreground text-background shadow-3 pl-4 pr-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <p className="m-0 mr-1 inline-flex items-center gap-2 text-sm font-semibold tabular-nums" aria-live="polite">
              <span className="w-2 h-2 rounded-full bg-warning-strong shrink-0" aria-hidden="true" />
              {n} {n === 1 ? "alteração não salva" : "alterações não salvas"}
            </p>
            {mudancas && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-medium text-background/75 hover:bg-background/10 hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
                    data-testid="cfg-ver-alteracoes"
                  >
                    <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />Ver o que mudou
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" sideOffset={10} className="w-[min(420px,calc(100vw-32px))] p-0 rounded-xl" data-testid="cfg-lista-alteracoes">
                  <ListaDeMudancas itens={mudancas()} />
                </PopoverContent>
              </Popover>
            )}
            {erros > 0 && (
              <button
                type="button"
                onClick={onIrParaErro}
                className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs font-semibold text-danger-soft hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
                data-testid="cfg-ir-para-erro"
              >
                <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                {erros} {erros === 1 ? "campo com erro" : "campos com erro"}
              </button>
            )}
          </div>
          <p className="m-0 hidden md:block text-2xs leading-4 text-background/65 truncate">
            Ao salvar, os novos valores passam a valer no cálculo e são reaplicados aos planejamentos ainda não enviados ao Realizado.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 max-[420px]:w-full max-[420px]:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-background/80 hover:bg-background/10 hover:text-background disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60"
            data-testid="cfg-descartar"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />Descartar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground",
              "hover:bg-primary-hover disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/60",
            )}
            data-testid="cfg-salvar"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
            {saving ? "Salvando…" : <>Salvar<span className="max-[420px]:hidden"> alterações</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListaDeMudancas({ itens }: { itens: MudancaPendente[] }) {
  return (
    <div>
      <p className="m-0 px-4 pt-3 pb-2 text-xs font-semibold text-foreground border-b border-border">
        O que vai ser salvo <span className="font-normal text-muted-foreground">· {itens.length} {itens.length === 1 ? "valor" : "valores"}</span>
      </p>
      <dl className="cfg-lista-mudancas m-0 max-h-[320px] overflow-y-auto px-4 py-2">
        {itens.map((m, i) => (
          <div key={i} className="contents">
            <dt className="text-xs text-foreground min-w-0">{m.rotulo}</dt>
            <dd className="m-0 text-xs tabular-nums whitespace-nowrap text-right">
              <span className="text-muted-foreground line-through decoration-muted-foreground/50">{m.antes}</span>
              <span className="mx-1 text-muted-foreground" aria-hidden="true">→</span>
              <span className="sr-only"> passa para </span>
              <span className="font-semibold text-foreground">{m.depois}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
