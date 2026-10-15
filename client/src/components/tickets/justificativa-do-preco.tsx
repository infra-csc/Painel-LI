/**
 * TETO POR TRECHO (09/10, extra aprovado pelo dono): o servidor recusa (422
 * `preco_acima_do_teto`) a passagem aérea com valor acima de N% do preço
 * típico da rota sem justificativa. Este diálogo pergunta o porquê — com os
 * números à vista — e o registro segue com a justificativa (gravada na
 * passagem e, por isso, na auditoria).
 *
 * Um pedido por vez, por promessa: `useTicketUpsert` chama
 * `pedirJustificativaDoPreco` e reenvia; quem renderiza é o host montado no
 * modal da passagem (Passagens e Busca de passagens usam o mesmo modal). Sem
 * host montado (registro em lote), a promessa responde `null` na hora e o
 * lote lista a recusa com a mensagem do servidor.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Scale } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatarMoeda } from "@/lib/format";
import { MIN_CARACTERES_DA_JUSTIFICATIVA } from "@shared/regras-da-busca";

export interface TetoDoTrecho {
  rota: string;
  valor: number;
  tipico: number;
  limite: number;
  pctAcimaDoTipico: number;
  pctPermitido: number;
  amostra: number;
}

interface Pedido { teto: TetoDoTrecho; mensagem: string; responder: (t: string | null) => void }

let atual: Pedido | null = null;
let hosts = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** Pede a justificativa (null = a pessoa voltou para revisar o valor). */
export function pedirJustificativaDoPreco(teto: TetoDoTrecho, mensagem: string): Promise<string | null> {
  if (hosts === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    atual?.responder(null);
    atual = { teto, mensagem, responder: (t) => { atual = null; avisar(); resolve(t); } };
    avisar();
  });
}

/** O 422 do teto (o corpo do ApiError). */
export function lerTetoDoErro(erro: unknown): { teto: TetoDoTrecho; mensagem: string } | null {
  const corpo = (erro as { body?: { code?: string; message?: string; teto?: TetoDoTrecho } } | null)?.body;
  return corpo?.code === "preco_acima_do_teto" && corpo.teto ? { teto: corpo.teto, mensagem: corpo.message ?? "" } : null;
}

export function JustificativaDoPrecoHost() {
  const pedido = useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => atual, () => null);
  const [texto, setTexto] = useState("");
  useEffect(() => {
    hosts += 1;
    return () => { hosts -= 1; atual?.responder(null); };
  }, []);
  useEffect(() => { if (pedido) setTexto(""); }, [pedido]);
  const t = pedido?.teto;
  const ok = texto.trim().length >= MIN_CARACTERES_DA_JUSTIFICATIVA;
  return (
    <AlertDialog open={!!pedido} onOpenChange={(o) => { if (!o) pedido?.responder(null); }}>
      <AlertDialogContent className="max-w-[500px]" data-testid="dialogo-justificativa-preco">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-soft" aria-hidden="true"><Scale className="h-4 w-4 text-warning-strong" /></span>
            Valor acima do teto deste trecho
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {t && (
                <dl className="m-0 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-left">
                  <div className="bg-card px-3 py-2"><dt className="text-2xs text-muted-foreground">Valor</dt><dd className="m-0 text-sm font-semibold tabular-nums text-warning">{formatarMoeda(t.valor)}</dd></div>
                  <div className="bg-card px-3 py-2"><dt className="text-2xs text-muted-foreground">Típico de {t.rota}</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{formatarMoeda(t.tipico)}</dd></div>
                  <div className="bg-card px-3 py-2"><dt className="text-2xs text-muted-foreground">Teto (+{t.pctPermitido}%)</dt><dd className="m-0 text-sm font-semibold tabular-nums text-foreground">{formatarMoeda(t.limite)}</dd></div>
                </dl>
              )}
              <p className="text-sm text-slate-700">
                {t ? <>Este valor está <strong className="font-semibold">{t.pctAcimaDoTipico}% acima</strong> do preço típico da rota (mediana de {t.amostra} consultas na busca). </> : pedido?.mensagem}
                Escreva o motivo para registrar — ele fica na passagem e no log de auditoria.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <label htmlFor="justificativa-preco" className="text-xs font-medium text-slate-700">Por que este valor?</label>
          <textarea
            id="justificativa-preco"
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 500))}
            rows={3}
            autoFocus
            placeholder="Ex.: único voo que chega antes da montagem; compra de última hora pedida pela produção."
            className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/12"
            data-testid="campo-justificativa-preco"
          />
          <p className="m-0 mt-1 text-2xs text-muted-foreground">{ok ? `${texto.trim().length}/500` : `Mínimo de ${MIN_CARACTERES_DA_JUSTIFICATIVA} caracteres.`}</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar e revisar o valor</AlertDialogCancel>
          <Button type="button" disabled={!ok} onClick={() => pedido?.responder(texto.trim())} data-testid="confirmar-justificativa-preco">Registrar com justificativa</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
