/**
 * Célula função × dia do quadro da Escala, com a logística DENTRO da grade
 * (23/10 — dono, no print do 20a Fuga das Ilhas: "as informações de logística
 * poderiam aparecer aqui de alguma forma").
 *
 * O chip continua dizendo quantas pessoas da função trabalham no dia. Embaixo,
 * marcadores pequenos: quem chega (avião pousando), quem sai (decolando) e se
 * alguém dorme no hotel naquela noite (cama). No canto do chip, o estado: ponto
 * âmbar = falta passagem, carro/van ou hotel para alguém do dia; ponto verde =
 * tudo resolvido. Âmbar também no marcador do que falta; "≈" = só a sugestão
 * da escala (ainda sem passagem).
 *
 * Passar o mouse mostra quem e a que horas; clicar abre o detalhe da função
 * naquele dia. Celular e tablet: só o chip (os marcadores ficam no detalhe).
 */
import type { ComponentType, ReactNode } from "react";
import { BedDouble, PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { LogisticaDaCelula, Movimento } from "@shared/logistica-da-escala";
import { faltaNoMovimento, porFonte } from "@shared/logistica-da-escala";
import { Portal as PortalDaDica } from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContextoDaEscala, FocoDoDia } from "./detalhe-da-logistica";
import { diaCurto, horaDaLista, plural, primeirosNomes, rotaDoTrecho } from "./formatos";

/** Nomes por seção no tooltip — o resto vira "+N" (a lista completa está no detalhe). */
const MAX_NOMES = 4;

export function CelulaDaGrade({ functionId, funcao, dia, count, chip, celula, ctx, onAbrir }: {
  functionId: string;
  funcao: string;
  dia: string;
  count: number;
  chip: ReactNode;
  celula: LogisticaDaCelula | undefined;
  ctx: ContextoDaEscala;
  onAbrir: (foco: FocoDoDia) => void;
}) {
  const temLogistica = !!celula && celula.estado !== "vazio";
  if (count === 0 && !temLogistica) return <span className="text-slate-200">–</span>;

  const chegam = celula?.chegam ?? [];
  const saem = celula?.saem ?? [];
  const reservados = celula?.noHotel.length ?? 0;
  const semReserva = celula?.semReserva.length ?? 0;
  const noite = reservados + semReserva;
  const falta = celula?.estado === "falta";
  const faltaNa = (lista: readonly Movimento[]) => lista.some((m) => {
    const l = ctx.resumo.porVaga.get(m.vagaId);
    return !!l && !!faltaNoMovimento(l, m);
  });
  const foco: FocoDoDia = chegam.length ? "chegam" : saem.length ? "saem" : noite ? "hotel" : "trabalham";

  const partes = [
    count > 0 ? `${count} na escala` : "ninguém na escala",
    chegam.length ? `${chegam.length} ${plural(chegam.length, "chega", "chegam")}` : null,
    saem.length ? `${saem.length} ${plural(saem.length, "sai", "saem")}` : null,
    noite ? `hotel ${reservados} de ${noite} reservados` : null,
    temLogistica ? (falta ? "falta logística" : "logística resolvida") : null,
  ].filter(Boolean).join(", ");

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onAbrir(foco)}
          aria-label={`${funcao}, ${diaCurto(dia)}: ${partes}. Ver o detalhe`}
          className="group mx-auto flex w-full flex-col items-center gap-1 rounded-lg py-0.5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`celula-${functionId}-${dia}`}
          data-estado={celula?.estado ?? "vazio"}
        >
          <span className="relative inline-flex">
            {chip ?? <span className="inline-flex h-7 w-10 items-center justify-center text-xs text-slate-300">–</span>}
            {temLogistica && (
              <span
                aria-hidden="true"
                className={cn("absolute -right-1 -top-1 hidden h-2 w-2 rounded-full ring-2 ring-card lg:block", falta ? "bg-warning" : "bg-success")}
                data-testid={`estado-${functionId}-${dia}`}
              />
            )}
          </span>
          {temLogistica && (
            <span aria-hidden="true" className="hidden h-3 items-center justify-center gap-1.5 text-2xs font-semibold leading-none tabular-nums lg:flex">
              {chegam.length > 0 && <Marcador Icone={PlaneLanding} lista={chegam} falta={faltaNa(chegam)} testId={`marcador-chegam-${functionId}-${dia}`} />}
              {saem.length > 0 && <Marcador Icone={PlaneTakeoff} lista={saem} falta={faltaNa(saem)} testId={`marcador-saem-${functionId}-${dia}`} />}
              {noite > 0 && (
                <BedDouble
                  className={cn("h-3 w-3", semReserva > 0 ? "text-warning" : "text-slate-400")}
                  data-testid={`marcador-hotel-${functionId}-${dia}`}
                  data-pendente={semReserva > 0 ? "sim" : "nao"}
                />
              )}
            </span>
          )}
        </button>
      </TooltipTrigger>
      {/* Portal: a célula fica dentro do quadro com rolagem e cabeçalho fixo — a dica não pode ser cortada nem herdar o centro da célula. */}
      <PortalDaDica>
        <TooltipContent side="bottom" align="center" collisionPadding={12} className="w-80 p-0 text-left text-xs" data-testid="dica-da-celula">
          <DicaDaCelula funcao={funcao} dia={dia} count={count} celula={celula} ctx={ctx} />
        </TooltipContent>
      </PortalDaDica>
    </Tooltip>
  );
}

