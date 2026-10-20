/**
 * Formulário do pedido (16/10; refeito em 20/10 a pedido do dono: "ele só
 * coloca qual tipo de freela ou um valor à parte").
 *
 *  - VAGA: a escolha principal são os 4 tipos de freela da cenotécnica, em
 *    cartões iguais aos do "Tipo de freela" do Resumo, cada um com o valor da
 *    TABELA para os dias da vaga (o servidor calcula e grava — a tela não manda
 *    o valor). A quinta opção, "Outro valor", é a negociação à parte, com o
 *    mesmo peso ("nem sempre é o valor de freela") e a observação recomendada.
 *    Setor, posição, período e diárias saíram do formulário: vêm da vaga e do
 *    tipo. O valor por diária fica só como informação.
 *    Tipo do Resumo: vem pré-selecionado; se a vaga não tinha tipo e a pessoa
 *    escolhe um da tabela, a vaga também passa a tê-lo (rota da Escalação),
 *    para o Planejado bater; se a vaga já tem OUTRO tipo, a vaga não muda —
 *    a tela avisa "o tipo da vaga é X".
 *  - EMPREITA: responsável, nº de pessoas, as VAGAS da escala que fazem parte
 *    dela (checkbox), o valor fechado e a observação. O nº de pessoas segue o
 *    nº de vagas marcadas até a pessoa mudar o número (uma equipe pode ter
 *    gente que não está na escala).
 *
 * `useFormularioDoPedido` + `CamposDoPedido` são os MESMOS no diálogo (gaveta
 * "Honorários do evento") e na aba "Honorário" do modal da vaga.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Info, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/common/currency-input";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useConfirmarDescarte } from "@/lib/use-confirmar-descarte";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { isCenotecnicaFunction } from "@shared/alimentacao";
import { CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, isCenoFreelaTipo } from "@shared/cenotecnica-empreita";
import {
  HONORARIO_PESSOAS_MAX, HONORARIO_STATUS_LABEL, HONORARIO_TEXTO_MAX, ehTipoDeTabela, validarDadosDoPedido, valorPorDiaria,
  type HonorarioStatus,
} from "@shared/honorarios-ceno";
import {
  useGravarTipoNaVaga, useMutacoesDoPedido, type CamposDoPedido as CamposGravados, type Honorario, type LinhaDoPedido,
  type PrecisaConfirmarDescarte, type VagaParaEmpreita,
} from "./api";
import { brl, diariasTexto, periodoCurto, useFocoDeVolta } from "./pecas";

export type AlvoDoFormulario =
  | { modo: "vaga"; linha: LinhaDoPedido }
  | { modo: "empreita"; honorario: Honorario | null; vagasDoEvento: VagaParaEmpreita[]; vagaInicial?: string | null };

export interface FormDoPedido {
  nome: string;
  pessoas: string;
  /** Vaga: um dos 4 tipos da tabela, "outro" ou "" (ainda não escolhido). */
  tipo: string;
  /** Valor digitado: "Outro valor" na vaga, valor fechado na empreita. */
  valor: number;
  observacao: string;
  /** Empreita: as vagas marcadas. */
  vagaIds: string[];
}

function inicial(alvo: AlvoDoFormulario): FormDoPedido {
  if (alvo.modo === "vaga") {
    const h = alvo.linha.honorario;
    const s = alvo.linha.sugestao;
    return {
      nome: h?.nome ?? s?.nome ?? "",
      pessoas: "",
      // Pedido novo: o tipo do Resumo vem marcado. Pedido antigo sem tipo: nada marcado.
      tipo: h ? h.tipoFreela ?? "" : s?.tipoFreela ?? "",
      valor: h?.valorPedido ?? 0,
      observacao: h?.observacao ?? "",
      vagaIds: [],
    };
  }
  const h = alvo.honorario;
  const vagaIds = h ? h.vagasDaEmpreita.map((v) => v.id) : alvo.vagaInicial ? [alvo.vagaInicial] : [];
  return {
    nome: h?.nome ?? "",
    pessoas: h?.pessoas ? String(h.pessoas) : vagaIds.length ? String(vagaIds.length) : "",
    tipo: "",
    valor: h?.valorPedido ?? 0,
    observacao: h?.observacao ?? "",
    vagaIds,
  };
}

