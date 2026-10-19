// "Vai de carro/van" de UMA vaga (16/10) — registrar, editar e desfazer.
//
// Abre pela linha de Passagens (o atalho da Sugestão já vem com o tipo
// marcado), pelo modal da passagem e ao clicar numa vaga que já é toda
// terrestre. Desfazer devolve a vaga à fila "Comprar".
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Undo2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastSucessoDaVaga } from "@/components/common/toast-sucesso";
import { apiErrorMessage } from "@/lib/api-error";
import { passagemTemIda, passagemTemVolta } from "@shared/janela-de-viagem";
import {
  formularioDosRegistros,
  itensDoFormulario,
  pernasDaVaga,
  sugestaoTerrestreDaVaga,
  type CampoDoFormulario,
  type FormularioTerrestre,
  type ModoTerrestre,
  type PernaDaViagem,
  type TrechoTerrestre,
} from "@shared/transporte-terrestre";
import type { TeamInclusion, Ticket } from "@shared/schema";
import CamposDoTerrestre from "./campos-do-terrestre";
import { useTerrestreMutations } from "./use-transporte-terrestre";

export interface AberturaDoTerrestre {
  inclusion: TeamInclusion;
  /** Atalho da Sugestão: já abre com este tipo marcado. */
  modo?: ModoTerrestre;
}

interface TerrestreDialogProps {
  abertura: AberturaDoTerrestre | null;
  onClose: () => void;
  registros: readonly TrechoTerrestre[];
  ticket: Ticket | undefined;
  collaboratorName: string;
  eventName: string;
  functionName: string;
  /** Sem permissão ou evento encerrado: só leitura. */
  somenteLeitura?: boolean;
}

