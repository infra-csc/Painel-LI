/**
 * Popover de filtro da tela de Passagens (02/09), com busca e contador.
 *
 * O que ele acrescenta aos seletores antigos é o NÚMERO ao lado de cada opção:
 * quantas linhas sobram se você escolher aquela, mantendo o resto do recorte.
 * Sem ele, escolher um evento numa lista de 160 é apostar — e descobrir que a
 * escolha devolve zero linhas só depois de fechar o popover.
 *
 * A contagem vem de `tickets-filtering.ts`, a MESMA regra que monta a lista.
 * Um contador que usasse a própria cópia da regra passaria a mentir na
 * primeira mudança.
 *
 * A semântica de valor é a de antes, intocada: evento e colaborador são
 * escolha única com "all" para "todos"; função é seleção múltipla por array.
 */
import { forwardRef, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Sem acento e sem caixa — "jose" acha "José". */
const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface OpcaoDeFiltro {
  id: string;
  nome: string;
  /** Quantas linhas sobram ao escolher esta opção. */
  n: number;
}

const GATILHO =
  "inline-flex w-full items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-[13px] font-medium text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:border-primary";

const Gatilho = forwardRef<HTMLButtonElement, {
  ativo: boolean; texto: string; testid: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ ativo, texto, testid, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-testid={testid}
      // Evento e colaborador têm nome de tamanho imprevisível: quando o
      // escolhido não couber, o title deixa ler o nome inteiro no hover.
      title={texto}
      {...props}
      className={`${GATILHO} ${ativo ? "border-[rgba(0,51,204,0.35)]" : "border-border"} ${className ?? ""}`}
    >
      <span className="flex-1 min-w-0 truncate text-left">{texto}</span>
      {/* #64748B: o chevron antigo era #94A3B8, 2,56:1 sobre branco. */}
      <ChevronDown className="w-4 h-4 shrink-0 text-[#64748B]" aria-hidden="true" />
    </button>
  ),
);
Gatilho.displayName = "GatilhoDeFiltro";

