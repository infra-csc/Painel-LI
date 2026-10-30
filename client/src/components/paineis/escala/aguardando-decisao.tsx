/**
 * Aguardando decisão por evento (Painel da escala, 30/10) — "aguardando
 * aprovação (atrasados) por evento" do dono.
 *
 * Para cada evento futuro: o que espera a área validar, o aprovador, o gestor
 * da cenotécnica, a análise da troca e a decisão do pedido de ajuste — há
 * quantos dias, quem precisa agir e o atalho para a tela onde se resolve. Ao
 * lado, quem está segurando mais vagas (para saber quem cobrar primeiro).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, UserRound } from "lucide-react";
import { DIAS_ESPERA_ATRASADA, rotuloDaDataDoEvento, textoDePrazo } from "@/components/scaling/scaling-analytics-data";
import { cn } from "@/lib/utils";
import {
  ROTULO_DA_ESPERA, SEM_RESPONSAVEL, cargaPorResponsavel, plural, textoHaDias,
  type EsperaDoEvento, type GrupoDeEspera, type TipoDeEspera,
} from "./painel-escala-dados";
import { BOTAO_PEQUENO, Barra, Secao, Segmentos } from "./comum-escala";

const POR_VEZ = 12;

/** Onde cada espera se resolve. Gestor e troca abrem o bloco da fila da Escalação. */
export function hrefDaEspera(tipo: TipoDeEspera, eventId: string): string {
  const ev = encodeURIComponent(eventId);
  switch (tipo) {
    case "validacao": return `/scaling-validation?eventId=${ev}`;
    case "aprovacao":
    case "ajuste": return `/scaling-approval?eventId=${ev}`;
    case "gestor": return `/scaling?eventId=${ev}&fila=gestor`;
    case "troca": return `/scaling?eventId=${ev}&fila=troca`;
  }
}

const ROTULO_DO_LINK: Record<TipoDeEspera, string> = {
  validacao: "Validação",
  aprovacao: "Aprovação",
  ajuste: "Aprovação",
  gestor: "Escalação",
  troca: "Escalação",
};

const COR_DA_ESPERA: Record<TipoDeEspera, string> = {
  validacao: "var(--neutral)",
  aprovacao: "var(--primary)",
  gestor: "var(--danger-strong)",
  troca: "var(--info-strong)",
  ajuste: "var(--warning-strong)",
};

function quemAgeEmTexto(g: GrupoDeEspera): string {
  const nomes = g.quemAge.slice(0, 2).map((q) => (g.quemAge.length > 1 ? `${q.nome} (${q.vagas})` : q.nome));
  return `${nomes.join(" · ")}${g.quemAge.length > 2 ? ` +${g.quemAge.length - 2}` : ""}`;
}

