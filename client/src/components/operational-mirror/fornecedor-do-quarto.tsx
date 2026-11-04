/**
 * Fornecedor e forma de pagamento da reserva (04/11, dono: "preciso saber quais
 * fornecedores estou utilizando e as formas de pagamento").
 *
 * `CanalDoQuarto` é a faixa de cada quarto: um clique escolhe o canal, e de novo
 * tira. A forma vem do fornecedor (shared/fornecedores-de-hotel.ts): só "Direto
 * com o hotel" pede para escolher. `ResumoDosFornecedores` soma o evento e filtra
 * a lista de quartos. Os ícones são genéricos: o kit não traz marca dos fornecedores.
 */
import { BedDouble, Briefcase, Building2, Check, CreditCard, FileText, Home, QrCode, type LucideIcon } from "lucide-react";
import {
  FORNECEDORES_DE_HOTEL, formasDoFornecedor, rotuloDaForma, rotuloDoFornecedor,
  type FormaDePagamentoDeHotel, type FornecedorDeHotel, type LinhaDoResumoDeFornecedores,
} from "@shared/fornecedores-de-hotel";
import { cn } from "@/lib/utils";

const ICONE_DO_FORNECEDOR: Record<FornecedorDeHotel, LucideIcon> = {
  flytour: Briefcase, lca: Briefcase, onfly: Briefcase, hoteis_com: BedDouble, airbnb: Home, direto: Building2,
};
const ICONE_DA_FORMA: Record<FormaDePagamentoDeHotel, LucideIcon> = { cartao: CreditCard, pix: QrCode, faturado: FileText };

