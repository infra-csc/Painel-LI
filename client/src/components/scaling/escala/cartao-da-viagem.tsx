/**
 * A viagem de UMA vaga, compacta (23/10 — dono: "horários e tudo mais da
 * passagem"). Ida e volta lado a lado como em Passagens (partida → chegada,
 * origem → destino, companhia e LOC), o carro/van registrado, a Sugestão da
 * escala quando ainda não há passagem (marcada como sugestão), o hotel com as
 * datas e a observação da passagem (é onde a conexão fica anotada).
 */
import { ArrowRight, BedDouble, Car, Info, PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import type { EstadoDoItem, LogisticaDaVagaNaEscala, Movimento } from "@shared/logistica-da-escala";
import type { PernaDaViagem } from "@shared/transporte-terrestre";
import { cn } from "@/lib/utils";
import {
  codigosDaPassagem, diaCurto, dm, horarioDoTrecho, modoECompanhia, plural, rotaDoTrecho, textoDaPernaTerrestre,
} from "./formatos";

const QUARTO: Record<string, string> = { single: "Single", duplo: "Duplo", double: "Duplo", triplo: "Triplo", triple: "Triplo" };

export type FocoDoCartao = "passagem" | "terrestre" | "hotel" | "sem_nome" | null;

export function CartaoDaViagem({ vaga, l, nome, funcao, foco, onAbrirVaga }: {
  vaga: TeamInclusion;
  l: LogisticaDaVagaNaEscala;
  /** null = sem nome. */
  nome: string | null;
  funcao: string | null;
  foco?: FocoDoCartao;
  onAbrirVaga?: (v: TeamInclusion) => void;
}) {
  const observacao = String(l.passagemAtual?.ticketObservations ?? "").trim();
  return (
    <article className="px-1 py-3" data-testid={`viagem-vaga-${vaga.id}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span className="w-12 shrink-0 pt-px font-mono text-xs tabular-nums text-muted-foreground">#{vaga.inclusionNumber}</span>
        <div className="min-w-0 flex-1">
          {onAbrirVaga ? (
            <button
              type="button"
              onClick={() => onAbrirVaga(vaga)}
              className={cn("block max-w-full truncate rounded text-left text-sm underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", nome ? "font-semibold text-foreground" : "italic text-muted-foreground")}
              title="Abrir a vaga"
            >
              {nome ?? "sem nome"}
            </button>
          ) : (
            <span className={cn("block truncate text-sm", nome ? "font-semibold text-foreground" : "italic text-muted-foreground")}>{nome ?? "sem nome"}</span>
          )}
          {(funcao || vaga.city) && (
            <span className="block truncate text-xs text-slate-600">{[funcao, vaga.city].filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 max-sm:w-full max-sm:justify-start max-sm:pl-[60px]">
          <ChipDoItem rotulo="Passagem" estado={l.passagem} texto={l.situacao === "so_carimbo" ? "emitida · sem dados" : l.situacao === "emitida" ? "emitida" : l.situacao === "comprada" ? "comprada" : undefined} alerta={l.situacao === "so_carimbo"} />
          <ChipDoItem rotulo="Carro/van" estado={l.terrestre} />
          <ChipDoItem rotulo="Hotel" estado={l.hotel} />
        </div>
      </header>

      {l.semNome && !l.viaja ? (
        <p className={cn("mt-2 ml-0 rounded-lg border border-dashed px-3 py-2 text-xs sm:ml-[60px]", foco === "sem_nome" ? "border-danger/30 bg-danger-soft text-danger" : "border-border text-muted-foreground")}>
          Sem colaborador — passagem, carro/van e hotel esperam o nome.
        </p>
      ) : !l.viaja ? (
        <p className="mt-1.5 ml-0 text-xs text-muted-foreground sm:ml-[60px]">Não viaja{l.hotel === "nao_precisa" ? " nem precisa de hotel" : ""}.</p>
      ) : (
        <div className="mt-2 ml-0 grid grid-cols-1 gap-2 sm:ml-[60px] sm:grid-cols-2">
          <Perna perna="ida" l={l} movimento={l.chegada} />
          <Perna perna="volta" l={l} movimento={l.saida} />
        </div>
      )}

      {(l.hotel !== "nao_precisa" || l.hospedagem) && (
        <LinhaDoHotel l={l} />
      )}

      {observacao && (
        <p className="mt-1.5 ml-0 flex items-start gap-1.5 text-xs text-slate-600 sm:ml-[60px]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="line-clamp-2 min-w-0" title={observacao}>{observacao}</span>
        </p>
      )}
    </article>
  );
}

function ChipDoItem({ rotulo, estado, texto, alerta = false }: { rotulo: string; estado: EstadoDoItem; texto?: string; alerta?: boolean }) {
  if (estado === "nao_precisa") return null;
  const ok = estado === "tem" && !alerta;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2 text-2xs font-semibold",
        ok ? "border-success/25 bg-success-soft text-success" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      {rotulo}{estado === "tem" ? (texto ? ` ${texto}` : " ok") : " falta"}
    </span>
  );
}

/** Uma perna: a passagem, o carro/van registrado ou a Sugestão (tracejada). */
function Perna({ perna, l, movimento }: { perna: PernaDaViagem; l: LogisticaDaVagaNaEscala; movimento: Movimento | null }) {
  const Icone = perna === "ida" ? PlaneTakeoff : PlaneLanding;
  const titulo = perna === "ida" ? "Ida" : "Volta";
  const terrestre = textoDaPernaTerrestre(l, perna);
  const pernaDaVaga = l.pernasDePassagem.includes(perna) || l.pernasTerrestres.includes(perna);

  if (!movimento) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.06em] text-2xs text-slate-600">
          <Icone className="h-3.5 w-3.5" aria-hidden="true" />{titulo}
        </span>
        <span className="mt-0.5 block">{pernaDaVaga ? "Sem data — nem passagem, nem sugestão" : "Não tem esta perna"}</span>
        {terrestre && <span className="mt-0.5 block text-slate-700">{terrestre}</span>}
      </div>
    );
  }

  const sugestao = movimento.fonte === "sugestao";
  const horario = horarioDoTrecho(movimento);
  const rota = rotaDoTrecho(movimento);
  const { loc } = codigosDaPassagem(sugestao ? null : l.passagemAtual);
  // Perna de carro/van registrada: a linha do terrestre já diz o modo e a empresa.
  const meio = terrestre && l.terrestrePorPerna[perna] ? null : modoECompanhia(movimento);
  return (
    <div
      className={cn("rounded-lg border px-3 py-2", sugestao ? "border-dashed border-border bg-card" : "border-border bg-surface-muted/60")}
      data-testid={`perna-${perna}`}
    >
      <div className="flex items-center gap-1.5 text-2xs">
        <Icone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span className="font-semibold uppercase tracking-[0.06em] text-primary">{titulo}</span>
        <span className="font-semibold tabular-nums text-foreground">{diaCurto(movimento.dia)}</span>
        {sugestao && <span className="ml-auto rounded-full border border-border px-1.5 py-px font-medium text-muted-foreground">sugestão da escala</span>}
        {movimento.segueParaOutroEvento && <span className="ml-auto rounded-full border border-border px-1.5 py-px font-medium text-slate-600">segue para outro evento</span>}
      </div>
      {sugestao ? (
        <p className="mt-1 text-sm text-slate-700">
          {movimento.textoDaSugestao ? <span className="font-medium">{movimento.textoDaSugestao}</span> : <span className="text-muted-foreground">sem horário sugerido</span>}
        </p>
      ) : (
        <>
          {horario && <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{horario}</p>}
          {rota && (
            <p className="flex items-center gap-1 text-xs font-medium uppercase tabular-nums text-slate-700" title={[movimento.cidadeDe, movimento.cidadePara].filter(Boolean).join(" → ")}>
              {movimento.de ?? "?"}<ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{movimento.para ?? "?"}
            </p>
          )}
        </>
      )}
      {(meio || loc) && (
        <p className="mt-0.5 truncate text-xs text-slate-600">
          {meio}{loc && <>{meio ? " · " : ""}LOC <span className="font-mono font-semibold text-foreground">{loc}</span></>}
        </p>
      )}
      {terrestre && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-700">
          <Car className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />{terrestre}
        </p>
      )}
    </div>
  );
}

function LinhaDoHotel({ l }: { l: LogisticaDaVagaNaEscala }) {
  const h = l.hospedagem;
  if (!h) {
    return (
      <p className="mt-2 ml-0 flex items-center gap-1.5 text-xs text-warning sm:ml-[60px]">
        <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Hotel: falta reservar
      </p>
    );
  }
  const noites = l.noites.length;
  const quarto = h.roomType ? QUARTO[String(h.roomType).toLowerCase()] ?? h.roomType : null;
  return (
    <p className="mt-2 ml-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-700 sm:ml-[60px]">
      <BedDouble className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="font-semibold text-foreground">{h.hotelName}</span>
      <span className="tabular-nums">· {dm(h.checkInDate ?? null)}{h.checkInTime ? ` ${h.checkInTime}` : ""} → {dm(h.checkOutDate ?? null)}{h.checkOutTime ? ` ${h.checkOutTime}` : ""}</span>
      {noites > 0 && <span>· {noites} {plural(noites, "noite", "noites")}</span>}
      {quarto && <span>· {quarto}</span>}
      {h.reservationNumber && <span>· Reserva <span className="font-mono">{h.reservationNumber}</span></span>}
    </p>
  );
}