/** Quando a vaga NÃO pode entrar numa empreita (null = pode). */
export function bloqueioDaVagaNaEmpreita(v: VagaParaEmpreita, empreitaId: string | null): string | null {
  if (v.empreita && v.empreita.id !== empreitaId) return `já está na empreita ${v.empreita.nome}`;
  if (v.pedidoProprio && v.pedidoProprio.status !== "rascunho" && v.pedidoProprio.status !== "devolvido") {
    return `pedido próprio ${(HONORARIO_STATUS_LABEL[v.pedidoProprio.status as HonorarioStatus] ?? v.pedidoProprio.status).toLowerCase()} — peça para o aprovador devolver`;
  }
  return null;
}

/**
 * Estado do formulário do pedido. `chave` decide quando ele volta ao que está
 * gravado (abrir o diálogo, outra vaga, nova versão do pedido) — um refetch
 * qualquer com a mesma chave não apaga o que a pessoa está digitando.
 */
export function useFormularioDoPedido({ alvo, chave, eventId }: {
  alvo: AlvoDoFormulario | null;
  chave: unknown;
  eventId: string;
  /** Mantido por compatibilidade com quem chamava (as datas agora vêm da vaga). */
  evento?: { startDate: string; endDate: string };
}) {
  const { criar, editar } = useMutacoesDoPedido();
  const gravarTipo = useGravarTipoNaVaga();
  const [f, setF] = useState<FormDoPedido | null>(null);
  const [base, setBase] = useState<FormDoPedido | null>(null);
  const [pessoasTocadas, setPessoasTocadas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedeDescarte, setPedeDescarte] = useState<PrecisaConfirmarDescarte[] | null>(null);
  const [avisoDaVaga, setAvisoDaVaga] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) { setF(null); setBase(null); return; }
    const i = inicial(alvo);
    setF(i);
    setBase(i);
    const h = alvo.modo === "empreita" ? alvo.honorario : null;
    setPessoasTocadas(!!h && h.pessoas != null && h.pessoas !== h.vagasDaEmpreita.length);
    setErro(null);
    setPedeDescarte(null);
    setAvisoDaVaga(null);
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const honorario = alvo?.modo === "vaga" ? alvo.linha.honorario : alvo?.honorario ?? null;
  const empreita = alvo?.modo === "empreita";
  const linha = alvo?.modo === "vaga" ? alvo.linha : null;
  const tabela = linha?.tabela ?? null;
  const salvando = criar.isPending || editar.isPending;
  const sujo = !!f && !!base && JSON.stringify(f) !== JSON.stringify(base);
  /** Dias da vaga (os da tabela); na empreita, nada. */
  const dias = linha ? (linha.vaga?.dias ?? tabela?.dias ?? honorario?.diarias ?? 0) : 0;
  /** O valor que o pedido terá: o da tabela no tipo de tabela, o digitado em "Outro valor" e na empreita. */
  const valorEfetivo = !f ? 0
    : empreita ? f.valor
    : ehTipoDeTabela(f.tipo) ? (tabela?.valores[f.tipo]?.total ?? (honorario?.tipoFreela === f.tipo ? honorario.valorPedido : 0))
    : f.tipo === "outro" ? f.valor : 0;
  const porDia = useMemo(() => valorPorDiaria(valorEfetivo, dias || null), [valorEfetivo, dias]);

  const set = (patch: Partial<FormDoPedido>) => { setErro(null); setPedeDescarte(null); setF((p) => (p ? { ...p, ...patch } : p)); };
  const setPessoas = (v: string) => { setPessoasTocadas(true); set({ pessoas: v.replace(/\D/g, "").slice(0, 3) }); };
  /** Marca/desmarca uma vaga da empreita; o nº de pessoas acompanha até ser mexido à mão. */
  const alternarVaga = (id: string) => {
    if (!f) return;
    const vagaIds = f.vagaIds.includes(id) ? f.vagaIds.filter((x) => x !== id) : [...f.vagaIds, id];
    set({ vagaIds, ...(!pessoasTocadas ? { pessoas: vagaIds.length ? String(vagaIds.length) : "" } : {}) });
  };

  /** O que vai para o servidor (mesmo formato do POST e do PATCH). */
  const campos = (): CamposGravados | null => {
    if (!f) return null;
    if (empreita) {
      return {
        nome: f.nome.trim(), pessoas: f.pessoas ? Number(f.pessoas) : null, valorPedido: f.valor,
        observacao: f.observacao.trim() || null, vagaIds: f.vagaIds,
      };
    }
    return {
      tipoFreela: f.tipo || null,
      // Tipo de tabela: o servidor calcula o valor. "Outro valor": vai o digitado.
      ...(f.tipo === "outro" ? { valorPedido: f.valor } : {}),
      observacao: f.observacao.trim() || null,
    };
  };

  /**
   * Grava o rascunho (cria ou edita) e devolve o pedido como ficou; `null`
   * quando os dados não passam ou o servidor recusa (o motivo fica em `erro`;
   * vagas com rascunho próprio ficam em `pedeDescarte`, para confirmar).
   */
  const gravar = async (opcoes: { descartarRascunhos?: boolean } = {}): Promise<Honorario | null> => {
    const c = campos();
    if (!c || !alvo || !f) return null;
    const problema = validarDadosDoPedido({ tipo: empreita ? "empreita" : "vaga", ...c, tipoFreela: c.tipoFreela ?? null });
    if (problema) { setErro(problema); return null; }
    const corpo = { ...c, ...(opcoes.descartarRascunhos ? { descartarRascunhos: true } : {}) };
    try {
      let salvo: Honorario;
      if (honorario) salvo = await editar.mutateAsync({ id: honorario.id, versao: honorario.versao, ...corpo });
      else if (alvo.modo === "vaga" && alvo.linha.vaga) salvo = await criar.mutateAsync({ eventId, tipo: "vaga", teamInclusionId: alvo.linha.vaga.id, ...corpo });
      else salvo = await criar.mutateAsync({ eventId, tipo: "empreita", ...corpo });
      setBase(f);
      setPedeDescarte(null);
      // A vaga ainda sem tipo no Resumo passa a ter o escolhido aqui (o Planejado usa).
      const vaga = alvo.modo === "vaga" ? alvo.linha.vaga : null;
      if (vaga && !vaga.cenoFreelaTipo && isCenoFreelaTipo(f.tipo) && isCenotecnicaFunction(vaga.functionName)) {
        gravarTipo.mutateAsync({ vagaId: vaga.id, tipo: f.tipo })
          .catch((e) => setAvisoDaVaga(`O honorário foi salvo, mas o tipo não foi marcado na vaga: ${apiErrorMessage(e, "tente pelo Resumo")}`));
      }
      return salvo;
    } catch (err) {
      if (isApiError(err) && err.status === 409 && Array.isArray(err.body?.precisaConfirmar)) {
        setPedeDescarte(err.body.precisaConfirmar as PrecisaConfirmarDescarte[]);
      }
      setErro(apiErrorMessage(err, "Não foi possível salvar. Tente de novo."));
      return null;
    }
  };

  return {
    f, set, setPessoas, alternarVaga, erro, setErro, salvando, sujo, porDia, dias, valorEfetivo, tabela, linha, honorario, empreita,
    campos, gravar, pedeDescarte, setPedeDescarte, avisoDaVaga, vagasDoEvento: alvo?.modo === "empreita" ? alvo.vagasDoEvento : [],
    /** As vagas marcadas ao abrir (a da aba, as que já estão na empreita) — vão para o topo da lista. */
    vagasIniciais: base?.vagaIds ?? [],
  };
}

