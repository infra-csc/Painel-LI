/**
 * Lightbox das selfies (27/10): a foto grande, com o que importa na legenda —
 * quem, que dia, entrada ou saída, a hora, quem registrou e a localização
 * (link para o mapa). As setas (e ← →) passam pelas selfies da mesma pessoa,
 * na ordem dos dias. As fotos vêm de /api/attachments/:id/view, que só
 * entrega para admin, DP e produção.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Loader2, MapPin, UserRoundCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { diaComSemana, linkDoMapa, quemRegistrou, type SelfieDaPrestacao } from "./presenca-utils";

export function LightboxDaSelfie({ nome, selfies, indice, onIndice, onClose }: {
  nome: string;
  selfies: SelfieDaPrestacao[];
  indice: number | null;
  onIndice: (i: number) => void;
  onClose: () => void;
}) {
  const aberto = indice !== null && !!selfies[indice];
  const atual = aberto ? selfies[indice!] : null;
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  useEffect(() => { setEstado("carregando"); }, [atual?.marcacao.fotoUrl]);

  const temAnterior = aberto && indice! > 0;
  const temProxima = aberto && indice! < selfies.length - 1;
  const ir = (passo: number) => { if (indice === null) return; const n = indice + passo; if (n >= 0 && n < selfies.length) onIndice(n); };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="prs-lightbox max-w-[620px] gap-0 p-0 overflow-hidden bg-slate-950 border-slate-800 text-white [&>button]:text-white [&>button]:opacity-80"
        onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); } if (e.key === "ArrowRight") { e.preventDefault(); ir(1); } }}
        data-testid="prs-lightbox"
      >
        {atual && (
          <>
            <div className="relative flex items-center justify-center bg-black min-h-[260px] max-h-[min(70dvh,640px)]">
              {estado === "carregando" && <Loader2 className="absolute w-6 h-6 animate-spin text-slate-400 motion-reduce:animate-none" aria-hidden="true" />}
              {estado === "erro" ? (
                <div className="flex flex-col items-center gap-2 py-16 text-slate-300">
                  <ImageOff className="w-7 h-7" aria-hidden="true" />
                  <p className="m-0 text-sm">Não foi possível abrir a foto.</p>
                </div>
              ) : (
                <img
                  key={atual.marcacao.fotoUrl!}
                  src={atual.marcacao.fotoUrl!}
                  alt={`Selfie da ${atual.lado === "entrada" ? "entrada" : "saída"} de ${nome} em ${diaComSemana(atual.dia)}, ${atual.marcacao.hora}`}
                  onLoad={() => setEstado("ok")}
                  onError={() => setEstado("erro")}
                  className={cn("block max-w-full max-h-[min(70dvh,640px)] object-contain transition-opacity duration-150", estado === "ok" ? "opacity-100" : "opacity-0")}
                />
              )}
              {selfies.length > 1 && (
                <>
                  <button type="button" onClick={() => ir(-1)} disabled={!temAnterior} aria-label="Selfie anterior"
                    className="pas-alvo absolute left-2 top-1/2 -translate-y-1/2 inline-flex w-10 h-10 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => ir(1)} disabled={!temProxima} aria-label="Próxima selfie"
                    className="pas-alvo absolute right-2 top-1/2 -translate-y-1/2 inline-flex w-10 h-10 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <ChevronRight className="w-5 h-5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5 border-t border-slate-800">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm font-semibold leading-5 text-white break-words">{nome}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-slate-300">
                  {atual.lado === "entrada" ? "Entrada" : "Saída"} · {diaComSemana(atual.dia)} · <span className="tabular-nums">{atual.marcacao.hora}</span>
                  {selfies.length > 1 && <span className="tabular-nums text-slate-400"> · {indice! + 1} de {selfies.length}</span>}
                </DialogDescription>
                <p className="m-0 mt-1 inline-flex items-center gap-1 text-2xs text-slate-400">
                  {atual.marcacao.por === "representante" && <UserRoundCheck className="w-3 h-3" aria-hidden="true" />}
                  Registrado {quemRegistrou(atual.marcacao)}
                </p>
              </div>
              {atual.marcacao.lat != null && atual.marcacao.lng != null ? (
                <a href={linkDoMapa(atual.marcacao.lat, atual.marcacao.lng)} target="_blank" rel="noopener noreferrer"
                  className="pas-alvo inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-700 text-xs font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />Ver no mapa
                  {atual.marcacao.precisaoM != null && <span className="text-slate-400 tabular-nums">±{atual.marcacao.precisaoM} m</span>}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 h-8 text-xs text-slate-400"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />Sem localização</span>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
