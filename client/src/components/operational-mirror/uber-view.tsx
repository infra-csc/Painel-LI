/**
 * Visão Uber do espelho operacional (25/09 — extraída da página; redesenho 07/10).
 * Quem está fora da roteirização, a roteirização (ida/volta) e os deslocamentos internos.
 */
import { CheckCheck, Loader2, Car, RefreshCw, UserX } from "lucide-react";
import type { UberGroup } from "@shared/operational-mirror-types";
import { cn } from "@/lib/utils";
import { Roteirizacao } from "./roteirizacao";
import { fmtDate, memberInfo, uberDirectionLabel, type GroupViewProps } from "./mirror-shared";

export type UberViewProps = GroupViewProps<UberGroup> & {
  onSkipUber?: (rowId: string, skip: boolean) => void;
  /** "Refazer sugestões" no lugar em que o resultado aparece. */
  onRecalc?: () => void;
  recalcPending?: boolean;
};

const COR_DO_GRUPO = ["var(--info-strong)", "var(--primary)", "var(--warning-strong)", "var(--success-strong)", "var(--danger-strong)", "var(--muted-foreground)"];

export function UberView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onMover, pendingId, onSkipUber, onRecalc, recalcPending }: UberViewProps) {
  const refazer = canEdit && onRecalc ? (
    <button type="button" onClick={onRecalc} disabled={recalcPending}
      className="esp-alvo inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {recalcPending ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
      {recalcPending ? "Recalculando…" : "Refazer sugestões"}
    </button>
  ) : null;
  /**
   * Quem não está em carro nenhum (31/08): dispensado da roteirização ou sem
   * voo lançado. Antes essas pessoas simplesmente não apareciam em lugar
   * nenhum desta visão — e ninguém sabia que faltavam.
   */
  const emCarro = new Set<string>();
  for (const g of groups) for (const m of g.members || []) if (m.collaboratorId) emCarro.add(m.collaboratorId);
  const foraDaRoteirizacao = rows.filter((r) => r.skipUber || (r.collaborator.id && !emCarro.has(r.collaborator.id)));

  const blocoFora = foraDaRoteirizacao.length > 0 ? (
    <section id="uber-fora" className="scroll-mt-40 overflow-hidden rounded-xl border border-warning/30 bg-card shadow-1" data-testid="uber-fora">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-warning/25 bg-warning-soft/70 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-warning">
          <UserX className="h-4 w-4" aria-hidden="true" /> Fora da roteirização
          <span className="rounded bg-warning/10 px-1 text-2xs font-semibold tabular-nums">{foraDaRoteirizacao.length}</span>
        </h3>
        <p className="text-xs text-warning/90">
          Quem foi dispensado do Uber e quem ainda não tem voo lançado. Não entram em carro e não geram custo.
        </p>
      </header>
      <ul className="divide-y divide-border/70">
        {foraDaRoteirizacao.map((r) => (
          <li key={r.teamInclusionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs transition-colors hover:bg-surface-muted/60">
            <span className="min-w-[180px] font-medium text-foreground">{r.collaborator.fullName}</span>
            <span className="min-w-[110px] capitalize text-muted-foreground">{r.function.area || r.function.name || "Sem área"}</span>
            <span className={cn("inline-flex h-[22px] items-center rounded-md px-[7px] text-2xs font-medium", r.skipUber ? "bg-muted text-slate-600" : "bg-warning-soft text-warning")}>
              {r.skipUber ? "não vai de Uber" : "sem voo lançado"}
            </span>
            {canEdit && r.skipUber && onSkipUber && (
              <button type="button"
                onClick={() => onSkipUber(r.teamInclusionId, false)}
                className="esp-alvo ml-auto inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`voltar-uber-${r.teamInclusionId}`}>
                Voltar para a roteirização
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="uber-vazio">
          <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><Car className="h-5 w-5" /></span>
          <h2 className="m-0 text-base font-semibold text-foreground">Nenhuma sugestão de Uber ainda</h2>
          <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
            Quem coincide em data, aeroporto e voo divide o carro.{canEdit ? " Gere os carros a partir dos voos lançados." : ""}
          </p>
          {refazer && <div className="mt-4">{refazer}</div>}
        </div>
        {blocoFora}
      </div>
    );
  }
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  const idas = groups.filter((g) => g.direction === "ida");
  const voltas = groups.filter((g) => g.direction === "volta");
  const internos = groups.filter((g) => g.direction !== "ida" && g.direction !== "volta");

  /**
   * UMA LINHA POR PESSOA, com ida e volta lado a lado — é o formato da planilha
   * que a equipe usa. Duas tabelas empilhadas obrigavam a procurar a mesma
   * pessoa duas vezes para saber a viagem dela inteira.
   *
   * Os agrupamentos das duas direções são INDEPENDENTES: dá para ser titular na
   * ida e passageiro na volta. Por isso "Carro N" aparece em toda linha — a
   * tabela é ordenada pela ida, e os carros da volta não ficam contíguos.
   */
  const indexar = (lista: UberGroup[]) => {
    const numero = new Map<string, number>();
    const porPessoa = new Map<string, UberGroup>();
    lista.forEach((g, i) => {
      numero.set(g.id, i + 1);
      for (const m of g.members || []) if (m.collaboratorId) porPessoa.set(m.collaboratorId, g);
    });
    return { numero, porPessoa };
  };
  const naIda = indexar(idas);
  const naVolta = indexar(voltas);

  const linhas = rows
    .filter((r) => r.collaborator.id && (naIda.porPessoa.has(r.collaborator.id) || naVolta.porPessoa.has(r.collaborator.id)))
    .map((r) => ({
      row: r,
      ida: naIda.porPessoa.get(r.collaborator.id as string),
      volta: naVolta.porPessoa.get(r.collaborator.id as string),
    }))
    // Ordenada pela ida — quem sai antes aparece antes.
    .sort((a, b) => `${a.ida?.date ?? "9"}${a.ida?.time ?? "9"}`.localeCompare(`${b.ida?.date ?? "9"}${b.ida?.time ?? "9"}`));

  const th = "h-9 px-3 text-left align-middle text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap border-b border-border";
  return (
    <div className="space-y-4">
      {linhas.length > 0 && (
        <Roteirizacao
          linhas={linhas} naIda={naIda} naVolta={naVolta}
          totalIda={idas.length} totalVolta={voltas.length}
          collabById={collabById} canEdit={canEdit}
          onConfirm={onConfirm} onPatch={onPatch} onMover={onMover}
          pendingId={pendingId} onSkipUber={onSkipUber}
          gruposIda={idas} gruposVolta={voltas}
          acao={refazer} fora={foraDaRoteirizacao.length}
        />
      )}

      {blocoFora}

      {internos.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-1">
          <header className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">Uber no evento</h3>
            <p className="text-xs text-muted-foreground">Deslocamentos que não são do aeroporto.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className={cn(th, "pl-4")}>Nome</th>
                  <th scope="col" className={th}>Departamento</th>
                  <th scope="col" className={th}>Trajeto</th>
                  <th scope="col" className={th}>Data</th>
                  <th scope="col" className={cn(th, "pr-4 text-right")}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {internos.map((g, gi) => {
                  const membros = (g.members || []).map((m) => memberInfo(m, collabById));
                  const ultimo = gi === internos.length - 1;
                  return membros.map((m, mi) => {
                    const r = m.id ? rowByCollab.get(m.id) : undefined;
                    const fimDoGrupo = mi === membros.length - 1;
                    const borda = fimDoGrupo && !ultimo ? "border-b-[3px] border-b-muted" : fimDoGrupo ? "" : "border-b border-b-border/60";
                    return (
                      <tr key={`${g.id}-${m.id ?? mi}`} className="esp-grupo transition-colors hover:bg-surface-muted/60"
                        style={{ ["--esp-cor" as string]: COR_DO_GRUPO[gi % COR_DO_GRUPO.length] }}>
                        <td className={cn("py-2 pl-4 pr-3 font-medium text-foreground", borda)}>{m.name}</td>
                        <td className={cn("px-3 py-2 capitalize text-muted-foreground", borda)}>{r?.function.area || r?.function.name || "—"}</td>
                        <td className={cn("px-3 py-2", borda)}>{[g.origin, g.destination].filter(Boolean).join(" → ") || uberDirectionLabel(g.direction)}</td>
                        <td className={cn("px-3 py-2 tabular-nums", borda)}>{fmtDate(g.date)}</td>
                        {mi === 0 ? (
                          <td className={cn("py-2 pl-3 pr-4 text-right align-middle", ultimo ? "" : "border-b-[3px] border-b-muted")} rowSpan={membros.length}>
                            {g.confirmed ? <span className="inline-flex h-6 items-center gap-1 rounded-md bg-success-soft px-2 text-2xs font-medium text-success"><CheckCheck className="h-3 w-3" aria-hidden="true" /> Confirmado</span>
                              : canEdit ? (
                                <button type="button" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id}
                                  className="esp-alvo inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary disabled:opacity-60">
                                  {pendingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                                  {pendingId === g.id ? "Confirmando…" : "Confirmar"}
                                </button>
                              ) : <span className="inline-flex h-6 items-center rounded-md bg-brand-soft px-2 text-2xs font-medium text-primary">Sugestão</span>}
                          </td>
                        ) : null}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
