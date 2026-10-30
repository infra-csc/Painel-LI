/**
 * Quadro de prazos por evento (18/09 — planilha do time; prazos do PROCESSO DO
 * DONO desde 16/10): uma linha por evento, uma coluna por etapa, com a
 * quantidade e a data limite de cada uma, contada da data do evento.
 *
 * Cada vaga trava numa coluna só (dono, 16/10: "não faz sentido a mesma
 * escalação estar em duas colunas") — a etapa em que está parada, calculada por
 * `quadroDoEvento` em scaling-analytics-data.ts. A célula pinta quando o prazo
 * passou (vermelho) ou vence em até 3 dias (amarelo) e há vaga PARADA ali; as
 * colunas seguintes não repetem o alerta.
 *
 * Clicar numa célula abre o detalhe com exatamente as vagas daquele número
 * (scaling-analytics-quadro-detalhe.tsx).
 *
 * Os dias de cada prazo vêm de /api/escala/prazos e o administrador edita aqui
 * mesmo — é onde o prazo é usado.
 */
import { useMemo, useState } from "react";
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
  DIAS_MAXIMO, DIAS_PADRAO, ETAPAS_COM_PRAZO, ETAPA_DO_PROCESSO, ROTULO_DA_ETAPA, diasDeAtraso, prazoDaEtapa, situacaoDoPrazo,
  type DiasDosPrazos, type EtapaComPrazo, type SituacaoDoPrazo,
} from "@shared/prazos-da-escala";
import {
  ETAPAS_DO_QUADRO, O_QUE_FALTA, quadroDoEvento,
  type AnalyticsContext, type ColunaDoQuadro, type EventoAnalisado, type QuadroDoEvento,
} from "./scaling-analytics-data";
import { DetalheDaEtapa, type AlvoDoDetalhe } from "./scaling-analytics-quadro-detalhe";

export const PRAZOS_QUERY_KEY = ["/api/escala/prazos"];

/** Dias de cada prazo — o padrão do processo enquanto carrega ou se falhar. */
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
 * O prazo em duas linhas curtas ("prazo 09/10" / "7 dias atrasado"): numa
 * linha só cada coluna passava de 170px e, com Hotel, o quadro não cabia em
 * 1366 sem rolar.
 */
function LinhasDoPrazo({ tom, prazo, hoje }: { tom: Tom; prazo: Date | null; hoje: Date }) {
  const texto = textoDaSituacao(tom, prazo, hoje);
  const [base, situacao] = texto.split(" · ");
  return (
    <span className={`mt-0.5 block text-2xs leading-snug ${TOM[tom].data}`}>
      <span className="block whitespace-nowrap">{base}</span>
      {situacao && situacao !== "ok" && <span className="block whitespace-nowrap">{situacao}</span>}
    </span>
  );
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * A célula inteira é o botão que abre o detalhe (alvo grande, foco visível).
 * `h-px` no td + `h-full` no botão: o botão ocupa a altura da linha toda.
 */
const TD_DA_CELULA = "h-px border-l border-border p-0 align-top";
const BOTAO_DA_CELULA = "flex h-full min-h-[64px] w-full flex-col items-center px-2 py-2 text-center hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * Uma célula diz O QUE ESTÁ PARADO naquela etapa (09/10 — o time não entendia o
 * quadro; 16/10 — cada vaga numa coluna só): "2 sem nome", "1 a validar", com
 * o prazo embaixo. Sem ninguém parado: "—" se ainda há vagas antes, ✓ se todas
 * já passaram.
 */
