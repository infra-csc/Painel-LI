/**
 * "O hotel tem: Individual · Duplo · Triplo" na faixa do Hotel do evento
 * (22/10, dono: "no espelho ter a opção de colocar se o hotel não tem duplo
 * ou triplo").
 *
 * Individual sempre existe e não desmarca; Duplo e Triplo vêm marcados. Grava
 * por evento (hotel_tarifas_evento.tem_duplo/tem_triplo, pelo mesmo PUT das
 * tarifas). Quem edita é quem edita a aba Quartos (logística).
 *
 * Mudar a opção NÃO refaz os quartos: a aba mostra um aviso com "Refazer
 * sugestões" quando algum quarto excede o que o hotel tem (`AvisoDeQuartosQueExcedem`).
 */
import { useId, useState } from "react";
import { AlertTriangle, Check, Loader2, Minus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import type { TiposDoHotel } from "@shared/room-pairing";
import type { ValoresDoHotelMutacoes } from "./valores-do-hotel";

type Qual = "duplo" | "triplo";
const ROTULO: Record<Qual, string> = { duplo: "Duplo", triplo: "Triplo" };

/** O que as sugestões passam a fazer — só quando o hotel não tem algum tipo. */
export function regraDosTipos(t: TiposDoHotel): string | null {
  if (!t.duplo && !t.triplo) return "Só individual: um quarto por pessoa.";
  if (!t.duplo) return "Sem duplo: cada pessoa num individual; triplo só para a cenotécnica.";
  if (!t.triplo) return "Sem triplo: a cenotécnica fica em duplo e individual.";
  return null;
}

export function TiposDoHotelChips({ tipos, canEdit, indisponivel, mutacoes }: {
  tipos: TiposDoHotel;
  canEdit: boolean;
  /** Tabelas ainda não criadas no banco: mostra, mas não deixa mudar. */
  indisponivel?: boolean;
  mutacoes: ValoresDoHotelMutacoes;
}) {
  const { toast } = useToast();
  const idDoRotulo = useId();
  const [salvando, setSalvando] = useState<Qual | null>(null);
  const regra = regraDosTipos(tipos);

  const mudar = async (qual: Qual) => {
    if (salvando) return;
    setSalvando(qual);
    try {
      await mutacoes.evento.mutateAsync(qual === "duplo" ? { temDuplo: !tipos.duplo } : { temTriplo: !tipos.triplo });
    } catch (e) {
      toast({ title: "Não foi possível salvar os apartamentos do hotel", description: apiErrorMessage(e, "Tente novamente em instantes."), variant: "destructive" });
    } finally {
      setSalvando(null);
    }
  };

  const chip = (qual: Qual) => {
    const tem = tipos[qual];
    const conteudo = (
      <>
        {salvando === qual
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : tem ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="esp-apto-nome">{ROTULO[qual]}</span>
      </>
    );
    if (!canEdit) {
      return (
        <span key={qual} className="esp-apto" data-tem={tem || undefined} data-testid={`hotel-tipo-${qual}`}>
          {conteudo}<span className="sr-only">{tem ? "— tem" : "— o hotel não tem"}</span>
        </span>
      );
    }
    return (
      <button key={qual} type="button" className="esp-apto esp-alvo" data-tem={tem || undefined} aria-pressed={tem}
        disabled={indisponivel || salvando !== null} onClick={() => void mudar(qual)} data-testid={`hotel-tipo-${qual}`}
        title={tem ? `Marcar que o hotel NÃO tem ${ROTULO[qual].toLowerCase()}` : `Marcar que o hotel tem ${ROTULO[qual].toLowerCase()}`}>
        {conteudo}
      </button>
    );
  };

  return (
    <div className="esp-hotel-tipos" role="group" aria-labelledby={idDoRotulo} data-testid="hotel-tipos">
      <span id={idDoRotulo} className="esp-hotel-evento-rotulo esp-hotel-tipos-rotulo">O hotel tem</span>
      <span className="esp-apto" data-tem data-fixo title="Todo hotel tem apartamento individual" data-testid="hotel-tipo-individual">
        <Check className="h-3.5 w-3.5" aria-hidden="true" /><span className="esp-apto-nome">Individual</span>
      </span>
      {chip("duplo")}
      {chip("triplo")}
      <span className="esp-hotel-tipos-regra" aria-live="polite" data-testid="hotel-tipos-regra">{regra}</span>
    </div>
  );
}

/** "2 quartos triplos" / "1 quarto duplo". */
const quartosDoTipo = (n: number, tipo: "double" | "triple") =>
  `${n} ${n === 1 ? "quarto" : "quartos"} ${tipo === "double" ? (n === 1 ? "duplo" : "duplos") : (n === 1 ? "triplo" : "triplos")}`;

/**
 * Aviso no topo dos quartos quando algum excede o que o hotel tem (ex.: "2
 * quartos triplos, mas o hotel não tem triplo"), com "Refazer sugestões". Os
 * confirmados não mudam no recálculo — o aviso diz isso.
 */
export function AvisoDeQuartosQueExcedem({ excedentes, canEdit, onRecalc, recalcPending }: {
  /** Quartos que excedem: o tipo que o hotel não tem e se está confirmado. */
  excedentes: { tipo: "double" | "triple"; confirmed: boolean }[];
  canEdit: boolean;
  onRecalc?: () => void;
  recalcPending?: boolean;
}) {
  if (excedentes.length === 0) return null;
  const duplos = excedentes.filter((e) => e.tipo === "double").length;
  const triplos = excedentes.filter((e) => e.tipo === "triple").length;
  const confirmados = excedentes.filter((e) => e.confirmed).length;
  const abertos = excedentes.length - confirmados;
  const frases = [
    triplos > 0 && `${quartosDoTipo(triplos, "triple")}, mas o hotel não tem triplo`,
    duplos > 0 && `${quartosDoTipo(duplos, "double")}, mas o hotel não tem duplo`,
  ].filter((x): x is string => !!x);
  const detalhe = [
    abertos > 0 && canEdit && `“Refazer sugestões” remonta ${abertos === excedentes.length ? (abertos === 1 ? "esse quarto" : "esses quartos") : `os ${abertos} não confirmados`} com o que o hotel tem.`,
    confirmados > 0 && canEdit && `${confirmados === 1 ? "1 confirmado fica" : `${confirmados} confirmados ficam`} como está — reabra ou separe à mão.`,
  ].filter((x): x is string => !!x).join(" ");

  return (
    <div className="esp-excede" role="status" data-testid="quartos-excedem">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-medium text-foreground" data-testid="quartos-excedem-texto">{frases.join(" · ")}.</p>
        {detalhe && <p className="m-0 mt-0.5 text-xs leading-snug text-muted-foreground">{detalhe}</p>}
      </div>
      {canEdit && onRecalc && abertos > 0 && (
        <button type="button" onClick={onRecalc} disabled={recalcPending} data-testid="quartos-excedem-refazer"
          className="esp-alvo inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {recalcPending ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          {recalcPending ? "Recalculando…" : "Refazer sugestões"}
        </button>
      )}
    </div>
  );
}
