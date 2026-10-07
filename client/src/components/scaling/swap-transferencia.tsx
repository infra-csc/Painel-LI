/**
 * Pedir transferência de colaborador para uma vaga ABERTA (dono, 14/09):
 * "tem casos que ainda não têm alguém escalado na vaga" e a pessoa que se
 * quer trazer já está escalada em outra vaga do mesmo período — a lista de
 * colaboradores travava com "Conflito" e não havia saída.
 *
 * O pedido diz de qual vaga a pessoa sai e de onde ela sai (cidade). Aprovado
 * por Compras, ela entra nesta vaga e a de origem volta a ficar aberta — tudo
 * de uma vez, no servidor. Até lá, nada muda nas duas vagas.
 *
 * 05/10 (dono: "só quero tirar a Jaqueline e colocar a Aline sem trocar a vaga
 * dela"): esta vaga pode já ter alguém. Essa pessoa sai da escala — não vai
 * para a vaga de origem, que fica aberta.
 */
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeftRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Collaborator, TeamInclusion } from "@shared/schema";
import { cidadeDeSaida, validarSaiDe } from "@shared/swap-sai-de";
import { CampoSaiDe, saiDeInicial } from "./swap-request-panel";
import { periodoCurto } from "./swap-permuta";
import type { ScalingMutations } from "./use-scaling-mutations";
import { RequiredMark } from "@/components/forms/required-mark";

export interface TransferRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A vaga aberta que vai receber a pessoa. */
  inclusion: TeamInclusion;
  /** Quem se quer trazer (já escalado em outra vaga do período). */
  collaboratorId: string | null;
  /** As vagas onde essa pessoa está escalada no período — de uma delas ela sai. */
  origens: TeamInclusion[];
  collaborators: Collaborator[] | undefined;
  getCollaboratorName: (id?: string | null) => string;
  getEventName: (id: string | null) => string;
  getFunctionName: (id: string | null) => string;
  createSwapRequest: ScalingMutations["createSwapRequest"];
  /** Depois de enviar (ex.: fechar a lista de colaboradores). */
  onEnviado?: () => void;
}

const LABEL = "text-xs font-medium text-slate-600";