export type FormularioDoPedido = ReturnType<typeof useFormularioDoPedido>;

const CAMPO = "h-10 rounded-lg bg-card";
const CARTAO = "w-full rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const ATIVO = "border-primary bg-primary text-primary-foreground shadow-1";
const INATIVO = "border-border bg-card text-slate-700 hover:border-primary/40 hover:bg-brand-soft";

/** Os 4 tipos de freela (tabela) + "Outro valor". */
function EscolhaDoTipo({ form, prefixo }: { form: FormularioDoPedido; prefixo: string }) {
  const { f, set, tabela, dias, linha } = form;
  if (!f) return null;
  const tipoDaVaga = linha?.vaga?.cenoFreelaTipo ?? null;
  const algumExtrapolado = CENO_FREELA_TIPOS.some((t) => tabela?.valores[t]?.extrapolado);
  const outro = f.tipo === "outro";
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium text-foreground">
        Tipo de freela
        <span className="text-2xs font-normal text-muted-foreground">
          {dias > 0 ? `valor da tabela para ${dias} ${dias === 1 ? "dia" : "dias"} da vaga` : "a vaga ainda não tem dias"}
        </span>
      </legend>
      <div role="radiogroup" aria-label="Tipo de freela" className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid={`${prefixo}-tipos`}>
        {CENO_FREELA_TIPOS.map((t) => {
          const ativo = f.tipo === t;
          const v = tabela?.valores[t] ?? null;
          return (
            <button key={t} type="button" role="radio" aria-checked={ativo} onClick={() => set({ tipo: t })}
              className={cn(CARTAO, "relative", ativo ? ATIVO : INATIVO)} data-testid={`${prefixo}-tipo-${t}`}>
              {CENO_FREELA_TIPO_LABELS[t]}
              <span className={cn("mt-0.5 block text-2xs font-bold tabular-nums", ativo ? "text-primary-foreground/85" : "text-muted-foreground")}>
                {v ? brl(v.total) : "—"}
              </span>
              {v?.extrapolado && <span className={cn("block text-2xs font-medium", ativo ? "text-primary-foreground/80" : "text-warning")}>extrapolado</span>}
              {tipoDaVaga === t && (
                <span className={cn("block text-2xs font-medium", ativo ? "text-primary-foreground/80" : "text-primary")}>tipo da vaga</span>
              )}
            </button>
          );
        })}
      </div>
      <div className={cn("rounded-lg border transition-colors", outro ? "border-primary bg-brand-soft/40 ring-1 ring-primary/30" : "border-border bg-card")}>
        <button type="button" role="radio" aria-checked={outro} onClick={() => set({ tipo: "outro" })}
          className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !outro && "hover:bg-brand-soft")}
          data-testid={`${prefixo}-tipo-outro`}>
          <span>
            <span className="block text-xs font-semibold text-foreground">Outro valor</span>
            <span className="block text-2xs text-muted-foreground">Negociado à parte — nem sempre é o valor de freela</span>
          </span>
          <span aria-hidden="true" className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", outro ? "border-primary" : "border-slate-300")}>
            {outro && <span className="h-2 w-2 rounded-full bg-primary" />}
          </span>
        </button>
        {outro && (
          <div className="border-t border-primary/15 px-3 pb-3 pt-2.5">
            <Label htmlFor={`${prefixo}-valor`} className="text-xs">Valor negociado</Label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <CurrencyInput id={`${prefixo}-valor`} value={f.valor} onChange={(c) => set({ valor: c })} className="h-11 bg-card pl-9 text-base tabular-nums" aria-label="Valor negociado" />
            </div>
          </div>
        )}
      </div>
      {algumExtrapolado && dias > 0 && (
        <p className="text-2xs leading-snug text-muted-foreground">A tabela cobre de 2 a 6 dias; fora disso o valor é <b>extrapolado</b> pelo incremento da modalidade.</p>
      )}
    </fieldset>
  );
}

