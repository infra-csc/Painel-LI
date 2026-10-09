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
import { Check, Pencil } from "lucide-react";
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
  atrasado: { celula: "bg-danger-soft", data: "font-semibold text-danger" },
  vence_logo: { celula: "bg-warning-soft", data: "font-semibold text-warning" },
  cumprido: { celula: "", data: "text-success" },
  no_prazo: { celula: "", data: "text-muted-foreground" },
  sem_data: { celula: "", data: "text-muted-foreground" },
  neutro: { celula: "", data: "text-muted-foreground" },
};

function textoDaSituacao(tom: Tom, prazo: Date | null, hoje: Date): string {
  if (!prazo) return "sem data do evento";
  const base = `prazo ${dm(prazo)}`;
  const atraso = diasDeAtraso(prazo, hoje) ?? 0;
  if (tom === "atrasado") return `${base} · ${atraso} ${atraso === 1 ? "dia" : "dias"} atrasado`;
  if (tom === "vence_logo") return atraso === 0 ? `${base} · vence hoje` : `${base} · vence em ${-atraso} ${-atraso === 1 ? "dia" : "dias"}`;
  if (tom === "cumprido") return `${base} · ok`;
  return base;
}

/**
 * Uma célula diz O QUE FALTA naquela etapa (09/10 — o time não entendia o
 * quadro): "2 sem nome", "1 a validar", com o prazo embaixo. Etapa sem
 * pendência mostra só ✓ (o prazo fica no title).
 */