function LinhaDoGrupo({ g, eventId }: { g: GrupoDeEspera; eventId: string }) {
  const n = g.vagas.length;
  const espera = g.diasMaisAntiga;
  const prazoVencido = (g.atrasoDoPrazo ?? 0) > 0;
  const semResponsavel = g.quemAge.every((q) => q.nome === SEM_RESPONSAVEL);
  return (
    <li className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[3px_minmax(0,1.5fr)_minmax(0,1fr)_124px_112px]" data-testid={`espera-${g.tipo}-${eventId}`}>
      <span aria-hidden="true" className="row-span-2 h-full min-h-7 w-[3px] rounded-full sm:row-span-1 sm:h-7" style={{ background: COR_DA_ESPERA[g.tipo] }} />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">
          <span className="font-semibold tabular-nums">{n}</span> {plural(n, "vaga", "vagas")} · {ROTULO_DA_ESPERA[g.tipo]}
        </span>
        <span className="block truncate text-2xs text-muted-foreground" title={g.funcoes.join(", ")}>
          {g.funcoes.slice(0, 3).join(", ")}{g.funcoes.length > 3 ? ` +${g.funcoes.length - 3}` : ""}
        </span>
      </span>
      <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-1.5 text-xs sm:col-start-auto sm:row-start-auto" title={g.quemAge.map((q) => `${q.nome}: ${q.vagas}`).join("\n")}>
        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn("truncate", semResponsavel ? "font-medium text-warning" : "text-slate-700")} data-testid={`quem-age-${g.tipo}-${eventId}`}>
          {quemAgeEmTexto(g)}
        </span>
      </span>
      <span className="col-start-3 row-start-1 text-right text-xs leading-tight sm:col-start-auto sm:row-start-auto">
        <span className={cn("block whitespace-nowrap", (espera ?? 0) >= DIAS_ESPERA_ATRASADA ? "font-semibold text-danger" : "text-slate-600")}>
          {espera === null ? "sem data" : textoHaDias(espera)}
        </span>
        {prazoVencido && (
          <span className="block whitespace-nowrap text-2xs font-medium text-danger">prazo vencido há {g.atrasoDoPrazo}d</span>
        )}
      </span>
      <Link href={hrefDaEspera(g.tipo, eventId)} className={cn(BOTAO_PEQUENO, "col-start-3 row-start-2 justify-self-end sm:col-start-auto sm:row-start-auto")} data-testid={`link-espera-${g.tipo}-${eventId}`}>
        {ROTULO_DO_LINK[g.tipo]} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function AguardandoDecisao({ esperas }: { esperas: EsperaDoEvento[] }) {
  const [filtro, setFiltro] = useState<"atrasados" | "todos">("atrasados");
  const [quantos, setQuantos] = useState(POR_VEZ);
  const nAtrasados = esperas.filter((e) => e.atrasado).length;
  const lista = useMemo(() => {
    if (filtro === "todos") return esperas;
    // Só os grupos atrasados de cada evento.
    return esperas
      .filter((e) => e.atrasado)
      .map((e) => ({ ...e, grupos: e.grupos.filter((g) => g.atrasado) }));
  }, [esperas, filtro]);
  const carga = useMemo(() => cargaPorResponsavel(lista), [lista]);
  const maxCarga = Math.max(1, ...carga.map((c) => c.vagas));
  const visiveis = lista.slice(0, quantos);

  const filtros = (
    <Segmentos
      rotulo="O que mostrar"
      valor={filtro}
      onChange={(k) => { setFiltro(k); setQuantos(POR_VEZ); }}
      opcoes={[["atrasados", `Atrasados (${nAtrasados})`], ["todos", `Tudo esperando (${esperas.length})`]] as const}
      testId="filtro-espera"
    />
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Secao
        titulo="Aguardando decisão por evento"
        descricao={<>Atrasado: esperando há {DIAS_ESPERA_ATRASADA} dias ou mais, ou com o prazo da etapa vencido. Validação conta do envio para a área; Aprovação, da validação.</>}
        acoes={filtros}
        testId="secao-esperas"
      >
        {visiveis.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="esperas-vazio">
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-foreground">
              {filtro === "atrasados" && esperas.length > 0 ? "Nada atrasado esperando decisão" : "Nada esperando decisão"}
            </p>
            <p className="mt-1 max-w-[440px] text-sm text-muted-foreground">
              {filtro === "atrasados" && esperas.length > 0
                ? `${esperas.length} ${plural(esperas.length, "evento tem", "eventos têm")} vaga esperando, todas dentro do prazo.`
                : "Nenhum evento futuro tem vaga em validação, aprovação, com o gestor, em troca ou com pedido de ajuste."}
            </p>
          </div>
        ) : (
          <ul>
            {visiveis.map((e) => (
              <li key={e.evento.eventId} className="border-b border-border last:border-b-0" data-testid={`evento-espera-${e.evento.eventId}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 bg-surface-muted/60 px-4 py-2">
                  <p className="min-w-0 flex-1 basis-full truncate text-sm font-semibold text-foreground sm:basis-auto" title={e.evento.nome}>{e.evento.nome}</p>
                  <p className="text-2xs text-muted-foreground">
                    Evento {rotuloDaDataDoEvento(e.evento)} · {textoDePrazo(e.evento.prazoDias)} · {e.grupos.reduce((s, g) => s + g.vagas.length, 0)} esperando
                  </p>
                </div>
                <ul className="divide-y divide-border">
                  {e.grupos.map((g) => <LinhaDoGrupo key={g.tipo} g={g} eventId={e.evento.eventId} />)}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {lista.length > quantos && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-2.5">
            <span className="text-xs tabular-nums text-slate-600">Mostrando {visiveis.length} de {lista.length} eventos</span>
            <button type="button" onClick={() => setQuantos((n) => n + POR_VEZ)} className="h-[26px] rounded-md border border-border bg-card px-2.5 text-xs font-medium text-primary hover:border-primary hover:bg-brand-soft" data-testid="button-mais-esperas">
              Mostrar mais
            </button>
          </div>
        )}
      </Secao>

      <Secao titulo="Quem precisa agir" descricao="Vagas esperando cada pessoa, a mais carregada primeiro." testId="secao-quem-age">
        {carga.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Ninguém com decisão pendente.</p>
        ) : (
          <ul className="max-h-[520px] space-y-3 overflow-y-auto px-4 py-4">
            {carga.map((c) => (
              <li key={c.nome} data-testid={`carga-${c.nome}`}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className={cn("min-w-0 truncate font-medium", c.nome === SEM_RESPONSAVEL ? "text-warning" : "text-slate-700")} title={c.nome}>{c.nome}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.vagas}</span> · {c.eventos} {plural(c.eventos, "evento", "eventos")}
                  </span>
                </div>
                <div className="mt-1.5 flex">
                  <Barra
                    max={maxCarga}
                    rotulo={`${c.nome}: ${c.vagas} vagas, ${c.atrasadas} atrasadas`}
                    segmentos={[
                      { valor: c.atrasadas, cor: "var(--danger-strong)", titulo: `${c.atrasadas} atrasadas` },
                      { valor: c.vagas - c.atrasadas, cor: "var(--neutral)", titulo: `${c.vagas - c.atrasadas} no prazo` },
                    ]}
                  />
                </div>
                {c.maiorEspera > 0 && <p className="mt-1 text-2xs text-muted-foreground">mais antiga {textoHaDias(c.maiorEspera)}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-danger-strong" />atrasadas</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-neutral" />no prazo</span>
        </p>
      </Secao>
    </div>
  );
}
