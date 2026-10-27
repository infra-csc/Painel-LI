/**
 * Ficha do contrato (26/10) — painel lateral, como a ficha do colaborador:
 * consultar um contrato não interrompe a lista. Cabeçalho com a empresa e a
 * situação; o corpo em grupos (vigência, colaboradores, anexo, observação,
 * histórico) e as ações no rodapé, sempre à mão: editar, encerrar/reativar.
 */
import { useRef, useState, type ReactNode } from "react";
import { Ban, Eye, FileUp, History, Loader2, PencilLine, Paperclip, RotateCcw, Trash2, UserMinus, Users } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { toTitleCase } from "@/lib/format";
import { apiErrorMessage } from "@/lib/utils";
import { useContrato, useMutacoesDeContrato, type Contrato, type HistoricoDoContrato } from "./api";
import { SituacaoDoContratoBadge, TipoDoContrato, dataBr, vigenciaTexto } from "./pecas";

function Grupo({ titulo, icone, children, acessorio }: { titulo: string; icone?: ReactNode; children: ReactNode; acessorio?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        {icone && <span className="text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden="true">{icone}</span>}
        <h3 className="text-xs font-semibold text-foreground">{titulo}</h3>
        {acessorio && <div className="ml-auto">{acessorio}</div>}
      </header>
      <div className="px-4 pb-3.5">{children}</div>
    </section>
  );
}

const ROTULO_DA_ACAO: Record<string, string> = {
  criado: "Cadastrado", editado: "Editado", encerrado: "Encerrado", reativado: "Reativado",
  vinculado: "Colaborador vinculado", desvinculado: "Colaborador desvinculado", anexo: "Anexo", importado: "Importado da planilha",
};

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Historico({ itens }: { itens: HistoricoDoContrato[] }) {
  if (itens.length === 0) return <p className="text-xs text-muted-foreground">Sem registros.</p>;
  return (
    <ol className="ctr-linha-do-tempo space-y-3">
      {itens.map((h) => (
        <li key={h.id} className="relative pl-4">
          <span aria-hidden="true" className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
          <p className="text-xs font-medium text-foreground">{ROTULO_DA_ACAO[h.acao] ?? "Alteração"} <span className="font-normal text-muted-foreground">· {h.porNome} · {quando(h.em)}</span></p>
          {h.detalhes.length > 0 && (
            <ul className="mt-0.5 space-y-0.5">
              {h.detalhes.map((d, i) => <li key={i} className="break-words text-2xs leading-relaxed text-slate-600">{d}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ContratoSheet({ id, onOpenChange, onEditar }: { id: string | null; onOpenChange: (o: boolean) => void; onEditar: (c: Contrato) => void }) {
  const q = useContrato(id);
  const { encerrar, reativar, desvincular, anexar, removerAnexo } = useMutacoesDeContrato();
  const { toast } = useToast();
  const [encerrando, setEncerrando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [reativando, setReativando] = useState(false);
  const [tirandoAnexo, setTirandoAnexo] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const c = q.data?.contrato ?? null;

  const erro = (titulo: string) => (e: unknown) => toast({ variant: "destructive", title: titulo, description: apiErrorMessage(e, "Tente de novo.") });

  const enviarAnexo = async (f: File | undefined) => {
    if (!c || !f) return;
    try {
      await anexar.mutateAsync({ id: c.id, arquivo: f });
      toast({ variant: "success", title: "Contrato anexado", description: f.name });
    } catch (e) { erro("Não foi possível anexar")(e); }
    if (arquivo.current) arquivo.current.value = "";
  };

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="ctr-ficha flex w-full flex-col gap-0 border-l border-border bg-surface-muted p-0 sm:max-w-[480px]" data-testid="ctr-ficha">
        <div className="shrink-0 border-b border-border bg-card px-5 pb-4 pr-12 pt-5">
          {c ? (
            <>
              <SheetTitle className="break-words text-lg font-semibold leading-6 tracking-[-0.01em] text-foreground">{c.razaoSocial}</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums text-slate-700">{c.cnpjFormatado}</span>
                {c.nomeFantasia ? ` · ${c.nomeFantasia}` : ""}
              </SheetDescription>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <SituacaoDoContratoBadge situacao={c.situacao} dias={c.diasParaVencer} />
                <TipoDoContrato tipo={c.tipo} />
              </div>
            </>
          ) : (
            <>
              <SheetTitle className="text-lg font-semibold">Contrato</SheetTitle>
              <SheetDescription className="sr-only">Ficha do contrato</SheetDescription>
              {q.isLoading && <div className="mt-2 space-y-2" aria-busy="true"><div className="val-osso h-4 w-40" /><div className="val-osso h-5 w-24" /></div>}
              {q.error && <p role="alert" className="mt-2 text-xs text-danger">{apiErrorMessage(q.error, "Não foi possível abrir o contrato.")}</p>}
            </>
          )}
        </div>

        {c && (
          <div key={c.id} className="ctr-entra min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            {c.encerradoEm && (
              <div className="relative overflow-hidden rounded-xl border border-border bg-card py-2.5 pl-4 pr-3.5">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-slate-400" aria-hidden="true" />
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Encerrado <span className="font-normal text-muted-foreground">em {dataBr(c.encerradoEm.slice(0, 10))} por {c.encerradoPorNome}</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{c.motivoEncerramento}</p>
                <p className="mt-1 text-2xs text-muted-foreground">Não conta como contrato ativo, mesmo dentro da vigência.</p>
              </div>
            )}

            <Grupo titulo="Vigência">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div><dt className="text-2xs font-medium text-muted-foreground">Início</dt><dd className="mt-0.5 text-sm tabular-nums">{c.vigenciaInicio ? dataBr(c.vigenciaInicio) : <span className="text-muted-foreground">Não informado</span>}</dd></div>
                <div><dt className="text-2xs font-medium text-muted-foreground">Fim</dt><dd className="mt-0.5 text-sm tabular-nums">{c.vigenciaFim ? dataBr(c.vigenciaFim) : <span className="text-muted-foreground">{c.vigenciaInicio ? "Sem prazo" : "Não informado"}</span>}</dd></div>
                {c.situacao === "sem_vigencia" && <p className="col-span-2 text-2xs text-warning">Sem datas, o contrato não conta como ativo — edite e informe a vigência.</p>}
                {c.diasParaVencer != null && c.diasParaVencer < 0 && !c.encerradoEm && <p className="col-span-2 text-2xs text-danger">Venceu há {-c.diasParaVencer} {c.diasParaVencer === -1 ? "dia" : "dias"}.</p>}
              </dl>
            </Grupo>

            <Grupo titulo={`Colaboradores atendidos (${c.colaboradores.length})`} icone={<Users />}>
              {c.colaboradores.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">Nenhum colaborador vinculado. Use Editar ou vincule pelo cadastro do colaborador.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {c.colaboradores.map((x) => (
                    <li key={x.id} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{toTitleCase(x.fullName)}</span>
                      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">nº {x.collaboratorNumber}{x.active ? "" : " · inativo"}</span>
                      <button type="button" aria-label={`Desvincular ${toTitleCase(x.fullName)}`} disabled={desvincular.isPending}
                        onClick={() => desvincular.mutate({ id: c.id, colaboradorId: x.id }, { onError: erro("Não foi possível desvincular") })}
                        className="val-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Grupo>

            <Grupo titulo="Arquivo do contrato" icone={<Paperclip />}>
              <input ref={arquivo} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true"
                onChange={(e) => void enviarAnexo(e.target.files?.[0])} data-testid="ctr-anexo-input" />
              {c.anexoId ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary" aria-hidden="true"><Paperclip className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{c.anexoNome ?? "Contrato"}</p>
                    <p className="text-2xs text-muted-foreground">Só o DP abre este arquivo</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => window.open(`/api/attachments/${c.anexoId}/view`, "_blank", "noopener")}>
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Abrir
                  </Button>
                  <button type="button" aria-label="Remover o anexo" onClick={() => setTirandoAnexo(true)}
                    className="val-alvo inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => arquivo.current?.click()} disabled={anexar.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                  {anexar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
                  {anexar.isPending ? "Enviando…" : "Anexar o contrato (PDF ou imagem, até 10 MB)"}
                </button>
              )}
            </Grupo>

            {c.observacao && (
              <Grupo titulo="Observação">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{c.observacao}</p>
              </Grupo>
            )}

            <Grupo titulo="Histórico" icone={<History />}>
              <Historico itens={q.data?.historico ?? []} />
            </Grupo>
          </div>
        )}

        {c && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
            <Button variant="outline" onClick={() => onEditar(c)} className="h-9 rounded-lg px-3 text-sm font-medium" data-testid="ctr-ficha-editar">
              <PencilLine className="mr-1.5 h-4 w-4" aria-hidden="true" /> Editar
            </Button>
            <div className="ml-auto">
              {c.encerradoEm ? (
                <Button variant="outline" onClick={() => setReativando(true)} className="h-9 rounded-lg px-3 text-sm font-medium" data-testid="ctr-ficha-reativar">
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Reativar
                </Button>
              ) : (
                <Button variant="outline" onClick={() => { setMotivo(""); setEncerrando(true); }} className="h-9 rounded-lg border-danger/30 px-3 text-sm font-medium text-danger hover:bg-danger-soft hover:text-danger" data-testid="ctr-ficha-encerrar">
                  <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" /> Encerrar
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      {c && (
        <>
          <ConfirmDialog open={encerrando} onOpenChange={setEncerrando} tone="danger" icon={Ban}
            title="Encerrar o contrato?" description={`${c.razaoSocial} · ${c.cnpjFormatado} deixa de contar como contrato ativo, mesmo dentro da vigência. Dá para reativar depois.`}
            confirmLabel="Encerrar contrato" pending={encerrar.isPending} confirmDisabled={motivo.trim().length < 3} confirmTestId="ctr-confirmar-encerrar"
            onConfirm={() => encerrar.mutate({ id: c.id, versao: c.versao, motivo: motivo.trim() }, {
              onSuccess: () => { setEncerrando(false); toast({ title: "Contrato encerrado", description: c.razaoSocial }); },
              onError: erro("Não foi possível encerrar"),
            })}>
            <div className="space-y-1.5">
              <Label htmlFor="ctr-motivo">Motivo</Label>
              <Textarea id="ctr-motivo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: fim da parceria, CNPJ baixado" className="rounded-lg bg-card text-sm" />
            </div>
          </ConfirmDialog>
          <ConfirmDialog open={reativando} onOpenChange={setReativando} icon={RotateCcw}
            title="Reativar o contrato?" description={`${c.razaoSocial} volta a valer conforme a vigência (${vigenciaTexto(c.vigenciaInicio, c.vigenciaFim)}).`}
            confirmLabel="Reativar" pending={reativar.isPending}
            onConfirm={() => reativar.mutate({ id: c.id, versao: c.versao }, {
              onSuccess: () => { setReativando(false); toast({ variant: "success", title: "Contrato reativado", description: c.razaoSocial }); },
              onError: erro("Não foi possível reativar"),
            })} />
          <ConfirmDialog open={tirandoAnexo} onOpenChange={setTirandoAnexo} tone="danger" icon={Trash2}
            title="Remover o anexo?" description="O arquivo deixa de estar ligado a este contrato. O registro fica no histórico."
            confirmLabel="Remover" pending={removerAnexo.isPending}
            onConfirm={() => removerAnexo.mutate({ id: c.id }, { onSuccess: () => setTirandoAnexo(false), onError: erro("Não foi possível remover") })} />
        </>
      )}
    </Sheet>
  );
}

