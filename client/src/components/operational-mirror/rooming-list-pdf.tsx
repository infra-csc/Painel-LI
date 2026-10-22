/**
 * "PDF para o hotel" da aba Quartos (09/10, pedido do dono: "no final
 * precisamos de uma exportação em PDF para mandar para hotéis").
 *
 * Gera a ROOMING LIST de UM hotel: escolhe-se o hotel (quando há mais de um),
 * vê-se o que vai no documento e baixa. CPF só sai com a caixa marcada
 * (desligada por padrão), só para quem tem CPF no cadastro e só para papéis
 * que já veem dados pessoais; o servidor registra a exportação na auditoria
 * (sem CPF no log).
 *
 * 15/10 (dono: "aqui não necessariamente precisa definir o hotel"): quarto sem
 * hotel não bloqueia mais. O seletor ganha "Sem hotel definido (N quartos)" —
 * ou "Todos os quartos", quando nenhum tem hotel — e esse PDF sai com o
 * cabeçalho do evento e "Hotel: a definir"; dá para escrever um nome só para
 * o cabeçalho do arquivo, sem gravar nos quartos.
 *
 * 20/10 (valores do hotel): a rooming list do hotel NUNCA leva valores. Quando
 * há tarifas, uma caixa separada — "Com valores (uso interno)", desligada por
 * padrão — gera a versão de conferência, marcada "uso interno" no topo e no
 * nome do arquivo.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, FileDown, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { toTitleCase } from "@/lib/format";
import { hasRole } from "@/lib/role-utils";
import { ROLE_GROUPS } from "@shared/roles";
import type { MirrorEvent } from "@shared/operational-mirror-types";
import { chaveDoHotel, hoteisDosQuartos, hotelDoEvento, montarRoomingList, type QuartoDaRoomingList } from "@shared/rooming-list";
import type { TiposDoHotel } from "@shared/room-pairing";

/** Valor da opção "quartos sem hotel definido" no seletor (nenhum hotel tem esse nome). */
const SEM_HOTEL = "__sem_hotel__";

const quartosTxt = (n: number) => `${n} ${n === 1 ? "quarto" : "quartos"}`;

