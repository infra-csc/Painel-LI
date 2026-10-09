/**
 * "PDF para o hotel" da aba Quartos (09/10, pedido do dono: "no final
 * precisamos de uma exportação em PDF para mandar para hotéis").
 *
 * Gera a ROOMING LIST de UM hotel: escolhe-se o hotel (quando há mais de um),
 * vê-se o que vai no documento e baixa. Quartos sem hotel ficam de fora — o
 * diálogo diz quantos. CPF só sai com a caixa marcada (desligada por padrão),
 * só para quem tem CPF no cadastro e só para papéis que já veem dados
 * pessoais; o servidor registra a exportação na auditoria (sem CPF no log).
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { toTitleCase } from "@/lib/format";
import { hasRole } from "@/lib/role-utils";
import { ROLE_GROUPS } from "@shared/roles";
import type { MirrorEvent } from "@shared/operational-mirror-types";
import { chaveDoHotel, hoteisDosQuartos, montarRoomingList, type QuartoDaRoomingList } from "@shared/rooming-list";

export function RoomingListPdf({ evento, quartos }: { evento: MirrorEvent; quartos: QuartoDaRoomingList[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [incluirCpf, setIncluirCpf] = useState(false);
  const [gerando, setGerando] = useState(false);
  const podeCpf = hasRole(user, ...ROLE_GROUPS.dadosPessoais);

  const { hoteis, semHotel } = useMemo(() => hoteisDosQuartos(quartos), [quartos]);
  // O hotel escolhido some se alguém renomeia: volta para o primeiro.
  const hotel = hoteis.find((h) => chaveDoHotel(h.nome) === chaveDoHotel(escolhido))?.nome ?? hoteis[0]?.nome ?? null;
  const previa = useMemo(() => hotel ? montarRoomingList({
    hotel, quartos, incluirCpf: false, geradoEm: new Date(),
    evento: { nome: evento.name, local: evento.location, inicio: evento.startDate, fim: evento.endDate },
    contato: { nome: "", email: null },
  }) : null, [hotel, quartos, evento]);

  const abrir = (v: boolean) => { setAberto(v); if (v) setIncluirCpf(false); };

  const gerar = async () => {
    if (!hotel) return;
    setGerando(true);
    try {
      // 1) auditoria + CPF (se pedido) — 2) PDF desenhado aqui, com as datas da tela.
      const res = await apiRequest("POST", `/api/events/${evento.id}/operational-mirror/rooming-list`, { hotel, incluirCpf: incluirCpf && podeCpf });
      const { cpfs } = (await res.json()) as { cpfs: Record<string, string> };
      const lista = montarRoomingList({
        hotel,
        incluirCpf: incluirCpf && podeCpf,
        geradoEm: new Date(),
        evento: { nome: evento.name, local: evento.location, inicio: evento.startDate, fim: evento.endDate },
        contato: { nome: user?.name || "Logística", email: user?.email ?? null },
        quartos: quartos.map((q) => ({
          ...q,
          hospedes: q.hospedes.map((h) => ({ ...h, nome: toTitleCase(h.nome), cpf: h.collaboratorId ? cpfs?.[h.collaboratorId] ?? null : null })),
        })),
      });
      const { baixarRoomingListPdf } = await import("@/lib/rooming-list-pdf");
      await baixarRoomingListPdf(lista);
      toast({ title: "PDF gerado", description: lista.nomeDoArquivo });
      setAberto(false);
    } catch (e) {
      toast({ title: "Não foi possível gerar o PDF", description: (e as Error)?.message || "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => abrir(true)} data-testid="quartos-pdf-hotel"
        className="esp-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> PDF para o hotel
      </button>
      <Dialog open={aberto} onOpenChange={(v) => { if (!gerando) abrir(v); }}>
        <DialogContent className="max-w-[480px] gap-0 overflow-hidden rounded-xl p-0" data-testid="dialogo-rooming-list">
          <DialogHeader className="px-5 pb-3 pt-5">
            <DialogTitle className="pr-6 text-base">PDF para o hotel</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Rooming list com cada quarto, os hóspedes e a entrada e saída de cada um — pronta para enviar ao hotel.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto border-t px-5 py-4">
            {hoteis.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning" data-testid="rooming-sem-hotel">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Nenhum quarto tem hotel definido. Escreva o hotel no cabeçalho de cada quarto e volte aqui.
              </p>
            ) : (
              <fieldset>
                <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Hotel</legend>
                {hoteis.length === 1 ? (
                  <p className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium">{hoteis[0].nome}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{hoteis[0].quartos} {hoteis[0].quartos === 1 ? "quarto" : "quartos"}</span>
                  </p>
                ) : (
                  <RadioGroup value={hotel ?? undefined} onValueChange={setEscolhido} className="gap-1.5" aria-label="Hotel">
                    {hoteis.map((h) => (
                      <label key={h.nome} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-brand-soft has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-brand-soft">
                        <RadioGroupItem value={h.nome} />
                        <span className="min-w-0 flex-1 truncate font-medium">{h.nome}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{h.quartos} {h.quartos === 1 ? "quarto" : "quartos"}</span>
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </fieldset>
            )}

            {semHotel > 0 && hoteis.length > 0 && (
              <p className="flex items-start gap-2 text-xs leading-snug text-warning" data-testid="rooming-quartos-sem-hotel">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {semHotel} {semHotel === 1 ? "quarto sem hotel fica de fora" : "quartos sem hotel ficam de fora"} — defina antes de exportar.
              </p>
            )}

            {previa && (
              <div className="rounded-lg bg-muted px-3 py-2.5" data-testid="rooming-previa">
                <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Vai no documento</p>
                <p className="mt-1 text-sm tabular-nums text-foreground">
                  {previa.totalDeQuartos} {previa.totalDeQuartos === 1 ? "quarto" : "quartos"} · {previa.totalDeHospedes} {previa.totalDeHospedes === 1 ? "hóspede" : "hóspedes"} · {previa.totalDeDiarias} {previa.totalDeDiarias === 1 ? "diária" : "diárias"}
                </p>
                {previa.periodoDaHospedagem && <p className="mt-0.5 text-xs text-muted-foreground">Hospedagem de {previa.periodoDaHospedagem}</p>}
              </div>
            )}

            {podeCpf && hoteis.length > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox checked={incluirCpf} onCheckedChange={(v) => setIncluirCpf(v === true)} className="mt-0.5" data-testid="rooming-incluir-cpf" />
                <span>
                  <span className="font-medium text-foreground">Incluir CPF dos hóspedes</span>
                  <span className="block text-xs leading-snug text-muted-foreground">Só sai para quem tem CPF no cadastro. Por padrão o documento leva apenas o nome completo.</span>
                </span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2 border-t bg-surface-muted px-5 py-3 sm:gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => abrir(false)} disabled={gerando}>Cancelar</Button>
            <Button type="button" size="sm" onClick={gerar} disabled={!hotel || gerando} data-testid="rooming-baixar">
              {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileDown className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {gerando ? "Gerando…" : "Baixar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
