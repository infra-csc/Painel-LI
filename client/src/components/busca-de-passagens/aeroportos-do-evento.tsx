/**
 * Aeroporto do EVENTO na aba Buscar (15/10, dono: "373 com falta, todas por
 * aeroporto do evento não confirmado").
 *
 *  - Cidade reconhecida (pelo local do evento ou, na falta, pelo nome): a
 *    busca já usa o aeroporto PRINCIPAL da cidade — a linha fica pronta e o
 *    código ganha o selo discreto "sugerido · trocar" (troca grava no evento).
 *  - Cidade com mais de um aeroporto (BH, Rio, São Paulo…): além disso, a
 *    confirmação é pedida UMA vez por evento, nesta faixa acima da lista — sem
 *    travar a busca.
 *  - Cidade desconhecida: as escalações esperam a confirmação (mesma faixa).
 */
import { useState } from "react";
import { ChevronDown, PlaneLanding } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { rotuloDoAeroporto } from "@shared/aeroportos-do-brasil";
import type { EventoAConfirmar } from "./linhas-da-busca";
import { FormDoAeroportoDoEvento } from "./corrigir-falta";
import { diaCurto, plural } from "./formato";

/** Quantos eventos a faixa mostra antes do "Ver todos". */
const VISIVEIS = 4;

function ConfirmarEvento({ e }: { e: EventoAConfirmar }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-lg bg-card" data-testid={`confirmar-aeroporto-${e.eventId}`}>
          <PlaneLanding className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{e.sugerido ? "Confirmar ou trocar" : "Informar aeroporto"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl p-0">
        <FormDoAeroportoDoEvento eventId={e.eventId} nomeDoEvento={e.nome} sugestoes={e.sugestoes} atual={e.sugerido} onPronto={() => setAberto(false)} />
      </PopoverContent>
    </Popover>
  );
}

export function EventosAConfirmar({ eventos, podeCorrigir }: { eventos: EventoAConfirmar[]; podeCorrigir: boolean }) {
  const [todos, setTodos] = useState(false);
  if (eventos.length === 0) return null;
  const travados = eventos.filter((e) => !e.sugerido);
  const lista = todos ? eventos : eventos.slice(0, VISIVEIS);
  const titulo = eventos.length === 1 ? "1 evento com o aeroporto a confirmar" : `${eventos.length} eventos com o aeroporto a confirmar`;
  return (
    <section className="pas-entra overflow-hidden rounded-xl border border-warning/30 bg-warning-soft/50" aria-label={titulo} data-testid="eventos-a-confirmar">
      <div className="flex items-start gap-2.5 px-4 py-2.5">
        <PlaneLanding className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
        <p className="m-0 min-w-0 text-sm leading-5 text-foreground">
          <span className="font-semibold">{titulo}</span>{" "}
          <span className="text-slate-600">
            {travados.length === eventos.length
              ? "— não reconheci a cidade. Informe uma vez: vale para todas as escalações do evento."
              : <>— a cidade tem mais de um aeroporto e a busca já usa o principal. Confirme uma vez por evento: vale para todas as escalações dele.{travados.length > 0 && <> {plural(travados.length, "evento", "eventos")} sem cidade reconhecida {travados.length === 1 ? "espera" : "esperam"} o aeroporto para buscar.</>}</>}
          </span>
        </p>
      </div>
      <ul className="m-0 list-none divide-y divide-warning/15 border-t border-warning/20 bg-card/70 p-0">
        {lista.map((e) => (
          <li key={e.eventId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2" data-testid={`evento-a-confirmar-${e.eventId}`}>
            <div className="min-w-0 flex-1 basis-[220px]">
              <p className="m-0 truncate text-sm font-medium leading-5 text-foreground" title={e.nome}>{e.nome}</p>
              <p className="m-0 truncate text-2xs leading-4 text-muted-foreground" title={e.local || undefined}>
                {[e.local || "Local não informado", plural(e.escalacoes, "escalação", "escalações"), e.primeiraData ? `ida ${diaCurto(e.primeiraData)}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="shrink-0 text-2xs text-muted-foreground" title={e.sugestoes.map((s) => rotuloDoAeroporto(s)).join(", ") || undefined}>
              {e.sugerido
                ? <>usando <span className="font-mono font-semibold text-slate-700">{e.sugerido}</span>{e.sugestoes.length > 1 && <> · ou {e.sugestoes.filter((s) => s !== e.sugerido).join(" / ")}</>}</>
                : <span className="font-medium text-warning-strong">aguardando o aeroporto</span>}
            </span>
            {podeCorrigir && <ConfirmarEvento e={e} />}
          </li>
        ))}
      </ul>
      {eventos.length > VISIVEIS && (
        <div className="border-t border-warning/20 bg-card/70 px-2 py-1">
          <button type="button" onClick={() => setTodos((t) => !t)} aria-expanded={todos} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {todos ? "Mostrar menos" : `Ver todos (${eventos.length})`}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", todos && "rotate-180")} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Selo "sugerido · trocar" ao lado do código do aeroporto do evento: a busca
 * usa o principal da cidade; um clique abre a troca (que grava no evento).
 */
export function SeloDeAeroportoSugerido({ vagaId, eventId, nomeDoEvento, iata, opcoes, podeCorrigir }: {
  vagaId: string;
  eventId: string;
  nomeDoEvento?: string;
  iata: string;
  /** Aeroportos da cidade do evento (o principal primeiro). */
  opcoes: readonly string[];
  podeCorrigir: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const titulo = opcoes.length > 1
    ? `Aeroporto sugerido: ${iata} — o principal da cidade do evento (também ${opcoes.filter((o) => o !== iata).join(", ")}).`
    : `Aeroporto sugerido: ${iata} — o único da cidade do evento.`;
  const classe = "inline-flex h-[18px] items-center whitespace-nowrap rounded px-1 text-2xs font-medium leading-none text-muted-foreground bg-muted";
  if (!podeCorrigir) return <span className={classe} title={titulo} data-testid={`aeroporto-sugerido-${vagaId}`}>sugerido</span>;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(classe, "transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-brand-soft data-[state=open]:text-primary")}
          title={`${titulo} Clique para trocar.`}
          aria-label={`Aeroporto sugerido: ${iata}. Trocar o aeroporto do evento`}
          data-testid={`aeroporto-sugerido-${vagaId}`}
        >
          sugerido · <span className="ml-0.5 underline decoration-dotted underline-offset-2">trocar</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl p-0" onClick={(e) => e.stopPropagation()}>
        <FormDoAeroportoDoEvento eventId={eventId} nomeDoEvento={nomeDoEvento} sugestoes={opcoes} atual={iata} onPronto={() => setAberto(false)} />
      </PopoverContent>
    </Popover>
  );
}
