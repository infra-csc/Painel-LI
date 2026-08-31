/**
 * Barra de contexto do Espelho Operacional (31/08).
 *
 * Eram três andares de cabeçalho (~180px) antes do primeiro dado. Agora é uma
 * faixa só, que ACOMPANHA a rolagem: quem está no fim de uma grade de 39
 * colunas continua vendo de que evento aquilo é, e continua alcançando
 * "Refazer sugestões" e "Exportar" sem voltar ao topo.
 *
 * O nome do evento é o gatilho do próprio seletor — em vez de um combobox
 * genérico com rótulo "Evento" acima, que gastava uma linha para dizer o que o
 * conteúdo já diz.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventoDoSeletor {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  /** Texto curto à direita do item ("em andamento", "encerrado"…). */
  situacao?: string | null;
}

export function SeletorDeEvento({ eventos, valor, aoEscolher, formatarPeriodo }: {
  eventos: EventoDoSeletor[];
  valor: string;
  aoEscolher: (id: string) => void;
  /** A tela decide como escrever o período — a barra só o exibe. */
  formatarPeriodo: (e: EventoDoSeletor) => string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);

  const atual = eventos.find((e) => e.id === valor);

  // Fecha ao clicar fora ou no Esc — um dropdown que só fecha no próprio
  // gatilho fica preso quando o clique vai para a grade atrás.
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", clique); document.removeEventListener("keydown", tecla); };
  }, [aberto]);

  useEffect(() => { if (aberto) buscaRef.current?.focus(); }, [aberto]);

  const filtrados = busca.trim()
    ? eventos.filter((e) => e.name.toLowerCase().includes(busca.trim().toLowerCase()))
    : eventos;

  return (
    <div ref={caixaRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className="flex h-[34px] max-w-[460px] items-center gap-1.5 rounded-lg px-2.5 text-[15px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="mirror-event-trigger"
      >
        <span className="truncate">{atual?.name ?? "Selecione um evento"}</span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {aberto && (
        <div
          className="absolute left-0 top-10 z-[60] w-[420px] max-w-[92vw] overflow-hidden rounded-xl border bg-card shadow-[0_16px_48px_rgba(2,8,23,0.16)]"
          role="listbox"
          data-testid="mirror-event-dropdown"
        >
          <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar evento…"
              aria-label="Buscar evento"
              className="h-6 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
            {busca && (
              <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca" className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <ul className="max-h-[260px] overflow-y-auto">
            {filtrados.length === 0 && (
              <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">Nenhum evento com esse nome.</li>
            )}
            {filtrados.map((e) => {
              const ativo = e.id === valor;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={ativo}
                    onClick={() => { aoEscolher(e.id); setAberto(false); setBusca(""); }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      ativo ? "bg-brand-soft text-primary" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{e.name}</span>
                      <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{formatarPeriodo(e)}</span>
                    </span>
                    {e.situacao && <span className="shrink-0 text-[11px] text-muted-foreground">{e.situacao}</span>}
                  </button>
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
