/**
 * "Alterações aprovadas para você remarcar" (07/10) — o bloco de destaque
 * acima da lista de Passagens (e, na etapa seguinte, de Hospedagem).
 *
 * Pedido de Compras: "quando eu voltar, preciso saber o que mudou e em qual
 * prova, para eu poder atuar". Por isso o bloco:
 *  - só existe quando HÁ aviso pendente do tipo da tela (nada de faixa vazia);
 *  - agrupa por prova, a mais próxima primeiro (é a mais urgente de remarcar);
 *  - mostra o "de → para" inteiro, quem pediu e por quê, quem aprovou e quando;
 *  - tem as duas ações do trabalho: abrir a passagem da vaga e "Já atuei".
 *
 * Com 15 avisos ele NÃO empurra a lista para fora da tela: o corpo tem altura
 * máxima e rola por dentro, e o bloco pode ser recolhido (lembrado neste
 * navegador). Recolhido, o cabeçalho continua dizendo quantos e em quantas
 * provas — some o detalhe, não a pendência.
 */
import { useId, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, History, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemDoAviso } from "./item-do-aviso";
import { AvisosResolvidosDialog } from "./avisos-resolvidos";
import {
  dataDaProva, distanciaDaProva, useAvisosPendentes,
  type AvisoDeAlteracao, type TipoDeAviso,
} from "./use-avisos-de-alteracao";

const TEXTO: Record<TipoDeAviso, { titulo: string; sub: string; abrir: string }> = {
  passagem: {
    titulo: "Alterações aprovadas para você remarcar",
    sub: "Datas ou horários mudaram depois que a passagem foi registrada.",
    abrir: "Abrir passagem",
  },
  hospedagem: {
    titulo: "Alterações aprovadas para rever a hospedagem",
    sub: "As noites mudaram depois que a hospedagem foi registrada.",
    abrir: "Abrir hospedagem",
  },
};

const chaveRecolhido = (tipo: TipoDeAviso) => `pas:avisos-recolhido:${tipo}`;
function lerRecolhido(tipo: TipoDeAviso): boolean {
  try { return localStorage.getItem(chaveRecolhido(tipo)) === "1"; } catch { return false; }
}
function gravarRecolhido(tipo: TipoDeAviso, v: boolean) {
  try { localStorage.setItem(chaveRecolhido(tipo), v ? "1" : "0"); } catch { /* conforto, não estado */ }
}

interface GrupoDaProva { eventId: string; nome: string; data: string | null; avisos: AvisoDeAlteracao[] }

/** Por prova, a mais próxima primeiro; dentro dela, a ordem do servidor (aprovação mais antiga antes). */
export function agruparPorProva(avisos: readonly AvisoDeAlteracao[]): GrupoDaProva[] {
  const m = new Map<string, GrupoDaProva>();
  for (const a of avisos) {
    const g = m.get(a.eventId) ?? { eventId: a.eventId, nome: a.eventName ?? "Evento", data: a.eventStartDate, avisos: [] };
    g.avisos.push(a);
    m.set(a.eventId, g);
  }
  return Array.from(m.values()).sort((x, y) => String(x.data ?? "9999").localeCompare(String(y.data ?? "9999")) || x.nome.localeCompare(y.nome));
}

const vagasTxt = (n: number) => `${n} ${n === 1 ? "vaga" : "vagas"}`;
const provasTxt = (n: number) => `${n} ${n === 1 ? "prova" : "provas"}`;

