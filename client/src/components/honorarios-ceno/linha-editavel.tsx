/**
 * Edição na própria linha (16/10) — o jeito da planilha: o tipo de freela se
 * escolhe ali mesmo (20/10: no lugar de setor e posição) e, em "Outro valor"
 * ou na empreita, o valor se digita na célula e grava ao sair dela. Cada
 * linha diz o que está acontecendo (salvando → salvo, ou o erro), sem modal
 * e sem botão "Salvar" por linha.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, parseBrNumber } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS } from "@shared/cenotecnica-empreita";
import type { TabelaDaVaga } from "./api";

export type EstadoDoSalvamento = "parado" | "salvando" | "salvo" | "erro";

const paraTexto = (c: number) => (c > 0 ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

/** Valor em reais com grava-ao-sair. Enter também grava; Esc desfaz. */
export function CampoDeValor({ valor, onSalvar, disabled, rotulo, testId }: {
  valor: number;
  onSalvar: (cents: number) => void;
  disabled?: boolean;
  rotulo: string;
  testId?: string;
}) {
  const [texto, setTexto] = useState(() => paraTexto(valor));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setTexto(paraTexto(valor));
  }, [valor]);

  const confirmar = () => {
    const limpo = texto.trim();
    const cents = limpo ? Math.round(parseBrNumber(limpo) * 100) : 0;
    const valido = Number.isFinite(cents) && cents >= 0 ? cents : valor;
    setTexto(paraTexto(valido));
    if (valido !== valor) onSalvar(valido);
  };

  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden="true">R$</span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        aria-label={rotulo}
        data-testid={testId}
        data-campo-valor=""
        disabled={disabled}
        value={texto}
        placeholder="0,00"
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => setTimeout(() => ref.current?.select(), 0)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Como na planilha: Enter grava e desce para o próximo valor da lista.
            e.preventDefault();
            const campos = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-campo-valor]:not(:disabled)"));
            const proximo = campos[campos.indexOf(ref.current!) + 1];
            if (proximo) proximo.focus(); else ref.current?.blur();
          }
          if (e.key === "Escape") { setTexto(paraTexto(valor)); setTimeout(() => ref.current?.blur(), 0); }
        }}
        className={cn(
          "val-alvo h-9 w-full rounded-lg border border-input bg-card pl-8 pr-2.5 text-right text-sm font-semibold tabular-nums text-foreground",
          "transition-[border-color,box-shadow,background-color] duration-150 placeholder:font-normal placeholder:text-muted-foreground/70",
          "hover:border-slate-300 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
          "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground",
        )}
      />
    </span>
  );
}

const SELECT = "val-alvo h-9 w-full rounded-lg border-input bg-card px-2.5 text-xs font-medium data-[placeholder]:text-muted-foreground";

/** Tipo de freela na linha: os 4 da tabela (com o valor para os dias da vaga) ou "Outro valor". */
export function SelectDoTipo({ valor, tabela, onMudar, disabled, rotulo, testId }: {
  valor: string | null; tabela: TabelaDaVaga | null | undefined; onMudar: (v: string) => void; disabled?: boolean; rotulo: string; testId?: string;
}) {
  return (
    <Select value={valor ?? undefined} onValueChange={onMudar} disabled={disabled}>
      <SelectTrigger className={cn(SELECT, !valor && "border-dashed")} aria-label={rotulo} data-testid={testId}><SelectValue placeholder="Escolher o tipo" /></SelectTrigger>
      <SelectContent>
        {CENO_FREELA_TIPOS.map((t) => {
          const v = tabela?.valores[t];
          return (
            <SelectItem key={t} value={t}>
              {CENO_FREELA_TIPO_LABELS[t]}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{v ? formatarMoeda(v.total).replace(/,00$/, "") : "—"}</span>
            </SelectItem>
          );
        })}
        <SelectItem value="outro">Outro valor <span className="ml-1.5 text-muted-foreground">negociado à parte</span></SelectItem>
      </SelectContent>
    </Select>
  );
}

/** "Salvando…" → "Salvo" (some sozinho) → ou o erro com a causa. */
export function IndicadorDeSalvamento({ estado, erro }: { estado: EstadoDoSalvamento; erro?: string | null }) {
  if (estado === "parado") return null;
  return (
    <span
      role={estado === "erro" ? "alert" : "status"}
      className={cn(
        "val-entra inline-flex items-center gap-1 text-2xs font-medium",
        estado === "salvando" && "text-muted-foreground",
        estado === "salvo" && "text-success",
        estado === "erro" && "text-danger",
      )}
    >
      {estado === "salvando" && <><Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Salvando…</>}
      {estado === "salvo" && <><Check className="h-3 w-3" aria-hidden="true" /> Salvo</>}
      {estado === "erro" && <><AlertCircle className="h-3 w-3" aria-hidden="true" /> {erro ?? "Não salvou"}</>}
    </span>
  );
}

/** Estado de salvamento por linha, com o "Salvo" que se apaga em 1,6 s. */
export function useSalvamento() {
  const [estado, setEstado] = useState<EstadoDoSalvamento>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const rodar = async (fn: () => Promise<unknown>, mensagemDeErro: (e: unknown) => string) => {
    if (timer.current) clearTimeout(timer.current);
    setErro(null);
    setEstado("salvando");
    try {
      await fn();
      setEstado("salvo");
      timer.current = setTimeout(() => setEstado("parado"), 1600);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEstado("erro");
    }
  };
  return { estado, erro, rodar };
}
