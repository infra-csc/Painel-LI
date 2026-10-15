/**
 * "Hotel do evento" na aba Quartos (15/10, dono: "todos ficam no mesmo
 * [hotel] por evento"). Um campo só, no topo: ao aplicar, o hotel vai para
 * TODOS os quartos do evento numa transação (PATCH
 * /api/events/:id/operational-mirror/hotel). Quarto confirmado fica como
 * está; quarto que alguém pôs em OUTRO hotel não é trocado sem perguntar —
 * o diálogo oferece "manter" ou "trocar todos".
 *
 * Não há coluna própria: o hotel do evento é o hotel comum aos quartos
 * (`hotelDoEvento`, shared/rooming-list.ts). A regra do que muda em cada
 * quarto é a mesma no cliente (prévia) e no servidor (`planoDoHotelDoEvento`).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { chaveDoHotel, hoteisDosQuartos, hotelDoEvento, nomeDeHotelLimpo, planoDoHotelDoEvento, type QuartoParaOHotelDoEvento } from "@shared/rooming-list";
import { mirrorQueryKey } from "./use-mirror-data";

interface Resposta {
  hotel: string;
  aplicados: number;
  confirmadosMantidos: number;
  outrosMantidos: number;
}

const quartosTxt = (n: number) => `${n} ${n === 1 ? "quarto" : "quartos"}`;

/** "2 confirmados ficaram como estavam · 1 em outro hotel foi mantido". */
export function avisoDoQueFicou(r: Pick<Resposta, "confirmadosMantidos" | "outrosMantidos">): string | undefined {
  const partes = [
    r.confirmadosMantidos > 0 && (r.confirmadosMantidos === 1 ? "1 confirmado ficou como estava" : `${r.confirmadosMantidos} confirmados ficaram como estavam`),
    r.outrosMantidos > 0 && (r.outrosMantidos === 1 ? "1 quarto em outro hotel foi mantido" : `${r.outrosMantidos} quartos em outro hotel foram mantidos`),
  ].filter((x): x is string => !!x);
  return partes.length ? `${partes.join(" · ")}.` : undefined;
}

