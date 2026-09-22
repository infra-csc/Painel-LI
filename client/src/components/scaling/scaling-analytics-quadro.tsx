/**
 * Quadro de prazos por evento (18/09 — planilha do time: uma linha por evento,
 * uma coluna por etapa, com a quantidade e a data limite de cada uma, contada da
 * data do evento). A célula pinta quando o prazo passou (vermelho) ou vence em
 * até 3 dias (amarelo) e ainda há pendência naquela etapa.
 *
 * Os dias de cada prazo vêm de /api/escala/prazos (padrão da planilha) e o
 * administrador edita aqui mesmo — é onde o prazo é usado.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DIAS_MAXIMO, DIAS_PADRAO, ETAPAS_COM_PRAZO, ROTULO_DA_ETAPA, diasDeAtraso, prazoDaEtapa, situacaoDoPrazo,
  type DiasDosPrazos, type EtapaComPrazo, type SituacaoDoPrazo,
} from "@shared/prazos-da-escala";
import type { EventoAnalisado } from "./scaling-analytics-data";

export const PRAZOS_QUERY_KEY = ["/api/escala/prazos"];

/** Dias de cada prazo — o padrão da planilha enquanto carrega ou se falhar. */
export function useDiasDosPrazos(): DiasDosPrazos {
  const { data } = useQuery<{ dias: DiasDosPrazos }>({ queryKey: PRAZOS_QUERY_KEY, staleTime: 300_000 });
  return data?.dias ?? DIAS_PADRAO;
}

const dm = (d: Date | null) =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—";

const dmIso = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

type Tom = SituacaoDoPrazo | "neutro";

const TOM: Record<Tom, { celula: string; data: string }> = {
  atrasado: { celula: "bg-[#FEF2F2]", data: "font-semibold text-[#B91C1C]" },
  vence_logo: { celula: "bg-[#FFFBEB]", data: "font-semibold text-[#B45309]" },
  cumprido: { celula: "", data: "text-[#047857]" },
  no_prazo: { celula: "", data: "text-slate-500" },
  sem_data: { celula: "", data: "text-slate-400" },
  neutro: { celula: "", data: "text-slate-400" },
};

function textoDaSituacao(tom: Tom, prazo: Date | null, hoje: Date): string {
  if (!prazo) return "sem data do evento";
  const base = `até ${dm(prazo)}`;
  const atraso = diasDeAtraso(prazo, hoje) ?? 0;
  if (tom === "atrasado") return `${base} · ${atraso} ${atraso === 1 ? "dia" : "dias"} atrasado`;
  if (tom === "vence_logo") return atraso === 0 ? `${base} · vence hoje` : `${base} · vence em ${-atraso} ${-atraso === 1 ? "dia" : "dias"}`;
  if (tom === "cumprido") return `${base} · ok`;
  return base;
}

