/**
 * Resumo de Eventos (28/09, extraído de pages/events.tsx): Ativos /
 * Planejados / Em andamento / Concluídos. Cada indicador também é um filtro
 * de status (`aria-pressed`).
 *
 * 07/10 (redesenho): eram quatro cartões com filete colorido em cima, ícone
 * gigante a 20% e "hover que sobe" — o "dashboard genérico" que as outras
 * telas da Logística já tinham deixado. Agora é a MESMA faixa da fila de
 * trabalho de Passagens/Hospedagem (`common/fila-de-trabalho`): um bloco por
 * status, número e uma linha que diz o que ele significa (o próximo evento,
 * quantos acontecem agora). Reclicar o aceso desliga. Cores do status vêm de
 * `lib/event-status` — "Em andamento" é a cor da marca, como no selo da lista
 * (era âmbar aqui e azul no selo).
 */
import { CalendarCheck2, CalendarClock, CalendarDays, CalendarRange } from "lucide-react";
import type { Event } from "@shared/schema";
import { format } from "date-fns";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { getEventStatus, parseLocalDate } from "@/lib/event-status";

export interface EventsStats {
  total: number;
  planejado: number;
  emAndamento: number;
  concluido: number;
}

type ChaveDoResumo = "active" | "planejado" | "em andamento" | "concluído";
const CHAVES: ChaveDoResumo[] = ["active", "planejado", "em andamento", "concluído"];

export interface EventsKpisProps {
  stats: EventsStats;
  /** Eventos ativos — de onde sai "o próximo começa em…". */
  events?: Event[];
  /** Valor atual do filtro de status (o bloco cujo status bate fica aceso). */
  statusFilter: string;
  /** `null` = desligar (voltar ao recorte padrão). */
  onFilter: (status: string | null) => void;
}

export function EventsKpis({ stats, events = [], statusFilter, onFilter }: EventsKpisProps) {
  // O próximo planejado: a data que a pessoa quer saber ao olhar a faixa.
  const proximo = events
    .filter(e => getEventStatus(e) === "planejado")
    .map(e => parseLocalDate(e.startDate))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const blocos: BlocoDaFilaDeTrabalho<ChaveDoResumo>[] = [
    {
      key: "active", rotulo: "Ativos", n: stats.total, icone: CalendarDays, cor: "text-muted-foreground",
      sub: "fora os excluídos", titulo: `${stats.total} eventos ativos: planejados, em andamento e concluídos`,
    },
    {
      key: "planejado", rotulo: "Planejados", n: stats.planejado, icone: CalendarClock, cor: "text-slate-500",
      sub: proximo ? `próximo em ${format(proximo, "dd/MM")}` : "nenhum por vir",
      titulo: `${stats.planejado} eventos planejados${proximo ? ` — o próximo começa em ${format(proximo, "dd/MM/yyyy")}` : ""}`,
    },
    {
      key: "em andamento", rotulo: "Em andamento", n: stats.emAndamento, icone: CalendarRange, cor: "text-primary",
      sub: stats.emAndamento > 0 ? "acontecendo agora" : "nenhum agora",
      titulo: `${stats.emAndamento} eventos acontecendo hoje (pelas datas)`,
    },
    {
      key: "concluído", rotulo: "Concluídos", n: stats.concluido, icone: CalendarCheck2, cor: "text-success",
      sub: "já encerrados", titulo: `${stats.concluido} eventos concluídos`,
    },
  ];

  const ativa = (CHAVES as string[]).includes(statusFilter) ? (statusFilter as ChaveDoResumo) : null;
  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={ativa}
      onEscolher={onFilter}
      rotulo="Resumo dos eventos — cada indicador filtra a lista"
      testid={(k) => `resumo-eventos-${k.replace(" ", "-")}`}
    />
  );
}

export default EventsKpis;
