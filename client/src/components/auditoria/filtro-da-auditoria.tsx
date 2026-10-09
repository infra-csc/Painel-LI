/**
 * Seletor de filtro do Log de auditoria (redesenho 08/10).
 *
 * O MESMO desenho dos filtros das listas (gatilho de 34px, popover com busca,
 * marcador redondo, "Limpar"), mas sem o número ao lado de cada opção: aqui o
 * filtro é resolvido no SERVIDOR, página a página — um contador montado com os
 * 30 registros da tela mentiria. Por isso não usa `FiltroUnico` (que exige o
 * número). Aceita grupos (as ações, pelo tom) e um ícone no gatilho.
 *
 * Semântica de antes: escolha única, "all" = todos (o período não tem "todos":
 * `padrao` diz qual opção é a de fábrica).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GrupoDeOpcoes } from "./auditoria-utils";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function FiltroDaAuditoria({
  valor, onChange, grupos, rotuloTodos, padrao = "all", titulo, icone, placeholderBusca, testid, largura = 300, textoDoGatilho,
}: {
  valor: string;
  onChange: (v: string) => void;
  grupos: GrupoDeOpcoes[];
  /** Primeira opção ("Todas as pessoas"); sem ela, a lista não tem "todos". */
  rotuloTodos?: string;
  /** Valor de fábrica — com ele o gatilho fica neutro. */
  padrao?: string;
  /** Nome do filtro, para o leitor de tela ("Pessoa"). */
  titulo: string;
  icone?: ReactNode;
  /** Com busca quando a lista é longa. */
  placeholderBusca?: string;
  testid: string;
  largura?: number;
  /** Texto do gatilho quando difere do nome da opção (ex.: período curto). */
  textoDoGatilho?: (id: string) => string | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const todas = useMemo(() => grupos.flatMap((g) => g.opcoes), [grupos]);
  const escolhida = todas.find((o) => o.id === valor);
  const ativo = valor !== padrao;
  const texto = textoDoGatilho?.(valor) ?? escolhida?.nome ?? rotuloTodos ?? "";

  const filtrados = useMemo(() => {
    const q = normalizar(busca);
    if (!q) return grupos;
    return grupos
      .map((g) => ({ ...g, opcoes: g.opcoes.filter((o) => normalizar(o.nome).includes(q)) }))
      .filter((g) => g.opcoes.length > 0);
  }, [grupos, busca]);

  const escolher = (id: string) => {
    onChange(id);
    setAberto(false);
    setBusca("");
  };

  const opcao = (id: string, nome: string, ponto?: string) => {
    const marcada = id === valor;
    return (
      <button
        key={id}
        type="button"
        role="option"
        aria-selected={marcada}
        onClick={() => escolher(id)}
        className={cn(
          "aud-opcao flex w-full min-h-[32px] items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
          marcada ? "font-medium text-primary" : "text-slate-700",
        )}
        data-testid={`${testid}-opcao-${id}`}
      >
        <span aria-hidden="true" className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", marcada ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card text-transparent")}>
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
        {ponto && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ponto)} />}
        <span className="min-w-0 flex-1 truncate">{nome}</span>
      </button>
    );
  };

  return (
    <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setBusca(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${titulo}: ${texto}`}
          title={texto}
          className={cn(
            "pas-alvo inline-flex h-[34px] w-full min-w-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 data-[state=open]:border-primary/60",
            ativo ? "border-primary/40 text-primary" : "border-border text-slate-700",
          )}
          data-testid={testid}
        >
          {icone && <span aria-hidden="true" className={cn("shrink-0 [&>svg]:h-4 [&>svg]:w-4", ativo ? "text-primary" : "text-muted-foreground")}>{icone}</span>}
          <span className="min-w-0 flex-1 truncate text-left">{texto}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="overflow-hidden rounded-xl p-0" style={{ width: `min(${largura}px, calc(100vw - 24px))` }}>
        {placeholderBusca && (
          <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={placeholderBusca}
              aria-label={placeholderBusca}
              className="h-[26px] min-w-0 flex-1 rounded-sm bg-transparent text-sm text-foreground outline-none"
              data-testid={`${testid}-busca`}
            />
            {ativo && (
              <button type="button" onClick={() => escolher(padrao)} className="h-6 shrink-0 rounded-md px-2 text-xs font-medium text-primary hover:bg-brand-soft" data-testid={`${testid}-limpar`}>
                Limpar
              </button>
            )}
          </div>
        )}
        <div role="listbox" aria-label={titulo} className="max-h-[min(340px,60vh)] overflow-y-auto overscroll-contain p-1.5">
          {rotuloTodos && !busca && opcao("all", rotuloTodos)}
          {filtrados.map((g, i) => (
            <div key={g.titulo || i} role={g.titulo ? "group" : undefined} aria-label={g.titulo || undefined}>
              {g.titulo && grupos.length > 1 && (
                <p className="m-0 mt-2 mb-0.5 flex items-center gap-1.5 px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground first:mt-1">
                  {g.titulo}
                </p>
              )}
              {g.opcoes.map((o) => opcao(o.id, o.nome, g.ponto))}
            </div>
          ))}
          {filtrados.length === 0 && <p className="px-2 py-3.5 text-center text-xs text-muted-foreground">Nada com esse nome.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