export default function TerrestreDialog({ abertura, onClose, registros, ticket, collaboratorName, eventName, functionName, somenteLeitura }: TerrestreDialogProps) {
  // Ao fechar, o conteúdo continua o da última vaga até a animação de saída
  // terminar (sem isso o diálogo piscava "#—" vazio enquanto sumia).
  const ultima = useRef<AberturaDoTerrestre | null>(null);
  if (abertura) ultima.current = abertura;
  const inclusion = (abertura ?? ultima.current)?.inclusion ?? null;
  const { registrar, desfazer } = useTerrestreMutations();
  const pernas = useMemo(() => (inclusion ? pernasDaVaga(inclusion) : []), [inclusion]);
  // Perna que já tem passagem não vira terrestre (o servidor recusa também).
  const bloqueadas = useMemo(() => {
    const out: Partial<Record<PernaDaViagem, string>> = {};
    if (ticket && passagemTemIda(ticket)) out.ida = "A ida já tem passagem registrada";
    if (ticket && passagemTemVolta(ticket)) out.volta = "A volta já tem passagem registrada";
    return out;
  }, [ticket]);
  const livres = useMemo(() => pernas.filter((p) => !bloqueadas[p]), [pernas, bloqueadas]);

  const [form, setForm] = useState<FormularioTerrestre | null>(null);
  const [erros, setErros] = useState<Partial<Record<CampoDoFormulario, string>>>({});
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);
  const [confirmandoDesfazer, setConfirmandoDesfazer] = useState(false);
  const corpoRef = useRef<HTMLDivElement | null>(null);
  // A confirmação troca o rodapé: o foco vai para o "Manter" (a saída segura), não se perde no diálogo.
  const manterRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (confirmandoDesfazer) manterRef.current?.focus(); }, [confirmandoDesfazer]);

  // Cada abertura começa do que está gravado (editar) ou da Sugestão (novo).
  useEffect(() => {
    if (!abertura || !inclusion) return;
    const sugestao = sugestaoTerrestreDaVaga(inclusion);
    if (abertura?.modo) { sugestao.ida ??= abertura.modo; sugestao.volta ??= abertura.modo; }
    const base = formularioDosRegistros(registros, livres, sugestao);
    if (registros.length === 0 && abertura?.modo) { base.modo = abertura.modo; base.modoVolta = sugestao.volta ?? abertura.modo; }
    setForm(base);
    setErros({});
    setErroDoServidor(null);
    setConfirmandoDesfazer(false);
  }, [abertura]); // eslint-disable-line react-hooks/exhaustive-deps

  const ocupado = registrar.isPending || desfazer.isPending;
  // Revisão 16/10: ao fechar depois de registrar, o cache já traz o registro
  // novo — sem congelar, o título virava "Transporte terrestre" (e o botão
  // "Salvar") no meio da animação de saída.
  const editandoAoAbrir = useRef(false);
  if (abertura) editandoAoAbrir.current = registros.length > 0;
  const editando = abertura ? registros.length > 0 : editandoAoAbrir.current;
  const resumoDaVaga = { inclusionNumber: inclusion?.inclusionNumber ?? null, eventName, collaboratorName, functionName };

  const salvar = async () => {
    if (!inclusion || !form || ocupado || livres.length === 0) return;
    const r = itensDoFormulario(form, [inclusion.id]);
    if (!r.ok) {
      setErros(r.erros);
      // Leva até o primeiro campo em vermelho (o formulário pode ter rolado).
      setTimeout(() => corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
      return;
    }
    setErros({});
    setErroDoServidor(null);
    try {
      // Editar e desmarcar uma perna que estava gravada = desfazer só ela.
      const desmarcadas = registros.map((x) => x.trecho).filter((p) => !(p === "ida" ? form.ida : form.volta));
      for (const trecho of desmarcadas) await desfazer.mutateAsync({ inclusionId: inclusion.id, trecho });
      const res = await registrar.mutateAsync(r.itens);
      if (res.falhas.length > 0 && res.gravados === 0) { setErroDoServidor(res.falhas[0].mensagem); return; }
      toastSucessoDaVaga(editando ? "Transporte terrestre atualizado" : "Transporte terrestre registrado", resumoDaVaga);
      onClose();
    } catch (erro) {
      setErroDoServidor(apiErrorMessage(erro, "Não foi possível registrar o transporte."));
    }
  };

  const confirmarDesfazer = async () => {
    if (!inclusion || ocupado) return;
    try {
      await desfazer.mutateAsync({ inclusionId: inclusion.id });
      toastSucessoDaVaga("Transporte terrestre desfeito", resumoDaVaga, "A vaga voltou para a fila Comprar.");
      onClose();
    } catch (erro) {
      setErroDoServidor(apiErrorMessage(erro, "Não foi possível desfazer."));
    }
  };

  return (
    <Dialog open={!!abertura} onOpenChange={(o) => { if (!o && !ocupado) onClose(); }}>
      <DialogContent
        className="max-w-[560px] p-0 gap-0" data-testid="dialogo-terrestre"
        // Revisão 16/10: o foco caía no "Cancelar" (o formulário monta um quadro
        // depois). Vai para o primeiro campo: a empresa/valor, ou o tipo.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const conteudo = e.currentTarget as HTMLElement | null;
          setTimeout(() => {
            const corpo = corpoRef.current;
            const alvo = corpo?.querySelector<HTMLElement>("input:not([disabled]):not([type=checkbox])")
              ?? corpo?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not([disabled])')
              ?? corpo?.querySelector<HTMLElement>('[role="radio"]:not([disabled])')
              ?? conteudo?.querySelector<HTMLElement>("[data-terrestre-fechar]")
              ?? conteudo;
            alvo?.focus();
          }, 0);
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border text-left">
          <DialogTitle className="text-base font-semibold pr-8">
            {editando ? "Transporte terrestre" : "Vai de carro ou van"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            <span className="font-medium text-foreground">#{inclusion?.inclusionNumber ?? "—"} · {collaboratorName}</span>
            {" · "}{functionName}{" · "}{eventName}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={corpoRef} className="px-5 py-4 space-y-4"
          // Enter num campo de texto registra (como um formulário).
          onKeyDown={(e) => {
            const alvo = e.target as HTMLInputElement;
            if (e.key === "Enter" && !somenteLeitura && alvo.tagName === "INPUT" && alvo.type !== "checkbox") { e.preventDefault(); void salvar(); }
          }}
        >
          {form && (
            <CamposDoTerrestre
              valor={form}
              onChange={(patch) => {
                setForm((f) => (f ? { ...f, ...patch } : f));
                setErros((e) => {
                  const resto = { ...e };
                  for (const k of Object.keys(patch)) delete resto[(k === "ida" || k === "volta" ? "pernas" : k) as CampoDoFormulario];
                  return resto;
                });
              }}
              erros={erros}
              pernas={pernas}
              bloqueadas={bloqueadas}
              idBase="terrestre"
              disabled={somenteLeitura || ocupado}
            />
          )}
          <p className="m-0 text-2xs leading-relaxed text-muted-foreground">
            A perna terrestre sai da fila de compra de passagem. O valor fica registrado na vaga e aparece em Passagens — não entra no Planejado nem no Realizado.
          </p>
          {erroDoServidor && (
            <p className="m-0 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft/60 px-3 py-2 text-xs text-danger-strong" role="alert" data-testid="terrestre-erro-servidor">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />{erroDoServidor}
            </p>
          )}
        </div>

        {confirmandoDesfazer ? (
          // Confirmação no lugar do rodapé: uma pergunta, duas saídas.
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 border-t border-danger/25 bg-danger-soft/50 rounded-b-xl" role="alertdialog" aria-label="Confirmar desfazer">
            <p className="m-0 text-sm text-foreground">
              <span className="font-semibold">Desfazer o transporte terrestre?</span>{" "}
              <span className="text-slate-600">A vaga volta para a fila Comprar.</span>
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="outline" className="pas-alvo h-9" onClick={() => setConfirmandoDesfazer(false)} disabled={ocupado} ref={manterRef} data-testid="terrestre-manter">Manter</Button>
              <Button type="button" variant="destructive" className="pas-alvo h-9" onClick={confirmarDesfazer} disabled={ocupado} data-testid="terrestre-confirmar-desfazer">
                {desfazer.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Undo2 className="w-4 h-4 mr-1.5" aria-hidden="true" />}Desfazer
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="px-5 py-3 border-t border-border bg-surface-muted rounded-b-xl gap-2 sm:items-center">
            {editando && !somenteLeitura && (
              <Button type="button" variant="ghost" className="pas-alvo h-9 sm:mr-auto text-danger-strong hover:text-danger-strong hover:bg-danger-soft" onClick={() => setConfirmandoDesfazer(true)} disabled={ocupado} data-testid="terrestre-desfazer">
                <Undo2 className="w-4 h-4 mr-1.5" aria-hidden="true" />Desfazer
              </Button>
            )}
            <Button type="button" variant="outline" className="pas-alvo h-9" onClick={onClose} disabled={ocupado} data-terrestre-fechar>
              {somenteLeitura ? "Fechar" : "Cancelar"}
            </Button>
            {!somenteLeitura && (
              <Button type="button" className="pas-alvo h-9 bg-primary hover:bg-primary-hover text-primary-foreground" onClick={salvar} disabled={ocupado || livres.length === 0} data-testid="terrestre-salvar">
                {registrar.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
                {editando ? "Salvar" : "Registrar"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
