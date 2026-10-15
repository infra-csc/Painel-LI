/**
 * Uma opção de voo nos resultados (09/10). Leitura na ordem da decisão:
 * companhia e voos → horários de cada perna (com paradas e duração) → preço
 * (e o custo total quando há diária a mais) → selos → ações.
 *
 * "Abrir na companhia" pede o link SÓ no clique (gasta consulta só se não
 * estiver no cache). "Usar este voo" abre o registro da passagem já preenchido.
 */
import { ExternalLink, Loader2, ChevronDown, Copy, Check } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
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
};

function Perna({ rotulo, p }: { rotulo: string; p: PernaDeVoo }) {
  const ini = p.segmentos[0], fim = p.segmentos[p.segmentos.length - 1];
  const diasDepois = Math.round((Date.parse(`${fim.chegada.slice(0, 10)}T00:00:00Z`) - Date.parse(`${ini.partida.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  const escalas = p.segmentos.slice(0, -1).map((s) => s.destino);
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 text-xs leading-5 sm:grid-cols-[48px_86px_minmax(0,1fr)]">
      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground leading-5">{rotulo}</span>
      <span className="hidden tabular-nums text-muted-foreground sm:inline">{diaCurto(ini.partida)}</span>
      <span className="col-start-2 min-w-0 sm:col-start-auto">
        <span className="font-semibold tabular-nums text-foreground">{hhmm(ini.partida)}</span>
        <span className="mx-1 text-muted-foreground" aria-hidden="true">→</span>
        <span className="font-semibold tabular-nums text-foreground">{hhmm(fim.chegada)}</span>
        {diasDepois > 0 && <sup className="ml-0.5 text-2xs font-semibold text-warning-strong" title="Chega no dia seguinte">+{diasDepois}</sup>}
        <span className="text-muted-foreground"> · {duracaoEmTexto(p.duracaoMin)} · </span>
        <span className={escalas.length === 0 ? "font-medium text-success" : "text-muted-foreground"}>
          {escalas.length === 0 ? "direto" : `${escalas.length} ${escalas.length === 1 ? "conexão" : "conexões"} (${escalas.join(", ")})`}
        </span>
      </span>
    </div>
  );
}

export function OpcaoDeVoo({ opcao, perna, diariaCentavos, vagas, indice, onUsar, onAbrirLink, abrindoLink, simulado }: {
  opcao: OpcaoAvaliada;
  perna: PernaDaRota;
  diariaCentavos: number | null;
  vagas: VagaDaOpcao[];
  indice: number;
  onUsar?: (vagaId: string) => void;
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

  return (
    <li
      className={`pas-bp-opcao pas-bp-chega relative rounded-lg border px-3 py-2.5 sm:px-3.5 ${destaque ? "border-success/40 bg-card" : opcao.absurda ? "border-border bg-surface-muted/60" : "border-border bg-card"}`}
      style={{ ["--i" as string]: Math.min(indice, 8) }}
      data-testid={`opcao-${it.id}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-md font-mono text-2xs font-bold tracking-wide ${CLASSE_DA_CIA[cia] ?? "bg-muted text-foreground"}`} aria-hidden="true">{cia}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 min-w-0 text-sm leading-5">
              <span className="font-semibold text-foreground">{nomeCia}</span>
              <span className="ml-1.5 font-mono text-2xs text-muted-foreground">{voos}</span>
            </p>
            <div className="shrink-0 text-right">
              <p className="m-0 text-base font-semibold leading-5 tabular-nums text-foreground" data-testid={`preco-${it.id}`}>{formatarMoeda(it.precoCentavos)}</p>
              {opcao.diarias !== 0 && diariaCentavos ? (
                <p className="m-0 text-2xs leading-4 tabular-nums text-muted-foreground" title={`Diária média do hotel deste evento: ${formatarMoeda(diariaCentavos)}`}>
                  total {formatarMoeda(opcao.custoTotalCentavos)}
                </p>
              ) : (
                <p className="m-0 text-2xs leading-4 text-muted-foreground">por pessoa</p>
              )}
            </div>
          </div>
          <div className="mt-1.5 space-y-0.5">
            {ida && <Perna rotulo="Ida" p={ida} />}
            {volta && <Perna rotulo="Volta" p={volta} />}
          </div>
          {pagas.length > 0 && (
            <p className="m-0 mt-1.5 text-2xs leading-4 text-muted-foreground">
              {pagas.slice(0, 2).map((v) => {
                const dif = it.precoCentavos - (v.valorPagoCentavos ?? 0);
                const pct = v.valorPagoCentavos ? Math.round((dif / v.valorPagoCentavos) * 100) : 0;
                return (
                  <span key={v.id} className="mr-2">
                    #{v.numero} pagou {formatarMoeda(v.valorPagoCentavos)} ·{" "}
                    <span className={dif < 0 ? "font-medium text-success" : dif > 0 ? "font-medium text-danger-strong" : ""}>
                      hoje {dif === 0 ? "igual" : `${dif < 0 ? "−" : "+"}${formatarMoeda(Math.abs(dif))} (${pct > 0 ? "+" : ""}${pct}%)`}
                    </span>
                  </span>
                );
              })}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1">
              {opcao.selos.map((s, i) => (
                <span key={`${s.tipo}-${i}`} className={`inline-flex h-[20px] items-center rounded-md px-1.5 text-2xs font-medium ${COR_DO_SELO[s.tipo]}`}>{s.texto}</span>
              ))}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={copiar} className="pas-bp-acao-sec pas-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Copiar companhia, voos e preço" title="Copiar voos e preço">
                {copiado ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={onAbrirLink}
                disabled={abrindoLink}
                className="pas-bp-acao-sec pas-alvo inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-slate-700 hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={simulado ? "Simulação: abre o site da companhia" : "Abre o site de compra (o link é pedido agora)"}
                data-testid={`abrir-companhia-${it.id}`}
              >
                {abrindoLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="hidden sm:inline">Abrir na companhia</span><span className="sm:hidden">Companhia</span>
              </button>
              {onUsar && pendentes.length === 1 && (
                <button type="button" onClick={() => onUsar(pendentes[0].id)} className="pas-alvo inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`usar-voo-${it.id}`}>
                  Usar este voo
                </button>
              )}
              {onUsar && pendentes.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="pas-alvo inline-flex h-8 items-center gap-1 rounded-lg bg-primary pl-3 pr-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`usar-voo-${it.id}`}>
                      Usar este voo<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Registrar para quem?</DropdownMenuLabel>
                    {pendentes.map((v) => (
                      <DropdownMenuItem key={v.id} onSelect={() => onUsar(v.id)} className="gap-2">
                        <span className="font-mono text-2xs font-semibold text-primary">#{v.numero}</span>
                        <span className="truncate">{toTitleCase(v.nome)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
