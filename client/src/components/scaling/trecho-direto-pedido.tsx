/**
 * "Vai direto de/para outro evento?" — Escalação, vaga JÁ ESCALADA (09/10).
 *
 * Compras: "Outro caso é esse do Alonso, que só percebemos quando vamos
 * incluir o colaborador. Então teria que ser um PEDIDO DE AJUSTE na escala: no
 * primeiro evento, cancelando a volta, e no segundo evento ajustando a ida pro
 * local do 1º evento."
 *
 * Na Escalação a logística da vaga só muda por pedido ao aprovador (o resto da
 * vaga está de pé: passagem, hospedagem). Por isso o botão monta UM PEDIDO EM
 * PAR, já com os dois lados (POST /api/scaling-change-requests/par):
 *  - 1º evento: sem volta própria — "segue direto para" o 2º;
 *  - 2º evento: a ida sai da cidade do 1º ("vem direto de"), com data e
 *    desembarque sugeridos.
 * O aprovador decide os dois de uma vez. Quem pode pedir e quando: as mesmas
 * regras do "Pedir ajuste" (a janela vem do servidor). A outra vaga é detectada
 * entre as do MESMO colaborador em outra cidade, até 3 dias antes/depois.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CornerDownRight, Loader2, Route, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDateBr } from "@/lib/dates";
import { ModeSelect } from "@/components/scaling-validation/mode-select";
import { invalidateScalingQueries } from "@/components/scaling-validation/types";
import { TRANSPORT_MODES, type TransportMode } from "@shared/scaling-validation-rules";
import { cidadeDoEvento, type VizinhaDeViagem } from "@shared/janela-de-viagem";
import { toTitleCase } from "@/lib/format";
import type { TeamInclusion } from "@shared/schema";
import { Secao } from "./inclusion-details/details-shared";
import { podePedirAjuste, useChangeWindow } from "./adjust-request-panel";
import type { ScalingData } from "./use-scaling-data";

type Vizinha = VizinhaDeViagem<TeamInclusion & { eventLocation: string | null; eventName: string | null }>;

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const asMode = (v: string | null | undefined): TransportMode | "" => ((TRANSPORT_MODES as readonly string[]).includes(v ?? "") ? (v as TransportMode) : "");

export function TrechoDiretoPedido({ inclusion, data }: { inclusion: TeamInclusion; data: Pick<ScalingData, "getVizinhasDeViagem" | "getEventName" | "getCollaboratorName" | "eventById"> }) {
  const { data: janela } = useChangeWindow(inclusion.id);
  const [aberto, setAberto] = useState(false);
  const vizinhas = data.getVizinhasDeViagem(inclusion) as Vizinha[];
  // Já indicado na vaga (Sugestão/Inclusão/pedido aprovado): diz e não oferece de novo.
  const indicado = [
    inclusion.idaVemDoEventoId ? `vem direto de ${data.getEventName(inclusion.idaVemDoEventoId)}` : null,
    inclusion.voltaSegueParaEventoId ? `segue direto para ${data.getEventName(inclusion.voltaSegueParaEventoId)}` : null,
  ].filter(Boolean) as string[];
  const livres = vizinhas.filter((v) => v.vaga.eventId !== inclusion.idaVemDoEventoId && v.vaga.eventId !== inclusion.voltaSegueParaEventoId);
  if (!janela || !janela.postScaling) return null;
  if (indicado.length === 0 && livres.length === 0) return null;
  const pode = podePedirAjuste(janela);
  const nome = toTitleCase(data.getCollaboratorName(inclusion.collaboratorId));

  return (
    <>
      <Secao titulo="Vai direto de/para outro evento?" icone={<Route aria-hidden="true" />} testId="card-trecho-direto" corpo="px-4 py-3 space-y-2">
        {indicado.length > 0 && (
          <p className="m-0 flex items-start gap-1.5 text-xs text-slate-700" data-testid="trecho-direto-indicado">
            <CornerDownRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>Indicado nesta vaga: <strong className="font-semibold">{indicado.join(" · ")}</strong>. Compras confirma ao registrar a passagem.</span>
          </p>
        )}
        {livres.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 min-w-[220px] flex-1 text-xs leading-snug text-slate-600">
              {nome} tem{" "}
              {livres.slice(0, 2).map((v, i) => (
                <span key={v.vaga.id}>
                  {i > 0 ? " e " : ""}
                  <strong className="font-semibold text-foreground">#{v.vaga.inclusionNumber} · {v.vaga.eventName}</strong>
                  {v.lado === "anterior" ? ` terminando ${formatDateBr(v.dia)}` : ` começando ${formatDateBr(v.dia)}`} em {v.cidade}
                </span>
              ))}
              . Se for direto de um para o outro, peça os dois ajustes de uma vez.
            </p>
            {pode ? (
              <Button
                type="button" variant="outline" onClick={() => setAberto(true)}
                className="h-9 shrink-0 rounded-lg bg-card border-border hover:border-primary/40 hover:bg-brand-soft hover:text-primary"
                data-testid="button-pedir-trecho-direto"
              >
                <Route className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Pedir trecho direto
              </Button>
            ) : (
              <p className="m-0 text-2xs text-muted-foreground">{janela.pendingRequest ? "Há um pedido em análise nesta vaga." : janela.message ?? "Pedido de ajuste indisponível para você nesta vaga."}</p>
            )}
          </div>
        )}
      </Secao>
      {aberto && <PedidoEmParDialog inclusion={inclusion} vizinhas={livres} data={data} onClose={() => setAberto(false)} />}
    </>
  );
}

function PedidoEmParDialog({ inclusion, vizinhas, data, onClose }: {
  inclusion: TeamInclusion;
  vizinhas: Vizinha[];
  data: Pick<ScalingData, "getEventName" | "eventById">;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [escolhida, setEscolhida] = useState(vizinhas[0]?.vaga.id ?? "");
  const viz = vizinhas.find((v) => v.vaga.id === escolhida) ?? vizinhas[0];
  // Quem é o 1º evento (sai sem volta) e quem é o 2º (a ida sai de lá).
  const anterior = viz?.lado === "anterior" ? viz.vaga : inclusion;
  const seguinte = viz?.lado === "anterior" ? inclusion : viz?.vaga;
  const cidadeDaAnterior = cidadeDoEvento(data.eventById.get(anterior.eventId)?.location) || data.getEventName(anterior.eventId);
  const [dataIda, setDataIda] = useState(() => ymd(seguinte?.flightDepartureDate) || ymd(anterior.scheduleEndDate));
  const [desembarque, setDesembarque] = useState(() => seguinte?.flightArrivalSuggestedTime ?? "");
  const [modo, setModo] = useState<TransportMode | "">(() => asMode(seguinte?.transportModeIda) || "aereo");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  /** Trocar a outra vaga refaz as sugestões da ida (cada par tem a sua). */
  const escolher = (id: string) => {
    const v = vizinhas.find((x) => x.vaga.id === id);
    if (!v) return;
    const a = v.lado === "anterior" ? v.vaga : inclusion;
    const s = v.lado === "anterior" ? inclusion : v.vaga;
    setEscolhida(id);
    setDataIda(ymd(s.flightDepartureDate) || ymd(a.scheduleEndDate));
    setDesembarque(s.flightArrivalSuggestedTime ?? "");
    setModo(asMode(s.transportModeIda) || "aereo");
  };

  const enviar = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/scaling-change-requests/par", {
      anteriorId: anterior.id,
      seguinteId: seguinte!.id,
      reason: motivo.trim(),
      idaDaSeguinte: {
        flightDepartureDate: dataIda || null,
        flightArrivalSuggestedTime: desembarque.trim() || null,
        transportModeIda: modo || null,
      },
    })).json(),
    onSuccess: () => {
      toast({ title: "Pedido enviado ao aprovador", description: `As vagas #${anterior.inclusionNumber} e #${seguinte!.inclusionNumber} ficam travadas até a decisão.` });
      invalidateScalingQueries(queryClient);
      for (const id of [anterior.id, seguinte!.id]) queryClient.invalidateQueries({ queryKey: [`/api/team-inclusions/${id}/change-window`] });
      onClose();
    },
    onError: (e: unknown) => setErro(apiErrorMessage(e, "Não foi possível enviar o pedido.")),
  });

  if (!viz || !seguinte) return null;
  const voltaAtual = anterior.flightReturnDate ? formatDateBr(ymd(anterior.flightReturnDate)) : null;
  const podeEnviar = motivo.trim().length > 0 && !enviar.isPending;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviar.isPending) onClose(); }}>
      <DialogContent className="!max-w-[760px] w-[95vw] max-h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden max-sm:w-full max-sm:!max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none" data-testid="dialog-trecho-direto">
        <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-border pr-14">
          <DialogTitle className="text-base font-semibold text-foreground">Vai direto de um evento para o outro</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
            Um pedido de ajuste para as duas vagas, decidido de uma vez pelo aprovador.
          </DialogDescription>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          {vizinhas.length > 1 && (
            <div className="space-y-1.5" role="radiogroup" aria-label="Outra vaga do colaborador">
              <p className="m-0 text-xs font-medium text-slate-600">Outra vaga</p>
              <div className="flex flex-wrap gap-2">
                {vizinhas.map((v) => (
                  <button key={v.vaga.id} type="button" role="radio" aria-checked={v.vaga.id === escolhida} onClick={() => escolher(v.vaga.id)}
                    className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${v.vaga.id === escolhida ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:border-primary/30"}`}>
                    #{v.vaga.inclusionNumber} · {v.vaga.eventName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Os dois lados, na ordem da viagem. */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start">
            <section className="rounded-xl border border-border bg-card p-3.5 space-y-1.5" data-testid="par-lado-anterior">
              <p className="m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">1º evento</p>
              <p className="m-0 text-sm font-semibold text-foreground">#{anterior.inclusionNumber} · {data.getEventName(anterior.eventId)}</p>
              <p className="m-0 text-xs text-slate-600">Termina {formatDateBr(ymd(anterior.scheduleEndDate))} · {cidadeDaAnterior}</p>
              <div className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-relaxed">
                <p className="m-0 font-semibold text-foreground">Volta: sem volta própria</p>
                <p className="m-0 text-slate-600">
                  {voltaAtual ? <><span className="line-through">volta sugerida {voltaAtual}</span> → </> : null}
                  segue direto para {data.getEventName(seguinte.eventId)}
                </p>
              </div>
            </section>
            <div className="hidden md:flex self-center items-center text-muted-foreground" aria-hidden="true"><ArrowRight className="w-5 h-5" /></div>
            <section className="rounded-xl border border-primary/25 bg-brand-soft/40 p-3.5 space-y-1.5" data-testid="par-lado-seguinte">
              <p className="m-0 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">2º evento</p>
              <p className="m-0 text-sm font-semibold text-foreground">#{seguinte.inclusionNumber} · {data.getEventName(seguinte.eventId)}</p>
              <p className="m-0 text-xs text-slate-600">Começa {formatDateBr(ymd(seguinte.scheduleStartDate))}</p>
              <p className="m-0 mt-2 text-xs font-semibold text-foreground">Ida: sai de {cidadeDaAnterior} <span className="font-normal text-slate-600">(vem direto de {data.getEventName(anterior.eventId)})</span></p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="par-modo" className="text-2xs font-normal text-muted-foreground">Transporte</Label>
                  <ModeSelect id="par-modo" label="Transporte da ida" emptyLabel="Não informado" value={modo} onChange={setModo} className="h-9 w-full rounded-lg text-xs" />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="par-data" className="text-2xs font-normal text-muted-foreground">Data da ida</Label>
                  <Input id="par-data" type="date" value={dataIda} onChange={(e) => setDataIda(e.target.value)} className="h-9 rounded-lg text-xs bg-card" />
                </div>
                <div className="col-span-2 space-y-1 min-w-0">
                  <Label htmlFor="par-desembarque" className="text-2xs font-normal text-muted-foreground">Chegada até (desembarque)</Label>
                  <Input id="par-desembarque" value={desembarque} onChange={(e) => setDesembarque(e.target.value)} placeholder="ex.: 8-14h" maxLength={40} className="h-9 rounded-lg text-xs bg-card" />
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="par-motivo" className="text-xs font-medium text-slate-600">Motivo<span className="text-danger"> *</span></Label>
            <Textarea id="par-motivo" value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} maxLength={2000}
              placeholder="Ex.: termina em Aracaju na noite do dia 25 e já começa em João Pessoa no dia 26." className="h-20 resize-none" data-testid="par-motivo" />
          </div>
          <p className="m-0 text-2xs leading-relaxed text-muted-foreground">
            As duas vagas ficam travadas até o aprovador decidir. Se já houver passagem, Compras recebe o aviso para cancelar a volta do 1º evento e remarcar a ida do 2º.
          </p>
          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger-strong">{erro}</p>}
        </div>
        <div className="px-5 sm:px-6 py-3 border-t border-border flex items-center justify-end gap-2 bg-surface-muted">
          <Button type="button" variant="ghost" onClick={onClose} disabled={enviar.isPending} className="h-9 rounded-lg">Cancelar</Button>
          <Button type="button" onClick={() => enviar.mutate()} disabled={!podeEnviar} className="h-9 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-semibold" data-testid="button-enviar-trecho-direto">
            {enviar.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4 mr-1.5" aria-hidden="true" />}
            Enviar ao aprovador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
