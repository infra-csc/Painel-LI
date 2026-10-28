/**
 * Lançar ocorrência (27/10): falta, diária extra, horas extras ou
 * substituição. Cada tipo pede só o que o servidor exige — dia da prestação
 * (falta, substituição), um dia A MAIS (diária extra), as horas (horas
 * extras) e quem substituiu. O valor é recalculado pelo servidor e aparece na
 * memória do check-out final.
 * 28/10 (revisão S2): horas extras com DIA obrigatório e até o teto do dia
 * (12 h padrão); diária extra até 2 dias antes/depois do período; a Área de
 * Função só lança falta e substituição (o servidor confere tudo de novo).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Check, Clock, Loader2, Search, TriangleAlert, UserRoundX, UsersRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Collaborator } from "@shared/schema";
import { CONFIGURACAO_PADRAO, OCORRENCIAS_FINANCEIRAS, OCORRENCIA_LABEL, TIPOS_DE_OCORRENCIA, type TipoDeOcorrencia } from "@shared/presenca";
import { diaComSemana, normalizar } from "./presenca-utils";
import type { PrestacaoDaPresenca } from "./tipos";
import type { CorpoDaOcorrencia, useAcoesDaPresenca } from "./use-presenca";

export interface AlvoDaOcorrencia {
  prestacao: PrestacaoDaPresenca;
  nome: string;
  /** Abre já num tipo/dia (o "Lançar falta neste dia" do menu do dia). */
  tipo?: TipoDeOcorrencia;
  dia?: string;
}

const ICONE: Record<TipoDeOcorrencia, typeof Clock> = { falta: UserRoundX, diaria_extra: CalendarPlus, horas_extras: Clock, substituicao: UsersRound };
const DICA: Record<TipoDeOcorrencia, string> = {
  falta: "Tira a diária e a alimentação do dia.",
  diaria_extra: "Um dia a mais, fora dos dias previstos.",
  horas_extras: "Horas do dia × (diária do dia ÷ divisor da regra).",
  substituicao: "Outra pessoa trabalhou no lugar neste dia.",
};

/** Corpo do POST, ou o erro de preenchimento (pt-BR). */
export function montarOcorrencia(
  f: { tipo: TipoDeOcorrencia; dia: string; horas: string; substitutoId: string; observacao: string },
  p: Pick<PrestacaoDaPresenca, "dias" | "diasExtras">,
  horaExtraMaxDia: number = CONFIGURACAO_PADRAO.horaExtraMaxDia,
): CorpoDaOcorrencia | { erro: string } {
  const observacao = f.observacao.trim() || null;
  const dias = p.dias.map((d) => d.dia);
  if (f.tipo === "falta" || f.tipo === "substituicao") {
    if (!f.dia || !dias.includes(f.dia)) return { erro: "Escolha um dia de diária desta prestação." };
    if (f.tipo === "substituicao" && !f.substitutoId) return { erro: "Escolha quem substituiu." };
    return { tipo: f.tipo, dia: f.dia, substitutoCollaboratorId: f.tipo === "substituicao" ? f.substitutoId : null, observacao };
  }
  if (f.tipo === "diaria_extra") {
    if (!f.dia) return { erro: "Informe o dia da diária extra." };
    if (dias.includes(f.dia)) return { erro: "Este dia já é de diária — a diária extra é um dia a mais." };
    return { tipo: f.tipo, dia: f.dia, observacao };
  }
  if (!f.dia || (!dias.includes(f.dia) && !p.diasExtras.includes(f.dia))) return { erro: "Escolha o dia das horas extras." };
  const horas = Number(f.horas.replace(",", "."));
  if (!Number.isFinite(horas) || horas <= 0 || horas > horaExtraMaxDia) {
    return { erro: `Informe as horas extras do dia (mais que 0, até ${horaExtraMaxDia.toLocaleString("pt-BR")} h).` };
  }
  return { tipo: f.tipo, dia: f.dia, horas, observacao };
}

