/**
 * Visão Uber do espelho operacional (25/09 — extraída da página).
 * Quem está fora da roteirização, a roteirização (ida/volta) e os deslocamentos internos.
 */
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { UberGroup } from "@shared/operational-mirror-types";
import { Roteirizacao } from "./roteirizacao";
import { FAIXA, fmtDate, memberInfo, uberDirectionLabel, type GroupViewProps } from "./mirror-shared";

export type UberViewProps = GroupViewProps<UberGroup> & { onSkipUber?: (rowId: string, skip: boolean) => void };

export function UberView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onMover, pendingId, onSkipUber }: UberViewProps) {
  const emptyHint = canEdit ? ' Clique em "Refazer sugestões".' : "";
  /**
   * Quem não está em carro nenhum (31/08): dispensado da roteirização ou sem
   * voo lançado. Antes essas pessoas simplesmente não apareciam em lugar
   * nenhum desta visão — e ninguém sabia que faltavam.
   */
  const emCarro = new Set<string>();
  for (const g of groups) for (const m of g.members || []) if (m.collaboratorId) emCarro.add(m.collaboratorId);
  const foraDaRoteirizacao = rows.filter((r) => r.skipUber || (r.collaborator.id && !emCarro.has(r.collaborator.id)));

  const blocoFora = foraDaRoteirizacao.length > 0 ? (
    <section className="rounded-lg border border-warning/25 bg-warning-soft/50 overflow-hidden" data-testid="uber-fora">
      <header className="px-4 py-2.5 border-b border-warning/25">
        <h3 className="text-sm font-semibold text-warning">Fora da roteirização</h3>
        <p className="mt-0.5 text-2xs text-warning/80">
          Quem foi dispensado do Uber e quem ainda não tem voo lançado. Não entram em carro e não geram custo.
        </p>
      </header>
      <ul className="divide-y divide-warning/70">
        {foraDaRoteirizacao.map((r) => (
          <li key={r.teamInclusionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
            <span className="font-medium">{r.collaborator.fullName}</span>
            <span className="capitalize text-muted-foreground">{r.function.area || r.function.name || "Sem área"}</span>
            <span className="text-warning">
              {r.skipUber ? "não vai de Uber" : "sem voo lançado"}
            </span>
            {canEdit && r.skipUber && onSkipUber && (
              <Button size="sm" variant="outline" className="ml-auto h-7 bg-background text-xs"
                onClick={() => onSkipUber(r.teamInclusionId, false)}
                data-testid={`voltar-uber-${r.teamInclusionId}`}>
                Voltar para a roteirização
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center text-sm text-muted-foreground">Nenhuma sugestão de Uber ainda.{emptyHint}</div>
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

  return (
    <div className="space-y-6">
      {blocoFora}
      {linhas.length > 0 && (
        <Roteirizacao
          linhas={linhas} naIda={naIda} naVolta={naVolta}
          totalIda={idas.length} totalVolta={voltas.length}
          collabById={collabById} canEdit={canEdit}
          onConfirm={onConfirm} onPatch={onPatch} onMover={onMover}
          pendingId={pendingId} onSkipUber={onSkipUber}
          gruposIda={idas} gruposVolta={voltas}
        />
      )}

      {internos.length > 0 && (
        <section className="rounded-lg border bg-card overflow-hidden">
          <header className="px-4 py-2.5 border-b bg-muted/40">
            <h3 className="text-sm font-semibold">Uber no evento</h3>
            <p className="text-2xs text-muted-foreground">Deslocamentos que não são do aeroporto.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b">
                <tr className="text-left">
                  <th scope="col" className="px-3 py-2 font-semibold">Nome</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Departamento</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Trajeto</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Data</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-right">Situação</th>
                </tr>
              </thead>
              <tbody>
                {internos.map((g, gi) => {
                  const membros = (g.members || []).map((m) => memberInfo(m, collabById));
                  const faixa = FAIXA[gi % FAIXA.length];
                  return membros.map((m, mi) => {
                    const r = m.id ? rowByCollab.get(m.id) : undefined;
                    return (
                      <tr key={`${g.id}-${m.id ?? mi}`}
                        className={`${faixa} ${mi === membros.length - 1 ? "border-b-2 border-border" : "border-b border-border/40"}`}>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{r?.function.area || r?.function.name || "—"}</td>
                        <td className="px-3 py-2">{[g.origin, g.destination].filter(Boolean).join(" → ") || uberDirectionLabel(g.direction)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtDate(g.date)}</td>
                        {mi === 0 ? (
                          <td className="px-3 py-2 text-right align-middle" rowSpan={membros.length}>
                            {g.confirmed ? <Badge className="bg-success hover:bg-success/90">Confirmado</Badge>
                              : canEdit ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id}>
                                  {pendingId === g.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3 w-3 mr-1" aria-hidden="true" />} Confirmar
                                </Button>
                              ) : <Badge variant="outline">Sugestão</Badge>}
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
