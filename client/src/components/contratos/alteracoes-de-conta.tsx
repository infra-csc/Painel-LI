/**
 * Mudanças de conta e PIX (26/10) — a fila que o sino do DP aponta.
 * Conta bancária é o dado mais usado em fraude: toda troca de banco,
 * agência, conta, PIX ou titular fica aqui, com antes/depois MASCARADOS,
 * até OUTRA pessoa do DP conferir (quem alterou não confere a própria).
 */
import { ArrowRight, CheckCircle2, CloudOff, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoDaValidacao, BotaoTentarDeNovo } from "@/components/scaling-validation/validation-page/estados";
import { useToast } from "@/hooks/use-toast";
import { toTitleCase } from "@/lib/format";
import { apiErrorMessage, cn } from "@/lib/utils";
import { ROTULO_DO_CAMPO_DE_PAGAMENTO, type DadosDePagamento } from "@shared/pagamento";
import { useAlteracoesDeConta, useConferirAlteracao, type AlteracaoDePagamento } from "./api";

const quando = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

const rotulo = (c: string) => ROTULO_DO_CAMPO_DE_PAGAMENTO[c as keyof DadosDePagamento] ?? c;

/** Só os números (agência, conta, chave) em fonte mono; nomes e rótulos na fonte do app. */
const NUMERICOS = new Set(["agencia", "conta", "pixChave"]);

export function MudancasDoPagamento({ a, compacto = false }: { a: AlteracaoDePagamento; compacto?: boolean }) {
  // Primeiro cadastro: não há "de → para", só o que entrou.
  const inicial = a.campos.every((c) => a.antes[c] == null);
  return (
    <div className="space-y-1">
      {inicial && <p className="text-2xs font-medium text-muted-foreground">Primeiro cadastro</p>}
      <dl className={cn("grid gap-x-3 gap-y-1", compacto ? "grid-cols-1" : "sm:grid-cols-[140px_1fr]")}>
        {a.campos.map((c) => {
          const mono = NUMERICOS.has(c) ? "font-mono tabular-nums" : "";
          return (
            <div key={c} className="contents">
              <dt className="text-2xs font-medium text-muted-foreground sm:pt-0.5">{rotulo(c)}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                {!inicial && (
                  <>
                    <span className={cn(mono, "text-slate-500 line-through decoration-slate-300")}>{a.antes[c] ?? "vazio"}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="passou a" />
                  </>
                )}
                <span className={cn(mono, "break-words font-medium text-foreground")}>{a.depois[c] ?? "apagado"}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function AlteracoesDeConta({ situacao, onAbrirColaborador }: { situacao: "pendentes" | "todas"; onAbrirColaborador?: (id: string, nome: string) => void }) {
  const q = useAlteracoesDeConta(situacao, true);
  const conferir = useConferirAlteracao();
  const { toast } = useToast();

  if (q.isLoading) {
    return <div className="space-y-2" aria-busy="true" aria-label="Carregando mudanças">{[0, 1, 2].map((i) => <div key={i} className="val-osso h-[88px] w-full rounded-xl" />)}</div>;
  }
  if (q.error) {
    return <EstadoDaValidacao tom="erro" icone={<CloudOff />} titulo="Não foi possível carregar as mudanças" texto={apiErrorMessage(q.error, "Tente de novo.")} acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} />;
  }
  const lista = q.data ?? [];
  if (lista.length === 0) {
    return situacao === "pendentes"
      ? <EstadoDaValidacao icone={<ShieldCheck />} titulo="Nenhuma mudança de conta para conferir" texto="Quando alguém do DP trocar banco, conta, PIX ou titular de um colaborador, a mudança aparece aqui para outra pessoa conferir." testId="ctr-contas-vazio" />
      : <EstadoDaValidacao icone={<ShieldCheck />} titulo="Nenhum dado de pagamento alterado ainda" texto="O histórico das mudanças de conta, PIX e e-mail aparece aqui." />;
  }

  return (
    <ul className="space-y-2.5" data-testid="ctr-contas-lista">
      {lista.map((a) => {
        const pendente = a.mudaConta && !a.conferidoEm;
        return (
          <li key={a.id} className={cn("ctr-entra overflow-hidden rounded-xl border bg-card shadow-1", pendente ? "border-warning/40" : "border-border")}>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button type="button" disabled={!onAbrirColaborador || !a.collaboratorId} onClick={() => a.collaboratorId && onAbrirColaborador?.(a.collaboratorId, a.colaboradorNome ?? "Colaborador")}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary disabled:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{toTitleCase(a.colaboradorNome ?? "Colaborador")}
                  </button>
                  {a.colaboradorNumero != null && <span className="text-2xs tabular-nums text-muted-foreground">nº {a.colaboradorNumero}</span>}
                  {pendente
                    ? <span className="inline-flex h-5 items-center rounded-full border border-warning/40 bg-warning-soft px-2 text-2xs font-semibold text-warning">A conferir</span>
                    : a.mudaConta
                      ? <span className="inline-flex h-5 items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 text-2xs font-semibold text-success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Conferida</span>
                      : <span className="inline-flex h-5 items-center rounded-full border border-border bg-surface-muted px-2 text-2xs font-medium text-slate-600">Só contato</span>}
                </div>
                <MudancasDoPagamento a={a} />
                <p className="text-2xs text-muted-foreground">
                  Alterado por <span className="font-medium text-slate-700">{a.porNome}</span> em {quando(a.em)}
                  {a.conferidoEm && <> · conferido por <span className="font-medium text-slate-700">{a.conferidoPorNome}</span> em {quando(a.conferidoEm)}</>}
                </p>
              </div>
              {pendente && (
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:self-center">
                  {a.podeConferir ? (
                    <Button type="button" size="sm" className="h-9 border border-success/35 bg-success-soft px-3 text-xs font-semibold text-success hover:border-success hover:bg-success hover:text-white"
                      disabled={conferir.isPending} data-testid={`ctr-conferir-${a.id}`}
                      onClick={() => conferir.mutate(a.id, {
                        onSuccess: () => toast({ variant: "success", title: "Mudança conferida", description: toTitleCase(a.colaboradorNome ?? "") }),
                        onError: (e) => toast({ variant: "destructive", title: "Não foi possível conferir", description: apiErrorMessage(e, "Tente de novo.") }),
                      })}>
                      {conferir.isPending && conferir.variables === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                      Conferi com o colaborador
                    </Button>
                  ) : (
                    <p className="max-w-[220px] text-right text-2xs leading-relaxed text-muted-foreground">Você fez esta mudança — outra pessoa do DP confere.</p>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
