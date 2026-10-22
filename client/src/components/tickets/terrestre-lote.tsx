// "Carro / van" no painel Aplicar em lote (16/10).
//
// Caso do print do dono: várias vagas do mesmo evento vão na mesma van.
// 21/10 ("aqui só carro e van, e na van tem que ter um valor total da van e
// não só por trecho"): na van, um campo só — o VALOR TOTAL DA VAN —, dividido
// entre as vagas marcadas e, em cada vaga, entre os trechos dela; a soma bate
// exatamente com o total. Carro: o valor de cada vaga (padrão) ou o total
// dividido. O total dividido vai num pedido só (tudo ou nada) e vira um grupo.
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import {
  FORMULARIO_TERRESTRE_VAZIO,
  NOME_DO_MODO,
  itensDoFormulario,
  ordenarParaRateio,
  pernasDaVaga,
  planoDoValor,
  reaisDoTerrestre,
  type CampoDoFormulario,
  type FormularioTerrestre,
  type ItemTerrestre,
  type VagaDoRateio,
} from "@shared/transporte-terrestre";
import type { TeamInclusion } from "@shared/schema";
import CamposDoTerrestre, { type PreviaDoValor } from "./campos-do-terrestre";
import { useTerrestreMutations } from "./use-transporte-terrestre";

/** As vagas do lote na ordem do rateio, com as pernas que cada uma tem. */
const vagasDoLote = (vagas: readonly TeamInclusion[]): VagaDoRateio[] =>
  ordenarParaRateio(vagas).map((v) => ({ id: v.id, pernas: pernasDaVaga(v) }));

/**
 * Itens do lote: cada perna só nas vagas que a têm ("só ida" não ganha
 * volta); a van (e o carro "dividido") reparte o total entre as vagas que
 * recebem e, em cada uma, entre os trechos dela.
 */
export function itensDoLote(f: FormularioTerrestre, vagas: readonly TeamInclusion[]) {
  return itensDoFormulario(f, vagasDoLote(vagas));
}

/** O que o valor vira enquanto a pessoa digita ("R$ 150,00 por vaga · 8 vagas · total R$ 1.200,00"). */
export function previaDoLote(f: FormularioTerrestre, vagas: readonly TeamInclusion[]): PreviaDoValor | null {
  if (!f.modo) return null;
  const plano = planoDoValor(f, vagasDoLote(vagas));
  if (!plano || plano.receptoras.length === 0) return null;
  return {
    porVagaMin: plano.porVagaMin, porVagaMax: plano.porVagaMax, totalCentavos: plano.totalCentavos,
    vagas: plano.receptoras.length, dividir: plano.dividir, fora: plano.foraDoTrecho.length,
  };
}

/** Algo digitado no lote (modo, empresa ou valor) que ainda não foi gravado? */
export const loteTerrestreSujo = (f: FormularioTerrestre): boolean =>
  !!f.modo || f.empresa.trim() !== "" || f.valor.trim() !== "";

/**
 * O que a página pede ao lote (22/10, caso #4705–#4724): a barra de seleção
 * registra pelo MESMO caminho do botão do painel, e fechar o painel pergunta
 * antes de jogar fora o carro/van digitado.
 */
export interface LoteTerrestreHandle {
  /** O mesmo que "Registrar em N vagas": confere e abre a confirmação. */
  aplicar: () => void;
  temDados: () => boolean;
  limpar: () => void;
}

interface TerrestreLoteProps {
  /** Vagas marcadas na lista (pendentes, não canceladas, evento aberto). */
  vagas: TeamInclusion[];
  nomeDaVaga: (v: TeamInclusion) => string;
  canEdit: boolean;
  /**
   * Ids das vagas gravadas — a página tira da seleção. `todas`: nada falhou
   * (a página fecha o painel; com falha ele fica aberto com as que sobraram).
   */
  onConcluido: (ids: string[], resultado: { todas: boolean }) => void;
}