function Celula({ valor, sub, prazo, tom, hoje, testId }: {
  valor: string; sub?: string; prazo: Date | null; tom: Tom; hoje: Date; testId: string;
}) {
  const texto = textoDaSituacao(tom, prazo, hoje);
  return (
    <td className={`border-l border-slate-100 px-3 py-2 text-center align-top ${TOM[tom].celula}`} title={texto} data-testid={testId}>
      <div className="text-[15px] font-semibold leading-tight tabular-nums text-slate-900">{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      <div className={`mt-0.5 whitespace-nowrap text-[11px] ${TOM[tom].data}`}>{texto}</div>
    </td>
  );
}

export function QuadroDePrazos({ eventos, hoje, dias, podeEditar, onVerVagasDoEvento }: {
  eventos: EventoAnalisado[];
  hoje: Date;
  dias: DiasDosPrazos;
  podeEditar: boolean;
  onVerVagasDoEvento: (eventId: string) => void;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">Quantidade e prazo de cada etapa, por evento</caption>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              <th scope="col" className="px-4 py-2">Evento</th>
              <th scope="col" className="px-3 py-2 text-center" title="Dia da prova — o domingo dentro do período cadastrado do evento (ou o sábado)">
                Data do evento
              </th>
              {ETAPAS_COM_PRAZO.map((etapa) => (
                <th key={etapa} scope="col" className="border-l border-slate-100 px-3 py-2 text-center">
                  {ROTULO_DA_ETAPA[etapa]}
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">{dias[etapa]} dias antes</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => {
              const prazo = (etapa: EtapaComPrazo) => prazoDaEtapa(e.dataEvento ?? e.ini, etapa, dias);
              const tom = (etapa: EtapaComPrazo, pendentes: number): Tom => situacaoDoPrazo(prazo(etapa), hoje, pendentes);
              const semNome = e.naEscalacao.semNome;
              const passagens = e.logistica.passagens;
              return (
                <tr key={e.eventId} className={`border-b border-slate-50 last:border-b-0 hover:bg-[#FBFCFE] ${e.jaTerminou ? "opacity-65" : ""}`}>
                  <th scope="row" className="max-w-[260px] px-4 py-2 align-top font-normal">
                    <button
                      type="button"
                      onClick={() => onVerVagasDoEvento(e.eventId)}
                      className="block max-w-full truncate text-left text-[13px] font-semibold text-slate-900 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      title={`Ver as vagas de ${e.nome}`}
                    >
                      {e.nome}
                    </button>
                    <span className="block text-[11px] text-muted-foreground">{e.total} {e.total === 1 ? "vaga" : "vagas"}</span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-top text-[13px] font-semibold tabular-nums text-slate-800">
                    {dmIso(e.dataEvento)}
                  </td>
                  {/* Registros: o total — o prazo é informativo (não dá para saber o que ainda falta registrar). */}
                  <Celula testId={`quadro-registro-${e.eventId}`} valor={String(e.total)} sub="vagas" prazo={prazo("registro")} tom="neutro" hoje={hoje} />
                  <Celula testId={`quadro-validacao-${e.eventId}`} valor={String(e.etapas.validacao)} sub="em validação" prazo={prazo("validacao")} tom={tom("validacao", e.etapas.validacao)} hoje={hoje} />
                  <Celula testId={`quadro-aprovacao-${e.eventId}`} valor={String(e.etapas.aprovacao)} sub="em aprovação" prazo={prazo("aprovacao")} tom={tom("aprovacao", e.etapas.aprovacao)} hoje={hoje} />
                  <Celula
                    testId={`quadro-escalacao-${e.eventId}`}
                    valor={String(e.etapas.escalacao)}
                    sub={semNome ? `${semNome} sem nome` : "em escalação"}
                    prazo={prazo("escalacao")}
                    tom={tom("escalacao", e.etapas.escalacao)}
                    hoje={hoje}
                  />
                  <Celula
                    testId={`quadro-escalado-${e.eventId}`}
                    valor={String(e.etapas.completa)}
                    sub={`de ${e.total}`}
                    prazo={prazo("escalado")}
                    tom={tom("escalado", e.total - e.etapas.completa)}
                    hoje={hoje}
                  />
                  <Celula
                    testId={`quadro-passagem-${e.eventId}`}
                    valor={passagens.precisam ? String(passagens.emitidas) : "—"}
                    sub={passagens.precisam ? `de ${passagens.precisam}` : "ninguém precisa"}
                    prazo={prazo("passagem")}
                    tom={passagens.precisam ? tom("passagem", passagens.precisam - passagens.emitidas) : "neutro"}
                    hoje={hoje}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-red-200 bg-[#FEF2F2]" />prazo passou e ainda há pendência</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-amber-200 bg-[#FFFBEB]" />vence em até 3 dias</span>
        <span className="inline-flex items-center gap-1.5"><span className="text-[#047857]">ok</span> etapa concluída</span>
        <span>Prazos contados da data do evento.</span>
        {podeEditar && (
          <Button type="button" variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-[12px]" onClick={() => setEditando(true)} data-testid="button-editar-prazos">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar prazos
          </Button>
        )}
      </div>

      {podeEditar && <EditarPrazos aberto={editando} onFechar={() => setEditando(false)} dias={dias} />}
    </div>
  );
}

/** Janela do administrador: dias antes do evento de cada etapa, com prévia. */
function EditarPrazos({ aberto, onFechar, dias }: { aberto: boolean; onFechar: () => void; dias: DiasDosPrazos }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [valores, setValores] = useState<Record<EtapaComPrazo, string>>(
    () => Object.fromEntries(ETAPAS_COM_PRAZO.map((e) => [e, String(dias[e])])) as Record<EtapaComPrazo, string>,
  );
  // Reabre com os valores atuais (podem ter mudado desde a última abertura).
  const [aberturaAnterior, setAberturaAnterior] = useState(aberto);
  if (aberto !== aberturaAnterior) {
    setAberturaAnterior(aberto);
    if (aberto) setValores(Object.fromEntries(ETAPAS_COM_PRAZO.map((e) => [e, String(dias[e])])) as Record<EtapaComPrazo, string>);
  }

  const invalido = (v: string) => !/^\d+$/.test(v.trim()) || Number(v) > DIAS_MAXIMO;
  const algumInvalido = ETAPAS_COM_PRAZO.some((e) => invalido(valores[e]));
  const exemplo = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 20);
  const exemploIso = `${exemplo.getFullYear()}-${String(exemplo.getMonth() + 1).padStart(2, "0")}-20`;

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo = Object.fromEntries(ETAPAS_COM_PRAZO.map((e) => [e, Number(valores[e])]));
      return (await apiRequest("PUT", "/api/escala/prazos", corpo)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRAZOS_QUERY_KEY });
      toast({ title: "Prazos salvos", description: "O quadro já usa os novos prazos para todos os eventos." });
      onFechar();
    },
    onError: (err: { body?: { message?: string } }) =>
      toast({ title: "Não foi possível salvar", description: err?.body?.message || "Tente de novo.", variant: "destructive" }),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Prazos das etapas</DialogTitle>
          <DialogDescription>
            Quantos dias antes da data do evento cada etapa precisa estar concluída. Vale para todos os eventos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ETAPAS_COM_PRAZO.map((etapa) => {
            const v = valores[etapa];
            const prazo = !invalido(v) ? prazoDaEtapa(exemploIso, etapa, { ...DIAS_PADRAO, [etapa]: Number(v) }) : null;
            return (
              <div key={etapa} className="grid grid-cols-[1fr_88px_1fr] items-center gap-3">
                <label htmlFor={`prazo-${etapa}`} className="text-[13px] font-medium text-slate-700">{ROTULO_DA_ETAPA[etapa]}</label>
                <Input
                  id={`prazo-${etapa}`}
                  inputMode="numeric"
                  value={v}
                  onChange={(ev) => setValores((atual) => ({ ...atual, [etapa]: ev.target.value }))}
                  aria-invalid={invalido(v)}
                  className={`h-9 text-right tabular-nums ${invalido(v) ? "border-red-400" : ""}`}
                  data-testid={`input-prazo-${etapa}`}
                />
                <span className="text-[12px] text-muted-foreground">
                  {invalido(v) ? <span className="text-red-600">0 a {DIAS_MAXIMO}</span> : <>dias antes · ex.: até {dm(prazo)}</>}
                </span>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] text-muted-foreground">Exemplo calculado para um evento em {dm(exemplo)}.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="button" onClick={() => salvar.mutate()} disabled={algumInvalido || salvar.isPending} data-testid="button-salvar-prazos">
            {salvar.isPending ? "Salvando…" : "Salvar prazos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