function Celula({ coluna, prazo, hoje, testId, onAbrir }: {
  coluna: ColunaDoQuadro; prazo: Date | null; hoje: Date; testId: string; onAbrir: () => void;
}) {
  const paradas = coluna.paradas.length;
  const rotulo = ROTULO_DA_ETAPA[coluna.etapa];
  const td = (classe: string, title: string, conteudo: React.ReactNode, aria: string, centro = false) => (
    <td className={`${TD_DA_CELULA} ${classe}`} data-testid={testId}>
      <button
        type="button"
        onClick={onAbrir}
        className={`${BOTAO_DA_CELULA} ${centro ? "justify-center" : "justify-start"}`}
        title={title}
        aria-label={`${rotulo}: ${aria}. Ver as vagas`}
        data-testid={`abrir-${testId}`}
      >
        {conteudo}
      </button>
    </td>
  );

  if (coluna.ninguemPrecisa) {
    return td("", "Nenhuma vaga deste evento precisa", <span className="text-2xs text-muted-foreground">ninguém precisa</span>, "ninguém precisa", true);
  }
  if (paradas > 0) {
    const tom = situacaoDoPrazo(prazo, hoje, paradas);
    const texto = textoDaSituacao(tom, prazo, hoje);
    const oque = `${paradas} ${O_QUE_FALTA[coluna.etapa]}`;
    return td(TOM[tom].celula, `${oque} · ${texto}`, (
      <>
        <span className="block text-base font-semibold leading-tight tabular-nums text-foreground">{paradas}</span>
        <span className="block whitespace-nowrap text-2xs font-medium text-slate-700">{O_QUE_FALTA[coluna.etapa]}</span>
        <LinhasDoPrazo tom={tom} prazo={prazo} hoje={hoje} />
      </>
    ), `${oque}, ${texto}`);
  }
  if (coluna.antes.length > 0) {
    const antes = coluna.antes.length;
    const texto = textoDaSituacao("neutro", prazo, hoje);
    return td("", `Nenhuma vaga parada aqui — ${antes} ainda em etapas anteriores · ${texto}`, (
      <>
        <span className="block text-base font-semibold leading-tight text-muted-foreground">—</span>
        <span className="block whitespace-nowrap text-2xs text-muted-foreground">{antes} antes</span>
        <LinhasDoPrazo tom="neutro" prazo={prazo} hoje={hoje} />
      </>
    ), `nenhuma parada, ${antes} em etapas anteriores`);
  }
  return td("", `Concluída${prazo ? ` — prazo era ${dm(prazo)}` : ""}`, (
    <Check className="h-4 w-4 text-success" aria-hidden="true" />
  ), "concluída", true);
}