function Celula({ falta, antes = 0, rotulo, prazo, tom, hoje, testId, vazio }: {
  /** Quantas pendências nesta etapa. */
  falta: number;
  /**
   * Vagas ainda em etapas ANTERIORES: com elas, um 0 aqui não é "concluída" —
   * nenhuma chegou ainda ("—"). ✓ só quando não há nada aqui nem antes.
   */
  antes?: number;
  /** O que falta ("sem nome", "a validar"). */
  rotulo: string;
  prazo: Date | null; tom: Tom; hoje: Date; testId: string;
  /** A etapa não se aplica ao evento (ex.: ninguém precisa de passagem). */
  vazio?: string;
}) {
  if (vazio) {
    return (
      <td className="border-l border-border px-3 py-2 text-center align-middle text-2xs text-muted-foreground" data-testid={testId}>
        {vazio}
      </td>
    );
  }
  if (falta <= 0 && antes > 0) {
    const texto = textoDaSituacao(tom, prazo, hoje);
    return (
      <td className={`border-l border-border px-3 py-2 text-center align-top ${TOM[tom].celula}`} title={`Nenhuma vaga chegou a esta etapa ainda (${antes} em etapas anteriores) · ${texto}`} data-testid={testId}>
        <div className="text-base font-semibold leading-tight text-muted-foreground">—</div>
        <div className="text-2xs text-muted-foreground">nenhuma chegou ainda</div>
        <div className={`mt-0.5 whitespace-nowrap text-2xs ${TOM[tom].data}`}>{texto}</div>
      </td>
    );
  }
  if (falta <= 0) {
    return (
      <td className="border-l border-border px-3 py-2 text-center align-middle" title={`Concluída${prazo ? ` — prazo era ${dm(prazo)}` : ""}`} data-testid={testId}>
        <Check className="mx-auto h-4 w-4 text-success" aria-hidden="true" />
        <span className="sr-only">Concluída</span>
      </td>
    );
  }
  const texto = textoDaSituacao(tom, prazo, hoje);
  return (
    <td className={`border-l border-border px-3 py-2 text-center align-top ${TOM[tom].celula}`} title={`${falta} ${rotulo} · ${texto}`} data-testid={testId}>
      <div className="text-base font-semibold leading-tight tabular-nums text-foreground">{falta}</div>
      <div className="text-2xs font-medium text-slate-700">{rotulo}</div>
      <div className={`mt-0.5 whitespace-nowrap text-2xs ${TOM[tom].data}`}>{texto}</div>
    </td>
  );
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

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
            <tr className="border-b border-border bg-surface-muted/60 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              <th scope="col" className="px-4 py-2">Evento</th>
              <th scope="col" className="px-3 py-2 text-center" title="Dia da prova — o domingo dentro do período cadastrado do evento (ou o sábado)">
                Data do evento
              </th>
              {ETAPAS_COM_PRAZO.map((etapa) => (
                <th key={etapa} scope="col" className="border-l border-border px-3 py-2 text-center">
                  {ROTULO_DA_ETAPA[etapa]}
                  <span className="block text-2xs font-normal normal-case tracking-normal text-muted-foreground">{dias[etapa]} dias antes</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => {
              const prazo = (etapa: EtapaComPrazo) => prazoDaEtapa(e.dataEvento ?? e.ini, etapa, dias);
              const tom = (etapa: EtapaComPrazo, pendentes: number): Tom => situacaoDoPrazo(prazo(etapa), hoje, pendentes);
              // O que ainda está ANTES de cada etapa — conta para o prazo dela também.
              const antesDaAprovacao = e.etapas.validacao;
              const antesDaEscalacao = e.etapas.validacao + e.etapas.aprovacao;
              const semNome = e.naEscalacao.semNome;
              const passagens = e.logistica.passagens;
              return (
                <tr key={e.eventId} className={`border-b border-border last:border-b-0 hover:bg-surface-muted ${e.jaTerminou ? "opacity-65" : ""}`}>
                  <th scope="row" className="max-w-[260px] px-4 py-2 align-top font-normal">
                    <button
                      type="button"
                      onClick={() => onVerVagasDoEvento(e.eventId)}
                      className="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      title={`Ver as vagas de ${e.nome}`}
                    >
                      {e.nome}
                    </button>
                    <span className="block text-2xs text-muted-foreground">{e.total} {e.total === 1 ? "vaga" : "vagas"}</span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-top text-sm font-semibold tabular-nums text-foreground">
                    {dmIso(e.dataEvento)}
                  </td>
                  {/* Registros: o total cadastrado — não há meta de vagas, então não existe "falta"; o prazo é informativo. */}
                  <td className="border-l border-border px-3 py-2 text-center align-top" data-testid={`quadro-registro-${e.eventId}`}>
                    <div className="text-base font-semibold leading-tight tabular-nums text-foreground">{e.total}</div>
                    <div className="text-2xs text-muted-foreground">{plural(e.total, "vaga", "vagas")}</div>
                    <div className="mt-0.5 whitespace-nowrap text-2xs text-muted-foreground">{textoDaSituacao("neutro", prazo("registro"), hoje)}</div>
                  </td>
                  <Celula testId={`quadro-validacao-${e.eventId}`} falta={e.etapas.validacao} rotulo="a validar" prazo={prazo("validacao")} tom={tom("validacao", e.etapas.validacao)} hoje={hoje} />
                  <Celula testId={`quadro-aprovacao-${e.eventId}`} falta={e.etapas.aprovacao} antes={antesDaAprovacao} rotulo="a aprovar" prazo={prazo("aprovacao")} tom={tom("aprovacao", e.etapas.aprovacao + antesDaAprovacao)} hoje={hoje} />
                  {/* Escalação: o que falta é pôr nome — ou, já com nome, confirmar. */}
                  <Celula
                    testId={`quadro-escalacao-${e.eventId}`}
                    falta={semNome || e.etapas.escalacao}
                    antes={antesDaEscalacao}
                    rotulo={semNome ? "sem nome" : "a confirmar"}
                    prazo={prazo("escalacao")}
                    tom={tom("escalacao", e.etapas.escalacao + antesDaEscalacao)}
                    hoje={hoje}
                  />
                  <Celula
                    testId={`quadro-escalado-${e.eventId}`}
                    falta={e.total - e.etapas.completa}
                    rotulo={`de ${e.total} a escalar`}
                    prazo={prazo("escalado")}
                    tom={tom("escalado", e.total - e.etapas.completa)}
                    hoje={hoje}
                  />
                  <Celula
                    testId={`quadro-passagem-${e.eventId}`}
                    falta={passagens.precisam - passagens.emitidas}
                    rotulo={`de ${passagens.precisam} a emitir`}
                    prazo={prazo("passagem")}
                    tom={passagens.precisam ? tom("passagem", passagens.precisam - passagens.emitidas) : "neutro"}
                    hoje={hoje}
                    vazio={passagens.precisam ? undefined : "ninguém precisa"}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-danger/25 bg-danger-soft" />prazo passou e ainda há pendência</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-warning/25 bg-warning-soft" />vence em até 3 dias</span>
        <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> etapa concluída</span>
        <span>Cada célula mostra o que falta e até quando; prazos contados da data do evento.</span>
        {podeEditar && (
          <Button type="button" variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs" onClick={() => setEditando(true)} data-testid="button-editar-prazos">
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
                <label htmlFor={`prazo-${etapa}`} className="text-sm font-medium text-slate-700">{ROTULO_DA_ETAPA[etapa]}</label>
                <Input
                  id={`prazo-${etapa}`}
                  inputMode="numeric"
                  value={v}
                  onChange={(ev) => setValores((atual) => ({ ...atual, [etapa]: ev.target.value }))}
                  aria-invalid={invalido(v)}
                  className={`h-9 text-right tabular-nums ${invalido(v) ? "border-danger-strong" : ""}`}
                  data-testid={`input-prazo-${etapa}`}
                />
                <span className="text-xs text-muted-foreground">
                  {invalido(v) ? <span className="text-danger">0 a {DIAS_MAXIMO}</span> : <>dias antes · ex.: até {dm(prazo)}</>}
                </span>
              </div>
            );
          })}
          <p className="pt-1 text-2xs text-muted-foreground">Exemplo calculado para um evento em {dm(exemplo)}.</p>
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
