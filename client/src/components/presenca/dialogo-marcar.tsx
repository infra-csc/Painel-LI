/**
 * Entrada ou saída feita pelo REPRESENTANTE (27/10) — quando o colaborador não
 * tem como registrar no próprio celular. A foto é da pessoa no evento,
 * tirada pela câmera de quem registra (ou escolhida do aparelho), reduzida no
 * navegador antes de enviar. A hora é a do servidor; a localização, se a
 * regra pedir, é a do aparelho de quem registra (negada → registra sem).
 */
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, LogIn, LogOut, MapPin, RefreshCw, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { reduzirImagem } from "./reduzir-imagem";
import { diaComSemana } from "./presenca-utils";
import type { RespostaDaPresenca } from "./tipos";
import type { useAcoesDaPresenca } from "./use-presenca";

type EstadoDoLocal = { tipo: "pedindo" } | { tipo: "ok"; lat: number; lng: number; precisao: number | null } | { tipo: "negado" } | { tipo: "nao_pede" };

export interface AlvoDaMarcacao {
  actualId: string;
  nome: string;
  dia: string;
  tipo: "entrada" | "saida";
}

export function DialogoMarcar({ alvo, configuracao, marcar, onClose }: {
  alvo: AlvoDaMarcacao | null;
  configuracao: RespostaDaPresenca["configuracao"];
  marcar: ReturnType<typeof useAcoesDaPresenca>["marcar"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [local, setLocal] = useState<EstadoDoLocal>({ tipo: "nao_pede" });
  const [erro, setErro] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const aberto = !!alvo;
  const enviando = marcar.isPending;

  // Ao abrir: limpa e pede a localização (se a regra pedir).
  useEffect(() => {
    if (!aberto) return;
    setFoto(null); setPrevia(null); setErro(null);
    if (configuracao.localizacao !== "registrar" || typeof navigator === "undefined" || !navigator.geolocation) {
      setLocal({ tipo: configuracao.localizacao === "registrar" ? "negado" : "nao_pede" });
      return;
    }
    setLocal({ tipo: "pedindo" });
    let vivo = true;
    navigator.geolocation.getCurrentPosition(
      (p) => { if (vivo) setLocal({ tipo: "ok", lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy ?? null }); },
      () => { if (vivo) setLocal({ tipo: "negado" }); },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
    return () => { vivo = false; };
  }, [aberto, configuracao.localizacao]);

  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  const escolher = async (f: File | undefined | null) => {
    if (!f) return;
    setErro(null);
    setPreparando(true);
    try {
      const reduzida = await reduzirImagem(f);
      setFoto(reduzida);
      setPrevia(URL.createObjectURL(reduzida));
    } finally {
      setPreparando(false);
    }
  };

  const ehEntrada = alvo?.tipo === "entrada";
  const faltaFoto = configuracao.selfieObrigatoria && !foto;

  const enviar = () => {
    if (!alvo) return;
    if (faltaFoto) { setErro("A foto é obrigatória: tire a foto da pessoa no evento."); return; }
    marcar.mutate(
      { actualId: alvo.actualId, dia: alvo.dia, tipo: alvo.tipo, foto, local: local.tipo === "ok" ? { lat: local.lat, lng: local.lng, precisao: local.precisao } : null },
      {
        onSuccess: (p) => {
          const d = p.dias.find((x) => x.dia === alvo.dia);
          const hora = (ehEntrada ? d?.entrada?.hora : d?.saida?.hora) ?? "";
          toast({ variant: "success", title: ehEntrada ? "Entrada registrada" : "Saída registrada", description: `${alvo.nome} · ${diaComSemana(alvo.dia)}${hora ? ` às ${hora}` : ""}, pelo representante.` });
          onClose();
        },
        onError: (e) => setErro(apiErrorMessage(e, "Não foi possível registrar. Tente de novo.")),
      },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[480px] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()} data-testid="prs-dialogo-marcar">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            {ehEntrada ? <LogIn className="h-4 w-4 text-success-strong" aria-hidden="true" /> : <LogOut className="h-4 w-4 text-primary" aria-hidden="true" />}
            {ehEntrada ? "Fazer a entrada" : "Fazer a saída"} como representante
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo ? <><span className="font-medium text-foreground">{alvo.nome}</span> · {diaComSemana(alvo.dia)} (hoje). A hora registrada é a do servidor, no momento do envio, e fica marcado que foi você.</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="prs-dialogo-corpo space-y-4 px-6 py-5">
          <div className="space-y-2">
            <p className="m-0 text-sm font-medium text-foreground">
              Foto da pessoa {configuracao.selfieObrigatoria ? <span className="text-2xs font-normal text-muted-foreground">(obrigatória)</span> : <span className="text-2xs font-normal text-muted-foreground">(opcional)</span>}
            </p>
            {previa ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                <img src={previa} alt="Prévia da foto" className="block w-full max-h-[300px] object-contain" />
                <button type="button" onClick={() => { setFoto(null); setPrevia(null); }} disabled={enviando} aria-label="Tirar a foto"
                  className="pas-alvo absolute right-2 top-2 inline-flex w-8 h-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => camera.current?.click()} disabled={enviando}
                  className="pas-alvo absolute left-2 bottom-2 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-black/60 text-xs font-medium text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />Tirar outra
                </button>
              </div>
            ) : (
              <div className={cn("grid grid-cols-2 gap-2", erro && faltaFoto && "prs-treme")}>
                <button type="button" onClick={() => camera.current?.click()} disabled={preparando || enviando}
                  className="prs-botao-foto" data-testid="prs-tirar-foto">
                  {preparando ? <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Camera className="w-5 h-5" aria-hidden="true" />}
                  <span>{preparando ? "Preparando…" : "Tirar foto"}</span>
                </button>
                <button type="button" onClick={() => arquivo.current?.click()} disabled={preparando || enviando} className="prs-botao-foto prs-botao-foto-sec">
                  <ImagePlus className="w-5 h-5" aria-hidden="true" /><span>Escolher do aparelho</span>
                </button>
              </div>
            )}
            {/* Câmera traseira: quem registra fotografa a pessoa. */}
            <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} data-testid="prs-input-camera" />
            <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ""; }} data-testid="prs-input-arquivo" />
            <p className="m-0 text-2xs text-muted-foreground">A foto é reduzida no aparelho antes de enviar. Só o DP, a produção e a própria pessoa a veem.</p>
          </div>

          {configuracao.localizacao === "registrar" && (
            <p className={cn("m-0 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              local.tipo === "ok" ? "border-success/25 bg-success-soft/60 text-success" : local.tipo === "negado" ? "border-warning/25 bg-warning-soft/60 text-warning" : "border-border bg-surface-muted text-slate-600")}
              aria-live="polite">
              {local.tipo === "pedindo" ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <MapPin className="w-3.5 h-3.5" aria-hidden="true" />}
              {local.tipo === "pedindo" && "Pegando a localização deste aparelho…"}
              {local.tipo === "ok" && <>Localização deste aparelho registrada{local.precisao != null ? <span className="tabular-nums"> (±{Math.round(local.precisao)} m)</span> : null}.</>}
              {local.tipo === "negado" && "Sem localização (não autorizada neste aparelho) — registra assim mesmo, marcado como sem localização."}
            </p>
          )}

          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
        </div>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={enviando || preparando || local.tipo === "pedindo"} data-testid="prs-confirmar-marcacao">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : ehEntrada ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Registrando…" : ehEntrada ? "Registrar entrada" : "Registrar saída"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