const CHIP = "esp-alvo inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chipAtivo = (on: boolean) => on
  ? "border-primary bg-brand-soft font-semibold text-primary"
  : "border-border bg-card text-slate-700 hover:border-primary/40 hover:bg-brand-soft hover:text-primary";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function CanalDoQuarto({ quarto, fornecedor, formaPagamento, canEdit, aoSalvar }: {
  /** Número do quarto, para os nomes acessíveis. */
  quarto: number;
  fornecedor: string | null | undefined;
  formaPagamento: string | null | undefined;
  canEdit: boolean;
  aoSalvar: (campos: { fornecedor?: string | null; formaPagamento?: string | null }) => void;
}) {
  const escolhido = FORNECEDORES_DE_HOTEL.find((f) => f.id === fornecedor)?.id ?? null;
  const formas = escolhido ? formasDoFornecedor(escolhido) : [];

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border px-4 py-1.5 text-xs text-muted-foreground" data-testid={`canal-quarto-${quarto}`}>
        <span>Reservado por</span>
        <span className="font-medium text-foreground">{rotuloDoFornecedor(escolhido) ?? "não informado"}</span>
        {escolhido && <span>· {rotuloDaForma(formaPagamento) ?? "pagamento a definir"}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-1.5" data-testid={`canal-quarto-${quarto}`}>
      <div role="group" aria-label={`Fornecedor da reserva do quarto ${quarto}`} className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">Reservado por</span>
        {FORNECEDORES_DE_HOTEL.map((f) => {
          const on = f.id === escolhido;
          const Icone = ICONE_DO_FORNECEDOR[f.id];
          return (
            <button key={f.id} type="button" aria-pressed={on} className={cn(CHIP, chipAtivo(on))}
              title={on ? "Clique de novo para tirar" : undefined}
              onClick={() => aoSalvar({ fornecedor: on ? null : f.id, formaPagamento: null })}
              data-testid={`canal-${quarto}-${f.id}`}>
              {on ? <Check className="h-3 w-3" aria-hidden="true" /> : <Icone className="h-3 w-3" aria-hidden="true" />}
              {f.rotulo}
            </button>
          );
        })}
      </div>
      {escolhido && (
        <div role="group" aria-label={`Forma de pagamento da reserva do quarto ${quarto}`} className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Pagamento</span>
          {formas.length === 1 ? (
            <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md bg-muted px-2 text-xs font-medium text-foreground" data-testid={`forma-${quarto}`}>
              {(() => { const Icone = ICONE_DA_FORMA[formas[0]]; return <Icone className="h-3 w-3" aria-hidden="true" />; })()}
              {rotuloDaForma(formas[0])}
            </span>
          ) : (
            <>
              {formas.map((forma) => {
                const on = forma === formaPagamento;
                const Icone = ICONE_DA_FORMA[forma];
                return (
                  <button key={forma} type="button" aria-pressed={on} className={cn(CHIP, chipAtivo(on))}
                    onClick={() => aoSalvar({ fornecedor: escolhido, formaPagamento: on ? null : forma })}
                    data-testid={`forma-${quarto}-${forma}`}>
                    <Icone className="h-3 w-3" aria-hidden="true" />{rotuloDaForma(forma)}
                  </button>
                );
              })}
              {!formaPagamento && <span className="text-xs font-medium text-warning" data-testid={`forma-${quarto}-falta`}>escolha a forma</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ResumoDosFornecedores({ linhas, total, filtro, aoFiltrar }: {
  linhas: LinhaDoResumoDeFornecedores[];
  total: number;
  filtro: string | null;
  aoFiltrar: (chave: string | null) => void;
}) {
  if (total === 0) return null;
  const semFornecedor = linhas.find((l) => !l.fornecedor)?.quartos ?? 0;
  const aDefinir = linhas.filter((l) => l.fornecedor && !l.formaPagamento).reduce((n, l) => n + l.quartos, 0);
  return (
    <section aria-label="Fornecedores e formas de pagamento do evento" className="mb-3 rounded-xl border border-border bg-card" data-testid="resumo-fornecedores">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5">
        <h4 className="text-sm font-semibold text-foreground">Fornecedores e pagamentos</h4>
        <p className="text-xs text-muted-foreground">
          {semFornecedor > 0 ? `${plural(semFornecedor, "quarto", "quartos")} sem fornecedor de ${total}` : `todos os ${plural(total, "quarto", "quartos")} com fornecedor`}
          {aDefinir > 0 ? ` · ${plural(aDefinir, "quarto", "quartos")} sem forma de pagamento` : ""}
        </p>
        {filtro && (
          <button type="button" onClick={() => aoFiltrar(null)} className="esp-alvo ml-auto text-xs font-medium text-primary hover:underline" data-testid="resumo-fornecedores-todos">
            Ver todos os quartos
          </button>
        )}
      </header>
      <ul className="m-0 grid grid-cols-1 list-none p-0 sm:grid-cols-2 xl:grid-cols-3">
        {linhas.map((l) => {
          const on = filtro === l.chave;
          const Icone = l.fornecedor ? ICONE_DO_FORNECEDOR[l.fornecedor] : Building2;
          const nome = rotuloDoFornecedor(l.fornecedor) ?? "Sem fornecedor";
          const forma = l.fornecedor ? rotuloDaForma(l.formaPagamento) ?? "pagamento a definir" : "falta informar";
          return (
            <li key={l.chave}>
              <button type="button" aria-pressed={on} onClick={() => aoFiltrar(on ? null : l.chave)}
                aria-label={`${nome}, ${forma}: ${plural(l.quartos, "quarto", "quartos")}. ${on ? "Ver todos" : "Mostrar só estes"}`}
                className={cn("esp-alvo flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", on ? "bg-brand-soft" : "hover:bg-surface-muted")}
                data-testid={`resumo-fornecedor-${l.chave}`}>
                <Icone className={cn("h-4 w-4 shrink-0", l.fornecedor ? "text-primary" : "text-warning")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{nome}</span>
                  <span className={cn("block truncate text-xs", l.fornecedor && l.formaPagamento ? "text-muted-foreground" : "text-warning")}>{forma}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs tabular-nums text-foreground">{plural(l.quartos, "quarto", "quartos")} · {plural(l.hospedes, "pessoa", "pessoas")}</span>
                  {l.valorCentavos !== null && <span className="block text-xs font-semibold tabular-nums text-foreground">{reais(l.valorCentavos)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
