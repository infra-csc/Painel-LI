/**
 * Vagas canceladas com custo — o aviso do topo do Espelho e a lista (23/10).
 *
 * Caso real (Night Run Curitiba): o evento mudou de data, as vagas antigas
 * foram canceladas e continuavam com a passagem das datas antigas — o Espelho
 * as misturava com as vagas novas, inclusive no mesmo quarto. Agora a vaga
 * cancelada sai das listas operacionais (servidor; shared/vagas-canceladas.ts)
 * e aparece só AQUI, com o dinheiro que já foi gasto nela: passagem e
 * hospedagem compradas continuam no custo do evento, para Compras revisar
 * reembolso ou remarcação.
 *
 * Fechado, é uma faixa de uma linha ("N vagas canceladas ainda têm passagem
 * ou hospedagem — revisar"); "Ver as vagas" abre a lista no lugar, e "Abrir
 * em Passagens" leva à tela de Passagens já filtrada no evento e nas
 * canceladas.
 */
import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronDown, ExternalLink, Info } from "lucide-react";
import type { TotaisDasCanceladas, VagaCanceladaComCusto } from "@shared/operational-mirror-types";
import { avisoDasCanceladas } from "@shared/vagas-canceladas";
import { cn } from "@/lib/utils";
import { brl } from "./mirror-shared";

const ddmm = (v: string | null | undefined) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : "—");
const periodo = (a: string | null | undefined, b: string | null | undefined) => (a || b ? `${ddmm(a)} → ${ddmm(b)}` : "sem datas");

const ROTULO_DA_PASSAGEM: Record<string, string> = { pendente: "pendente", comprada: "comprada", confirmada: "confirmada", cancelada: "cancelada" };
const ROTULO_DA_HOSPEDAGEM: Record<string, string> = { pendente: "pendente", reservada: "reservada", confirmada: "confirmada", cancelada: "cancelada" };

function Registro({ titulo, datas, detalhe, valor, viva }: { titulo: string; datas: string; detalhe: string | null; valor: number; viva: boolean }) {
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
      <span className="font-medium text-foreground">{titulo}</span>
      <span className="tabular-nums text-muted-foreground">{datas}</span>
      <span className="tabular-nums text-foreground">· {brl(valor)}</span>
      {/* No celular o detalhe desce inteiro para a linha de baixo, em vez de quebrar no meio. */}
      {detalhe && <span className={cn("basis-full sm:basis-auto", viva ? "text-warning" : "text-muted-foreground")}><span className="hidden sm:inline">· </span>{detalhe}</span>}
    </p>
  );
}

