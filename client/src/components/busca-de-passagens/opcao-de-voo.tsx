/**
 * Uma opção de voo na tela de RESULTADOS (16/10). Lista densa, para comparar:
 * a mesma coluna para a companhia, as pernas, o preço e as ações em toda
 * linha (grade por CSS `.bpr-opcao`, que vira cartão no estreito — nada
 * duplicado). Leitura na ordem da decisão: companhia → horários de ida e
 * volta (duração, paradas e onde) → preço (e o custo total) → selos → ações.
 *
 * "Abrir na companhia" pede o link SÓ no clique (gasta consulta só se não
 * estiver no cache). "Usar este voo" abre o registro da passagem já
 * preenchido — para uma escalação, ou para todas as da rota, uma por vez.
 */
import { ExternalLink, Loader2, ChevronDown, Copy, Check, Users } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import {
  duracaoEmTexto,
  pernasDaOpcao,
  voosDaPerna,
  companhiaDaPerna,
  type OpcaoAvaliada,
  type PernaDeVoo,
  type PernaDaRota,
  type Selo,
} from "@shared/busca-de-passagens";
import { CLASSE_DA_CIA, diaCurto, hhmm } from "./formato";

export interface VagaDaOpcao { id: string; numero: number | null; nome: string; comprada: boolean; valorPagoCentavos: number | null }

const COR_DO_SELO: Record<Selo["tipo"], string> = {
  menor_custo: "bg-success-soft text-success",
  no_horario: "bg-success-soft text-success",
  fora_do_horario: "bg-warning-soft text-warning-strong",
  diaria_extra: "bg-info-soft text-info-strong",
  diaria_a_menos: "bg-muted text-slate-600",
  conexao_longa: "bg-warning-soft text-warning-strong",
  viagem_longa: "bg-danger-soft text-danger-strong",
  troca_de_cia: "bg-danger-soft text-danger-strong",
  mala_inclusa: "bg-success-soft text-success",
  mala_extra: "bg-info-soft text-info-strong",
};