/** Aviso da integração com o Resumo: a vaga já tem outro tipo, ou vai ganhar este. */
function AvisoDoTipoDaVaga({ form }: { form: FormularioDoPedido }) {
  const { f, linha, avisoDaVaga } = form;
  if (!f || !linha?.vaga) return null;
  const tipoDaVaga = linha.vaga.cenoFreelaTipo;
  if (avisoDaVaga) {
    return <p role="alert" className="flex items-start gap-1.5 text-2xs leading-snug text-warning"><AlertCircle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />{avisoDaVaga}</p>;
  }
  if (isCenoFreelaTipo(tipoDaVaga) && isCenoFreelaTipo(f.tipo) && tipoDaVaga !== f.tipo) {
    return (
      <p className="flex items-start gap-1.5 rounded-lg border border-warning/25 bg-warning-soft px-2.5 py-1.5 text-2xs leading-snug text-slate-700" data-testid="hon-tipo-diferente">
        <AlertCircle className="mt-px h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
        <span>O tipo da vaga no Resumo é <b>{CENO_FREELA_TIPO_LABELS[tipoDaVaga]}</b>. O honorário fica {CENO_FREELA_TIPO_LABELS[f.tipo]} — a vaga não muda (se for para mudar, troque no Resumo).</span>
      </p>
    );
  }
  if (!tipoDaVaga && isCenoFreelaTipo(f.tipo) && isCenotecnicaFunction(linha.vaga.functionName)) {
    return (
      <p className="flex items-start gap-1.5 text-2xs leading-snug text-muted-foreground" data-testid="hon-tipo-na-vaga">
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
        Ao salvar, a vaga também fica como {CENO_FREELA_TIPO_LABELS[f.tipo]} no Resumo — para o Planejado bater.
      </p>
    );
  }
  return null;
}

