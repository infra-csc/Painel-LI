/**
 * Corrigir o horário de um dia (27/10) — o caso típico é o check-out
 * esquecido. Produção, DP e admin. O motivo é obrigatório e fica na
 * observação do dia e na auditoria. Só vai para o servidor o que mudou;
 * apagar um horário manda "sem entrada"/"sem saída". Saída "antes" da
 * entrada no relógio vale como o dia seguinte (passou da meia-noite).
 */
import { useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { diaComSemana, quemRegistrou } from "./presenca-utils";
import type { DiaDaPresenca } from "./tipos";
import type { useAcoesDaPresenca } from "./use-presenca";

export interface AlvoDaCorrecao {
  actualId: string;
  nome: string;
  dia: DiaDaPresenca;
}

export const MOTIVO_MINIMO = 5;

/** O que vai no PATCH: só os campos alterados (vazio = apagar). */
export function corpoDaCorrecao(antes: { entrada: string; saida: string }, agora: { entrada: string; saida: string }) {
  const corpo: { entrada?: string | null; saida?: string | null } = {};
  if (agora.entrada !== antes.entrada) corpo.entrada = agora.entrada || null;
  if (agora.saida !== antes.saida) corpo.saida = agora.saida || null;
  return corpo;
}

export function DialogoCorrigir({ alvo, corrigir, onClose }: {
  alvo: AlvoDaCorrecao | null;
  corrigir: ReturnType<typeof useAcoesDaPresenca>["corrigir"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const antes = { entrada: alvo?.dia.entrada?.hora ?? "", saida: alvo?.dia.saida?.hora ?? "" };
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberto = !!alvo;

  useEffect(() => {
    if (!alvo) return;
    setEntrada(alvo.dia.entrada?.hora ?? "");
    setSaida(alvo.dia.saida?.hora ?? "");
    setMotivo(""); setTentou(false); setErro(null);
  }, [alvo]);

  const corpo = corpoDaCorrecao(antes, { entrada, saida });
  const mudou = Object.keys(corpo).length > 0;
  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;
  const saidaSemEntrada = !!saida && !entrada;
  const viraDiaSeguinte = !!entrada && !!saida && saida <= entrada;
  const enviando = corrigir.isPending;

  const salvar = () => {
    setTentou(true);
    if (!alvo || !mudou || !motivoOk || saidaSemEntrada) return;
    setErro(null);
    corrigir.mutate({ actualId: alvo.actualId, dia: alvo.dia.dia, ...corpo, motivo: motivo.trim() }, {
      onSuccess: () => {
        toast({ variant: "success", title: "Horário corrigido", description: `${alvo.nome} · ${diaComSemana(alvo.dia.dia)}${entrada ? ` · ${entrada}` : ""}${saida ? ` – ${saida}` : ""}.` });
        onClose();
      },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível corrigir o horário.")),
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[460px] gap-0 p-0" data-testid="prs-dialogo-corrigir">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Clock3 className="h-4 w-4 text-warning-strong" aria-hidden="true" />Corrigir horário
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo && <><span className="font-medium text-foreground">{alvo.nome}</span> · {diaComSemana(alvo.dia.dia)} · {alvo.dia.rotulo}</>}
          </DialogDescription>
        </DialogHeader>

        <form className="prs-dialogo-corpo space-y-4 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prs-corr-entrada">Entrada</Label>
              <Input id="prs-corr-entrada" type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="h-10 rounded-lg tabular-nums" />
              <p className="m-0 text-2xs text-muted-foreground">{alvo?.dia.entrada ? `Registrada ${alvo.dia.entrada.hora}, ${quemRegistrou(alvo.dia.entrada)}` : "Sem entrada registrada"}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prs-corr-saida">Saída</Label>
              <Input id="prs-corr-saida" type="time" value={saida} onChange={(e) => setSaida(e.target.value)} className={cn("h-10 rounded-lg tabular-nums", tentou && saidaSemEntrada && "border-danger")} data-testid="prs-corr-saida" />
              <p className="m-0 text-2xs text-muted-foreground">{alvo?.dia.saida ? `Registrada ${alvo.dia.saida.hora}, ${quemRegistrou(alvo.dia.saida)}` : "Sem saída registrada"}</p>
            </div>
          </div>
          {viraDiaSeguinte && <p className="m-0 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">A saída ficou antes da entrada: conta como o dia seguinte (passou da meia-noite).</p>}
          {tentou && saidaSemEntrada && <p role="alert" className="m-0 text-xs font-medium text-danger">Sem entrada não há saída — informe a entrada também.</p>}
          {tentou && !mudou && <p role="alert" className="m-0 text-xs font-medium text-danger">Nada mudou: altere a entrada ou a saída.</p>}

          <div className="space-y-1.5">
            <Label htmlFor="prs-corr-motivo">Motivo <span className="font-normal text-muted-foreground">(obrigatório)</span></Label>
            <Textarea id="prs-corr-motivo" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: esqueceu de registrar a saída; confirmado com o líder da equipe às 18h."
              className={cn("rounded-lg text-sm", tentou && !motivoOk && "border-danger")} aria-invalid={tentou && !motivoOk} data-testid="prs-corr-motivo" />
            <p className={cn("m-0 text-2xs", tentou && !motivoOk ? "font-medium text-danger" : "text-muted-foreground")}>
              {tentou && !motivoOk ? `Escreva o motivo (pelo menos ${MOTIVO_MINIMO} caracteres).` : "Fica na observação do dia e no log de auditoria."}
            </p>
          </div>

          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando} data-testid="prs-salvar-correcao">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Salvando…" : "Salvar correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
