/**
 * Mover alguém de grupo (quarto ou carro) — 25/09, extraído da página.
 *
 * Era um <select> solto: escolher no menu já executava, sem dizer o que a
 * escolha provoca. Virou um diálogo de ESCOLHAS — cada destino descrito por
 * quem já está nele —, com a consequência dita antes: tirar alguém de um carro
 * muda o horário dos dois carros, porque ele é calculado a partir dos voos de
 * quem sobra em cada um.
 */
import { useState } from "react";
import { ArrowLeftRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface MoverParaProps {
  pessoa: string;
  grupoAtual: string;
  destinos: { id: string; descricao: string }[];
  rotuloNovo: string;
  onMover: (paraGrupoId: string | null) => void;
  /** O que muda ao mover — dito no diálogo, antes da escolha. */
  consequencia?: string;
}

export function MoverPara({ pessoa, grupoAtual, destinos, rotuloNovo, onMover, consequencia }: MoverParaProps) {
  const [aberto, setAberto] = useState(false);
  const escolher = (destino: string | null) => { onMover(destino); setAberto(false); };
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Mover ${pessoa} para outro grupo`}
        title={`Mover ${pessoa} para outro grupo`}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-input/60 bg-background/60 px-1.5 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/linha:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`mover-${grupoAtual}`}
      >
        <ArrowLeftRight className="h-3 w-3" aria-hidden="true" /> Mover
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[460px] p-0 gap-0 overflow-hidden rounded-xl">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base">Mover {pessoa} para onde?</DialogTitle>
            {consequencia && <DialogDescription className="text-sm leading-normal">{consequencia}</DialogDescription>}
          </DialogHeader>
          <div className="max-h-[46vh] overflow-y-auto border-t">
            {destinos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => escolher(d.id)}
                className="flex w-full items-center gap-2 border-b px-5 py-[11px] text-left transition-colors last:border-b-0 hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.descricao}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => escolher(null)}
              className="flex w-full items-center gap-2 px-5 py-[11px] text-left transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{rotuloNovo}</span>
                <span className="block text-xs text-muted-foreground">Cria um grupo só para esta pessoa.</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <DialogFooter className="border-t bg-muted/40 px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
