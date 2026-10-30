/**
 * Visão geral (30/10) — um bloco de atrasos por evento: Passagens, Hotéis,
 * Escala ou Validação e aprovação. Uma linha por evento futuro com alguma
 * etapa do bloco vencida (vermelho) ou vencendo em até 3 dias (âmbar), a pior
 * primeiro; a linha inteira leva à tela de trabalho já no evento.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DIAS_PADRAO, type DiasDosPrazos } from "@shared/prazos-da-escala";
import type { EtapaDoQuadro } from "@/components/scaling/scaling-analytics-data";
import { O_QUE_FALTA, textoAteOEvento } from "@/components/scaling/scaling-analytics-data";
import {
  ROTULO_DA_ETAPA, plural, textoDaEtapa, textoDaSituacao, totaisDoBloco,
  type AtrasoDaEtapa, type EventoComAtraso,
} from "../comum/paineis-dados";
import { AvisoDoBloco, CartaoDoPainel, PilulaDoPrazo } from "../comum/ui";

const LINHAS_POR_VEZ = 6;

const dm = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` : "—");

/** "3 sem nome  [7 dias de atraso]  prazo 09/10" — a etapa (Colaborador definido…) vai no title. */
function LinhaDaEtapa({ a, dias }: { a: AtrasoDaEtapa; dias: DiasDosPrazos }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1" title={`${ROTULO_DA_ETAPA[a.etapa]}: prazo ${dm(a.prazo)} (D-${dias[a.etapa]})`}>
      <span className="text-sm text-foreground">
        <span className="font-semibold tabular-nums">{a.paradas}</span>{" "}
        <span className="text-slate-700">{O_QUE_FALTA[a.etapa]}</span>
      </span>
      <PilulaDoPrazo situacao={a.situacao}>{textoDaSituacao(a)}</PilulaDoPrazo>
      <span className="text-2xs tabular-nums text-muted-foreground">prazo {dm(a.prazo)}</span>
      {a.aindaAntes > 0 && (
        <span className="text-2xs text-warning" data-testid="ainda-antes">
          + {plural(a.aindaAntes, "vaga ainda sem escala confirmada", "vagas ainda sem escala confirmada")}
        </span>
      )}
    </span>
  );
}

export function BlocoDeAtrasos({ id, titulo, icone, etapas, lista, dias = DIAS_PADRAO, destino, vazio, rodape, testId }: {
  id: string;
  titulo: string;
  icone: LucideIcon;
  etapas: readonly EtapaDoQuadro[];
  lista: EventoComAtraso[];
  dias?: DiasDosPrazos;
  /** Para onde a linha do evento leva (a tela de trabalho já filtrada). */
  destino: (e: EventoComAtraso) => { href: string; tela: string };
  vazio: string;
  rodape?: React.ReactNode;
  testId: string;
}) {
  const [todos, setTodos] = useState(false);
  const t = totaisDoBloco(lista);
  const visiveis = todos ? lista : lista.slice(0, LINHAS_POR_VEZ);
  const prazos = etapas.map((e) => `${ROTULO_DA_ETAPA[e]} D-${dias[e]}`).join(" · ");
  const tom = t.vagasAtrasadas > 0 ? "danger" : t.vagasVencendo > 0 ? "warning" : "success";

  return (
    <CartaoDoPainel
      id={id}
      icone={icone}
      tom={tom}
      titulo={titulo}
      subtitulo={<>Prazo contado da data do evento · {prazos}</>}
      testId={testId}
      contagem={
        <span className="block leading-tight">
          <span className={`block text-xl font-semibold tabular-nums ${t.vagasAtrasadas > 0 ? "text-danger" : t.vagasVencendo > 0 ? "text-warning" : "text-success"}`} data-testid={`${testId}-total`}>
            {t.vagasAtrasadas > 0 ? t.vagasAtrasadas : t.vagasVencendo}
          </span>
          <span className="block text-2xs text-muted-foreground">
            {t.vagasAtrasadas > 0 ? "fora do prazo" : t.vagasVencendo > 0 ? "vencendo" : "em dia"}
          </span>
        </span>
      }
      acao={rodape}
    >
      {lista.length === 0 ? (
        <AvisoDoBloco testId={`${testId}-vazio`}>{vazio}</AvisoDoBloco>
      ) : (
        <>
          <p className="border-b border-border bg-surface-muted/40 px-4 py-1.5 text-2xs text-slate-600">
            {t.vagasAtrasadas > 0 && <><span className="font-semibold text-danger">{plural(t.vagasAtrasadas, "vaga", "vagas")}</span> fora do prazo em {plural(t.eventosAtrasados, "evento", "eventos")}{t.maiorAtraso > 0 ? ` · até ${plural(t.maiorAtraso, "dia", "dias")} de atraso` : ""}</>}
            {t.vagasAtrasadas > 0 && t.vagasVencendo > 0 && " · "}
            {t.vagasVencendo > 0 && <><span className="font-semibold text-warning">{plural(t.vagasVencendo, "vaga", "vagas")}</span> vencendo em até 3 dias</>}
          </p>
          <ul className="m-0 p-0">
            {visiveis.map((e) => {
              const d = destino(e);
              return (
                <li key={e.eventId} className="list-none">
                  <Link
                    href={d.href}
                    className="group flex items-start gap-3 border-b border-border px-4 py-3 no-underline last:border-b-0 hover:bg-surface-muted focus-visible:bg-brand-soft focus-visible:outline-none"
                    aria-label={`${e.nome}: ${e.etapas.map((a) => `${textoDaEtapa(a)}, ${textoDaSituacao(a)}`).join("; ")}. Abrir em ${d.tela}`}
                    data-testid={`${testId}-evento-${e.eventId}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:flex-nowrap">
                        {/* No celular o nome quebra a linha (truncado sumia o que distingue os eventos). */}
                        <span className="min-w-0 break-words text-sm font-semibold text-foreground sm:truncate" title={e.nome}>{e.nome}</span>
                        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{e.data} · {textoAteOEvento(e.diasAteOEvento)}</span>
                      </span>
                      <span className="mt-1 flex flex-col gap-1">
                        {e.etapas.map((a) => <LinhaDaEtapa key={a.etapa} a={a} dias={dias} />)}
                      </span>
                    </span>
                    <span className="mt-0.5 hidden shrink-0 items-center gap-0.5 whitespace-nowrap text-2xs font-medium text-primary sm:inline-flex">
                      {d.tela}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {lista.length > LINHAS_POR_VEZ && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="border-t border-border px-4 py-2 text-left text-xs font-medium text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
              aria-expanded={todos}
              data-testid={`${testId}-mais`}
            >
              {todos ? "Mostrar menos" : `Mostrar todos os ${lista.length} eventos`}
            </button>
          )}
        </>
      )}
    </CartaoDoPainel>
  );
}
