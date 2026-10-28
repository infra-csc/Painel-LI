/**
 * Contestação do colaborador → DP (28/10, Fase 3 — prazos e cobranças).
 *
 * Na confirmação o colaborador pode escrever "Algo não bate?". O texto volta
 * ao DP como pendência ("Contestação do colaborador"), no Painel de
 * honorários e na Conferência DP; o DP responde e ela fica "respondida" — o
 * colaborador vê a resposta no portal. Um componente só para as duas telas:
 * o selo (aberta/respondida) e o diálogo de responder.
 *
 * POST /api/presenca/:actualId/contestacao/resposta { resposta } (admin, DP).
 */
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCheck, Loader2, MessageSquareWarning } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

/** O formato que o servidor manda (Painel: `linha.contestacao`; presença: `confirmacao.contestacaoDoColaborador`). */
export interface ContestacaoParaTela {
  texto: string;
  em: string | null;
  respondida: boolean;
  resposta: string | null;
  respondidaEm: string | null;
  respondidaPorNome: string | null;
}

export const RESPOSTA_MINIMA = 3;

const F_DATA_HORA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dataHora = (iso: string | null) => (iso ? F_DATA_HORA.format(new Date(iso)).replace(",", " às") : "");

/** Selo curto da contestação: aberta (âmbar, é pendência do DP) ou respondida. */
export function SeloDaContestacao({ c, onClick, className }: { c: ContestacaoParaTela; onClick?: () => void; className?: string }) {
  const aberta = !c.respondida;
  const conteudo = (
    <>
      {aberta ? <MessageSquareWarning className="w-3 h-3 shrink-0" aria-hidden="true" /> : <CheckCheck className="w-3 h-3 shrink-0" aria-hidden="true" />}
      {aberta ? "Contestação do colaborador" : "Contestação respondida"}
    </>
  );
  const cls = cn(
    "inline-flex items-center gap-1 h-[20px] px-1.5 rounded-md border text-2xs font-semibold whitespace-nowrap",
    aberta ? "border-warning/30 bg-warning-soft text-warning" : "border-border bg-muted text-slate-600",
    className,
  );
  const dica = aberta ? `“${c.texto}” — responda para o colaborador ver no app` : `“${c.texto}” · respondida${c.respondidaPorNome ? ` por ${c.respondidaPorNome}` : ""}`;
  if (!onClick) return <span className={cls} title={dica}>{conteudo}</span>;
  return (
    <button type="button" className={cn(cls, "pas-alvo hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")} title={dica}
      onClick={(e) => { e.stopPropagation(); onClick(); }} data-testid="contestacao-selo">
      {conteudo}
    </button>
  );
}

/**
 * Diálogo de responder (ou rever a resposta). `aoResponder` recebe a
 * contestação gravada; as listas que a mostram são invalidadas aqui.
 */
export function DialogoDaContestacao({ alvo, onClose, podeResponder }: {
  alvo: { actualId: string; nome: string; contestacao: ContestacaoParaTela } | null;
  onClose: () => void;
  /** Só admin e DP respondem; os outros leem. */
  podeResponder: boolean;
}) {
  const { toast } = useToast();
  const [resposta, setResposta] = useState("");
  const [tentou, setTentou] = useState(false);
  useEffect(() => {
    if (!alvo) return;
    setResposta(alvo.contestacao.resposta ?? "");
    setTentou(false);
  }, [alvo]);

  const m = useMutation({
    mutationFn: async (texto: string) => (await apiRequest("POST", `/api/presenca/${encodeURIComponent(alvo!.actualId)}/contestacao/resposta`, { resposta: texto })).json() as Promise<{ contestacao: ContestacaoParaTela }>,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/rh/controle"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/presenca/eventos"] }),
        queryClient.invalidateQueries({ queryKey: ["shell", "honorarios-prazos"] }),
      ]);
      toast({ variant: "success", title: "Contestação respondida", description: "O colaborador vê a resposta no app." });
      onClose();
    },
    onError: (e) => toast({ variant: "destructive", title: "Não foi possível responder", description: apiErrorMessage(e, "Tente de novo.") }),
  });

  const c = alvo?.contestacao;
  const texto = resposta.trim();
  const curta = texto.length < RESPOSTA_MINIMA;
  const enviar = () => {
    setTentou(true);
    if (curta || m.isPending) return;
    m.mutate(texto);
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => { if (!o && !m.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]" data-testid="contestacao-dialogo">
        <DialogHeader>
          <DialogTitle>Contestação do colaborador</DialogTitle>
          <DialogDescription>{alvo?.nome}{c?.em ? ` · enviada em ${dataHora(c.em)}` : ""}</DialogDescription>
        </DialogHeader>
        {c && (
          <div className="space-y-3">
            <blockquote className="m-0 rounded-md border-l-[3px] border-warning-strong bg-warning-soft/50 px-3 py-2 text-sm italic leading-relaxed text-slate-700 whitespace-pre-line">
              “{c.texto}”
            </blockquote>
            {c.respondida && (
              <p className="m-0 text-xs text-muted-foreground">
                Respondida{c.respondidaPorNome ? ` por ${c.respondidaPorNome}` : ""}{c.respondidaEm ? ` em ${dataHora(c.respondidaEm)}` : ""}.
                {podeResponder ? " Mude o texto para corrigir a resposta." : ""}
              </p>
            )}
            {podeResponder ? (
              <div className="space-y-1.5">
                <Label htmlFor="contestacao-resposta">Resposta ao colaborador</Label>
                <Textarea id="contestacao-resposta" value={resposta} rows={4} maxLength={2000} disabled={m.isPending}
                  onChange={(e) => setResposta(e.target.value)} placeholder="Ex.: Conferimos com o produtor: a diária de sábado entra na próxima OC."
                  aria-invalid={tentou && curta} className={cn("text-sm", tentou && curta && "border-danger")} data-testid="contestacao-resposta" />
                <p className={cn("m-0 text-2xs", tentou && curta ? "text-danger font-medium" : "text-muted-foreground")}>
                  {tentou && curta ? `Escreva a resposta (pelo menos ${RESPOSTA_MINIMA} caracteres).` : "O colaborador lê no app, na prestação dele."}
                </p>
              </div>
            ) : c.resposta ? (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-slate-700 whitespace-pre-line">{c.resposta}</div>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Aguardando a resposta do DP.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={m.isPending}>{podeResponder ? "Cancelar" : "Fechar"}</Button>
          {podeResponder && (
            <Button type="button" onClick={enviar} disabled={m.isPending} data-testid="contestacao-responder">
              {m.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {c?.respondida ? "Salvar a resposta" : "Marcar como respondida"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
