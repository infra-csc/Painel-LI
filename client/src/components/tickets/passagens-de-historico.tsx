/**
 * Passagens anteriores da vaga (01/10).
 *
 * Dono: "eu comprei mas vamos trocar o colaborador — aquela passagem fica de
 * histórico, e o custo mantém na prova" / "tem que ter algo falando do total
 * daquela passagem com o histórico". Quando uma troca é aprovada, a passagem
 * de quem saiu não é apagada: vira histórico da vaga (servidor, trocas.ts).
 * Este bloco mostra cada uma (de quem era, por quê, trechos, LOC, valor e
 * anexos) e o TOTAL da vaga = passagem atual + histórico.
 *
 * A chave começa com "/api/tickets": toda invalidação de passagens (registrar,
 * aprovar troca) também atualiza o histórico.
 */
import { useQuery } from "@tanstack/react-query";
import { History, Paperclip } from "lucide-react";
import type { Ticket } from "@shared/schema";
import { fetchJson } from "@/lib/queryClient";
import { formatarMoeda } from "@/lib/format";

type PassagemDeHistorico = Ticket & { archivedCollaboratorName: string | null };

const dataBr = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const s = d instanceof Date ? d.toISOString() : String(d);
  const [a, m, dia] = s.slice(0, 10).split("-");
  return a && m && dia ? `${dia}/${m}/${a}` : "";
};

function trecho(rotulo: string, data: string | null | undefined, hora: string | null | undefined, origem: string | null | undefined, destino: string | null | undefined) {
  if (!data && !origem && !destino) return null;
  const rota = origem || destino ? ` · ${origem ?? "?"} → ${destino ?? "?"}` : "";
  return <span>{rotulo} {dataBr(data)}{hora ? ` ${hora}` : ""}{rota}</span>;
}

export function PassagensDeHistorico({ teamInclusionId, passagemAtualCentavos }: {
  teamInclusionId: string;
  /** Valor da passagem ATUAL da vaga (centavos), para o total. */
  passagemAtualCentavos?: number | null;
}) {
  const { data: historico } = useQuery<PassagemDeHistorico[]>({
    queryKey: ["/api/tickets", "historico", { teamInclusionId }],
    queryFn: ({ signal }) => fetchJson<PassagemDeHistorico[]>(`/api/tickets/historico?teamInclusionId=${encodeURIComponent(teamInclusionId)}`, signal),
    staleTime: 30_000,
  });
  if (!historico || historico.length === 0) return null;

  const totalHistorico = historico.reduce((s, t) => s + (t.value || 0), 0);
  const atual = passagemAtualCentavos || 0;

  return (
    <section className="mt-5 rounded-xl border border-border overflow-hidden" aria-labelledby={`historico-passagem-${teamInclusionId}`} data-testid="passagens-de-historico">
      <div className="flex items-center gap-2 bg-surface-muted border-b border-border px-4 py-2.5">
        <History className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 id={`historico-passagem-${teamInclusionId}`} className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Passagens anteriores · histórico
        </h3>
        <span className="ml-auto text-2xs text-muted-foreground">{historico.length} {historico.length === 1 ? "passagem" : "passagens"}</span>
      </div>

      <ul className="divide-y divide-border">
        {historico.map((t) => {
          const loc = t.purchaseOrderNumber || t.locator;
          return (
            <li key={t.id} className="px-4 py-3 text-xs text-slate-700 space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="font-semibold text-foreground">Era de {t.archivedCollaboratorName ?? "colaborador anterior"}</span>
                <span className="tabular-nums font-semibold text-foreground">{t.value ? formatarMoeda(t.value) : "sem valor"}</span>
              </div>
              {t.archivedReason && (
                <div className="text-muted-foreground">{t.archivedReason}{t.archivedAt ? ` · ${dataBr(t.archivedAt)}` : ""}</div>
              )}
              <div className="flex flex-col gap-0.5 text-muted-foreground">
                {trecho("Ida", t.actualDepartureDate, t.actualDepartureTime, t.departureAirport || t.departureCityOrigin, t.destinationAirport || t.departureCityDestination)}
                {trecho("Volta", t.actualReturnDate, t.actualReturnTime, t.returnOriginAirport || t.returnCityOrigin, t.returnDestinationAirport || t.returnCityDestination)}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                {loc && <span>LOC <span className="font-mono text-slate-700">{loc}</span></span>}
                {t.ticketCompany && <span>{t.ticketCompany}</span>}
                {(t.attachmentIds ?? []).map((id, i) => (
                  <a
                    key={id}
                    href={`/api/attachments/${id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Paperclip className="w-3 h-3" aria-hidden="true" />Anexo {i + 1}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Total da vaga: o dinheiro das passagens de troca continua na prova. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border bg-surface-muted/60 px-4 py-2.5" data-testid="total-passagens-da-vaga">
        <span className="text-xs text-slate-600">
          Total de passagens desta vaga: atual {formatarMoeda(atual)} + histórico {formatarMoeda(totalHistorico)}
        </span>
        <span className="tabular-nums text-sm font-bold text-foreground">{formatarMoeda(atual + totalHistorico)}</span>
      </div>
    </section>
  );
}

export default PassagensDeHistorico;
