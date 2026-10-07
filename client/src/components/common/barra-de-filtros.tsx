/**
 * Peças da barra de filtros das listas da Logística — Passagens e Hospedagem
 * (07/10).
 *
 * Extraídas de `tickets/tickets-filter-bar.tsx` SEM mudar uma classe, para as
 * duas telas irmãs terem a mesma busca, o mesmo botão "Filtros" (com as listas
 * curtas num popover e o número de ligados no botão) e a mesma etiqueta
 * removível — em vez de duas cópias que iam se afastando a cada ajuste.
 *
 * Só apresentação: quem sabe o que cada opção filtra é a tela.
 */
import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Campo de busca da lista: ícone, "limpar" próprio e Esc que apaga. */
export function BuscaDaLista({ valor, onChange, placeholder, rotulo, testid = "input-search-id", compacta }: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Nome acessível (o placeholder some quando a pessoa digita). */
  rotulo: string;
  testid?: string;
  /** Cede largura antes dos filtros quebrarem linha (placeholder curto). */
  compacta?: boolean;
}) {
  return (
    <div className={`relative sm:max-w-[340px] ${compacta ? "sm:flex-[1_1_140px] sm:min-w-[140px]" : "sm:flex-[1_1_180px] sm:min-w-[180px]"}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={rotulo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape" && valor) { e.preventDefault(); onChange(""); } }}
        className={`pas-busca w-full h-[34px] pl-[33px] ${valor ? "pr-8" : "pr-3"} rounded-lg border border-border bg-card text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12`}
        data-testid={testid}
      />
      {valor && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar a busca"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Uma lista curta de escolha única que mora dentro de "Filtros". */
export interface ListaCurta {
  chave: string;
  titulo: string;
  /** Prefixo da etiqueta removível ("Status", "Inclusão"…). */
  etiqueta: string;
  /** A primeira opção é o padrão da lista. */
  opcoes: { id: string; nome: string }[];
  testid: string;
}

const COLUNAS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

/**
 * O botão "Filtros" e o popover com as listas curtas, lado a lado.
 *
 * O que se escolhe todo dia fica à vista na barra; o que é raro mora aqui, com
 * o número de ligados no botão — um filtro ligado nunca fica escondido.
 */
export function MaisFiltros({ listas, valorDe, onEscolher, contagem, mostrarPadrao, onPadrao, depoisDaLista, testid = "filtros-mais" }: {
  listas: ListaCurta[];
  valorDe: (chave: string) => string;
  onEscolher: (chave: string, id: string) => void;
  /** Quantos filtros daqui estão fora do padrão — o número no botão. */
  contagem: number;
  /** Mostra "Voltar ao padrão" no topo do popover. */
  mostrarPadrao: boolean;
  onPadrao: () => void;
  /** Algo a mais embaixo de uma lista (ex.: o sentido da ordenação). */
  depoisDaLista?: (chave: string) => ReactNode;
  testid?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`pas-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary data-[state=open]:border-primary/60 ${
            contagem > 0 ? "border-primary/40 text-primary" : "border-border text-slate-700 hover:bg-muted"
          }`}
          data-testid={testid}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Filtros
          {contagem > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-2xs font-semibold tabular-nums text-primary-foreground">
              {contagem}
            </span>
          )}
          {/* Sem seta: o ícone já diz "abre opções", e os 22px dela empurravam
              o botão para a linha de baixo quando o contador aparece. */}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-[min(560px,calc(100vw-24px))] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Filtros</span>
          {mostrarPadrao && (
            <button
              type="button"
              onClick={onPadrao}
              className="ml-auto h-[26px] px-2.5 rounded-md text-xs font-medium text-primary hover:bg-brand-soft"
            >
              Voltar ao padrão
            </button>
          )}
        </div>
        <div className={`grid grid-cols-1 ${COLUNAS[listas.length] ?? "sm:grid-cols-3"} gap-x-3 gap-y-3 p-3`}>
          {listas.map((l) => (
            <div key={l.chave}>
              <div role="radiogroup" aria-label={l.titulo} data-testid={l.testid}>
                <p className="m-0 mb-1 px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{l.titulo}</p>
                <div className="flex flex-col gap-px">
                  {l.opcoes.map((o) => {
                    const marcada = valorDe(l.chave) === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={marcada}
                        onClick={() => onEscolher(l.chave, o.id)}
                        className={`flex items-center gap-2 w-full min-h-[32px] px-2 py-1 rounded-md text-left text-sm transition-colors hover:bg-muted ${marcada ? "text-primary font-medium" : "text-slate-700"}`}
                        data-testid={`${l.testid}-opcao-${o.id}`}
                      >
                        <span aria-hidden="true" className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded-full border ${marcada ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-card text-transparent"}`}>
                          <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                        </span>
                        <span className="min-w-0 leading-snug">{o.nome}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {depoisDaLista?.(l.chave)}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Etiqueta de um filtro de "Filtros" que fugiu do padrão, com o X que o desliga. */
export function EtiquetaDeFiltro({ etiqueta, valor, titulo, onTirar }: {
  etiqueta: string;
  valor: ReactNode;
  /** Nome do filtro por extenso, para o "Tirar o filtro …" do leitor de tela. */
  titulo: string;
  onTirar: () => void;
}) {
  return (
    <span className="pas-entra inline-flex max-w-full items-center gap-1 h-6 rounded-md border border-primary/25 bg-brand-soft pl-2 pr-0.5 text-xs font-medium text-primary">
      <span className="text-2xs font-semibold uppercase tracking-wide text-primary/70">{etiqueta}</span>
      <span className="truncate">{valor}</span>
      <button
        type="button"
        onClick={onTirar}
        aria-label={`Tirar o filtro ${titulo.toLowerCase()}`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-primary/15"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/** "Limpar filtros" da linha de etiquetas (o mesmo nas duas telas). */
export function LimparFiltros({ onClick, testid = "button-clear-filters" }: { onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
      data-testid={testid}
    >
      <X className="w-3.5 h-3.5" aria-hidden="true" />Limpar filtros
    </button>
  );
}