/** A lista de vagas da escala com checkbox (empreita). */
function VagasDaEmpreitaCampo({ form, prefixo }: { form: FormularioDoPedido; prefixo: string }) {
  const { f, alternarVaga, vagasDoEvento, vagasIniciais, honorario } = form;
  // As que abriram marcadas ficam no topo (a ordem não pula enquanto a pessoa marca).
  const ordenadas = [...vagasDoEvento].sort((a, b) => Number(vagasIniciais.includes(b.id)) - Number(vagasIniciais.includes(a.id)));
  if (!f) return null;
  const empreitaId = honorario?.id ?? null;
  // As que já estão nesta empreita mas saíram da lista do evento (cancelada, casa…) aparecem para poder tirar.
  const fora = (honorario?.vagasDaEmpreita ?? []).filter((v) => !vagasDoEvento.some((x) => x.id === v.id));
  const total = vagasDoEvento.length + fora.length;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-3 text-sm font-medium text-foreground">
        Vagas da escala nesta empreita
        <span className="text-2xs font-normal tabular-nums text-muted-foreground" aria-live="polite">{f.vagaIds.length} {f.vagaIds.length === 1 ? "marcada" : "marcadas"}</span>
      </legend>
      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Nenhuma vaga de cenotécnica ativa neste evento. A empreita pode seguir sem vaga (equipe que não está na escala).</p>
      ) : (
        <ul className="max-h-[260px] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card" data-testid={`${prefixo}-vagas`}>
          {ordenadas.map((v) => {
            const marcada = f.vagaIds.includes(v.id);
            const bloqueio = marcada ? null : bloqueioDaVagaNaEmpreita(v, empreitaId);
            const descarta = !bloqueio && !marcada && v.pedidoProprio && (v.pedidoProprio.status === "rascunho" || v.pedidoProprio.status === "devolvido");
            const id = `${prefixo}-vaga-${v.id}`;
            return (
              <li key={v.id} className={cn("flex items-start gap-2.5 px-3 py-2", bloqueio && "bg-surface-muted/60")}>
                <Checkbox id={id} checked={marcada} disabled={!!bloqueio} onCheckedChange={() => alternarVaga(v.id)} className="mt-0.5" />
                <label htmlFor={id} className={cn("min-w-0 flex-1 text-xs leading-4", bloqueio ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer text-slate-700")}>
                  <span className="font-mono tabular-nums text-muted-foreground">#{v.inclusionNumber}</span>{" "}
                  <span className={v.semColaborador ? "italic text-muted-foreground" : "font-medium text-foreground"}>{v.collaboratorName ?? "sem nome"}</span>
                  <span className="text-muted-foreground"> · {v.functionName} · {v.dias} {v.dias === 1 ? "dia" : "dias"}</span>
                  {bloqueio && <span className="block text-2xs text-muted-foreground">{bloqueio}</span>}
                  {descarta && <span className="block text-2xs text-warning">tem pedido próprio em {v.pedidoProprio!.status === "rascunho" ? "rascunho" : "negociação"} ({brl(v.pedidoProprio!.valorPedido)}) — será descartado</span>}
                </label>
              </li>
            );
          })}
          {fora.map((v) => {
            const id = `${prefixo}-vaga-${v.id}`;
            return (
              <li key={v.id} className="flex items-start gap-2.5 bg-warning-soft/50 px-3 py-2">
                <Checkbox id={id} checked={f.vagaIds.includes(v.id)} onCheckedChange={() => alternarVaga(v.id)} className="mt-0.5" />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-xs leading-4 text-slate-700">
                  <span className="font-mono tabular-nums text-muted-foreground">#{v.inclusionNumber}</span> {v.collaboratorName ?? "sem nome"}
                  <span className="block text-2xs font-medium text-warning">saiu da escala — desmarque para tirar da empreita</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

/**
 * Os campos do pedido. `prefixo` separa os ids quando o formulário aparece
 * em mais de um lugar da tela (diálogo × aba da vaga).
 */
export function CamposDoPedido({ form, prefixo = "hon" }: {
  form: FormularioDoPedido;
  prefixo?: string;
  /** Mantido por compatibilidade; o rótulo agora acompanha o tipo. */
  rotuloDaObservacao?: string;
}) {
  const { f, set, setPessoas, empreita, porDia, dias, valorEfetivo, linha, erro } = form;
  if (!f) return null;
  const id = (s: string) => `${prefixo}-${s}`;
  const outro = f.tipo === "outro";
  const vaga = linha?.vaga ?? null;
  const inicio = vaga?.scheduleStartDate ?? linha?.honorario?.inicio ?? null;
  const fim = vaga?.scheduleEndDate ?? linha?.honorario?.fim ?? null;
  return (
    <>
      {empreita ? (
        <>
          <fieldset className="grid grid-cols-[minmax(0,1fr)_88px] gap-x-3 gap-y-4 sm:grid-cols-[1fr_120px] sm:gap-x-4">
            <legend className="sr-only">Quem é a empreita</legend>
            <div className="space-y-1.5">
              <Label htmlFor={id("nome")}>Responsável ou equipe</Label>
              <Input id={id("nome")} className={CAMPO} value={f.nome} maxLength={120} placeholder="Ex.: Equipe Horizonte" onChange={(e) => set({ nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id("pessoas")}>Pessoas</Label>
              <Input id={id("pessoas")} className={CAMPO} inputMode="numeric" value={f.pessoas} placeholder="—" onChange={(e) => setPessoas(e.target.value)} aria-describedby={id("pessoas-dica")} />
            </div>
            <p id={id("pessoas-dica")} className="col-span-2 -mt-2 text-2xs text-muted-foreground">O nº de pessoas segue as vagas marcadas; mude se a equipe tiver gente fora da escala.</p>
          </fieldset>
          <VagasDaEmpreitaCampo form={form} prefixo={prefixo} />
          <div className="grid gap-4 rounded-xl border border-border bg-surface-muted/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={id("valor")}>Valor fechado</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <CurrencyInput id={id("valor")} value={f.valor} onChange={(c) => set({ valor: c })} className="h-11 bg-card pl-9 text-base tabular-nums" aria-label="Valor fechado" />
              </div>
            </div>
            {f.vagaIds.length > 0 && f.valor > 0 && (
              <div className="text-right">
                <p className="text-2xs text-muted-foreground">Por vaga</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{brl(Math.round(f.valor / f.vagaIds.length))}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <EscolhaDoTipo form={form} prefixo={prefixo} />
          <AvisoDoTipoDaVaga form={form} />
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-surface-muted/60 px-4 py-3" aria-live="polite">
            <div>
              <p className="text-2xs text-muted-foreground">Valor do pedido</p>
              <p className="text-lg font-semibold tabular-nums text-foreground" data-testid={`${prefixo}-valor-do-pedido`}>{valorEfetivo > 0 ? brl(valorEfetivo) : "—"}</p>
            </div>
            <p className="text-right text-2xs tabular-nums text-muted-foreground" data-testid={`${prefixo}-por-diaria`}>
              {porDia != null && valorEfetivo > 0 ? `${brl(porDia)}/diária · ` : ""}{diariasTexto(dias || null)}
              {(inicio || fim) && <span className="block">Montagem {periodoCurto(inicio, fim)} · da vaga</span>}
            </p>
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={id("obs")}>
          {outro ? "Por que outro valor?" : "Observação para o aprovador"}{" "}
          <span className="font-normal text-muted-foreground">({outro ? "recomendado" : "opcional"})</span>
        </Label>
        <Textarea id={id("obs")} rows={2} maxLength={HONORARIO_TEXTO_MAX} className="rounded-lg bg-card text-sm" value={f.observacao}
          placeholder={outro ? "Ex.: montagem noturna, fechado com a produção" : "Ex.: inclui carregamento e descarga"} onChange={(e) => set({ observacao: e.target.value })} />
      </div>

      {erro && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erro}</p>}
      {empreita && f.pessoas && Number(f.pessoas) > HONORARIO_PESSOAS_MAX && (
        <p className="text-xs text-danger">No máximo {HONORARIO_PESSOAS_MAX} pessoas.</p>
      )}
    </>
  );
}

/** Confirmação de descartar o rascunho próprio das vagas que entram na empreita. */
export function ConfirmarDescarteDasVagas({ form, onConfirmar }: { form: FormularioDoPedido; onConfirmar: () => void }) {
  const lista = form.pedeDescarte;
  return (
    <ConfirmDialog
      open={!!lista?.length}
      onOpenChange={(o) => { if (!o && !form.salvando) form.setPedeDescarte(null); }}
      title={lista && lista.length > 1 ? "Descartar os pedidos próprios?" : "Descartar o pedido próprio?"}
      description="Numa empreita, a vaga não tem pedido próprio — o valor é o da empreita. Nada disso foi aprovado; fica registrado no histórico da empreita."
      tone="danger"
      icon={Trash2}
      cancelLabel="Voltar"
      confirmLabel={form.salvando ? "Salvando…" : "Descartar e salvar"}
      pending={form.salvando}
      onConfirm={onConfirmar}
      testId="hon-confirmar-descarte"
    >
      <ul className="space-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs">
        {(lista ?? []).map((x) => (
          <li key={x.id}><span className="font-mono tabular-nums text-muted-foreground">#{x.inclusionNumber}</span> {x.nome} · {x.status === "rascunho" ? "rascunho" : "devolvido para negociar"}</li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}

export function DetalhesDialog({ alvo, eventId, evento, onClose, onSalvo }: {
  alvo: AlvoDoFormulario | null;
  eventId: string;
  evento: { startDate: string; endDate: string; name: string };
  onClose: () => void;
  onSalvo?: (h: Honorario) => void;
}) {
  const aberto = alvo !== null;
  const devolverFoco = useFocoDeVolta(aberto);
  const { toast } = useToast();
  const form = useFormularioDoPedido({ alvo, chave: alvo, eventId });
  const { f, honorario, empreita, salvando, sujo } = form;
  const nova = empreita && !honorario;
  const { pedirParaFechar, Dialogo } = useConfirmarDescarte(sujo, { salvando });

  if (!aberto || !f) return null;
  const somenteLeitura = !!honorario && !honorario.podeEditar;

  const salvar = async (opcoes: { descartarRascunhos?: boolean } = {}) => {
    const salvo = await form.gravar(opcoes);
    if (!salvo) return;
    toast({ variant: "success", title: nova ? "Empreita adicionada" : "Pedido salvo", description: "Fica como rascunho até você enviar para aprovação." });
    onSalvo?.(salvo);
    onClose();
  };

  const titulo = nova ? "Adicionar empreita" : empreita ? (honorario?.nome ?? "Empreita") : (alvo.modo === "vaga" ? alvo.linha.sugestao?.nome ?? honorario?.nome ?? "Vaga" : "");
  const subtitulo = alvo.modo === "vaga" && alvo.linha.vaga
    ? `#${alvo.linha.vaga.inclusionNumber} · ${alvo.linha.vaga.functionName} · ${evento.name}`
    : `Equipe com valor fechado — marque as vagas da escala que fazem parte dela · ${evento.name}`;

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => { if (!o) pedirParaFechar(onClose); }}>
        <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={(e) => { if (salvando) e.preventDefault(); }}
          // Foco no responsável da empreita pelo Radix (sem autoFocus): assim o foco volta ao botão de origem ao fechar.
          onOpenAutoFocus={(e) => { const nome = document.getElementById("hon-nome"); if (nome) { e.preventDefault(); nome.focus(); } }}
          onCloseAutoFocus={devolverFoco} data-testid="hon-detalhes">
          <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
            <DialogTitle className="pr-8 text-base font-semibold">{titulo}</DialogTitle>
            <DialogDescription className="text-xs">{subtitulo}</DialogDescription>
          </DialogHeader>
          <form
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5"
            onSubmit={(e) => { e.preventDefault(); if (!somenteLeitura) void salvar(); }}
            noValidate
          >
            {somenteLeitura && (
              <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs text-slate-700">
                Este pedido já foi enviado — só o aprovador muda (devolvendo para negociar).
              </p>
            )}
            <fieldset disabled={somenteLeitura} className="min-w-0 space-y-5">
              <CamposDoPedido form={form} />
            </fieldset>
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
          <DialogFooter className="gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => pedirParaFechar(onClose)} disabled={salvando}>{somenteLeitura ? "Fechar" : "Cancelar"}</Button>
            {!somenteLeitura && (
              <Button type="button" onClick={() => void salvar()} disabled={salvando || (empreita && f.nome.trim().length < 2)} data-testid="hon-detalhes-salvar">
                {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {salvando ? "Salvando…" : nova ? "Adicionar empreita" : "Salvar rascunho"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmarDescarteDasVagas form={form} onConfirmar={() => { void salvar({ descartarRascunhos: true }); }} />
      {Dialogo}
    </>
  );
}