function Marcador({ Icone, lista, falta, testId }: { Icone: ComponentType<{ className?: string }>; lista: readonly Movimento[]; falta: boolean; testId: string }) {
  const { passagem } = porFonte(lista);
  const soSugestao = passagem === 0;
  return (
    <span
      className={cn("inline-flex items-center gap-px", falta ? "text-warning" : soSugestao ? "text-muted-foreground" : "text-slate-600")}
      data-testid={testId}
    >
      <Icone className="h-3 w-3" />
      {passagem < lista.length ? "≈" : ""}{lista.length}
    </span>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────

function DicaDaCelula({ funcao, dia, count, celula, ctx }: {
  funcao: string; dia: string; count: number; celula: LogisticaDaCelula | undefined; ctx: ContextoDaEscala;
}) {
  const nome = (id: string) => {
    const v = ctx.vagaPorId.get(id);
    return v ? ctx.nomeDaVaga(v) ?? `sem nome #${v.inclusionNumber}` : "—";
  };
  const chegam = celula?.chegam ?? [];
  const saem = celula?.saem ?? [];
  const reservados = celula?.noHotel ?? [];
  const semReserva = celula?.semReserva ?? [];
  const noite = reservados.length + semReserva.length;

  return (
    <div className="divide-y divide-border">
      <div className="flex items-baseline justify-between gap-3 px-3 py-2">
        <p className="min-w-0 truncate font-semibold text-foreground">{funcao}</p>
        <p className="shrink-0 tabular-nums text-muted-foreground">{diaCurto(dia)} · {count > 0 ? `${count} na escala` : "ninguém trabalha"}</p>
      </div>
      {chegam.length > 0 && <SecaoDoMovimento Icone={PlaneLanding} rotulo="Chegam" lista={chegam} nome={nome} ctx={ctx} />}
      {saem.length > 0 && <SecaoDoMovimento Icone={PlaneTakeoff} rotulo="Saem" lista={saem} nome={nome} ctx={ctx} />}
      {noite > 0 && (
        <div className="space-y-1 px-3 py-2">
          <p className={cn("flex items-center gap-1.5 font-semibold", semReserva.length ? "text-warning" : "text-foreground")}>
            <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />
            Noite no hotel · {reservados.length} de {noite} {plural(noite, "reservado", "reservados")}
          </p>
          {semReserva.length > 0 && <p className="text-slate-700"><span className="font-medium text-warning">Sem reserva:</span> {primeirosNomes(semReserva.map(nome), MAX_NOMES)}</p>}
          {reservados.length > 0 && <p className="text-slate-600"><span className="font-medium text-slate-700">Reservados:</span> {primeirosNomes(reservados.map(nome), MAX_NOMES)}</p>}
        </div>
      )}
      {!chegam.length && !saem.length && !noite && (
        <p className="px-3 py-2 text-muted-foreground">Ninguém chega, sai ou dorme no hotel neste dia.</p>
      )}
      <p className="bg-surface-muted px-3 py-1.5 text-2xs text-muted-foreground">Clique para ver a lista completa</p>
    </div>
  );
}

function SecaoDoMovimento({ Icone, rotulo, lista, nome, ctx }: {
  Icone: ComponentType<{ className?: string }>; rotulo: string; lista: readonly Movimento[]; nome: (id: string) => string; ctx: ContextoDaEscala;
}) {
  const visiveis = lista.slice(0, MAX_NOMES);
  return (
    <div className="space-y-1 px-3 py-2">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <Icone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> {rotulo} {lista.length}
      </p>
      <ul className="space-y-0.5">
        {visiveis.map((m) => {
          const l = ctx.resumo.porVaga.get(m.vagaId);
          const falta = l ? faltaNoMovimento(l, m) : null;
          const rota = m.fonte === "passagem" ? rotaDoTrecho(m) : null;
          return (
            <li key={`${m.vagaId}-${m.tipo}`} className="flex items-baseline gap-2">
              <span className={cn("w-11 shrink-0 font-semibold tabular-nums", m.fonte === "sugestao" ? "text-muted-foreground" : "text-foreground")}>{horaDaLista(m)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-700">{nome(m.vagaId)}</span>
              <span className={cn("shrink-0 text-2xs", falta ? "font-semibold text-warning" : "text-muted-foreground")}>
                {falta === "passagem" ? "sem passagem" : falta === "terrestre" ? "sem carro/van" : rota ?? (m.fonte === "sugestao" ? "sugestão" : "")}
              </span>
            </li>
          );
        })}
      </ul>
      {lista.length > MAX_NOMES && <p className="text-2xs text-muted-foreground">+{lista.length - MAX_NOMES} no detalhe</p>}
    </div>
  );
}
