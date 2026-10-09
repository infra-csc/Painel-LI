/**
 * Seletor de evento da barra do Espelho Operacional (31/08; redesenho 07/10).
 *
 * O nome do evento é o gatilho do próprio seletor — em vez de um combobox
 * genérico com rótulo "Evento" acima, que gastava uma linha para dizer o que o
 * conteúdo já diz. Embaixo do nome, numa linha miúda, o que situa o evento
 * (datas, pessoas, local): cabe nos 56px da barra e não empurra as ações.
 *
 * A lista anda pelo teclado (↑ ↓ Enter), como qualquer seletor do app.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventoDoSeletor {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  /** Texto curto à direita do item ("em andamento", "encerrado"…). */
  situacao?: string | null;
}

export function SeletorDeEvento({ eventos, valor, aoEscolher, formatarPeriodo, detalhe }: {
  eventos: EventoDoSeletor[];
  valor: string;
  aoEscolher: (id: string) => void;
  /** A tela decide como escrever o período — a barra só o exibe. */
  formatarPeriodo: (e: EventoDoSeletor) => string;
  /** Segunda linha do gatilho (datas · pessoas · local). */
  detalhe?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [realce, setRealce] = useState(0);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);
  const listaRef = useRef<HTMLUListElement | null>(null);

  const atual = eventos.find((e) => e.id === valor);

  // Fecha ao clicar fora ou no Esc — um dropdown que só fecha no próprio
  // gatilho fica preso quando o clique vai para a grade atrás.
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); gatilhoRef.current?.focus(); } };
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", clique); document.removeEventListener("keydown", tecla); };
  }, [aberto]);

  useEffect(() => { if (aberto) buscaRef.current?.focus(); }, [aberto]);

  const filtrados = busca.trim()
    ? eventos.filter((e) => e.name.toLowerCase().includes(busca.trim().toLowerCase()))
    : eventos;

  // Ao abrir, o realce começa no evento atual; ao buscar, no primeiro resultado.
  useEffect(() => {
    if (!aberto) return;
    const i = busca.trim() ? 0 : Math.max(0, filtrados.findIndex((e) => e.id === valor));
    setRealce(i);
  }, [aberto, busca]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${realce}"]`)?.scrollIntoView({ block: "nearest" });
  }, [realce]);

  const escolher = (id: string) => { aoEscolher(id); setAberto(false); setBusca(""); gatilhoRef.current?.focus(); };

  const teclasDaBusca = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setRealce((i) => Math.min(filtrados.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setRealce((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const alvo = filtrados[realce]; if (alvo) escolher(alvo.id); }
  };

  return (
    <div ref={caixaRef} className="relative min-w-0 shrink">
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        title={atual ? [atual.name, detalhe].filter(Boolean).join(" — ") : undefined}
        className={cn(
          "group flex h-[42px] max-w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[300px] min-[1340px]:max-w-[340px] 2xl:max-w-[460px]",
          aberto && "bg-muted",
        )}
        data-testid="mirror-event-trigger"
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-semibold leading-5", atual ? "text-foreground" : "text-muted-foreground")}>
            {atual?.name ?? "Selecione um evento"}
          </span>
          {detalhe && atual && (
            <span className="block truncate text-2xs leading-4 tabular-nums text-muted-foreground">{detalhe}</span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", aberto && "rotate-180")} aria-hidden="true" />
      </button>

      {aberto && (
        <div
          className="pas-sobe absolute left-0 top-[46px] z-[60] w-[420px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border bg-card shadow-3"
          data-testid="mirror-event-dropdown"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={teclasDaBusca}
              placeholder="Buscar evento…"
              aria-label="Buscar evento"
              aria-controls="esp-lista-eventos"
              aria-activedescendant={filtrados[realce] ? `esp-evento-${filtrados[realce].id}` : undefined}
              className="h-6 w-full rounded-sm bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {busca && (
              <button type="button" onClick={() => { setBusca(""); buscaRef.current?.focus(); }} aria-label="Limpar busca"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <ul ref={listaRef} id="esp-lista-eventos" role="listbox" aria-label="Eventos" className="max-h-[300px] overflow-y-auto py-1">
            {filtrados.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum evento com esse nome.</li>
            )}
            {filtrados.map((e, i) => {
              const ativo = e.id === valor;
              return (
                <li key={e.id}
                  id={`esp-evento-${e.id}`}
                  role="option"
                  aria-selected={ativo}
                  data-indice={i}
                  onMouseEnter={() => setRealce(i)}
                  onClick={() => escolher(e.id)}
                  className={cn(
                    "mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors",
                    i === realce ? "bg-muted" : "",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", ativo ? "font-semibold text-primary" : "font-medium text-foreground")}>{e.name}</span>
                    <span className="block text-2xs tabular-nums text-muted-foreground">{formatarPeriodo(e)}</span>
                  </span>
                  {e.situacao && <span className="shrink-0 text-2xs text-muted-foreground">{e.situacao}</span>}
                  {ativo && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SeletorDeEvento;
