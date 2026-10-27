/**
 * Linha do tempo compacta dos dias de uma pessoa (27/10).
 *
 * Um quadradinho por dia de diária, na ordem: o dia (sáb 25/10), entrada →
 * saída, e os sinais miúdos — selfie, localização, "pelo representante",
 * "corrigido". A cor diz o estado (concluído, na arena, sem saída, sem
 * registro, falta, ainda não chegou). O dia é um botão: abre o menu com o que
 * dá para fazer NAQUELE dia (ver selfie, abrir no mapa, entrada/saída como
 * representante, corrigir horário, lançar falta) — só o que a permissão e o
 * estado deixam. Muitos dias quebram em mais de uma fileira.
 */
import { Camera, CameraOff, Clock3, LogIn, LogOut, MapPin, PencilLine, UserRoundCheck, UserX } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EstadoDoDia } from "@shared/presenca";
import { diaCurto, diaDaSemana, linkDoMapa, quemRegistrou } from "./presenca-utils";
import type { DiaDaPresenca, MarcacaoDaPresenca, PermissoesDaPresenca } from "./tipos";

/** Tom de cada estado (borda, fundo, texto). */
const TOM_DO_ESTADO: Record<EstadoDoDia, string> = {
  concluido: "prs-dia-ok",
  em_andamento: "prs-dia-arena",
  sem_checkout: "prs-dia-alerta",
  ausente: "prs-dia-perigo",
  falta: "prs-dia-falta",
  futuro: "prs-dia-futuro",
  hoje_sem_checkin: "prs-dia-hoje",
};

/** Texto do meio do dia: os horários ou, sem eles, o estado. */
function horarios(d: DiaDaPresenca): string {
  if (d.estado === "falta") return "Falta";
  if (d.entrada && d.saida) return `${d.entrada.hora} – ${d.saida.hora}`;
  if (d.entrada) return `${d.entrada.hora} – …`;
  if (d.estado === "ausente") return "Sem registro";
  if (d.estado === "hoje_sem_checkin") return "Sem entrada";
  if (d.estado === "futuro") return "Ainda não";
  return "—";
}

function Sinais({ d }: { d: DiaDaPresenca }) {
  const marcas = [d.entrada, d.saida].filter((m): m is MarcacaoDaPresenca => !!m);
  if (marcas.length === 0) return null;
  const selfies = marcas.filter((m) => m.comSelfie).length;
  const expurgadas = marcas.some((m) => m.fotoExpurgada);
  const local = marcas.some((m) => m.lat != null && m.lng != null);
  const rep = marcas.some((m) => m.por === "representante");
  const corr = marcas.some((m) => m.por === "produtor_correcao");
  return (
    <span className="prs-dia-sinais" aria-hidden="true">
      {selfies > 0 && <span className="inline-flex items-center gap-0.5"><Camera className="w-3 h-3" />{selfies > 1 ? selfies : null}</span>}
      {expurgadas && <CameraOff className="w-3 h-3" />}
      {local && <MapPin className="w-3 h-3" />}
      {rep && <UserRoundCheck className="w-3 h-3" />}
      {corr && <PencilLine className="w-3 h-3" />}
    </span>
  );
}

/** Frase completa do dia para o leitor de tela e a dica. */
function descricaoDoDia(d: DiaDaPresenca, hoje: string): string {
  const partes = [`${diaDaSemana(d.dia)} ${diaCurto(d.dia)}${d.dia === hoje ? " (hoje)" : ""}`, d.rotulo];
  const m = (rot: string, x: MarcacaoDaPresenca | null) => x
    ? `${rot} ${x.hora} ${quemRegistrou(x)}${x.fotoExpurgada ? ", foto apagada pela política de guarda" : x.comSelfie ? ", com selfie" : ", sem selfie"}${x.lat != null ? ", com localização" : ""}`
    : null;
  return [...partes, m("entrada", d.entrada), m("saída", d.saida)].filter(Boolean).join(" · ");
}

export interface AcoesDoDia {
  verSelfie: (dia: string, lado: "entrada" | "saida") => void;
  marcar: (dia: string, tipo: "entrada" | "saida") => void;
  corrigir: (dia: string) => void;
  lancarFalta: (dia: string) => void;
}