export function QuadroDePrazos({ eventos, ctx, hoje, dias, podeEditar, onVerVagasDoEvento }: {
  eventos: EventoAnalisado[];
  ctx: AnalyticsContext;
  hoje: Date;
  dias: DiasDosPrazos;
  podeEditar: boolean;
  onVerVagasDoEvento: (eventId: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [alvo, setAlvo] = useState<AlvoDoDetalhe | null>(null);
  const quadros = useMemo(
    () => new Map<string, QuadroDoEvento>(eventos.map((e) => [e.eventId, quadroDoEvento(e.vagas, ctx)])),
    [eventos, ctx],
  );
  const eventoDoAlvo = alvo ? eventos.find((e) => e.eventId === alvo.eventId) : undefined;
  const quadroDoAlvo = alvo ? quadros.get(alvo.eventId) : undefined;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] border-collapse text-left">
          <caption className="sr-only">Vagas paradas em cada etapa e o prazo de cada uma, por evento. Cada vaga aparece só na etapa em que está parada; passagem e hotel são tarefas paralelas, contadas cada uma por si.</caption>
          <thead>
            <tr className="border-b border-border bg-surface-muted/60 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              <th scope="col" className="px-4 py-2">Evento</th>
              <th scope="col" className="px-3 py-2 text-center" title="Dia da prova — o domingo dentro do período cadastrado do evento (ou o sábado)">
                Data
              </th>
              {ETAPAS_COM_PRAZO.map((etapa) => (
                <th
                  key={etapa}
                  scope="col"
                  className="border-l border-border px-2 py-2 text-center"
                  title={`${dias[etapa]} dias antes da data do evento · processo: ${ETAPA_DO_PROCESSO[etapa]}`}
                  data-testid={`cabecalho-${etapa}`}
                >
                  {ROTULO_DA_ETAPA[etapa]}
                  <span className="block text-2xs font-semibold normal-case tracking-normal text-slate-600 tabular-nums">D-{dias[etapa]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => {
              const prazo = (etapa: EtapaComPrazo) => prazoDaEtapa(e.dataEvento ?? e.ini, etapa, dias);
              const q = quadros.get(e.eventId)!;
              const abrir = (etapa: EtapaComPrazo) => () => setAlvo({ eventId: e.eventId, etapa });
              return (
                <tr key={e.eventId} className={`border-b border-border last:border-b-0 hover:bg-surface-muted ${e.jaTerminou ? "opacity-65" : ""}`}>
                  <th scope="row" className="max-w-[160px] px-4 py-2 align-top font-normal sm:max-w-[240px]">
                    <button
                      type="button"
                      onClick={() => onVerVagasDoEvento(e.eventId)}
                      className="block max-w-full truncate text-left text-sm font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      title={`Ver as vagas de ${e.nome}`}
                    >
                      {e.nome}
                    </button>
                    <span className="block text-2xs text-muted-foreground">
                      {e.total} {plural(e.total, "vaga", "vagas")}
                      {q.concluidas.length > 0 && <> · {q.concluidas.length} {plural(q.concluidas.length, "concluída", "concluídas")}</>}
                    </span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 text-center align-top text-sm font-semibold tabular-nums text-foreground">
                    {dmIso(e.dataEvento)}
                  </td>
                  {/* Registros: o total cadastrado — não há meta de vagas, então não existe "falta"; o prazo é informativo. */}
                  <td className={TD_DA_CELULA} data-testid={`quadro-registro-${e.eventId}`}>
                    <button
                      type="button"
                      onClick={abrir("registro")}
                      className={`${BOTAO_DA_CELULA} justify-start`}
                      title={`${e.total} ${plural(e.total, "vaga registrada", "vagas registradas")}`}
                      aria-label={`Registros: ${e.total} ${plural(e.total, "vaga", "vagas")}. Ver as vagas`}
                      data-testid={`abrir-quadro-registro-${e.eventId}`}
                    >
                      <span className="block text-base font-semibold leading-tight tabular-nums text-foreground">{e.total}</span>
                      <span className="block text-2xs text-muted-foreground">{plural(e.total, "vaga", "vagas")}</span>
                      <LinhasDoPrazo tom="neutro" prazo={prazo("registro")} hoje={hoje} />
                    </button>
                  </td>
                  {ETAPAS_DO_QUADRO.map((etapa) => (
                    <Celula
                      key={etapa}
                      coluna={q.colunas[etapa]}
                      prazo={prazo(etapa)}
                      hoje={hoje}
                      testId={`quadro-${etapa}-${e.eventId}`}
                      onAbrir={abrir(etapa)}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
        <span className="font-medium text-slate-700">Cada vaga aparece só na etapa em que está parada; passagem e hotel correm em paralelo.</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-danger/25 bg-danger-soft" />prazo passou com vaga parada ali</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-warning/25 bg-warning-soft" />vence em até 3 dias</span>
        <span>— nenhuma parada, ainda há vagas antes</span>
        <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> todas já passaram</span>
        <span>D-N: dias antes da data do evento. Clique numa célula para ver as vagas.</span>
        {podeEditar && (
          <Button type="button" variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs" onClick={() => setEditando(true)} data-testid="button-editar-prazos">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar prazos
          </Button>
        )}
      </div>

      {podeEditar && <EditarPrazos aberto={editando} onFechar={() => setEditando(false)} dias={dias} />}
      {alvo && eventoDoAlvo && quadroDoAlvo && (
        <DetalheDaEtapa
          evento={eventoDoAlvo}
          quadro={quadroDoAlvo}
          etapa={alvo.etapa}
          ctx={ctx}
          dias={dias}
          hoje={hoje}
          onFechar={() => setAlvo(null)}
          onVerVagasDoEvento={onVerVagasDoEvento}
        />
      )}
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
      <DialogContent className="max-w-[560px]">
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
                <label htmlFor={`prazo-${etapa}`} className="min-w-0 text-sm font-medium text-slate-700">
                  {ROTULO_DA_ETAPA[etapa]}
                  <span className="block truncate text-2xs font-normal text-muted-foreground" title={ETAPA_DO_PROCESSO[etapa]}>{ETAPA_DO_PROCESSO[etapa]}</span>
                </label>
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
          <p className="pt-1 text-2xs text-muted-foreground">Exemplo calculado para um evento em {dm(exemplo)}. Padrão do processo: {ETAPAS_COM_PRAZO.map((e) => `D-${DIAS_PADRAO[e]}`).join(" · ")}.</p>
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