export function BlocoDeAvisos({ tipo, onAbrir, className }: {
  tipo: TipoDeAviso;
  /** Abre o registro da vaga (modal da passagem/hospedagem). */
  onAbrir?: (aviso: AvisoDeAlteracao) => void;
  className?: string;
}) {
  const { ativo, avisos, erro, tentarDeNovo } = useAvisosPendentes(tipo);
  const [recolhido, setRecolhido] = useState(() => lerRecolhido(tipo));
  const [verResolvidas, setVerResolvidas] = useState(false);
  const grupos = useMemo(() => agruparPorProva(avisos), [avisos]);
  const corpoId = useId();
  const tituloId = useId();
  const t = TEXTO[tipo];

  if (!ativo) return null;
  // Erro de rede/servidor: uma linha discreta — pode haver aviso e não dá para
  // fingir que não há. Sem aviso e sem erro, o bloco não existe.
  if (avisos.length === 0) {
    if (!erro) return null;
    return (
      <div role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-danger/25 bg-danger-soft/50 px-4 py-2.5 text-xs text-danger", className)}>
        <CalendarClock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="mr-auto">Não foi possível conferir as alterações aprovadas.</span>
        <button type="button" onClick={tentarDeNovo} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md font-medium hover:bg-danger-soft">
          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />Tentar de novo
        </button>
      </div>
    );
  }

  const alternar = () => setRecolhido((v) => { gravarRecolhido(tipo, !v); return !v; });
  const resumo = grupos.length > 1 ? `${vagasTxt(avisos.length)} em ${provasTxt(grupos.length)}` : `${vagasTxt(avisos.length)} · ${grupos[0]?.nome ?? ""}`;

  return (
    <section
      aria-labelledby={tituloId}
      className={cn("pas-avisos pas-entra relative rounded-xl border border-warning/35 bg-card overflow-hidden", className)}
      data-testid={`bloco-avisos-${tipo}`}
    >
      {/* Filete à esquerda: o mesmo sinal da linha da tabela ("espera você"). */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-warning-strong" />
      <header className="flex items-center gap-3 pl-4 pr-2 py-2.5 bg-warning-soft/45">
        <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-card text-warning-strong shadow-1">
          <CalendarClock className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {/* A contagem vai no fluxo do texto: quando o título quebra no celular,
              ela acompanha a última palavra em vez de cair sozinha numa linha. */}
          <h2 id={tituloId} className="m-0 text-sm font-semibold leading-5 text-foreground">
            {t.titulo}
            <span className="ml-2 inline-flex items-center justify-center align-[1px] min-w-[22px] h-5 px-1.5 rounded-full bg-warning text-2xs font-semibold tabular-nums text-white" data-testid="avisos-contagem">
              {avisos.length}
            </span>
          </h2>
          <p className="m-0 text-xs leading-4 text-warning line-clamp-2 sm:truncate">{recolhido ? resumo : t.sub}</p>
        </div>
        <button
          type="button"
          onClick={() => setVerResolvidas(true)}
          className="pas-alvo hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="avisos-ver-resolvidas"
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />Ver resolvidas
        </button>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-controls={corpoId}
          aria-label={recolhido ? "Mostrar as alterações" : "Recolher as alterações"}
          title={recolhido ? "Mostrar" : "Recolher"}
          className="pas-alvo inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-md text-slate-600 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="avisos-recolher"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", recolhido ? "-rotate-90" : "rotate-0")} aria-hidden="true" />
        </button>
      </header>

      <div id={corpoId} hidden={recolhido} className="border-t border-warning/25">
        <div className="max-h-[min(340px,40dvh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {grupos.map((g) => (
            <section key={g.eventId} aria-label={`${g.nome}${g.data ? `, ${dataDaProva(g.data)}` : ""}`}>
              {/* Cabeçalho da prova gruda no topo do corpo ao rolar — a pessoa
                  nunca perde de vista em qual prova está o aviso. */}
              <h3 className="sticky top-0 z-[1] m-0 flex flex-wrap items-baseline gap-x-2 border-b border-border bg-surface-muted/95 px-4 py-1.5 text-xs font-semibold text-foreground backdrop-blur-[2px]">
                {g.nome}
                {g.data && (
                  <span className="font-normal text-muted-foreground">
                    {dataDaProva(g.data)} · {distanciaDaProva(g.data)}
                  </span>
                )}
                <span className="ml-auto font-normal text-muted-foreground tabular-nums">{vagasTxt(g.avisos.length)}</span>
              </h3>
              <ul className="m-0 p-0 list-none divide-y divide-border">
                {g.avisos.map((a) => (
                  <li key={a.id} className="pas-aviso-linha">
                    <ItemDoAviso aviso={a} onAbrir={onAbrir} rotuloAbrir={t.abrir} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {/* No celular "Ver resolvidas" mora aqui embaixo (o cabeçalho não tem espaço). */}
        <div className="sm:hidden border-t border-border bg-surface-muted px-4 py-1.5">
          <button type="button" onClick={() => setVerResolvidas(true)} className="pas-alvo inline-flex items-center gap-1.5 h-8 text-xs font-medium text-primary">
            <History className="w-3.5 h-3.5" aria-hidden="true" />Ver resolvidas
          </button>
        </div>
      </div>

      <AvisosResolvidosDialog tipo={tipo} aberto={verResolvidas} onAbertoChange={setVerResolvidas} />
    </section>
  );
}

/**
 * Acesso às resolvidas quando NÃO há bloco (nenhuma pendente). Mesmo diálogo;
 * fica na barra da tela, discreto, só para quem é da logística.
 */
export function BotaoAvisosResolvidos({ tipo, className }: { tipo: TipoDeAviso; className?: string }) {
  const { ativo, avisos } = useAvisosPendentes(tipo);
  const [aberto, setAberto] = useState(false);
  if (!ativo || avisos.length > 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Alterações aprovadas já resolvidas"
        /* Só o ícone: na barra da tela o rótulo empurrava as ações para uma segunda linha. */
        aria-label="Alterações resolvidas"
        className={cn("pas-alvo inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-border bg-card text-slate-600 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        data-testid="avisos-resolvidas-barra"
      >
        <History className="w-4 h-4" aria-hidden="true" />
      </button>
      <AvisosResolvidosDialog tipo={tipo} aberto={aberto} onAbertoChange={setAberto} />
    </>
  );
}

export default BlocoDeAvisos;