export function LinhaDosDias({ dias, hoje, permissoes, travada, acoes, nome }: {
  dias: DiaDaPresenca[];
  hoje: string;
  permissoes: PermissoesDaPresenca;
  /** Já com o DP: nada muda por aqui (o servidor recusa). */
  travada: boolean;
  acoes: AcoesDoDia;
  nome: string;
}) {
  if (dias.length === 0) {
    return <p className="m-0 text-xs text-muted-foreground">Sem dias de diária nesta prestação.</p>;
  }
  return (
    <ol className="prs-dias" aria-label={`Dias de ${nome}`}>
      {dias.map((d) => {
        const ehHoje = d.dia === hoje;
        const passou = d.dia < hoje;
        const podeEntrar = !travada && ehHoje && !d.entrada && d.estado !== "falta";
        const podeSair = !travada && ehHoje && !!d.entrada && !d.saida;
        const podeCorrigir = !travada && permissoes.corrigir && (passou || ehHoje) && d.estado !== "falta";
        const podeFalta = !travada && d.estado !== "falta" && !d.entrada && (passou || ehHoje);
        const fotos = permissoes.verFotos ? ([["entrada", d.entrada], ["saida", d.saida]] as const).filter(([, m]) => m?.fotoUrl) : [];
        const locais = ([["Entrada", d.entrada], ["Saída", d.saida]] as const).filter(([, m]) => m && m.lat != null && m.lng != null);
        const temAcao = podeEntrar || podeSair || podeCorrigir || podeFalta || fotos.length > 0 || locais.length > 0;
        const descricao = descricaoDoDia(d, hoje);
        const corpo = (
          <>
            <span className="prs-dia-data">
              <span className="uppercase">{diaDaSemana(d.dia)}</span> {diaCurto(d.dia)}
              {ehHoje && <span className="prs-dia-hoje-marca">hoje</span>}
            </span>
            <span className="prs-dia-horas tabular-nums">
              {d.estado === "em_andamento" && <span className="prs-pulso" aria-hidden="true" />}
              {d.estado === "falta" && <UserX className="w-3 h-3 shrink-0" aria-hidden="true" />}
              {horarios(d)}
            </span>
            <Sinais d={d} />
          </>
        );
        return (
          <li key={d.dia} className="prs-dia-item">
            {temAcao ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn("prs-dia", TOM_DO_ESTADO[d.estado])} aria-label={`${descricao}. Abrir ações do dia`} title={descricao} data-testid={`prs-dia-${d.dia}`}>
                    {corpo}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[248px]">
                  <DropdownMenuLabel className="text-xs font-semibold">
                    <span className="capitalize">{diaDaSemana(d.dia)}</span> {diaCurto(d.dia)} · {d.rotulo}
                  </DropdownMenuLabel>
                  {(d.entrada || d.saida) && (
                    <div className="px-2 pb-1.5 text-2xs leading-4 text-muted-foreground">
                      {d.entrada && <p className="m-0">Entrada {d.entrada.hora} · {quemRegistrou(d.entrada)}</p>}
                      {d.saida && <p className="m-0">Saída {d.saida.hora} · {quemRegistrou(d.saida)}</p>}
                      {(d.entrada?.fotoExpurgada || d.saida?.fotoExpurgada) && (
                        <p className="m-0 mt-1 inline-flex items-center gap-1"><CameraOff className="w-3 h-3" aria-hidden="true" />Foto apagada pela política de guarda</p>
                      )}
                    </div>
                  )}
                  {(fotos.length > 0 || locais.length > 0) && <DropdownMenuSeparator />}
                  {fotos.map(([lado]) => (
                    <DropdownMenuItem key={lado} onSelect={() => acoes.verSelfie(d.dia, lado)} data-testid={`prs-ver-selfie-${d.dia}-${lado}`}>
                      <Camera className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />Ver selfie da {lado === "entrada" ? "entrada" : "saída"}
                    </DropdownMenuItem>
                  ))}
                  {locais.map(([rot, m]) => (
                    <DropdownMenuItem key={rot} asChild>
                      <a href={linkDoMapa(m!.lat!, m!.lng!)} target="_blank" rel="noopener noreferrer">
                        <MapPin className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />
                        {rot} no mapa{m!.precisaoM != null ? <span className="ml-auto pl-2 text-2xs text-muted-foreground tabular-nums">±{m!.precisaoM} m</span> : null}
                      </a>
                    </DropdownMenuItem>
                  ))}
                  {(podeEntrar || podeSair || podeCorrigir || podeFalta) && <DropdownMenuSeparator />}
                  {podeEntrar && (
                    <DropdownMenuItem onSelect={() => acoes.marcar(d.dia, "entrada")} data-testid={`prs-fazer-entrada-${d.dia}`}>
                      <LogIn className="w-4 h-4 mr-2 text-success-strong" aria-hidden="true" />Fazer a entrada como representante
                    </DropdownMenuItem>
                  )}
                  {podeSair && (
                    <DropdownMenuItem onSelect={() => acoes.marcar(d.dia, "saida")} data-testid={`prs-fazer-saida-${d.dia}`}>
                      <LogOut className="w-4 h-4 mr-2 text-primary" aria-hidden="true" />Fazer a saída como representante
                    </DropdownMenuItem>
                  )}
                  {podeCorrigir && (
                    <DropdownMenuItem onSelect={() => acoes.corrigir(d.dia)} data-testid={`prs-corrigir-${d.dia}`}>
                      <Clock3 className="w-4 h-4 mr-2 text-warning-strong" aria-hidden="true" />Corrigir horário
                    </DropdownMenuItem>
                  )}
                  {podeFalta && (
                    <DropdownMenuItem onSelect={() => acoes.lancarFalta(d.dia)} data-testid={`prs-falta-${d.dia}`}>
                      <UserX className="w-4 h-4 mr-2 text-danger" aria-hidden="true" />Lançar falta neste dia
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className={cn("prs-dia prs-dia-estatico", TOM_DO_ESTADO[d.estado])} title={descricao} aria-label={descricao} role="group">
                {corpo}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