const TerrestreLote = forwardRef<LoteTerrestreHandle, TerrestreLoteProps>(function TerrestreLote({ vagas, nomeDaVaga, canEdit, onConcluido }, ref) {
  const { toast } = useToast();
  const { registrar } = useTerrestreMutations();
  const [form, setForm] = useState<FormularioTerrestre>({ ...FORMULARIO_TERRESTRE_VAZIO });
  const [erros, setErros] = useState<Partial<Record<CampoDoFormulario, string>>>({});
  const [confirmar, setConfirmar] = useState<{ itens: ItemTerrestre[]; fora: string[]; agrupar: boolean } | null>(null);
  const n = vagas.length;
  const previa = useMemo(() => previaDoLote(form, vagas), [form, vagas]);

  const aplicar = () => {
    if (n === 0) return;
    const r = itensDoLote(form, vagas);
    if (!r.ok) { setErros(r.erros); return; }
    // O total dividido vai num pedido só (tudo ou nada) — e a rota aceita 400 itens.
    if (r.agrupar && r.itens.length > 400) {
      setErros({ valor: "Para dividir o total, marque no máximo 200 vagas por vez." });
      return;
    }
    setErros({});
    setConfirmar({ itens: r.itens, fora: r.foraDoTrecho, agrupar: r.agrupar });
  };

  const executar = async () => {
    const plano = confirmar;
    setConfirmar(null);
    if (!plano || plano.itens.length === 0) return;
    const gravadas: string[] = [];
    const falhas: string[] = [];
    // 400 itens por pedido (200 vagas × ida e volta) — o limite da rota. O
    // total dividido vai inteiro, com `tudoOuNada` e `agrupar`: gravar só parte
    // das vagas deixaria a soma diferente do total digitado (revisão 16/10).
    for (let i = 0; i < plano.itens.length; i += 400) {
      const fatia = plano.itens.slice(i, i + 400);
      try {
        const res = await registrar.mutateAsync(plano.agrupar ? { itens: fatia, tudoOuNada: true, agrupar: true } : fatia);
        const falharam = new Set(res.falhas.map((f) => f.teamInclusionId));
        for (const id of Array.from(new Set(fatia.map((x) => x.teamInclusionId)))) if (!falharam.has(id)) gravadas.push(id);
        falhas.push(...res.falhas.map((f) => `#${f.numero ?? "?"}: ${f.mensagem}`));
      } catch (erro) {
        const corpo = (erro as { body?: { code?: string; message?: string; falhas?: { numero: number | null; mensagem: string }[] } } | null)?.body;
        if (corpo?.code === "lote_dividido_incompleto" && corpo.falhas?.length) {
          toast({
            variant: "destructive",
            title: "Nada foi registrado",
            description: (
              <div className="space-y-1">
                <p className="m-0">{corpo.message}</p>
                <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">{corpo.falhas.map((f, i) => <li key={i}>#{f.numero ?? "?"}: {f.mensagem}</li>)}</ul>
              </div>
            ),
          });
          return;
        }
        if (corpo?.falhas?.length) falhas.push(...corpo.falhas.map((f) => `#${f.numero ?? "?"}: ${f.mensagem}`));
        else falhas.push(apiErrorMessage(erro, "Não foi possível registrar o lote."));
      }
    }
    for (const id of plano.fora) {
      const v = vagas.find((x) => x.id === id);
      falhas.push(`#${v?.inclusionNumber ?? "?"}: a vaga não tem o trecho marcado`);
    }
    if (gravadas.length > 0) {
      onConcluido(Array.from(new Set(gravadas)), { todas: falhas.length === 0 });
      toast({ variant: "success", title: `Transporte terrestre registrado em ${new Set(gravadas).size} ${new Set(gravadas).size === 1 ? "vaga" : "vagas"}`, description: "Elas saíram da fila Comprar." });
      setForm({ ...FORMULARIO_TERRESTRE_VAZIO });
    }
    if (falhas.length > 0) {
      toast({
        variant: "destructive",
        title: `${falhas.length} ${falhas.length === 1 ? "vaga não registrada" : "vagas não registradas"}`,
        description: <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">{falhas.map((f, i) => <li key={i}>{f}</li>)}</ul>,
      });
    }
  };

  // Resumo do que será gravado (para a confirmação). Fica congelado durante a
  // animação de saída (revisão 16/10: piscava "em 0 vagas" ao confirmar).
  const resumoAtual = (() => {
    if (!confirmar) return null;
    const porVaga = new Map<string, number>();
    for (const i of confirmar.itens) porVaga.set(i.teamInclusionId, (porVaga.get(i.teamInclusionId) ?? 0) + i.valorCentavos);
    const total = confirmar.itens.reduce((s, i) => s + i.valorCentavos, 0);
    const pernas = Array.from(new Set(confirmar.itens.map((i) => i.trecho)));
    const primeiro = confirmar.itens[0];
    const valores = Array.from(porVaga.values());
    const van = primeiro.modo === "van";
    return {
      linhas: [
        ["Trechos", pernas.length === 2 ? "Ida e volta" : pernas[0] === "ida" ? "Só a ida" : "Só a volta"],
        ["Transporte", `${NOME_DO_MODO[primeiro.modo]}${primeiro.empresa ? ` · ${primeiro.empresa}` : ""}`],
        [confirmar.agrupar ? (van ? "Total da van" : "Total do carro") : "Total do lote", reaisDoTerrestre(total)],
        ["Por vaga", `${Math.min(...valores) === Math.max(...valores) ? reaisDoTerrestre(valores[0]) : `${reaisDoTerrestre(Math.min(...valores))} a ${reaisDoTerrestre(Math.max(...valores))}`}${confirmar.agrupar ? ` (dividido entre ${porVaga.size})` : ""}`],
      ] as Array<[string, string]>,
      nomes: ordenarParaRateio(vagas).filter((v) => porVaga.has(v.id)).map((v) => `${nomeDaVaga(v)} · ${reaisDoTerrestre(porVaga.get(v.id)!)}`),
      fora: confirmar.fora.length,
    };
  })();
  useImperativeHandle(ref, () => ({
    aplicar,
    temDados: () => loteTerrestreSujo(form),
    limpar: () => { setForm({ ...FORMULARIO_TERRESTRE_VAZIO }); setErros({}); },
  }));
  const ultimoResumo = useRef(resumoAtual);
  if (resumoAtual) ultimoResumo.current = resumoAtual;
  const resumo = resumoAtual ?? ultimoResumo.current;

  return (
    <>
      <div className="p-4 grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <CamposDoTerrestre
          valor={form}
          onChange={(patch) => {
            setForm((f) => ({ ...f, ...patch }));
            setErros((e) => {
              const resto = { ...e };
              for (const k of Object.keys(patch)) delete resto[(k === "ida" || k === "volta" ? "pernas" : k) as CampoDoFormulario];
              // Os trechos e o modo mudam a divisão: o erro do valor pode não valer mais.
              if ("ida" in patch || "volta" in patch || "modo" in patch || "divisao" in patch) delete resto.valor;
              return resto;
            });
          }}
          erros={erros}
          pernas={["ida", "volta"]}
          contexto="lote"
          nVagas={n}
          previa={previa}
          idBase="lote-terrestre"
          disabled={!canEdit}
        />
        {/* No celular a explicação sai: o botão de registrar fica perto dos campos. */}
        <aside className="hidden sm:block rounded-xl border border-border bg-surface-muted/60 p-3 text-xs leading-relaxed text-slate-700 self-start space-y-2" data-testid="lote-terrestre-como-fica">
          <p className="m-0 font-semibold text-foreground">Como fica</p>
          <p className="m-0">Cada vaga marcada ganha o transporte nos trechos escolhidos e sai da fila <span className="font-medium">Comprar</span>. Vaga “só ida” recebe só a ida.</p>
          {form.modo === "carro" ? (
            <>
              <p className="m-0">Cada um com seu carro: digite o valor do carro de uma vaga — vale para cada uma, na viagem toda.</p>
              <p className="m-0">Um carro para todos: escolha <span className="font-medium">“o total, dividido”</span> e digite o valor do carro inteiro.</p>
            </>
          ) : (
            <p className="m-0">
              Van de R$ 1.200 que leva 8 pessoas na ida e na volta: digite <span className="font-medium">1.200,00</span> no <span className="font-medium">Valor total da van</span> — cada vaga fica com R$ 150,00 (R$ 75,00 na ida e R$ 75,00 na volta). O centavo que não divide exato vai para as primeiras vagas; a soma bate com o total.
            </p>
          )}
          <p className="m-0 text-muted-foreground">Não entra no Planejado nem no Realizado. Dá para editar ou desfazer na linha da vaga — só ela ou a van inteira.</p>
        </aside>
      </div>

      <div className="border-t border-border px-4 py-2.5 bg-surface-muted flex flex-wrap items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium tabular-nums ${n > 0 ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground"}`}>
          <Users className="h-4 w-4" aria-hidden="true" />
          <span><span className="font-semibold">{n}</span> {n === 1 ? "vaga marcada" : "vagas marcadas"}</span>
        </span>
        {canEdit && (
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" className="h-[34px] rounded-lg text-xs text-muted-foreground" onClick={() => { setForm({ ...FORMULARIO_TERRESTRE_VAZIO }); setErros({}); }} data-testid="lote-terrestre-limpar">
              Limpar
            </Button>
            <Button
              onClick={aplicar} disabled={n === 0 || registrar.isPending}
              className="h-[34px] px-4 font-semibold rounded-lg text-xs gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground disabled:bg-border disabled:text-muted-foreground disabled:opacity-100"
              data-testid="lote-terrestre-aplicar"
            >
              {registrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {registrar.isPending ? "Registrando…" : n === 0 ? "Marque vagas na lista" : `Registrar em ${n} ${n === 1 ? "vaga" : "vagas"}`}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent className="max-w-[560px]">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-base font-semibold text-foreground">
              Registrar transporte terrestre em {resumo?.nomes.length ?? 0} {(resumo?.nomes.length ?? 0) === 1 ? "vaga" : "vagas"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Elas saem da fila Comprar. Confira antes de confirmar.</AlertDialogDescription>
          </AlertDialogHeader>
          {resumo && (
            <div className="space-y-3">
              <dl className="m-0 rounded-xl border border-border divide-y divide-border text-xs overflow-hidden">
                {resumo.linhas.map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 px-3 py-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="m-0 font-semibold text-foreground break-words tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {resumo.fora > 0 && (
                <p className="m-0 text-xs text-warning-strong">
                  {resumo.fora} {resumo.fora === 1 ? "vaga não tem" : "vagas não têm"} o trecho marcado e {resumo.fora === 1 ? "fica" : "ficam"} de fora.
                </p>
              )}
              <ul className="m-0 p-0 list-none max-h-32 overflow-y-auto rounded-xl border border-border px-3 py-2 text-xs text-slate-700 space-y-0.5 tabular-nums">
                {resumo.nomes.map((nm, i) => <li key={i}>{nm}</li>)}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={executar} className="bg-primary hover:bg-primary-hover text-primary-foreground" data-testid="lote-terrestre-confirmar">
              Confirmar e registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

export default TerrestreLote;