function SeletorDoSubstituto({ valor, onChange, excluir }: { valor: string; onChange: (id: string) => void; excluir: string | null }) {
  const [busca, setBusca] = useState("");
  const { data: todos = [], isLoading, isError } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });
  const escolhido = todos.find((c) => c.id === valor);
  const sugestoes = useMemo(() => {
    const q = normalizar(busca);
    if (!q) return [];
    return todos.filter((c) => c.active !== false && c.id !== excluir && (normalizar(c.fullName).includes(q) || String(c.collaboratorNumber) === busca.trim())).slice(0, 6);
  }, [busca, todos, excluir]);
  if (escolhido) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-brand-soft px-3 py-2">
        <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{toTitleCase(escolhido.fullName)}</span>
        <button type="button" onClick={() => onChange("")} className="text-xs font-medium text-primary hover:underline">Trocar</button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <Input id="prs-oc-substituto" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou número do colaborador" className="h-10 rounded-lg pl-8" autoComplete="off" />
      </div>
      {isLoading && busca && <p className="m-0 text-2xs text-muted-foreground">Carregando os colaboradores…</p>}
      {isError && <p className="m-0 text-2xs text-danger">Não foi possível carregar os colaboradores.</p>}
      {sugestoes.length > 0 && (
        <ul className="m-0 max-h-[180px] overflow-y-auto rounded-lg border border-border bg-card p-1 list-none" aria-label="Sugestões">
          {sugestoes.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onChange(c.id); setBusca(""); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0 flex-1 truncate">{toTitleCase(c.fullName)}</span>
                {c.collaboratorNumber ? <span className="text-2xs tabular-nums text-muted-foreground">nº {c.collaboratorNumber}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {busca.trim() && !isLoading && sugestoes.length === 0 && <p className="m-0 text-2xs text-muted-foreground">Ninguém com esse nome.</p>}
    </div>
  );
}

export function DialogoOcorrencia({ alvo, lancar, onClose, financeiras = true, horaExtraMaxDia = CONFIGURACAO_PADRAO.horaExtraMaxDia }: {
  alvo: AlvoDaOcorrencia | null;
  lancar: ReturnType<typeof useAcoesDaPresenca>["lancarOcorrencia"];
  onClose: () => void;
  /** Diária extra e horas extras (produção/DP/admin); a Área de Função só falta/substituição. */
  financeiras?: boolean;
  horaExtraMaxDia?: number;
}) {
  const tipos = TIPOS_DE_OCORRENCIA.filter((t) => financeiras || !(OCORRENCIAS_FINANCEIRAS as readonly string[]).includes(t));
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoDeOcorrencia>("falta");
  const [dia, setDia] = useState("");
  const [horas, setHoras] = useState("");
  const [substitutoId, setSubstitutoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const aberto = !!alvo;
  const p = alvo?.prestacao;

  useEffect(() => {
    if (!alvo) return;
    setTipo(alvo.tipo ?? "falta"); setDia(alvo.dia ?? ""); setHoras(""); setSubstitutoId(""); setObservacao(""); setErro(null);
  }, [alvo]);

  // Dias que já têm falta/substituição não aceitam outra.
  const diasTirados = new Set((p?.ocorrencias ?? []).filter((o) => o.tipo === "falta" || o.tipo === "substituicao").map((o) => o.dia));
  const diasDaPrestacao = (p?.dias ?? []).map((d) => d.dia);
  const enviando = lancar.isPending;

  const trocarTipo = (t: TipoDeOcorrencia) => {
    setTipo(t); setErro(null);
    // O dia de antes só serve se ainda vale para o tipo novo.
    if (t === "diaria_extra" && diasDaPrestacao.includes(dia)) setDia("");
    if ((t === "falta" || t === "substituicao") && !diasDaPrestacao.includes(dia)) setDia("");
  };

  const salvar = () => {
    if (!p || !alvo) return;
    const r = montarOcorrencia({ tipo, dia, horas, substitutoId, observacao }, p, horaExtraMaxDia);
    if ("erro" in r) { setErro(r.erro); return; }
    setErro(null);
    lancar.mutate({ actualId: p.actualId, corpo: r }, {
      onSuccess: () => {
        toast({ variant: "success", title: `${OCORRENCIA_LABEL[tipo]} lançada`, description: `${alvo.nome}${r.dia ? ` · ${diaComSemana(r.dia)}` : ""}. O valor foi recalculado.` });
        onClose();
      },
      onError: (e) => setErro(apiErrorMessage(e, "Não foi possível lançar a ocorrência.")),
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[520px] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()} data-testid="prs-dialogo-ocorrencia">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <TriangleAlert className="h-4 w-4 text-warning-strong" aria-hidden="true" />Lançar ocorrência
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo && <><span className="font-medium text-foreground">{alvo.nome}</span>{p?.funcao.nome ? ` · ${p.funcao.nome}` : ""}. O valor da prestação é recalculado na hora.</>}
          </DialogDescription>
        </DialogHeader>

        <form className="prs-dialogo-corpo space-y-4 px-6 py-5" noValidate onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <div role="radiogroup" aria-label="Tipo de ocorrência" className="grid grid-cols-2 gap-2">
            {tipos.map((t) => {
              const Icone = ICONE[t];
              const on = tipo === t;
              return (
                <button key={t} type="button" role="radio" aria-checked={on} onClick={() => trocarTipo(t)}
                  className={cn("prs-tipo", on && "prs-tipo-on")} data-testid={`prs-oc-tipo-${t}`}>
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Icone className="w-4 h-4 shrink-0" aria-hidden="true" />{OCORRENCIA_LABEL[t]}</span>
                  <span className="text-2xs leading-4 text-muted-foreground">{DICA[t]}</span>
                </button>
              );
            })}
          </div>

          {(tipo === "falta" || tipo === "substituicao" || tipo === "horas_extras") && (
            <div className="space-y-1.5">
              <Label htmlFor="prs-oc-dia">Dia</Label>
              <select id="prs-oc-dia" value={dia} onChange={(e) => setDia(e.target.value)} className="prs-select" data-testid="prs-oc-dia">
                <option value="">Escolha o dia</option>
                {diasDaPrestacao.map((d) => {
                  const tirado = tipo !== "horas_extras" && diasTirados.has(d);
                  return <option key={d} value={d} disabled={tirado}>{diaComSemana(d)}{tirado ? " — já tem falta/substituição" : ""}</option>;
                })}
                {tipo === "horas_extras" && (p?.diasExtras ?? []).map((d) => <option key={d} value={d}>{diaComSemana(d)} (diária extra)</option>)}
              </select>
            </div>
          )}

          {tipo === "diaria_extra" && (
            <div className="space-y-1.5">
              <Label htmlFor="prs-oc-dia-extra">Dia da diária extra</Label>
              <Input id="prs-oc-dia-extra" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="h-10 w-[200px] rounded-lg tabular-nums" />
              <p className="m-0 text-2xs text-muted-foreground">Fora dos dias previstos ({diasDaPrestacao.length ? `${diaComSemana(diasDaPrestacao[0])} a ${diaComSemana(diasDaPrestacao[diasDaPrestacao.length - 1])}` : "sem dias"}), até 2 dias antes ou depois.</p>
            </div>
          )}

          {tipo === "horas_extras" && (
            <div className="space-y-1.5">
              <Label htmlFor="prs-oc-horas">Horas extras <span className="font-normal text-muted-foreground">(até {horaExtraMaxDia.toLocaleString("pt-BR")} h no dia)</span></Label>
              <Input id="prs-oc-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Ex.: 2 ou 1,5" className="h-10 w-[140px] rounded-lg tabular-nums" data-testid="prs-oc-horas" />
            </div>
          )}

          {tipo === "substituicao" && (
            <div className="space-y-1.5">
              <Label htmlFor="prs-oc-substituto">Quem substituiu</Label>
              <SeletorDoSubstituto valor={substitutoId} onChange={setSubstitutoId} excluir={p?.colaborador?.id ?? null} />
              <p className="m-0 text-2xs text-muted-foreground">O substituto é pago pela "Dividir escalação" do Realizado; aqui o dia sai do titular.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="prs-oc-obs">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="prs-oc-obs" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} className="rounded-lg text-sm" placeholder="Ex.: avisou pela manhã que estava doente." />
          </div>

          {erro && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando} data-testid="prs-salvar-ocorrencia">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Lançando…" : `Lançar ${OCORRENCIA_LABEL[tipo].toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
