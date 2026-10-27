/**
 * Legado no Painel de honorários — Módulo de Honorários, Fase 0 (26/10).
 *
 * Decisão do dono: eventos que TERMINAM antes da data de corte (01/11/2026,
 * editável pelo administrador na Tabela de valores) são legado. O Painel abre
 * no "Fluxo novo"; o "Legado" é um recorte próprio, só leitura, com
 * "Concluir em lote": marca os registros como concluídos fora do fluxo, com
 * motivo e auditoria (POST /api/rh/controle/legado/concluir). Nada é apagado
 * nem muda na prestação, na nota ou no planejado.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCheck, Loader2, Sparkles } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MOTIVO_MAXIMO, MOTIVO_MINIMO, dataDeCorteLegivel, type RecorteDoLegado } from "@shared/legado-honorarios";
import type { ControleRh } from "@shared/controle-rh";
import type { PrestacaoItem } from "./prestacao-types";
import { CHAVE_CONTROLE_RH } from "./prestacao-utils";

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** Fluxo novo × Legado — as duas abas do Painel, com as contagens do servidor. */
export function RecorteDoPainel({ recorte, onRecorte, recortes, dataDeCorte }: {
  recorte: RecorteDoLegado;
  onRecorte: (r: RecorteDoLegado) => void;
  recortes: ControleRh["contadores"]["recortes"];
  dataDeCorte: string;
}) {
  const abertosNoLegado = recortes.legado - recortes.legadoConcluido;
  const opcoes: { id: RecorteDoLegado; rotulo: string; n: number; sub: string; Icone: typeof Sparkles }[] = [
    { id: "fluxo_novo", rotulo: "Fluxo novo", n: recortes.fluxoNovo, sub: `terminam a partir de ${dataDeCorteLegivel(dataDeCorte)}`, Icone: Sparkles },
    { id: "legado", rotulo: "Legado", n: abertosNoLegado, sub: `terminaram antes de ${dataDeCorteLegivel(dataDeCorte)}`, Icone: Archive },
  ];
  return (
    <div role="tablist" aria-label="Recorte do Painel de honorários" className="inline-flex max-sm:flex max-sm:w-full p-0.5 rounded-lg bg-muted" data-testid="painel-recorte">
      {opcoes.map(({ id, rotulo, n, sub, Icone }) => {
        const on = recorte === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            title={id === "legado" ? `Eventos que terminaram antes de ${dataDeCorteLegivel(dataDeCorte)} — só leitura` : `Eventos que terminam a partir de ${dataDeCorteLegivel(dataDeCorte)}`}
            onClick={() => onRecorte(id)}
            className={cn(
              "pas-alvo inline-flex items-center justify-center gap-2 h-[34px] px-3.5 rounded-md text-sm font-medium transition-colors max-sm:flex-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`painel-recorte-${id}`}
          >
            <Icone className={cn("w-4 h-4 shrink-0", on ? "text-primary" : "")} aria-hidden="true" />
            {rotulo}
            <span className={cn("inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-2xs font-semibold tabular-nums", on ? "bg-brand-soft text-primary" : "bg-card/70 text-slate-600")}>
              {n.toLocaleString("pt-BR")}
            </span>
            <span className="sr-only">{sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Aviso do recorte Legado: só leitura, a data de corte e o "Concluir em lote". */
export function AvisoDoLegado({ dataDeCorte, recortes, pendentesVisiveis, podeConcluir, onConcluir }: {
  dataDeCorte: string;
  recortes: ControleRh["contadores"]["recortes"];
  /** Registros visíveis (filtros de agora) ainda não concluídos. */
  pendentesVisiveis: number;
  podeConcluir: boolean;
  onConcluir: () => void;
}) {
  return (
    <div role="note" className="pas-entra flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-border bg-surface-muted/70 px-4 py-3" data-testid="painel-aviso-legado">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-card text-slate-600 border border-border shrink-0" aria-hidden="true">
        <Archive className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 basis-[280px]">
        <p className="m-0 text-sm font-semibold text-foreground">Legado — só leitura</p>
        <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
          Eventos que terminaram antes de <span className="font-medium text-foreground">{dataDeCorteLegivel(dataDeCorte)}</span> ficam fora do fluxo novo.{" "}
          {plural(recortes.legado - recortes.legadoConcluido, "registro aberto", "registros abertos")} · {plural(recortes.legadoConcluido, "concluído fora do fluxo", "concluídos fora do fluxo")}.
          Concluir não apaga nada: só tira da fila, com motivo e registro na auditoria.
        </p>
      </div>
      {podeConcluir && (
        <button
          type="button"
          onClick={onConcluir}
          disabled={pendentesVisiveis === 0}
          title={pendentesVisiveis === 0 ? "Nada aberto no recorte de agora" : "Concluir fora do fluxo os registros que a lista mostra agora"}
          className="pas-alvo inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 max-sm:w-full max-sm:justify-center"
          data-testid="painel-concluir-legado"
        >
          <CheckCheck className="w-4 h-4" aria-hidden="true" />
          Concluir em lote ({pendentesVisiveis.toLocaleString("pt-BR")})
        </button>
      )}
    </div>
  );
}

/** Confirmação do "Concluir em lote", com a prévia e o motivo (obrigatório). */
export function ConcluirLegadoDialog({ itens, aberto, onClose, recorteDescrito }: {
  /** Os registros que serão concluídos (os visíveis e ainda abertos). */
  itens: PrestacaoItem[];
  aberto: boolean;
  onClose: () => void;
  /** "Todos os eventos" ou o nome do evento escolhido. */
  recorteDescrito: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const eventos = new Set(itens.map((i) => i.event.id)).size;
  const total = itens.reduce((s, i) => (i.planned?.didNotAttend || i.actual?.didNotAttend ? s : s + (i.actual?.totalValue ?? i.planned?.totalValue ?? 0)), 0);
  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;
  const m = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/rh/controle/legado/concluir", { ids: itens.map((i) => i.id), motivo: motivo.trim() })).json() as Promise<{ concluidas: number; jaConcluidas: number; recusadas: { id: string }[] }>,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      toast({
        variant: "success",
        title: `${plural(r.concluidas, "registro concluído", "registros concluídos")} fora do fluxo`,
        description: r.recusadas.length > 0 ? `${r.recusadas.length} não eram do legado e ficaram como estavam.` : "Ficaram registrados com o motivo na auditoria. Nada foi apagado.",
      });
      setMotivo("");
      onClose();
    },
    onError: (err) => toast({ variant: "destructive", title: "Não foi possível concluir", description: apiErrorMessage(err, "Tente de novo.") }),
  });
  return (
    <AlertDialog open={aberto} onOpenChange={(v) => { if (!m.isPending && !v) onClose(); }}>
      <AlertDialogContent className="max-w-[480px] w-[95vw] p-0 gap-0 rounded-xl overflow-hidden" data-testid="dialogo-concluir-legado">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted text-slate-700 shrink-0" aria-hidden="true">
            <Archive className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 pt-0.5">
            <AlertDialogTitle className="m-0 text-base font-semibold leading-6 text-foreground">
              Concluir {plural(itens.length, "registro", "registros")} fora do fluxo?
            </AlertDialogTitle>
            <AlertDialogDescription className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
              {recorteDescrito} · {plural(eventos, "evento", "eventos")} · {formatarMoeda(total)}
            </AlertDialogDescription>
          </div>
        </div>
        <div className="px-5 pb-4 space-y-3">
          <p className="m-0 rounded-lg border border-border bg-surface-muted/70 px-3 py-2 text-xs leading-5 text-slate-700">
            Os registros saem da fila do Painel e passam a aparecer como <span className="font-semibold">“Concluído fora do fluxo”</span>. A prestação, a nota e o planejado ficam exatamente como estão — nada é apagado.
          </p>
          <div>
            <label htmlFor="motivo-legado" className="block text-xs font-medium text-foreground">Motivo <span className="text-danger" aria-hidden="true">*</span></label>
            <Textarea
              id="motivo-legado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAXIMO))}
              placeholder="Ex.: pagos fora do sistema antes do fluxo novo (conferido com o DP em 26/10)"
              className="mt-1 min-h-[76px] text-sm"
              aria-describedby="motivo-legado-dica"
              data-testid="motivo-legado"
            />
            <p id="motivo-legado-dica" className={cn("m-0 mt-1 text-2xs", motivo && !motivoOk ? "text-warning" : "text-muted-foreground")}>
              {motivo && !motivoOk ? `Escreva pelo menos ${MOTIVO_MINIMO} caracteres.` : "Fica na auditoria junto com quem concluiu e quando."}
            </p>
          </div>
        </div>
        <AlertDialogFooter className="px-5 py-3 border-t border-border bg-surface-muted gap-2 sm:space-x-0">
          <AlertDialogCancel disabled={m.isPending} className="mt-0 h-9 rounded-lg text-sm">Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={m.isPending || !motivoOk || itens.length === 0}
            onClick={(e) => { e.preventDefault(); m.mutate(); }}
            className="h-9 rounded-lg text-sm font-semibold gap-1.5 bg-foreground hover:bg-foreground/90 text-background"
            data-testid="concluir-legado-confirmar"
          >
            {m.isPending ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Concluindo…</> : <><CheckCheck className="w-4 h-4" aria-hidden="true" />Concluir {itens.length.toLocaleString("pt-BR")}</>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
