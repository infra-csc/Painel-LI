/**
 * O que falta numa escalação para a busca consultar — e o atalho para corrigir
 * ali mesmo (09/10). Regra do dono: "não consulta com dado faltando — avisa
 * antes". Cada falta é uma pílula; o clique abre um popover pequeno:
 *  - aeroporto do EVENTO: confirma uma vez e fica salvo no evento (todas as
 *    próximas buscas usam). Desde 15/10 não é mais pílula por linha: a busca
 *    já usa o principal da cidade (selo "sugerido", com troca) e a faixa
 *    "eventos a confirmar" (aeroportos-do-evento.tsx) pede uma vez por evento;
 *  - aeroporto de SAÍDA ou data: vale só para esta busca (a vaga continua
 *    como está — quem corrige de vez é a Escalação), e a tela diz isso.
 */
import { useState } from "react";
import { AlertTriangle, CalendarX2, Check, Loader2, MapPinOff, PlaneLanding, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { AEROPORTOS, ehIata, rotuloDoAeroporto } from "@shared/aeroportos-do-brasil";
import type { AjusteDaBusca, DadoFaltando } from "@shared/busca-de-passagens";
import { useConfirmarAeroporto } from "./use-busca-de-passagens";

const PILULA = "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap";
const CAMPO = "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12";
const COMUNS = ["GRU", "CGH", "VCP", "GIG", "SDU", "CNF", "BSB", "CWB", "POA", "SSA", "REC", "FOR"];

/** Rótulo curto da pílula (o texto completo vai no popover). */
export function rotuloDaFalta(f: DadoFaltando): string {
  switch (f.tipo) {
    case "evento_sem_aeroporto": return "Confirmar aeroporto do evento";
    case "sem_cidade_de_saida": return "Sem cidade de saída";
    case "cidade_sem_aeroporto": return "Aeroporto de saída?";
    case "sem_data_ida": return "Sem data da ida";
    case "sem_data_volta": return "Sem data da volta";
    case "data_passada": return "Data já passou";
    case "volta_antes_da_ida": return "Volta antes da ida";
    case "mesmo_aeroporto": return "Mesmo aeroporto";
    default: return "Indisponível";
  }
}

const ICONE = (f: DadoFaltando) =>
  f.tipo === "evento_sem_aeroporto" ? PlaneLanding
  : f.tipo === "sem_cidade_de_saida" || f.tipo === "cidade_sem_aeroporto" ? MapPinOff
  : f.tipo.includes("data") || f.tipo === "volta_antes_da_ida" ? CalendarX2
  : f.tipo === "mesmo_aeroporto" ? Info : AlertTriangle;

export function PilulaDeFalta({ falta, nomeDoEvento, ajuste, onAjustar, podeCorrigir }: {
  falta: DadoFaltando;
  nomeDoEvento?: string;
  ajuste: AjusteDaBusca;
  onAjustar: (patch: Partial<AjusteDaBusca>) => void;
  podeCorrigir: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const Icone = ICONE(falta);
  const informativa = falta.tipo === "mesmo_aeroporto" || falta.tipo === "vaga_invalida";
  const cor = informativa ? "bg-muted text-muted-foreground" : "bg-warning-soft text-warning-strong";
  if (!podeCorrigir || informativa) {
    return (
      <span className={`${PILULA} ${cor}`} title={falta.mensagem} data-testid={`falta-${falta.tipo}-${falta.vagaId}`}>
        <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />{rotuloDaFalta(falta)}
      </span>
    );
  }
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`pas-alvo ${PILULA} ${cor} hover:ring-1 hover:ring-warning-strong/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-1 data-[state=open]:ring-warning-strong/50`}
          data-testid={`falta-${falta.tipo}-${falta.vagaId}`}
        >
          <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />{rotuloDaFalta(falta)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[min(320px,calc(100vw-24px))] p-0 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <CorrecaoDaFalta falta={falta} nomeDoEvento={nomeDoEvento} ajuste={ajuste} onAjustar={(p) => { onAjustar(p); setAberto(false); }} onPronto={() => setAberto(false)} />
      </PopoverContent>
    </Popover>
  );
}

function CorrecaoDaFalta({ falta, nomeDoEvento, ajuste, onAjustar, onPronto }: {
  falta: DadoFaltando;
  nomeDoEvento?: string;
  ajuste: AjusteDaBusca;
  onAjustar: (patch: Partial<AjusteDaBusca>) => void;
  onPronto: () => void;
}) {
  const sugestoes = falta.sugestoes ?? [];
  const [iata, setIata] = useState("");
  const [data, setData] = useState("");
  const iataOk = ehIata(iata);
  const campo = CAMPO;

  if (falta.tipo === "evento_sem_aeroporto" && falta.eventId) {
    return <FormDoAeroportoDoEvento eventId={falta.eventId} nomeDoEvento={nomeDoEvento} sugestoes={sugestoes} onPronto={onPronto} />;
  }

  if (falta.tipo === "sem_cidade_de_saida" || falta.tipo === "cidade_sem_aeroporto") {
    return (
      <form className="p-3.5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (iataOk) onAjustar({ aeroportoDeCasa: iata.toUpperCase() }); }}>
        <div>
          <p className="m-0 text-sm font-semibold text-foreground">De qual aeroporto sai?</p>
          <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {falta.tipo === "cidade_sem_aeroporto" ? <>Não reconheci “{falta.texto}”. </> : null}
            Vale só para esta busca — para corrigir de vez, ajuste o “Sai de” na Escalação.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMUNS.map((s) => (
            <button key={s} type="button" onClick={() => setIata(s)} className={`h-7 px-2 rounded-md border text-2xs font-mono font-semibold ${iata === s ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted"}`} title={rotuloDoAeroporto(s)}>{s}</button>
          ))}
        </div>
        <input value={iata} onChange={(e) => setIata(e.target.value.toUpperCase().slice(0, 3))} placeholder="Código, ex.: GRU" maxLength={3} className={`${campo} font-mono uppercase`} aria-label="Código do aeroporto de saída" />
        <button type="submit" disabled={!iataOk} className="pas-alvo inline-flex w-full items-center justify-center h-9 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60">Usar nesta busca</button>
      </form>
    );
  }

  if (falta.tipo === "sem_data_ida" || falta.tipo === "sem_data_volta" || falta.tipo === "data_passada" || falta.tipo === "volta_antes_da_ida") {
    const ehVolta = falta.tipo === "sem_data_volta" || falta.tipo === "volta_antes_da_ida";
    const chave = ehVolta ? "dataVolta" : "dataIda";
    const atual = ajuste[chave] ?? "";
    return (
      <form className="p-3.5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (data) onAjustar({ [chave]: data }); }}>
        <div>
          <p className="m-0 text-sm font-semibold text-foreground">{falta.mensagem}</p>
          <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">Informe a data da {ehVolta ? "volta" : "ida"} para esta busca. A data sugerida da vaga continua a da Escalação.</p>
        </div>
        <input type="date" value={data || atual} onChange={(e) => setData(e.target.value)} className={campo} aria-label={`Data da ${ehVolta ? "volta" : "ida"}`} />
        <button type="submit" disabled={!data} className="pas-alvo inline-flex w-full items-center justify-center h-9 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60">Usar nesta busca</button>
      </form>
    );
  }

  return <p className="m-0 p-3.5 text-sm text-muted-foreground">{falta.mensagem}</p>;
}

