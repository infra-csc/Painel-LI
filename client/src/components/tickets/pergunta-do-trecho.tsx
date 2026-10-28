/**
 * "Este bilhete troca a ida ou a volta?" (28/10, vaga #4618). O bilhete lido
 * traz um trecho só e a passagem já tem ida e volta: em vez de aplicar por
 * cima de tudo (o tipo da ida virava rodoviário e o LOC do voo sumia), a tela
 * pergunta. A resposta mexe só no trecho escolhido — `substituirUmTrecho`.
 */
import { ArrowLeftRight, Bus, Plane } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { PerguntaDoTrecho as Pergunta } from "./use-voucher-fill";

const Icone = ({ texto }: { texto: string }) =>
  texto.startsWith("de ônibus")
    ? <Bus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    : <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;

export function PerguntaDoTrecho({ pergunta }: { pergunta: Pergunta | null }) {
  const p = pergunta;
  const linha = (rotulo: string, texto: string) => (
    <div className="flex items-start gap-2 bg-card px-3 py-2">
      <dt className="w-14 shrink-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground pt-0.5">{rotulo}</dt>
      <dd className="m-0 flex min-w-0 items-start gap-1.5 text-xs text-foreground"><Icone texto={texto} /><span className="min-w-0 break-words">{texto || "—"}</span></dd>
    </div>
  );
  return (
    <AlertDialog open={!!p} onOpenChange={(o) => { if (!o) p?.responder(null); }}>
      <AlertDialogContent className="max-w-[520px]" data-testid="pergunta-do-trecho">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft" aria-hidden="true"><ArrowLeftRight className="h-4 w-4 text-primary" /></span>
            Este bilhete troca a ida ou a volta?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="m-0 text-sm text-slate-700">
                O bilhete traz <strong className="font-semibold">um trecho só</strong> e esta passagem já tem ida e volta.
                Escolha o trecho que ele substitui — o outro fica como está, com o tipo dele.
              </p>
              <dl className="m-0 overflow-hidden rounded-lg border border-border bg-border space-y-px">
                {p && linha("Bilhete", p.bilhete)}
                {p && linha("Ida", p.ida)}
                {p && linha("Volta", p.volta)}
              </dl>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="sm:mr-auto" data-testid="pergunta-do-trecho-so-anexar">Só anexar</AlertDialogCancel>
          {/* A sugestão (o trecho que o bilhete parece ser) fica por último, em destaque. */}
          {(p?.sugerido === "ida" ? (["volta", "ida"] as const) : (["ida", "volta"] as const)).map((lado) => (
            <Button
              key={lado}
              type="button"
              variant={p?.sugerido === lado ? "default" : "outline"}
              onClick={() => p?.responder(lado)}
              data-testid={`pergunta-do-trecho-${lado}`}
            >
              Trocar a {lado}
            </Button>
          ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