function Caixa({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border ${
        on ? "bg-primary border-primary text-white" : "bg-card border-slate-300 text-transparent"
      }`}
    >
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  );
}

function Lista({ opcoes, busca, onBusca, estaMarcada, onEscolher, placeholder, testidPrefixo, rodape }: {
  opcoes: OpcaoDeFiltro[];
  busca: string;
  onBusca: (v: string) => void;
  estaMarcada: (id: string) => boolean;
  onEscolher: (id: string) => void;
  placeholder: string;
  testidPrefixo: string;
  rodape?: React.ReactNode;
}) {
  const filtradas = useMemo(() => {
    const q = normalizar(busca);
    const ordenadas = [...opcoes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return q ? ordenadas.filter((o) => normalizar(o.nome).includes(q)) : ordenadas;
  }, [opcoes, busca]);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-background">
        <Search className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={`${testidPrefixo}-busca`}
          className="flex-1 min-w-0 h-[26px] bg-transparent text-[13px] text-slate-900 outline-none"
        />
        {rodape}
      </div>
      <div className="max-h-[260px] overflow-y-auto p-1.5">
        {filtradas.map((o) => (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={estaMarcada(o.id)}
            onClick={() => onEscolher(o.id)}
            className="flex items-center gap-2.5 w-full min-h-[32px] px-2 py-1.5 rounded-[7px] text-[13px] text-slate-700 text-left hover:bg-slate-100"
            data-testid={`${testidPrefixo}-opcao-${o.id}`}
          >
            <Caixa on={estaMarcada(o.id)} />
            <span className="flex-1 min-w-0 truncate">{o.nome}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{o.n}</span>
          </button>
        ))}
        {filtradas.length === 0 && (
          <p className="px-2 py-3.5 text-center text-[12px] text-muted-foreground">Nada com esse nome.</p>
        )}
      </div>
    </>
  );
}

/**
 * Lista curta de opções fixas — situação da passagem, transporte, situação da
 * inclusão.
 *
 * Eram `<select>` nativos: abriam o menu do sistema operacional, com fonte,
 * cor de seleção e altura de item que não são as do resto da tela. No meio de
 * três popovers desenhados, o menu do sistema aparecia como um corpo estranho.
 *
 * Sem busca, de propósito: são três ou quatro opções, e um campo de busca
 * sobre quatro itens é ruído.
 */
export function FiltroDeLista({ valor, onChange, opcoes, testid, larguraPopover = 260, contagens }: {
  valor: string;
  onChange: (v: string) => void;
  /** Opções na ordem em que devem aparecer. A primeira costuma ser o padrão. */
  opcoes: { id: string; nome: string }[];
  testid: string;
  larguraPopover?: number;
  /** Quantas linhas cada opção deixaria. Opcional — nem toda lista tem. */
  contagens?: Map<string, number>;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = opcoes.find((o) => o.id === valor) ?? opcoes[0];
  // "Ativo" é ter escolhido algo diferente do padrão — a primeira opção.
  const noPadrao = valor === opcoes[0]?.id;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Gatilho ativo={!noPadrao} texto={atual?.nome ?? ""} testid={testid} />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 rounded-xl overflow-hidden" style={{ width: larguraPopover }}>
        <div className="p-1.5">
          {opcoes.map((o) => {
            const marcada = o.id === valor;
            const n = contagens?.get(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => { onChange(o.id); setAberto(false); }}
                className={`flex items-center gap-2.5 w-full min-h-[32px] px-2 py-1.5 rounded-[7px] text-[13px] text-left hover:bg-slate-100 ${
                  marcada ? "text-primary font-medium" : "text-slate-700"
                }`}
                data-testid={`${testid}-opcao-${o.id}`}
              >
                <Caixa on={marcada} />
                <span className="flex-1 min-w-0 truncate">{o.nome}</span>
                {typeof n === "number" && (
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Escolha ÚNICA — "all" é "todos". Mesma semântica dos seletores antigos. */
export function FiltroUnico({ valor, onChange, opcoes, rotuloTodos, placeholderBusca, testid, larguraPopover = 320 }: {
  valor: string;
  onChange: (v: string) => void;
  opcoes: OpcaoDeFiltro[];
  rotuloTodos: string;
  placeholderBusca: string;
  testid: string;
  larguraPopover?: number;
}) {
  const [busca, setBusca] = useState("");
  const escolhida = opcoes.find((o) => o.id === valor);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Gatilho ativo={valor !== "all"} texto={escolhida?.nome ?? rotuloTodos} testid={testid} />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 rounded-xl overflow-hidden" style={{ width: larguraPopover }}>
        <Lista
          opcoes={opcoes}
          busca={busca}
          onBusca={setBusca}
          estaMarcada={(id) => id === valor}
          // Reclicar a opção escolhida volta para "todos": o filtro não pode
          // ser uma armadilha de mão única.
          onEscolher={(id) => onChange(id === valor ? "all" : id)}
          placeholder={placeholderBusca}
          testidPrefixo={testid}
          rodape={valor !== "all" ? (
            <button
              type="button"
              onClick={() => onChange("all")}
              className="h-6 px-2 rounded-md text-[12px] font-medium text-primary hover:bg-brand-soft shrink-0"
              data-testid={`${testid}-limpar`}
            >
              Limpar
            </button>
          ) : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Seleção MÚLTIPLA por array — a semântica que as funções sempre tiveram. */
export function FiltroMultiplo({ valores, onChange, opcoes, rotuloTodos, placeholderBusca, testid, larguraPopover = 300 }: {
  valores: string[];
  onChange: (v: string[]) => void;
  opcoes: OpcaoDeFiltro[];
  rotuloTodos: string;
  placeholderBusca: string;
  testid: string;
  larguraPopover?: number;
}) {
  const [busca, setBusca] = useState("");
  const texto = valores.length === 0
    ? rotuloTodos
    : valores.length === 1
      ? (opcoes.find((o) => o.id === valores[0])?.nome ?? "1 função")
      : `${valores.length} funções`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Gatilho ativo={valores.length > 0} texto={texto} testid={testid} />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 rounded-xl overflow-hidden" style={{ width: larguraPopover }}>
        <Lista
          opcoes={opcoes}
          busca={busca}
          onBusca={setBusca}
          estaMarcada={(id) => valores.includes(id)}
          onEscolher={(id) => onChange(valores.includes(id) ? valores.filter((v) => v !== id) : [...valores, id])}
          placeholder={placeholderBusca}
          testidPrefixo={testid}
          rodape={valores.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="h-6 px-2 rounded-md text-[12px] font-medium text-primary hover:bg-brand-soft shrink-0"
              data-testid={`${testid}-limpar`}
            >
              Limpar
            </button>
          ) : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
