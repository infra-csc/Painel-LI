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
  /** Só o ícone (tabelas apertadas, como a roteirização). */
  compacto?: boolean;
}

export function MoverPara({ pessoa, grupoAtual, destinos, rotuloNovo, onMover, consequencia, compacto }: MoverParaProps) {
  const [aberto, setAberto] = useState(false);
  const escolher = (destino: string | null) => { onMover(destino); setAberto(false); };
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Mover ${pessoa} para outro grupo`}
        title={`Mover ${pessoa} para outro grupo`}
        className="esp-revela inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-1.5 text-2xs font-medium text-muted-foreground opacity-0 transition-[opacity,color,background-color,border-color] hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus:opacity-100 group-hover/linha:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`mover-${grupoAtual}`}
      >
        <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />{!compacto && " Mover"}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[460px] p-0 gap-0 overflow-hidden rounded-xl">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="pr-6 text-base">Mover {pessoa} para onde?</DialogTitle>
            {consequencia && <DialogDescription className="text-sm leading-relaxed">{consequencia}</DialogDescription>}
          </DialogHeader>
          <div className="max-h-[46vh] overflow-y-auto border-t p-1.5">
            {destinos.length > 0 && <p className="px-3.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Juntar com</p>}
            {destinos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => escolher(d.id)}
                className="group/destino flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.descricao}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/destino:translate-x-0.5 group-hover/destino:text-primary motion-reduce:transition-none" aria-hidden="true" />
              </button>
            ))}
            {destinos.length > 0 && <div className="mx-3.5 my-1.5 h-px bg-border" aria-hidden="true" />}
            <button
              type="button"
              onClick={() => escolher(null)}
              className="group/destino flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-left transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{rotuloNovo}</span>
                <span className="block text-xs text-muted-foreground">Cria um grupo só para esta pessoa.</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/destino:translate-x-0.5 group-hover/destino:text-primary motion-reduce:transition-none" aria-hidden="true" />
            </button>
          </div>
          <DialogFooter className="border-t bg-surface-muted px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