export function RoomingListPdf({ evento, quartos, comValoresDisponivel = false, tiposDoHotel }: {
  evento: MirrorEvent;
  quartos: QuartoDaRoomingList[];
  /** Há valores calculados (tarifas definidas): oferece a versão de uso interno. */
  comValoresDisponivel?: boolean;
  /** Apartamentos que o hotel tem (22/10): o PDF usa o tipo que o hotel usa e avisa do quarto que excede. */
  tiposDoHotel?: TiposDoHotel;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [nomeNoPdf, setNomeNoPdf] = useState("");
  const [incluirCpf, setIncluirCpf] = useState(false);
  const [comValoresMarcado, setComValores] = useState(false);
  const comValores = comValoresDisponivel && comValoresMarcado;
  const [gerando, setGerando] = useState(false);
  const podeCpf = hasRole(user, ...ROLE_GROUPS.dadosPessoais);

  const { hoteis, semHotel } = useMemo(() => hoteisDosQuartos(quartos), [quartos]);
  const opcoes = useMemo(() => [
    ...hoteis.map((h) => ({ valor: h.nome, rotulo: h.nome, quartos: h.quartos })),
    ...(semHotel > 0 ? [{ valor: SEM_HOTEL, rotulo: hoteis.length ? "Sem hotel definido" : "Todos os quartos", quartos: semHotel }] : []),
  ], [hoteis, semHotel]);
  // O escolhido some se alguém renomeia o hotel: volta para o hotel do evento.
  const padrao = hotelDoEvento(quartos) ?? (semHotel > 0 ? SEM_HOTEL : null);
  const valor = (escolhido === SEM_HOTEL && semHotel > 0 ? SEM_HOTEL : null)
    ?? hoteis.find((h) => chaveDoHotel(h.nome) === chaveDoHotel(escolhido))?.nome
    ?? padrao;
  const doSemHotel = valor === SEM_HOTEL;
  const hotel = doSemHotel ? null : valor;

  const entrada = (extra: { incluirCpf: boolean; contato: { nome: string; email: string | null }; quartos: QuartoDaRoomingList[] }) => ({
    hotel, nomeDoHotelNoPdf: doSemHotel ? nomeNoPdf : null, geradoEm: new Date(), comValores, tiposDoHotel,
    evento: { nome: evento.name, local: evento.location, inicio: evento.startDate, fim: evento.endDate },
    ...extra,
  });
  const previa = valor
    ? montarRoomingList(entrada({ incluirCpf: false, contato: { nome: "", email: null }, quartos }))
    : null;

  const abrir = (v: boolean) => {
    setAberto(v);
    if (v) { setIncluirCpf(false); setComValores(false); setNomeNoPdf(""); setEscolhido(null); }
  };

  const gerar = async () => {
    if (!valor) return;
    setGerando(true);
    try {
      // 1) auditoria + CPF (se pedido) — 2) PDF desenhado aqui, com as datas da tela.
      const res = await apiRequest("POST", `/api/events/${evento.id}/operational-mirror/rooming-list`,
        doSemHotel
          ? { semHotel: true, nomeDoHotelNoPdf: nomeNoPdf.trim() || undefined, incluirCpf: incluirCpf && podeCpf, ...(comValores ? { comValores: true } : {}) }
          : { hotel, incluirCpf: incluirCpf && podeCpf, ...(comValores ? { comValores: true } : {}) });
      const { cpfs } = (await res.json()) as { cpfs: Record<string, string> };
      const lista = montarRoomingList(entrada({
        incluirCpf: incluirCpf && podeCpf,
        contato: { nome: user?.name || "Logística", email: user?.email ?? null },
        quartos: quartos.map((q) => ({
          ...q,
          hospedes: q.hospedes.map((h) => ({ ...h, nome: toTitleCase(h.nome), cpf: h.collaboratorId ? cpfs?.[h.collaboratorId] ?? null : null })),
        })),
      }));
      const { baixarRoomingListPdf } = await import("@/lib/rooming-list-pdf");
      await baixarRoomingListPdf(lista);
      toast({ title: comValores ? "PDF de uso interno gerado" : "PDF gerado", description: lista.nomeDoArquivo });
      setAberto(false);
    } catch (e) {
      toast({ title: "Não foi possível gerar o PDF", description: (e as Error)?.message || "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  const rotuloDaOpcao = (o: (typeof opcoes)[number]) => (
    <>
      <span className={`min-w-0 flex-1 truncate ${o.valor === SEM_HOTEL ? "text-foreground" : "font-medium"}`}>{o.rotulo}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{quartosTxt(o.quartos)}</span>
    </>
  );

  return (
    <>
      <button type="button" onClick={() => abrir(true)} data-testid="quartos-pdf-hotel"
        className="esp-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> PDF para o hotel
      </button>
      <Dialog open={aberto} onOpenChange={(v) => { if (!gerando) abrir(v); }}>
        <DialogContent className="max-w-[480px] gap-0 overflow-hidden rounded-xl p-0" data-testid="dialogo-rooming-list">
          <DialogHeader className="px-5 pb-3 pt-5">
            <DialogTitle className="pr-6 text-base">{comValores ? "PDF de uso interno" : "PDF para o hotel"}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {comValores
                ? "Rooming list com o valor de cada hóspede e de cada quarto — para conferência e fechamento, não para o hotel."
                : "Rooming list com cada quarto, os hóspedes e a entrada e saída de cada um — pronta para enviar ao hotel."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto border-t px-5 py-4">
            {opcoes.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{hoteis.length ? "Hotel" : "Quartos"}</legend>
                {opcoes.length === 1 ? (
                  <p className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm" data-testid="rooming-opcao-unica">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {rotuloDaOpcao(opcoes[0])}
                  </p>
                ) : (
                  <RadioGroup value={valor ?? undefined} onValueChange={setEscolhido} className="gap-1.5" aria-label="Hotel">
                    {opcoes.map((o) => (
                      <label key={o.valor} data-testid={o.valor === SEM_HOTEL ? "rooming-opcao-sem-hotel" : undefined}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-brand-soft has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-brand-soft">
                        <RadioGroupItem value={o.valor} />
                        {rotuloDaOpcao(o)}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              </fieldset>
            )}

            {/* Só informação — quarto sem hotel não impede o PDF (15/10). */}
            {semHotel > 0 && (
              <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground" data-testid="rooming-quartos-sem-hotel">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {hoteis.length === 0
                  ? "Nenhum quarto tem hotel definido ainda. O PDF sai com o nome do evento e “Hotel: a definir”."
                  : doSemHotel
                    ? `${semHotel === 1 ? "Este quarto ainda não tem" : `Estes ${semHotel} quartos ainda não têm`} hotel. O PDF sai com o nome do evento e “Hotel: a definir”.`
                    : `${quartosTxt(semHotel)} sem hotel ${semHotel === 1 ? "não entra" : "não entram"} neste PDF — ${semHotel === 1 ? "ele sai" : "eles saem"} em “Sem hotel definido”.`}
              </p>
            )}

            {doSemHotel && (
              <div className="space-y-1.5">
                <label htmlFor="rooming-nome-no-pdf" className="text-sm font-medium text-foreground">
                  Nome do hotel para o PDF <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Input id="rooming-nome-no-pdf" value={nomeNoPdf} maxLength={120} onChange={(e) => setNomeNoPdf(e.target.value)}
                  placeholder="a definir" autoComplete="off" data-testid="rooming-nome-no-pdf" aria-describedby="rooming-nome-no-pdf-ajuda" />
                <p id="rooming-nome-no-pdf-ajuda" className="text-xs leading-snug text-muted-foreground">
                  Só vai no cabeçalho deste arquivo — não grava nos quartos.
                </p>
              </div>
            )}

            {previa && (
              <div className="rounded-lg bg-muted px-3 py-2.5" data-testid="rooming-previa">
                <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Vai no documento</p>
                {!previa.hotelDefinido && (
                  <p className="mt-1 truncate text-sm text-foreground" data-testid="rooming-previa-cabecalho">
                    <span className="font-medium">{evento.name}</span>
                    <span className="text-muted-foreground"> · Hotel: {previa.hotel}</span>
                  </p>
                )}
                <p className="mt-1 text-sm tabular-nums text-foreground">
                  {quartosTxt(previa.totalDeQuartos)} · {previa.totalDeHospedes} {previa.totalDeHospedes === 1 ? "hóspede" : "hóspedes"} · {previa.totalDeDiarias} {previa.totalDeDiarias === 1 ? "diária" : "diárias"}
                </p>
                {previa.comValores && previa.totalDosValores && (
                  <p className="mt-0.5 text-sm tabular-nums text-foreground" data-testid="rooming-previa-valores">
                    Total calculado: <span className="font-semibold">{previa.totalDosValores}</span>{previa.valoresParciais ? <span className="text-warning"> · parcial</span> : null}
                  </p>
                )}
                {previa.periodoDaHospedagem && <p className="mt-0.5 text-xs text-muted-foreground">Hospedagem de {previa.periodoDaHospedagem}</p>}
              </div>
            )}

            {/* 22/10: o documento não deve pedir ao hotel um tipo que ele não tem. */}
            {previa && previa.quartosQueOHotelNaoTem > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs leading-snug text-warning" data-testid="rooming-aviso-excede">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {previa.quartosQueOHotelNaoTem === 1 ? "1 quarto deste documento é de um tipo" : `${previa.quartosQueOHotelNaoTem} quartos deste documento são de um tipo`} que o hotel não tem. Refaça as sugestões ou ajuste os quartos antes de enviar.
              </p>
            )}

            {podeCpf && opcoes.length > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox checked={incluirCpf} onCheckedChange={(v) => setIncluirCpf(v === true)} className="mt-0.5" data-testid="rooming-incluir-cpf" />
                <span>
                  <span className="font-medium text-foreground">Incluir CPF dos hóspedes</span>
                  <span className="block text-xs leading-snug text-muted-foreground">Só sai para quem tem CPF no cadastro. Por padrão o documento leva apenas o nome completo.</span>
                </span>
              </label>
            )}

            {comValoresDisponivel && opcoes.length > 0 && (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox checked={comValoresMarcado} onCheckedChange={(v) => setComValores(v === true)} className="mt-0.5" data-testid="rooming-com-valores" />
                  <span>
                    <span className="font-medium text-foreground">Com valores (uso interno)</span>
                    <span className="block text-xs leading-snug text-muted-foreground">Valor de cada hóspede e de cada quarto, para conferência e fechamento.</span>
                  </span>
                </label>
                {comValores && (
                  <p className="pas-entra flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs leading-snug text-danger" data-testid="rooming-aviso-uso-interno">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Este arquivo NÃO é para o hotel: sai marcado “uso interno” no topo e no nome. Para o hotel, desmarque.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t bg-surface-muted px-5 py-3 sm:gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => abrir(false)} disabled={gerando}>Cancelar</Button>
            <Button type="button" size="sm" onClick={gerar} disabled={!valor || !previa?.totalDeQuartos || gerando} data-testid="rooming-baixar">
              {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileDown className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {gerando ? "Gerando…" : comValores ? "Baixar PDF interno" : "Baixar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