export function TransferRequestDialog({
  open, onOpenChange, inclusion, collaboratorId, origens, collaborators,
  getCollaboratorName, getEventName, getFunctionName, createSwapRequest, onEnviado,
}: TransferRequestDialogProps) {
  const { toast } = useToast();
  const [origemId, setOrigemId] = useState("");
  const [saiDe, setSaiDe] = useState(() => saiDeInicial(null));
  const [reason, setReason] = useState("");
  const [tentou, setTentou] = useState(false);

  // Abre limpo a cada pessoa: a origem já vem marcada quando só existe uma, e
  // o "Sai de" vem com a cidade do cadastro dela (dá para corrigir).
  useEffect(() => {
    if (!open || !collaboratorId) return;
    setOrigemId(origens.length === 1 ? origens[0].id : "");
    setSaiDe(saiDeInicial((collaborators ?? []).find((c) => c.id === collaboratorId)?.city));
    setReason("");
    setTentou(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collaboratorId]);

  const nome = collaboratorId ? getCollaboratorName(collaboratorId) : "";
  /** Quem está nesta vaga hoje e sai dela (05/10) — null quando a vaga está aberta. */
  const quemSai = inclusion.collaboratorId ? getCollaboratorName(inclusion.collaboratorId) : null;
  const cidade = cidadeDeSaida(saiDe.saiDeSP, saiDe.cidade);
  const erroSaiDe = validarSaiDe(cidade);
  const origem = origens.find((o) => o.id === origemId) ?? null;
  const motivo = reason.trim();
  const motivoCurto = motivo.length > 0 && motivo.length < 10;
  const pode = !!collaboratorId && !!origem && !erroSaiDe && motivo.length >= 10 && !createSwapRequest.isPending;

  const enviar = () => {
    setTentou(true);
    if (!pode || !collaboratorId || !origem) return;
    createSwapRequest.mutate(
      {
        teamInclusionId: inclusion.id,
        newCollaboratorId: collaboratorId,
        reason: motivo,
        newCity: cidade,
        kind: "transferencia",
        pairedInclusionId: origem.id,
      },
      {
        onSuccess: () => {
          toast({
            title: "Transferência enviada para aprovação",
            description: quemSai
              ? `${nome} continua na vaga #${origem.inclusionNumber} e ${quemSai} continua nesta até Compras aprovar.`
              : `${nome} continua na vaga #${origem.inclusionNumber} até Compras aprovar.`,
          });
          onEnviado?.();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !createSwapRequest.isPending) onOpenChange(false); }}>
      {/* 07/10: o mesmo desenho do "Solicitar troca" — cabeçalho do sistema,
          a vaga de destino numa faixa de dados, "quem vem → quem sai" lado a
          lado, a origem como lista de opções e o rodapé à direita. */}
      <DialogContent className="max-w-[660px] w-[calc(100vw-1rem)] sm:w-[95vw] max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col p-0 gap-0 rounded-xl overflow-hidden">
        <div className="shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-border bg-card">
          <div>
            <div className="min-w-0">
              <DialogTitle className="pr-8 text-base font-semibold text-foreground leading-tight">Pedir transferência de colaborador</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {quemSai
                  ? `A pessoa sai da vaga onde está e entra nesta no lugar de ${quemSai} — só depois da aprovação do time de Compras.`
                  : "A pessoa sai da vaga onde está e entra nesta — só depois da aprovação do time de Compras."}
              </DialogDescription>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-foreground" data-testid="transferencia-destino">
            <span className="text-2xs text-muted-foreground">Para esta vaga</span>
            <p className="mt-0.5 break-words font-semibold">
              #{inclusion.inclusionNumber} · {getEventName(inclusion.eventId)} · {getFunctionName(inclusion.functionId)} · {periodoCurto(inclusion)}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-background px-5 sm:px-6 py-4 space-y-4 overflow-y-auto">
          <div className={`grid items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 ${quemSai ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]" : "grid-cols-1"}`}>
            <div className="min-w-0">
              <span className="text-2xs text-muted-foreground">Quem vem</span>
              <p className="mt-0.5 text-sm font-semibold text-primary break-words" data-testid="transferencia-quem">{nome || "?"}</p>
            </div>
            {quemSai && (
              <>
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 text-right">
                  <span className="text-2xs text-muted-foreground">Quem sai desta vaga</span>
                  <p className="mt-0.5 text-sm font-semibold text-foreground break-words" data-testid="transferencia-quem-sai">{quemSai}</p>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <span className={LABEL}>Sai da vaga<RequiredMark /></span>
            {origens.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-slate-600">
                Não achei a outra vaga desta pessoa no período. Recarregue a página e tente de novo.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Vaga de onde a pessoa sai" className="space-y-1.5">
                {origens.map((o) => {
                  const on = o.id === origemId;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { setOrigemId(o.id); setTentou(false); }}
                      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${on ? "border-primary bg-card ring-1 ring-primary text-foreground" : "border-border bg-card text-slate-700 hover:border-slate-300"}`}
                      data-testid={`transferencia-origem-${o.id}`}
                    >
                      <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-primary" : "border-slate-300"}`}>
                        {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0"><span className="font-semibold">#{o.inclusionNumber}</span> · {getEventName(o.eventId)} · {getFunctionName(o.functionId)} · {periodoCurto(o)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {tentou && !origem && origens.length > 0 && <p className="text-2xs text-danger-strong">Escolha de qual vaga a pessoa sai.</p>}
          </div>

          <CampoSaiDe
            id="transferencia-sai-de"
            rotulo={`${nome || "Colaborador"} sai de (vem para esta vaga)`}
            saiDeSP={saiDe.saiDeSP}
            cidade={saiDe.cidade}
            onChange={(sp, c) => { setSaiDe({ saiDeSP: sp, cidade: c }); setTentou(false); }}
            forcarErro={tentou}
          />

          {origem && (
            <p className="esc-entra flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs leading-snug text-warning" role="status">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning-strong" aria-hidden="true" />
              <span>
                Aprovada a transferência, {nome} sai da vaga #{origem.inclusionNumber} ({getEventName(origem.eventId)}) e ela fica aberta — a área precisa escalar outra pessoa nela.
                {quemSai && <> {quemSai} sai desta vaga e fica fora da escala; passagem já comprada para {quemSai} vai para o histórico desta vaga.</>}
              </span>
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="transferencia-motivo" className={LABEL}>Motivo<RequiredMark /></label>
              <span className={`text-2xs tabular-nums ${motivo.length >= 10 ? "text-success" : "text-muted-foreground"}`}>{motivo.length}/10</span>
            </div>
            <Textarea
              id="transferencia-motivo"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setTentou(false); }}
              placeholder="Por que esta pessoa precisa vir para esta vaga?"
              className="resize-none text-sm rounded-lg bg-card focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:border-primary"
              aria-invalid={(tentou && !motivo) || motivoCurto || undefined}
              rows={3}
            />
            {((tentou && !motivo) || motivoCurto)
              ? <p className="text-2xs text-danger-strong mt-1">{!motivo ? "Informe um motivo." : "Mínimo de 10 caracteres."}</p>
              : <p className="text-2xs text-muted-foreground mt-1">Mínimo de 10 caracteres.</p>}
          </div>
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-3 flex flex-col-reverse gap-2 border-t border-border bg-card sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="rounded-lg h-9 px-4 text-sm font-medium"
            onClick={() => onOpenChange(false)}
            disabled={createSwapRequest.isPending}
          >
            Cancelar
          </Button>
          <Button
            className="h-9 px-5 gap-1.5 text-sm font-semibold rounded-lg text-primary-foreground bg-primary hover:bg-primary-hover shadow-1"
            disabled={!pode}
            onClick={enviar}
            data-testid="button-enviar-transferencia"
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            {createSwapRequest.isPending ? "Enviando…" : "Enviar para aprovação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