/** Minutos entre a chegada de um trecho e a partida do seguinte (mesmo aeroporto → mesmo fuso). */
function espera(chegada: string, partida: string): number | null {
  const a = Date.parse(`${chegada.slice(0, 16)}:00Z`), b = Date.parse(`${partida.slice(0, 16)}:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 60000) : null;
}

function Perna({ rotulo, p }: { rotulo: string; p: PernaDeVoo }) {
  const ini = p.segmentos[0], fim = p.segmentos[p.segmentos.length - 1];
  const diasDepois = Math.round((Date.parse(`${fim.chegada.slice(0, 10)}T00:00:00Z`) - Date.parse(`${ini.partida.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  const conexoes = p.segmentos.slice(0, -1).map((s, i) => ({ onde: s.destino, min: espera(s.chegada, p.segmentos[i + 1].partida) }));
  return (
    <div className="bpr-perna">
      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{rotulo}</span>
      <span className="text-2xs tabular-nums text-muted-foreground">{diaCurto(ini.partida)}</span>
      <span className="whitespace-nowrap text-sm tabular-nums text-foreground">
        <span className="font-semibold">{hhmm(ini.partida)}</span>
        <span className="mx-1 text-muted-foreground" aria-hidden="true">→</span>
        <span className="sr-only"> a </span>
        <span className="font-semibold">{hhmm(fim.chegada)}</span>
        {diasDepois > 0 && <sup className="ml-0.5 text-2xs font-semibold text-warning-strong" title="Chega no dia seguinte">+{diasDepois}<span className="sr-only"> dia</span></sup>}
      </span>
      <span className="min-w-0 text-xs leading-5 text-muted-foreground">
        <span className="tabular-nums">{duracaoEmTexto(p.duracaoMin)}</span>
        <span aria-hidden="true"> · </span>
        {conexoes.length === 0
          ? <span className="font-medium text-success">direto</span>
          : <span title={conexoes.map((c) => `${c.onde}${c.min !== null ? ` (${duracaoEmTexto(c.min)} de espera)` : ""}`).join(", ")}>
              {conexoes.length === 1 ? "1 conexão" : `${conexoes.length} conexões`} · <span className="font-mono">{conexoes.map((c) => `${c.onde}${c.min !== null ? ` ${duracaoEmTexto(c.min)}` : ""}`).join(", ")}</span>
            </span>}
      </span>
    </div>
  );
}

export function OpcaoDeVoo({ opcao, perna, diariaCentavos, vagas, indice, onUsar, onUsarTodas, onAbrirLink, abrindoLink, simulado }: {
  opcao: OpcaoAvaliada;
  perna: PernaDaRota;
  diariaCentavos: number | null;
  vagas: VagaDaOpcao[];
  indice: number;
  onUsar?: (vagaId: string) => void;
  /** Registra para TODAS as pendentes da rota, uma por vez (o mesmo modal, em fila). */
  onUsarTodas?: () => void;
  onAbrirLink: () => void;
  abrindoLink: boolean;
  simulado: boolean;
}) {
  const it = opcao.itinerario;
  const { ida, volta } = pernasDaOpcao(it, perna);
  const cia = it.pernas[0]?.segmentos[0]?.companhia ?? it.pernas[0]?.companhia ?? "";
  const nomeCia = Array.from(new Set(it.pernas.map((p) => companhiaDaPerna(p)))).join(" / ");
  const voos = it.pernas.map((p) => voosDaPerna(p)).join("  ·  ");
  const pendentes = vagas.filter((v) => !v.comprada);
  const pagas = vagas.filter((v) => v.comprada && v.valorPagoCentavos);
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    const texto = `${nomeCia} ${voos} — ${formatarMoeda(it.precoCentavos)}`;
    void navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1400); }).catch(() => undefined);
  };
  const destaque = opcao.selos.some((s) => s.tipo === "menor_custo");
  // Só a melhor opção tem o botão cheio; nas outras ele é suave (uma ação primária por vez na tela).
  const usar = destaque ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-brand-soft text-primary hover:bg-primary hover:text-primary-foreground";
  const temTotal = (opcao.diarias !== 0 && !!diariaCentavos) || (opcao.malaCentavos ?? 0) > 0;

  return (
    <li
      className="bpr-opcao pas-bp-chega"
      data-destaque={destaque ? "" : undefined}
      data-absurda={opcao.absurda ? "" : undefined}
      style={{ ["--i" as string]: Math.min(indice, 8) }}
      data-testid={`opcao-${it.id}`}
    >
      <span data-area="cia" className={`inline-flex h-7 w-9 items-center justify-center rounded-md font-mono text-2xs font-bold tracking-wide ${CLASSE_DA_CIA[cia] ?? "bg-muted text-foreground"}`} aria-hidden="true">{cia}</span>

      <div data-area="quem" className="min-w-0">
        <p className="m-0 truncate text-sm font-semibold leading-5 text-foreground">{nomeCia}</p>
        <p className="m-0 truncate font-mono text-2xs leading-4 text-muted-foreground" title={voos}>{voos}</p>
      </div>

      <div data-area="pernas" className="min-w-0 space-y-0.5">
        {ida && <Perna rotulo="Ida" p={ida} />}
        {volta && <Perna rotulo="Volta" p={volta} />}
      </div>

      <div data-area="preco" className="text-right">
        <p className="m-0 whitespace-nowrap text-base font-semibold leading-5 tabular-nums text-foreground" data-testid={`preco-${it.id}`}>{formatarMoeda(it.precoCentavos)}</p>
        {temTotal ? (
          <p className="m-0 whitespace-nowrap text-2xs leading-4 tabular-nums text-muted-foreground"
            title={[opcao.diarias !== 0 && diariaCentavos ? `Diária média do hotel deste evento: ${formatarMoeda(diariaCentavos)}` : "", (opcao.malaCentavos ?? 0) > 0 ? `Mala estimada: ${formatarMoeda(opcao.malaCentavos)}` : ""].filter(Boolean).join(" · ")}>
            total <span className={destaque ? "font-semibold text-success" : "font-medium text-foreground"}>{formatarMoeda(opcao.custoTotalCentavos)}</span>
          </p>
        ) : (
          <p className="m-0 text-2xs leading-4 text-muted-foreground">por pessoa</p>
        )}
      </div>

      <div data-area="rodape" className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {opcao.selos.map((s, i) => (
          <span key={`${s.tipo}-${i}`} className={`inline-flex h-[20px] items-center rounded-md px-1.5 text-2xs font-medium ${COR_DO_SELO[s.tipo]}`}>{s.texto}</span>
        ))}
        {pagas.slice(0, 2).map((v) => {
          const dif = it.precoCentavos - (v.valorPagoCentavos ?? 0);
          const pct = v.valorPagoCentavos ? Math.round((dif / v.valorPagoCentavos) * 100) : 0;
          return (
            <span key={v.id} className="inline-flex h-[20px] items-center gap-1 rounded-md bg-muted px-1.5 text-2xs text-slate-700">
              #{v.numero} pagou {formatarMoeda(v.valorPagoCentavos)} ·
              <span className={dif < 0 ? "font-semibold text-success" : dif > 0 ? "font-semibold text-danger-strong" : ""}>
                hoje {dif === 0 ? "igual" : `${dif < 0 ? "−" : "+"}${formatarMoeda(Math.abs(dif))} (${pct > 0 ? "+" : ""}${pct}%)`}
              </span>
            </span>
          );
        })}
      </div>

      <div className="ml-auto flex items-center justify-end gap-1.5">
        <button type="button" onClick={copiar} className="pas-bp-acao-sec pas-alvo inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Copiar companhia, voos e preço" title="Copiar voos e preço">
          {copiado ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onAbrirLink}
          disabled={abrindoLink}
          className="pas-bp-acao-sec pas-alvo inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-slate-700 hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={simulado ? "Simulação: abre o site da companhia" : "Abre o site de compra (o link é pedido agora)"}
          data-testid={`abrir-companhia-${it.id}`}
        >
          {abrindoLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="bpr-so-largo">Abrir na companhia</span><span className="bpr-so-estreito">Companhia</span>
        </button>
        {onUsar && pendentes.length === 1 && (
          <button type="button" onClick={() => onUsar(pendentes[0].id)} className={`pas-alvo inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${usar} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`} data-testid={`usar-voo-${it.id}`}>
            Usar este voo
          </button>
        )}
        {onUsar && pendentes.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={`pas-alvo inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg pl-3 pr-2 text-xs font-semibold transition-colors ${usar} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`} data-testid={`usar-voo-${it.id}`}>
                Usar este voo<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Registrar para quem?</DropdownMenuLabel>
              {pendentes.map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => onUsar(v.id)} className="gap-2" data-testid={`usar-voo-${it.id}-${v.id}`}>
                  <span className="font-mono text-2xs font-semibold text-primary">#{v.numero}</span>
                  <span className="truncate">{toTitleCase(v.nome)}</span>
                </DropdownMenuItem>
              ))}
              {onUsarTodas && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onUsarTodas} className="items-start gap-2" data-testid={`usar-voo-todas-${it.id}`}>
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium">Para as {pendentes.length} desta rota</span>
                      <span className="block text-2xs leading-4 text-muted-foreground">Abre o registro de cada uma, uma por vez</span>
                    </span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      </div>
    </li>
  );
}
