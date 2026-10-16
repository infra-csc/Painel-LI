/**
 * Ações que GASTAM consulta na tela de resultados (16/10). Todas num lugar só
 * e sempre com o custo à vista ("1 consulta", "grátis") — a mesma regra de
 * antes: o servidor só consulta o que vier autorizado por um clique.
 *
 * `saidasDaRota` diz quais existem para a rota aberta; o estado "Nenhum voo"
 * usa as mesmas, explicadas, e o grupo lateral mostra as que sobram.
 */
import type { ReactNode } from "react";
import { CalendarRange, Clock, Layers, MapPinned, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { temFiltroDeHorario, type AlternativaNaTela, type OpcaoAvaliada, type ResultadoNaTela, type RotaNaTela } from "@shared/busca-de-passagens";
import { plural } from "../formato";

export interface AcoesDaRota {
  atualizar: (rota: RotaNaTela) => void;
  datasFlexiveis: (rota: RotaNaTela) => void;
  duasConexoes: (rota: RotaNaTela) => void;
  trocarSaida: (rota: RotaNaTela, iata: string) => void;
  consultar: (rota: RotaNaTela) => void;
  usar: (vagaId: string, rota: RotaNaTela, opcao: OpcaoAvaliada, resultado: ResultadoNaTela) => void;
  /** "Para as N desta rota": o mesmo registro, uma escalação por vez. */
  usarParaTodas?: (rota: RotaNaTela, opcao: OpcaoAvaliada, resultado: ResultadoNaTela) => void;
  /** Consulta SEM a janela de horário (1 consulta). */
  semHorario?: (rota: RotaNaTela) => void;
  /** Testa os aeroportos alternativos (1 consulta cada). */
  testarAlternativas?: (rota: RotaNaTela) => void;
  /** Troca para um alternativo já testado (do cache, não gasta). */
  usarAlternativa?: (rota: RotaNaTela, alt: AlternativaNaTela) => void;
}

export const custoEmTexto = (n: number) => (n === 0 ? "grátis" : plural(n, "consulta", "consultas"));

export function BotaoQueGasta({ onClick, disabled, children, custo, testid, primario, className }: {
  onClick: () => void; disabled?: boolean; children: ReactNode; custo: number; testid?: string; primario?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pas-alvo inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        primario ? "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover" : "border border-border bg-card text-slate-700 hover:bg-muted",
        className,
      )}
      data-testid={testid}
    >
      {children}
      <span className={cn("ml-auto rounded px-1 text-2xs tabular-nums", primario ? "bg-primary-foreground/15" : "bg-muted text-muted-foreground")}>
        {custoEmTexto(custo)}
      </span>
    </button>
  );
}

export type IdDaSaida = "sem-horario" | "duas-conexoes" | "flex" | "alternativas" | "atualizar";

export interface SaidaDaRota {
  id: IdDaSaida;
  rotulo: string;
  /** O que muda, em uma frase (o estado "Nenhum voo" mostra). */
  explica: string;
  custo: number;
  icone: typeof Clock;
  testid: string;
  fazer: () => void;
}

/** Aeroportos que ainda dá para testar (o de casa não vale no trecho direto). */
export function alternativasPossiveis(rota: RotaNaTela): string[] {
  return [...(rota.trechoDireto ? [] : rota.alternativasDeCasa), ...(rota.alternativasDoEvento ?? [])].filter((a, i, l) => l.indexOf(a) === i);
}

/**
 * As saídas que gastam para a rota aberta, na ordem em que mais resolvem.
 * `variante`: uma data vizinha está aberta — nada que mude a busca da data sugerida.
 */
export function saidasDaRota(rota: RotaNaTela, acoes: AcoesDaRota, variante: boolean): SaidaDaRota[] {
  const out: SaidaDaRota[] = [];
  if (!rota.resultado) return out;
  if (acoes.semHorario && temFiltroDeHorario(rota) && !rota.semHorario && !variante) {
    out.push({ id: "sem-horario", rotulo: "Ver sem o horário sugerido", explica: "Traz todos os voos do dia; os que saem da janela aparecem marcados, dizendo quanto estão fora.", custo: 1, icone: Clock, testid: `sem-horario-${rota.chave}`, fazer: () => acoes.semHorario?.(rota) });
  }
  if (rota.maxParadas === 1 && !variante) {
    out.push({ id: "duas-conexoes", rotulo: "Tentar com 2 conexões", explica: "Inclui voos com duas paradas — mais longos, às vezes os únicos.", custo: 1, icone: Layers, testid: `duas-conexoes-${rota.chave}`, fazer: () => acoes.duasConexoes(rota) });
  }
  if (!rota.variantes) {
    out.push({ id: "flex", rotulo: "Datas ±1 dia", explica: "Consulta a véspera e o dia seguinte (a diária a mais ou a menos entra no custo).", custo: rota.consultasDoFlex, icone: CalendarRange, testid: `flex-${rota.chave}`, fazer: () => acoes.datasFlexiveis(rota) });
  }
  const alts = alternativasPossiveis(rota);
  if (alts.length > 0 && !rota.alternativas && acoes.testarAlternativas) {
    out.push({ id: "alternativas", rotulo: `Testar ${alts.join(", ")}`, explica: "Outros aeroportos da cidade de casa ou do evento.", custo: rota.consultasDasAlternativas ?? alts.length, icone: MapPinned, testid: `alternativas-${rota.chave}`, fazer: () => acoes.testarAlternativas?.(rota) });
  }
  out.push({ id: "atualizar", rotulo: "Atualizar preços", explica: "Consulta de novo, mesmo com o cache.", custo: 1, icone: RefreshCw, testid: `atualizar-${rota.chave}`, fazer: () => acoes.atualizar(rota) });
  return out;
}
