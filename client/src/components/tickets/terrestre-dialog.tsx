// "Vai de carro/van" de UMA vaga (16/10) — registrar, editar e desfazer.
//
// Abre pela linha de Passagens (o atalho da Sugestão já vem com o tipo
// marcado), pelo modal da passagem e ao clicar numa vaga que já é toda
// terrestre. Desfazer devolve a vaga à fila "Comprar".
//
// 21/10: só carro e van; o valor é a viagem toda da vaga (os trechos
// marcados). Vaga que divide uma van com outras (grupo): editar e desfazer
// perguntam se é "só esta vaga" ou "a van inteira".
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Undo2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastSucessoDaVaga } from "@/components/common/toast-sucesso";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { passagemTemIda, passagemTemVolta } from "@shared/janela-de-viagem";
import {
  NOME_DA_PERNA,
  NOME_DO_MODO,
  PERNAS,
  centavosDoTexto,
  dividirCentavos,
  entradasDaViagem,
  formularioDosRegistros,
  itensDoFormulario,
  pernasDaVaga,
  sugestaoTerrestreDaVaga,
  textoDoValor,
  type CampoDoFormulario,
  type FormularioTerrestre,
  type GrupoDoTerrestre,
  type ModoDeRegistro,
  type PernaDaViagem,
  type TrechoTerrestre,
} from "@shared/transporte-terrestre";
import type { TeamInclusion, Ticket } from "@shared/schema";
import CamposDoTerrestre, { type PreviaDoValor } from "./campos-do-terrestre";
import { useTerrestreMutations } from "./use-transporte-terrestre";