export function HotelDoEvento({ eventId, quartos, listaDeSugestoes, canEdit }: {
  eventId: string;
  quartos: QuartoParaOHotelDoEvento[];
  /** id do <datalist> com os hotéis já usados no evento. */
  listaDeSugestoes: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const atual = useMemo(() => hotelDoEvento(quartos), [quartos]);
  const [texto, setTexto] = useState(atual ?? "");
  const [perguntar, setPerguntar] = useState(false);
  // Outra pessoa (ou o "trocar só este quarto") mudou o hotel do evento: o campo acompanha.
  useEffect(() => { setTexto(atual ?? ""); }, [atual]);

  const plano = useMemo(() => planoDoHotelDoEvento(quartos, texto), [quartos, texto]);
  const { hoteis, semHotel } = useMemo(() => hoteisDosQuartos(quartos), [quartos]);
  const noAtual = atual ? hoteis.find((h) => chaveDoHotel(h.nome) === chaveDoHotel(atual))?.quartos ?? 0 : 0;
  const emOutro = quartos.length - noAtual - semHotel;
  const outrosPorHotel = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of plano.emOutroHotel) m.set(o.hotel, (m.get(o.hotel) ?? 0) + 1);
    return Array.from(m, ([nome, n]) => `${nome} (${n})`).join(", ");
  }, [plano.emOutroHotel]);

  const aplicar = useMutation({
    mutationFn: async (trocarOutros: boolean): Promise<Resposta> =>
      (await apiRequest("PATCH", `/api/events/${eventId}/operational-mirror/hotel`, { hotelName: plano.hotel, trocarOutros })).json(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: mirrorQueryKey(eventId) });
      toast({
        title: r.aplicados > 0 ? `Hotel definido em ${quartosTxt(r.aplicados)}` : "Nenhum quarto mudou",
        description: avisoDoQueFicou(r),
      });
    },
    onError: (e) => toast({ title: "Não foi possível aplicar o hotel", description: (e as Error)?.message || "Tente novamente em instantes.", variant: "destructive" }),
  });

  const nadaAFazer = plano.aplicar.length === 0 && plano.emOutroHotel.length === 0;
  const pedir = () => {
    if (!plano.hotel || nadaAFazer || aplicar.isPending) return;
    if (plano.emOutroHotel.length > 0) setPerguntar(true);
    else aplicar.mutate(false);
  };

  const situacao = !atual
    ? "Nenhum quarto tem hotel ainda."
    : [
      noAtual === quartos.length ? (quartos.length === 1 ? "No único quarto" : `Em todos os ${quartos.length} quartos`) : `Em ${noAtual} de ${quartos.length} quartos`,
      emOutro > 0 && `${emOutro} em outro hotel`,
      semHotel > 0 && `${semHotel} sem hotel`,
    ].filter(Boolean).join(" · ");

  if (!canEdit) {
    return (
      <div className="esp-hotel-evento" data-testid="hotel-do-evento">
        <span className="esp-hotel-evento-rotulo"><Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Hotel do evento</span>
        <span className={`text-sm ${atual ? "font-medium text-foreground" : "text-muted-foreground"}`}>{atual ?? "a definir"}</span>
        <span className="esp-hotel-evento-situacao">{atual ? situacao : null}</span>
      </div>
    );
  }

  const n = plano.emOutroHotel.length;
  return (
    <div className="esp-hotel-evento" data-testid="hotel-do-evento">
      <label htmlFor={`hotel-do-evento-${eventId}`} className="esp-hotel-evento-rotulo">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Hotel do evento
      </label>
      <form className="esp-hotel-evento-campo" onSubmit={(e) => { e.preventDefault(); pedir(); }}>
        <input id={`hotel-do-evento-${eventId}`} value={texto} list={listaDeSugestoes} maxLength={120} autoComplete="off"
          onChange={(e) => setTexto(e.target.value)} disabled={aplicar.isPending}
          onKeyDown={(e) => { if (e.key === "Escape" && texto !== (atual ?? "")) { e.preventDefault(); setTexto(atual ?? ""); } }}
          placeholder="Nome do hotel" aria-describedby={`hotel-do-evento-situacao-${eventId}`}
          data-testid="hotel-do-evento-campo"
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-1 transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 disabled:opacity-60" />
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!plano.hotel || nadaAFazer || aplicar.isPending} data-testid="hotel-do-evento-aplicar">
          {aplicar.isPending
            ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {aplicar.isPending ? "Aplicando…" : "Aplicar a todos"}
        </Button>
      </form>
      <p id={`hotel-do-evento-situacao-${eventId}`} className="esp-hotel-evento-situacao" aria-live="polite" data-testid="hotel-do-evento-situacao">
        {plano.hotel && !nadaAFazer && chaveDoHotel(plano.hotel) !== chaveDoHotel(atual)
          ? `Vai para ${quartosTxt(plano.aplicar.length + n)}${plano.confirmadosMantidos ? ` · ${plano.confirmadosMantidos === 1 ? "1 confirmado fica" : `${plano.confirmadosMantidos} confirmados ficam`} como está` : ""}`
          : situacao}
      </p>

      <AlertDialog open={perguntar} onOpenChange={setPerguntar}>
        <AlertDialogContent className="max-w-[460px]" data-testid="hotel-do-evento-dialogo">
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar “{nomeDeHotelLimpo(plano.hotel)}” a todos os quartos?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {n === 1 ? "1 quarto está em outro hotel" : `${n} quartos estão em outro hotel`}: {outrosPorHotel}.
              {" "}Quer {n === 1 ? "manter esse quarto onde está" : "manter esses quartos onde estão"} ou trocar todos?
              {plano.confirmadosMantidos > 0 && ` Quartos confirmados ficam como estão (${plano.confirmadosMantidos}).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={() => { setPerguntar(false); aplicar.mutate(false); }} data-testid="hotel-do-evento-manter">
              {n === 1 ? "Manter esse" : `Manter esses ${n}`}
            </Button>
            <Button type="button" onClick={() => { setPerguntar(false); aplicar.mutate(true); }} data-testid="hotel-do-evento-trocar-todos">
              Trocar todos
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