function LinhaDaVaga({ v }: { v: VagaCanceladaComCusto }) {
  const extras = v.bagagemCentavos + v.uberCentavos + v.locacaoCentavos;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-3 lg:grid-cols-[minmax(200px,1.1fr)_minmax(0,2fr)_auto] lg:items-center"
      data-testid={`vaga-cancelada-${v.teamInclusionId}`}>
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
          <span className="break-words font-medium text-foreground">{v.collaborator.fullName}</span>
          {v.inclusionNumber != null && <span className="text-xs tabular-nums text-muted-foreground">#{v.inclusionNumber}</span>}
        </p>
        <p className="truncate text-xs capitalize text-muted-foreground">
          {v.function.area || v.function.name || "—"} · escala {periodo(v.schedule.startDate, v.schedule.endDate)}
        </p>
      </div>
      <div className="col-span-2 min-w-0 space-y-0.5 lg:col-span-1 lg:row-start-1 lg:col-start-2">
        {v.passagem && (
          <Registro titulo="Passagem" datas={periodo(v.passagem.ida, v.passagem.volta)} viva={v.passagem.viva}
            detalhe={v.passagem.viva
              ? `${v.passagem.status ? ROTULO_DA_PASSAGEM[v.passagem.status] ?? v.passagem.status : "registrada"} — ainda vale`
              : "cancelada"}
            valor={v.passagem.valorCentavos} />
        )}
        {v.hospedagem && (
          <Registro titulo="Hospedagem" datas={periodo(v.hospedagem.checkIn, v.hospedagem.checkOut)} viva={v.hospedagem.viva}
            detalhe={[v.hospedagem.hotelName || "hotel a definir",
              v.hospedagem.viva ? `${v.hospedagem.status ? ROTULO_DA_HOSPEDAGEM[v.hospedagem.status] ?? v.hospedagem.status : "registrada"} — ainda vale` : "cancelada"].join(" · ")}
            valor={v.hospedagem.valorCentavos} />
        )}
        {extras > 0 && <p className="text-xs text-muted-foreground">Bagagem, Uber e locação · <span className="tabular-nums text-foreground">{brl(extras)}</span></p>}
      </div>
      <div className="col-start-2 row-start-1 flex flex-col items-end gap-1 lg:col-start-3">
        <span className="text-sm font-semibold tabular-nums text-foreground">{brl(v.totalCentavos)}</span>
        <span className={cn("whitespace-nowrap rounded px-1.5 text-2xs font-medium leading-5",
          v.revisar ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
          {v.revisar ? "revisar" : "registros cancelados"}
        </span>
      </div>
    </li>
  );
}

export function VagasCanceladas({ vagas, totais, eventId }: {
  vagas: VagaCanceladaComCusto[] | undefined;
  totais: TotaisDasCanceladas | undefined;
  eventId: string;
}) {
  const [aberta, setAberta] = useState(false);
  if (!vagas || vagas.length === 0) return null;
  const revisar = totais?.revisar ?? vagas.filter((v) => v.revisar).length;
  const total = totais?.total ?? vagas.reduce((n, v) => n + v.totalCentavos, 0);
  const manchete = avisoDasCanceladas(revisar)
    ?? `${vagas.length} ${vagas.length === 1 ? "vaga cancelada tem" : "vagas canceladas têm"} custo registrado`;
  const tom = revisar > 0;
  const idDaLista = `vagas-canceladas-lista-${eventId}`;
  const passagens = `/tickets?event=${encodeURIComponent(eventId)}&inclusion=cancelado`;
  return (
    <section aria-label="Vagas canceladas com custo"
      className={cn("pas-entra overflow-hidden rounded-xl border bg-card shadow-1", tom ? "border-warning/35" : "border-border")}
      data-testid="vagas-canceladas">
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5", tom ? "bg-warning-soft/70" : "bg-surface-muted")}>
        <p className="flex min-w-0 flex-1 basis-[260px] items-start gap-2 text-sm">
          {tom
            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            : <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="min-w-0">
            <span className={cn("font-semibold", tom ? "text-warning" : "text-foreground")} data-testid="vagas-canceladas-aviso">{manchete}</span>
            <span className={cn("block text-xs sm:ml-1.5 sm:inline", tom ? "text-warning/90" : "text-muted-foreground")}>
              {brl(total)} continuam no custo do evento, fora das listas.
            </span>
          </span>
        </p>
        <span className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setAberta((a) => !a)} aria-expanded={aberta} aria-controls={idDaLista}
            className="esp-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="vagas-canceladas-abrir">
            {aberta ? "Ocultar" : vagas.length === 1 ? "Ver a vaga" : `Ver as ${vagas.length} vagas`}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", aberta && "rotate-180")} aria-hidden="true" />
          </button>
          <Link href={passagens}
            className="esp-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="vagas-canceladas-passagens">
            Abrir em Passagens <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </span>
      </div>
      {aberta && (
        <div id={idDaLista} data-testid="vagas-canceladas-lista">
          <ul className="divide-y divide-border/70 border-t border-border">
            {vagas.map((v) => <LinhaDaVaga key={v.teamInclusionId} v={v} />)}
          </ul>
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border bg-surface-muted px-4 py-2 text-xs text-muted-foreground">
            <span>Somado no custo do evento e no rateio; fora da grade, dos quartos, do Uber e das pendências.</span>
            <span className="font-semibold tabular-nums text-foreground">Total {brl(total)}</span>
          </p>
        </div>
      )}
    </section>
  );
}