export interface AberturaDoTerrestre {
  inclusion: TeamInclusion;
  /** Atalho da Sugestão: já abre com este tipo marcado. */
  modo?: ModoDeRegistro;
  /**
   * Só estas pernas: a vaga com ida e volta de transportes diferentes (cada
   * entrada da linha edita a sua) ou a perna que ainda falta.
   */
  pernas?: PernaDaViagem[];
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

type Escopo = "vaga" | "grupo";

/** O formulário do escopo: a vaga (o que ela tem) ou a van inteira (o total do grupo). */
function formularioDoEscopo(escopo: Escopo, registros: readonly TrechoTerrestre[], livres: readonly PernaDaViagem[], grupo: GrupoDoTerrestre | null): FormularioTerrestre {
  const base = formularioDosRegistros(registros, livres);
  return escopo === "grupo" && grupo ? { ...base, valor: textoDoValor(grupo.totalCentavos) } : base;
}

export default function TerrestreDialog({ abertura, onClose, registros, ticket, collaboratorName, eventName, functionName, somenteLeitura }: TerrestreDialogProps) {
  // Ao fechar, o conteúdo continua o da última vaga até a animação de saída
  // terminar (sem isso o diálogo piscava "#—" vazio enquanto sumia).
  const ultima = useRef<AberturaDoTerrestre | null>(null);
  if (abertura) ultima.current = abertura;
  const atual = abertura ?? ultima.current;
  const inclusion = atual?.inclusion ?? null;
  const restricao = atual?.pernas;
  const { registrar, desfazer, editarGrupo, desfazerGrupo } = useTerrestreMutations();
  const pernas = useMemo(() => (inclusion ? pernasDaVaga(inclusion) : []), [inclusion]);
  // Os registros que esta abertura edita (todas as pernas, ou só as da entrada clicada).
  const daAbertura = useMemo(
    () => (restricao ? registros.filter((r) => restricao.includes(r.trecho)) : [...registros]),
    [registros, restricao],
  );
  // Perna que já tem passagem não vira terrestre (o servidor recusa também);
  // perna fora desta abertura é editada à parte, pela linha da vaga.
  const bloqueadas = useMemo(() => {
    const out: Partial<Record<PernaDaViagem, string>> = {};
    if (ticket && passagemTemIda(ticket)) out.ida = "A ida já tem passagem registrada";
    if (ticket && passagemTemVolta(ticket)) out.volta = "A volta já tem passagem registrada";
    if (restricao) {
      for (const p of PERNAS) {
        if (out[p] || restricao.includes(p) || !pernas.includes(p)) continue;
        const outro = registros.find((r) => r.trecho === p);
        out[p] = outro
          ? `A ${NOME_DA_PERNA[p].toLowerCase()} está de ${NOME_DO_MODO[outro.modo].toLowerCase()} — edite pela linha da vaga`
          : `A ${NOME_DA_PERNA[p].toLowerCase()} fica fora desta edição`;
      }
    }
    return out;
  }, [ticket, restricao, registros, pernas]);
  const livres = useMemo(() => pernas.filter((p) => !bloqueadas[p]), [pernas, bloqueadas]);
  const grupo = useMemo(() => daAbertura.find((r) => r.grupo)?.grupo ?? null, [daAbertura]);

  const [form, setForm] = useState<FormularioTerrestre | null>(null);
  const [escopo, setEscopo] = useState<Escopo>("vaga");
  const [erros, setErros] = useState<Partial<Record<CampoDoFormulario, string>>>({});
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);
  const [avisoDaSugestao, setAvisoDaSugestao] = useState<string | null>(null);
  const [confirmandoDesfazer, setConfirmandoDesfazer] = useState(false);
  const corpoRef = useRef<HTMLDivElement | null>(null);
  // A confirmação troca o rodapé: o foco vai para o "Manter" (a saída segura), não se perde no diálogo.
  const manterRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (confirmandoDesfazer) manterRef.current?.focus(); }, [confirmandoDesfazer]);

  // Cada abertura começa do que está gravado (editar) ou da Sugestão (novo).
  useEffect(() => {
    if (!abertura || !inclusion) return;
    setEscopo("vaga");
    setErros({});
    setErroDoServidor(null);
    setConfirmandoDesfazer(false);
    if (daAbertura.length > 0) {
      setForm(formularioDoEscopo("vaga", daAbertura, livres, grupo));
      setAvisoDaSugestao(null);
      return;
    }
    const sugestao = sugestaoTerrestreDaVaga(inclusion);
    if (abertura.modo) { sugestao.ida ??= abertura.modo; sugestao.volta ??= abertura.modo; }
    const base = formularioDosRegistros([], livres, sugestao);
    if (abertura.modo) base.modo = abertura.modo;
    setForm(base);
    // A Sugestão diz outra coisa numa perna: a perna fica desmarcada e a tela diz por quê.
    const outras = livres.filter((p) => sugestao[p] && sugestao[p] !== base.modo);
    setAvisoDaSugestao(outras.length === 0 ? null : outras.map((p) => {
      const m = sugestao[p]!;
      const perna = NOME_DA_PERNA[p].toLowerCase();
      return m === "onibus"
        ? `A Sugestão diz ônibus na ${perna}: ônibus de linha é passagem rodoviária — registre no modal da passagem.`
        : `A Sugestão diz ${NOME_DO_MODO[m].toLowerCase()} na ${perna}: registre a ${perna} à parte, depois, pela linha da vaga.`;
    }).join(" "));
  }, [abertura]); // eslint-disable-line react-hooks/exhaustive-deps

  const trocarEscopo = (novo: Escopo) => {
    if (novo === escopo) return;
    setEscopo(novo);
    setForm(formularioDoEscopo(novo, daAbertura, livres, grupo));
    setErros({});
    setErroDoServidor(null);
    setConfirmandoDesfazer(false);
  };

  const ocupado = registrar.isPending || desfazer.isPending || editarGrupo.isPending || desfazerGrupo.isPending;
  // Revisão 16/10: ao fechar depois de registrar, o cache já traz o registro
  // novo — sem congelar, o título virava "Transporte terrestre" (e o botão
  // "Salvar") no meio da animação de saída.
  const editandoAoAbrir = useRef(false);
  if (abertura) editandoAoAbrir.current = daAbertura.length > 0;
  const editando = abertura ? daAbertura.length > 0 : editandoAoAbrir.current;
  const resumoDaVaga = { inclusionNumber: inclusion?.inclusionNumber ?? null, eventName, collaboratorName, functionName };
  const doGrupo = escopo === "grupo" && !!grupo;
  const grupoDeCarro = daAbertura[0]?.modo === "carro";
  // "a van inteira" · "o carro inteiro" — e o título, no mesmo gênero.
  const nomeDoGrupo = grupoDeCarro ? "o carro inteiro" : "a van inteira";
  const tituloDoGrupo = grupoDeCarro ? "Carro inteiro" : "Van inteira";
  const legadoOnibus = daAbertura.some((r) => r.modo === "onibus");
  const misto = !restricao && entradasDaViagem(daAbertura).length > 1;

  // A van inteira: o total novo dividido entre as vagas do grupo, ao vivo.
  const previaDoGrupo = useMemo<PreviaDoValor | null>(() => {
    if (!doGrupo || !form) return null;
    const total = centavosDoTexto(form.valor);
    if (!total || total <= 0) return null;
    const partes = dividirCentavos(total, grupo!.vagas);
    return { porVagaMin: Math.min(...partes), porVagaMax: Math.max(...partes), totalCentavos: total, vagas: grupo!.vagas, dividir: true };
  }, [doGrupo, form, grupo]);

  const levarAoErro = () => setTimeout(() => corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);

  const salvar = async () => {
    if (!inclusion || !form || ocupado || livres.length === 0) return;
    const r = itensDoFormulario(form, [{ id: inclusion.id, pernas: livres }]);
    if (!r.ok) { setErros(r.erros); levarAoErro(); return; }
    setErros({});
    setErroDoServidor(null);
    try {
      if (doGrupo) {
        const res = await editarGrupo.mutateAsync({ grupoId: grupo!.id, modo: form.modo as ModoDeRegistro, empresa: r.itens[0].empresa, totalCentavos: centavosDoTexto(form.valor)! });
        toastSucessoDaVaga(`${tituloDoGrupo} ${grupoDeCarro ? "atualizado" : "atualizada"}`, resumoDaVaga, `${res.vagas} vagas com o valor dividido de novo.`);
        onClose();
        return;
      }
      // Editar e desmarcar uma perna que estava gravada = desfazer só ela.
      const desmarcadas = daAbertura.map((x) => x.trecho).filter((p) => !(p === "ida" ? form.ida : form.volta));
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
      if (doGrupo) {
        const res = await desfazerGrupo.mutateAsync({ grupoId: grupo!.id });
        toastSucessoDaVaga(`${tituloDoGrupo} ${grupoDeCarro ? "desfeito" : "desfeita"}`, resumoDaVaga, `As ${res.vagas} vagas voltaram para a fila Comprar.`);
      } else {
        // Abertura de uma perna só (ida e volta de transportes diferentes): desfaz só ela.
        if (restricao) for (const r of daAbertura) await desfazer.mutateAsync({ inclusionId: inclusion.id, trecho: r.trecho });
        else await desfazer.mutateAsync({ inclusionId: inclusion.id });
        toastSucessoDaVaga("Transporte terrestre desfeito", resumoDaVaga, "A vaga voltou para a fila Comprar.");
      }
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
            {doGrupo ? tituloDoGrupo : editando ? "Transporte terrestre" : "Vai de carro ou van"}
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
          {/* Vaga que divide a van com outras: só ela, ou a van inteira? */}
          {grupo && !somenteLeitura && (
            <div className="space-y-1.5" data-testid="terrestre-escopo">
              <p id="terrestre-escopo-rotulo" className="m-0 text-xs font-medium text-slate-600">
                Esta vaga divide {grupoDeCarro ? "o carro" : "a van"} com mais {grupo.vagas - 1} {grupo.vagas - 1 === 1 ? "vaga" : "vagas"}. Mudar:
              </p>
              <div role="radiogroup" aria-labelledby="terrestre-escopo-rotulo" className="inline-flex flex-wrap rounded-lg border border-border bg-surface-muted p-0.5">
                {([
                  { chave: "vaga", rotulo: "Só esta vaga" },
                  { chave: "grupo", rotulo: `${tituloDoGrupo} · ${grupo.vagas} vagas` },
                ] as const).map((op) => (
                  <button
                    key={op.chave} type="button" role="radio" aria-checked={escopo === op.chave} disabled={ocupado}
                    onClick={() => trocarEscopo(op.chave)}
                    data-testid={`terrestre-escopo-${op.chave}`}
                    className={cn(
                      "pas-alvo h-8 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      escopo === op.chave ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-slate-700",
                    )}
                  >
                    {op.rotulo}
                  </button>
                ))}
              </div>
              <p className="m-0 text-2xs leading-snug text-muted-foreground">
                {doGrupo
                  ? `O total novo é dividido de novo entre as ${grupo.vagas} vagas. Desfazer aqui devolve todas para a fila Comprar.`
                  : `Esta vaga sai da divisão e fica com o valor abaixo; as outras ${grupo.vagas - 1} continuam com a parte delas.`}
              </p>
            </div>
          )}

          {legadoOnibus && !somenteLeitura && (
            <p className="m-0 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft/60 px-3 py-2 text-xs text-slate-700" data-testid="terrestre-aviso-onibus">
              <Info className="w-4 h-4 shrink-0 mt-px text-warning-strong" aria-hidden="true" />
              Registrado como ônibus, que saiu das opções. Para salvar, escolha carro ou van — ou desfaça.
            </p>
          )}
          {misto && !somenteLeitura && (
            <p className="m-0 flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-slate-700">
              <Info className="w-4 h-4 shrink-0 mt-px text-muted-foreground" aria-hidden="true" />
              A ida e a volta estão com transportes diferentes. Ao salvar, as duas ficam com o transporte abaixo.
            </p>
          )}
          {avisoDaSugestao && (
            <p className="m-0 flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-slate-700" data-testid="terrestre-aviso-sugestao">
              <Info className="w-4 h-4 shrink-0 mt-px text-muted-foreground" aria-hidden="true" />
              {avisoDaSugestao}
            </p>
          )}

          {form && (
            <CamposDoTerrestre
              valor={form}
              onChange={(patch) => {
                setForm((f) => (f ? { ...f, ...patch } : f));
                setErros((e) => {
                  const resto = { ...e };
                  for (const k of Object.keys(patch)) delete resto[(k === "ida" || k === "volta" ? "pernas" : k) as CampoDoFormulario];
                  if ("ida" in patch || "volta" in patch) delete resto.valor;
                  return resto;
                });
              }}
              erros={erros}
              pernas={pernas}
              bloqueadas={bloqueadas}
              contexto={doGrupo ? "grupo" : "vaga"}
              previa={previaDoGrupo}
              travarPernas={doGrupo}
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
              {doGrupo ? (
                <>
                  <span className="font-semibold">Desfazer {nomeDoGrupo}?</span>{" "}
                  <span className="text-slate-600">As {grupo!.vagas} vagas voltam para a fila Comprar.</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Desfazer o transporte terrestre{restricao ? ` da ${restricao.map((p) => NOME_DA_PERNA[p].toLowerCase()).join(" e ")}` : ""}?</span>{" "}
                  <span className="text-slate-600">{grupo ? "Só esta vaga volta para a fila Comprar." : "A vaga volta para a fila Comprar."}</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="outline" className="pas-alvo h-9" onClick={() => setConfirmandoDesfazer(false)} disabled={ocupado} ref={manterRef} data-testid="terrestre-manter">Manter</Button>
              <Button type="button" variant="destructive" className="pas-alvo h-9" onClick={confirmarDesfazer} disabled={ocupado} data-testid="terrestre-confirmar-desfazer">
                {desfazer.isPending || desfazerGrupo.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Undo2 className="w-4 h-4 mr-1.5" aria-hidden="true" />}Desfazer
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="px-5 py-3 border-t border-border bg-surface-muted rounded-b-xl gap-2 sm:items-center">
            {editando && !somenteLeitura && (
              <Button type="button" variant="ghost" className="pas-alvo h-9 sm:mr-auto text-danger-strong hover:text-danger-strong hover:bg-danger-soft" onClick={() => setConfirmandoDesfazer(true)} disabled={ocupado} data-testid="terrestre-desfazer">
                <Undo2 className="w-4 h-4 mr-1.5" aria-hidden="true" />{doGrupo ? `Desfazer ${nomeDoGrupo}` : "Desfazer"}
              </Button>
            )}
            <Button type="button" variant="outline" className="pas-alvo h-9" onClick={onClose} disabled={ocupado} data-terrestre-fechar>
              {somenteLeitura ? "Fechar" : "Cancelar"}
            </Button>
            {!somenteLeitura && (
              <Button type="button" className="pas-alvo h-9 bg-primary hover:bg-primary-hover text-primary-foreground" onClick={salvar} disabled={ocupado || livres.length === 0} data-testid="terrestre-salvar">
                {registrar.isPending || editarGrupo.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
                {doGrupo ? `Salvar ${nomeDoGrupo}` : editando ? "Salvar" : "Registrar"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
