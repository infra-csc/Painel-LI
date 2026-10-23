/**
 * Quarto confirmado × hospedagem da vaga, na aba Quartos (23/10, dono: "no
 * espelho operacional, quando colocarmos o hotel, refletir na passagem" →
 * "basicamente, quando confirmar, deve preencher lá na aba de Hospedagem com
 * os dados").
 *
 * O "Confirmar" do quarto preenche, no servidor, a hospedagem de cada pessoa
 * (hotel, check-in/out, tipo, diárias, valor, com quem divide) — é a
 * hospedagem que Passagens, Hospedagens e a Escalação leem. Aqui:
 *  - na linha da pessoa: "Hospedagem preenchida"; dados lançados à mão
 *    diferentes ("difere") ou quarto que mudou depois do Confirmar
 *    ("desatualizada"), com "Usar os dados do quarto"; e, no quarto reaberto,
 *    "quarto reaberto — confira a hospedagem" (nada é apagado ao reabrir);
 *  - na faixa do hotel do evento: o resumo do evento, com as ações em lote.
 * Regra em shared/hotel-na-hospedagem.ts.
 */
import { useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertTriangle, BedDouble, CheckCircle2, Info, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { textoDoCampo, type DiferencaDoQuarto, type SituacaoDaHospedagem } from "@shared/hotel-na-hospedagem";
import { mirrorQueryKey } from "./use-mirror-data";

/** O que o servidor devolve depois de preencher (server/hotel-na-hospedagem.ts). */
export interface ResumoDasHospedagens {
  criadas: number;
  atualizadas: number;
  diferem: { teamInclusionId: string; nome: string; diferencas: DiferencaDoQuarto[] }[];
  canceladas: number;
  semHotel: number;
  statusAlterados: number;
}

/**
 * Hospedagem e status da vaga mudaram: as outras telas (Passagens,
 * Hospedagens, Escalação) releem quando abrirem. `refetchType: "none"` — aqui
 * no Espelho nada disso está à vista, então não há por que buscar agora.
 */
export function invalidarLogisticaDasOutrasTelas(queryClient: QueryClient) {
  for (const chave of ["/api/accommodations", "/api/team-inclusions"]) {
    void queryClient.invalidateQueries({ queryKey: [chave], refetchType: "none" });
  }
}

const pessoasTxt = (n: number) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;

/** "Hospedagem preenchida para 2 pessoas · 1 com dados lançados à mão — confira na linha." */
export function textoDoPreenchimento(r: ResumoDasHospedagens | null | undefined): string | undefined {
  if (!r) return undefined;
  const tocadas = r.criadas + r.atualizadas;
  const partes = [
    tocadas > 0 && `Hospedagem preenchida para ${pessoasTxt(tocadas)}`,
    r.diferem.length > 0 && `${r.diferem.length === 1 ? "1 com dados lançados à mão" : `${r.diferem.length} com dados lançados à mão`} — confira na linha`,
    r.semHotel > 0 && "quarto sem hotel: a hospedagem não foi preenchida",
  ].filter((x): x is string => !!x);
  return partes.length ? `${partes.join(" · ")}.` : undefined;
}

/** Preencher (sem corpo) e "Usar os dados do quarto" (`usarDadosDoQuarto: [vagas]`). */
export function useHospedagensDoEspelho(eventId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (usarDadosDoQuarto?: string[]): Promise<ResumoDasHospedagens> =>
      (await apiRequest("POST", `/api/events/${eventId}/operational-mirror/hospedagens`, usarDadosDoQuarto ? { usarDadosDoQuarto } : {})).json(),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: mirrorQueryKey(eventId) });
      invalidarLogisticaDasOutrasTelas(queryClient);
      const tocadas = r.criadas + r.atualizadas;
      toast({
        title: tocadas > 0 ? `Hospedagem atualizada (${pessoasTxt(tocadas)})` : "As hospedagens já estavam com os dados do quarto",
        description: textoDoPreenchimento({ ...r, criadas: 0, atualizadas: 0 }),
      });
    },
    onError: (e) => toast({ title: "Não foi possível atualizar as hospedagens", description: apiErrorMessage(e, "Tente novamente em instantes."), variant: "destructive" }),
  });
}

/** Situação da hospedagem de um ocupante, como a aba mostra. */
export interface HospedagemDoOcupante {
  teamInclusionId: string;
  nome: string;
  /** Quarto confirmado: a conferência; quarto aberto: só "reaberto" (ou nada). */
  situacao: SituacaoDaHospedagem | "reaberto";
  diferencas: DiferencaDoQuarto[];
}

const listaDeDiferencas = (d: DiferencaDoQuarto[]) =>
  d.map((x) => `${x.rotulo}: ${textoDoCampo(x.campo, x.naHospedagem)} (quarto: ${textoDoCampo(x.campo, x.doQuarto)})`).join(" · ");

/**
 * A linha "Hospedagens" dentro da faixa do hotel do evento: quantas pessoas
 * de quarto confirmado já têm a hospedagem preenchida, e o que falta conferir.
 */
