/**
 * Peças pequenas das Ordens de compra (28/10): a pílula do estado, o CNPJ
 * emissor com o selo de contrato e o resumo da prestação no topo dos
 * diálogos.
 */
import { SeloContratoAtivo } from "@/components/contratos/pecas";
import { seloDoCnpj } from "@/components/presenca/presenca-utils";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EstadoDoPagamento } from "@shared/honorarios-pagamento";
import { reais } from "./oc-utils";
import type { CnpjEmissorDaLinha, LinhaDaOc } from "./tipos";

/** Forma das pílulas (22px · cantos de 6px · 11px) — a das telas irmãs. */
export const PILULA = "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-2xs font-semibold whitespace-nowrap";

export const TOM_DO_ESTADO: Record<EstadoDoPagamento | "nao_emite", string> = {
  sem_oc: "bg-muted text-slate-700",
  com_oc: "bg-brand-soft text-primary",
  nf_enviada: "bg-warning-soft text-warning",
  nf_devolvida: "bg-warning-soft text-warning",
  nf_recusada: "bg-danger-soft text-danger",
  nf_aprovada: "bg-info-soft text-info",
  programado: "bg-info-soft text-info",
  pago: "bg-success-soft text-success",
  nao_emite: "bg-muted text-muted-foreground",
};

/** Cor do filete/ponto de cada estado (fila e borda da linha). */
export const COR_DO_ESTADO: Record<EstadoDoPagamento | "nao_emite", string> = {
  sem_oc: "text-slate-500",
  com_oc: "text-primary",
  nf_enviada: "text-warning",
  nf_devolvida: "text-warning",
  nf_recusada: "text-danger",
  nf_aprovada: "text-info",
  programado: "text-info",
  pago: "text-success",
  nao_emite: "text-muted-foreground",
};

export function PilulaDoEstado({ linha, className }: { linha: Pick<LinhaDaOc, "estado" | "rotuloDoEstado" | "emiteNf">; className?: string }) {
  const chave = !linha.emiteNf && linha.estado === "sem_oc" ? "nao_emite" : linha.estado;
  return <span className={cn(PILULA, TOM_DO_ESTADO[chave], className)} data-estado={chave}>{linha.rotuloDoEstado}</span>;
}

export function CnpjEmissor({ cnpj, compacto = false }: { cnpj: CnpjEmissorDaLinha; compacto?: boolean }) {
  if (!cnpj.cnpj) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <SeloContratoAtivo situacao="sem_cnpj" />
        não informado
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium tabular-nums text-foreground">{cnpj.cnpj}</span>
        <SeloContratoAtivo situacao={seloDoCnpj(cnpj.situacao)} mostrarQuandoAtivo />
      </span>
      {!compacto && cnpj.razaoSocial && <span className="block min-w-0 truncate text-2xs text-muted-foreground" title={cnpj.razaoSocial}>{cnpj.razaoSocial}</span>}
    </span>
  );
}

/** O topo dos diálogos: quem é, a função, o valor aprovado e o CNPJ emissor. */
export function ResumoDaPrestacao({ linha, className }: { linha: LinhaDaOc; className?: string }) {
  const nome = linha.colaborador ? toTitleCase(linha.colaborador.nome) : "Sem colaborador";
  return (
    <div className={cn("rounded-lg border border-border bg-surface-muted/70 px-3.5 py-2.5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold leading-5 text-foreground break-words">{nome}</p>
          <p className="m-0 text-xs text-muted-foreground">
            {linha.funcao.nome ?? "Sem função"}
            {linha.colaborador?.numero ? <span className="tabular-nums"> · nº {linha.colaborador.numero}</span> : null}
            {linha.funcao.centroDeCusto ? <> · CC {linha.funcao.centroDeCusto}</> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-2xs text-muted-foreground">Valor aprovado</p>
          <p className="m-0 text-sm font-semibold tabular-nums text-foreground">{reais(linha.valorAprovado)}</p>
        </div>
      </div>
      <div className="mt-1.5"><CnpjEmissor cnpj={linha.cnpjEmissor} /></div>
    </div>
  );
}