/**
 * Confirmar (ou trocar) o aeroporto do EVENTO — grava em `events.aeroporto_iata`
 * e vale para todas as escalações dele. Usado pela faixa "eventos a confirmar"
 * e pelo selo "aeroporto sugerido" (15/10).
 */
export function FormDoAeroportoDoEvento({ eventId, nomeDoEvento, sugestoes, atual = null, onPronto }: {
  eventId: string;
  nomeDoEvento?: string;
  sugestoes: readonly string[];
  /** O sugerido hoje (troca): vem marcado e o texto explica de onde saiu. */
  atual?: string | null;
  onPronto: () => void;
}) {
  const { toast } = useToast();
  const confirmar = useConfirmarAeroporto();
  const [iata, setIata] = useState(atual ?? sugestoes[0] ?? "");
  const iataOk = ehIata(iata);
  const opcoes = Array.from(new Set([...(atual ? [atual] : []), ...sugestoes]));
  return (
    <form
      className="p-3.5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!iataOk) return;
        confirmar.mutate({ eventId, iata: iata.toUpperCase() }, {
          onSuccess: () => { toast({ title: "Aeroporto confirmado", description: `${nomeDoEvento ?? "O evento"} usa ${rotuloDoAeroporto(iata)} nas próximas buscas.` }); onPronto(); },
          onError: (err) => toast({ title: "Não foi possível salvar", description: apiErrorMessage(err, "Tente de novo."), variant: "destructive" }),
        });
      }}
    >
      <div>
        <p className="m-0 text-sm font-semibold text-foreground">Aeroporto de {nomeDoEvento ?? "destino"}</p>
        <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {atual
            ? opcoes.length > 1
              ? <>A busca está usando <span className="font-mono font-semibold text-foreground">{atual}</span>, o principal da cidade do evento. Confirme ou troque: fica salvo no evento e vale para todas as escalações dele.</>
              : <>A busca está usando <span className="font-mono font-semibold text-foreground">{atual}</span>, o único aeroporto da cidade do evento. Troque se for outro: fica salvo no evento.</>
            : "Confirme uma vez: fica salvo no evento e vale para todas as escalações dele."}
        </p>
      </div>
      {opcoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Sugestões pela cidade do evento">
          {opcoes.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={iata === s} onClick={() => setIata(s)}
              className={`pas-alvo h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${iata === s ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-slate-700 hover:bg-muted"}`}>
              {rotuloDoAeroporto(s)}
            </button>
          ))}
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Código do aeroporto</span>
        <input value={iata} onChange={(e) => setIata(e.target.value.toUpperCase().slice(0, 3))} placeholder="Ex.: JPA" maxLength={3} className={`${CAMPO} font-mono uppercase`} aria-invalid={!!iata && !iataOk} data-testid="input-aeroporto-evento" />
        {iataOk && <span className="mt-1 block text-2xs text-muted-foreground">{AEROPORTOS[iata] ? rotuloDoAeroporto(iata) : "Código fora da lista conhecida — confira antes de salvar."}</span>}
      </label>
      <button type="submit" disabled={!iataOk || confirmar.isPending} className="pas-alvo inline-flex w-full items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60" data-testid="confirmar-aeroporto-evento">
        {confirmar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
        {confirmar.isPending ? "Salvando…" : atual && iata !== atual ? "Trocar e salvar no evento" : "Confirmar e salvar no evento"}
      </button>
    </form>
  );
}