export function HospedagensDasVagas({ eventId, canEdit, ocupantes }: {
  eventId: string;
  canEdit: boolean;
  ocupantes: HospedagemDoOcupante[];
}) {
  const acao = useHospedagensDoEspelho(eventId);
  const [perguntar, setPerguntar] = useState(false);
  const conta = (s: HospedagemDoOcupante["situacao"]) => ocupantes.filter((o) => o.situacao === s);
  const preenchidas = conta("preenchida").length;
  const aPreencher = conta("a-preencher").length + conta("desatualizada").length;
  const diferem = conta("difere");
  const reabertos = conta("reaberto").length;
  const confirmados = ocupantes.filter((o) => o.situacao !== "reaberto").length;
  if (confirmados === 0 && reabertos === 0) {
    return (
      <p className="m-0 flex basis-full items-center gap-1.5 border-t border-dashed border-border pt-2.5 text-xs text-muted-foreground" data-testid="hospedagens-das-vagas">
        <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Ao confirmar um quarto, a hospedagem de cada pessoa é preenchida com o hotel, as datas, o tipo e o valor.
      </p>
    );
  }
  const tudoCerto = aPreencher === 0 && diferem.length === 0 && reabertos === 0;
  const partes = [
    preenchidas > 0 && `${preenchidas} ${preenchidas === 1 ? "preenchida" : "preenchidas"}`,
    aPreencher > 0 && `${aPreencher} a preencher`,
    diferem.length > 0 && `${diferem.length} com dados lançados à mão`,
    reabertos > 0 && `${reabertos} em quarto reaberto`,
  ].filter((x): x is string => !!x);

  return (
    <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed border-border pt-2.5" data-testid="hospedagens-das-vagas">
      <span className="esp-hotel-evento-rotulo !basis-auto">
        <BedDouble className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Hospedagens
      </span>
      <span className={`flex min-w-0 items-center gap-1.5 text-xs tabular-nums ${tudoCerto ? "text-success" : "text-muted-foreground"}`} aria-live="polite" data-testid="hospedagens-das-vagas-situacao">
        {tudoCerto
          ? <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{preenchidas === 1 ? "1 preenchida pelo quarto confirmado" : `${preenchidas} preenchidas pelos quartos confirmados`}</>
          : partes.join(" · ")}
      </span>
      {canEdit && (aPreencher > 0 || diferem.length > 0) && (
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {aPreencher > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={acao.isPending}
              onClick={() => acao.mutate(undefined)} data-testid="hospedagens-preencher">
              {acao.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              Preencher {aPreencher}
            </Button>
          )}
          {diferem.length > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={acao.isPending}
              onClick={() => setPerguntar(true)} data-testid="hospedagens-usar-todas">
              Usar os dados do quarto ({diferem.length})
            </Button>
          )}
        </span>
      )}

      <AlertDialog open={perguntar} onOpenChange={setPerguntar}>
        <AlertDialogContent className="max-w-[520px]" data-testid="hospedagens-usar-dialogo">
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar os dados lançados à mão pelos do quarto?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                <p className="m-0">{diferem.length === 1 ? "Esta hospedagem foi preenchida" : `Estas ${diferem.length} hospedagens foram preenchidas`} à mão com dados diferentes do quarto confirmado:</p>
                <ul className="m-0 max-h-56 list-none space-y-1.5 overflow-y-auto p-0">
                  {diferem.map((o) => (
                    <li key={o.teamInclusionId} className="text-xs">
                      <span className="font-medium text-foreground">{o.nome}</span> — {listaDeDiferencas(o.diferencas)}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0">Manter como está</AlertDialogCancel>
            <Button type="button" onClick={() => { setPerguntar(false); acao.mutate(diferem.map((o) => o.teamInclusionId)); }} data-testid="hospedagens-usar-confirmar">
              Usar os dados do quarto
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Na linha do ocupante: a situação da hospedagem dele (nada quando não há o que dizer). */
export function HospedagemDoOcupanteAviso({ eventId, canEdit, ocupante }: {
  eventId: string | undefined;
  canEdit: boolean;
  ocupante: HospedagemDoOcupante;
}) {
  const acao = useHospedagensDoEspelho(eventId ?? "");
  const { situacao } = ocupante;
  if (situacao === "cancelada") return null;
  if (situacao === "preenchida") {
    return (
      <div className="esp-oc-aviso flex items-center gap-1 text-2xs leading-snug text-success" data-testid={`hospedagem-ok-${ocupante.teamInclusionId}`}>
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />Hospedagem preenchida
      </div>
    );
  }
  if (situacao === "reaberto") {
    return (
      <div className="esp-oc-aviso flex items-start gap-1 text-2xs leading-snug text-info" data-testid={`hospedagem-reaberto-${ocupante.teamInclusionId}`}>
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Quarto reaberto — confira a hospedagem (tem os dados do último Confirmar; confirme de novo para atualizar).</span>
      </div>
    );
  }
  const texto = situacao === "difere"
    ? <>Hospedagem lançada à mão: {listaDeDiferencas(ocupante.diferencas)}</>
    : situacao === "desatualizada"
    ? <>Hospedagem desatualizada — o quarto mudou depois do Confirmar</>
    : <>Hospedagem ainda não preenchida</>;
  return (
    <div className="esp-oc-aviso flex items-start gap-1 text-2xs leading-snug text-warning" data-testid={`hospedagem-${situacao}-${ocupante.teamInclusionId}`}>
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span>{texto}</span>
        {canEdit && eventId && (
          <button type="button" disabled={acao.isPending}
            onClick={() => acao.mutate([ocupante.teamInclusionId])}
            className="esp-alvo -my-1 ml-1 inline-flex h-6 items-center gap-1 rounded-md px-1.5 align-middle font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            data-testid={`hospedagem-usar-${ocupante.teamInclusionId}`}>
            {acao.isPending && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {situacao === "difere" ? "Usar os dados do quarto" : "Preencher agora"}
          </button>
        )}
      </span>
    </div>
  );
}
